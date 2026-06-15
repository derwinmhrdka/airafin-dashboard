import { google } from 'googleapis';

export interface TransactionSheetRow {
  date: string;
  categoryName: string;
  detail: string;
  cost: string;
  period: string;
  pic: string;
}

export type SheetsSyncResult =
  | { status: 'synced' }
  | { status: 'skipped' }
  | { status: 'failed'; error: string };

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * DETAIL tab layout (column F is temporary — never written):
 * A: Date | B: Category | C: Detail | D: Cost | E: Month | F: (skip) | G: Initial
 *
 * Only the DETAIL tab is ever read or written. Monthly tabs (JUNE, JULY, etc.) are never touched.
 */
const SHEET_TAB_NAME = 'DETAIL';

export function isSheetsSyncEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  );
}

function monthFromPeriod(period: string): string {
  return period.trim().split(/\s+/)[0] ?? period;
}

function picInitial(pic: string): string {
  const initials: Record<string, string> = { Derwin: 'D', Anggita: 'A' };
  return initials[pic] ?? pic.charAt(0).toUpperCase();
}

function parseCost(value: string | number | undefined): number {
  if (value == null || value === '') return Number.NaN;
  return Number.parseFloat(String(value).replace(/,/g, ''));
}

function costsMatch(expected: string, actual: string | number | undefined): boolean {
  const a = parseCost(expected);
  const b = parseCost(actual);
  if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) < 0.01;
  return String(expected) === String(actual ?? '');
}

function monthsMatch(expectedPeriod: string, sheetMonth: string | number | undefined): boolean {
  const month = monthFromPeriod(expectedPeriod);
  const cell = String(sheetMonth ?? '');
  return cell === month || cell.startsWith(`${month} `);
}

function rowCoreValues(row: TransactionSheetRow): [string, string, string, string, string] {
  return [
    row.date,
    row.categoryName,
    row.detail,
    row.cost,
    monthFromPeriod(row.period),
  ];
}

function rowsMatch(sheetRow: (string | number | undefined)[], row: TransactionSheetRow): boolean {
  const initial = picInitial(row.pic);
  return (
    String(sheetRow[0] ?? '') === row.date &&
    String(sheetRow[1] ?? '') === row.categoryName &&
    String(sheetRow[2] ?? '') === row.detail &&
    costsMatch(row.cost, sheetRow[3]) &&
    monthsMatch(row.period, sheetRow[4]) &&
    String(sheetRow[6] ?? '').toUpperCase() === initial.toUpperCase()
  );
}

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
    scopes: SCOPES,
  });

  return google.sheets({ version: 'v4', auth });
}

async function getSpreadsheetId(): Promise<string | null> {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? null;
}

async function getSheetId(spreadsheetId: string): Promise<number> {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === SHEET_TAB_NAME);

  if (sheet?.properties?.sheetId == null) {
    throw new Error(`Sheet tab "${SHEET_TAB_NAME}" not found`);
  }

  return sheet.properties.sheetId;
}

/** Returns 1-based row number, or null if not found. */
async function findRowNumber(row: TransactionSheetRow): Promise<number | null> {
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) return null;

  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A:G`,
  });

  const values = res.data.values ?? [];
  for (let i = 0; i < values.length; i++) {
    if (rowsMatch(values[i], row)) {
      return i + 1;
    }
  }

  return null;
}

/** Writes A–E and G only; column F is left untouched. */
async function writeRowAt(
  spreadsheetId: string,
  rowNumber: number,
  row: TransactionSheetRow,
): Promise<void> {
  const sheets = await getSheetsClient();
  const [a, b, c, d, e] = rowCoreValues(row);
  const initial = picInitial(row.pic);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `${SHEET_TAB_NAME}!A${rowNumber}:E${rowNumber}`, values: [[a, b, c, d, e]] },
        { range: `${SHEET_TAB_NAME}!G${rowNumber}`, values: [[initial]] },
      ],
    },
  });
}

export async function appendTransactionToSheet(
  row: TransactionSheetRow,
): Promise<SheetsSyncResult> {
  if (!isSheetsSyncEnabled()) {
    return { status: 'skipped' };
  }

  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    return { status: 'failed', error: 'GOOGLE_SHEETS_SPREADSHEET_ID is not set' };
  }

  try {
    const sheets = await getSheetsClient();
    const [a, b, c, d, e] = rowCoreValues(row);
    const initial = picInitial(row.pic);

    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_TAB_NAME}!A:E`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[a, b, c, d, e]],
      },
    });

    const updatedRange = appendRes.data.updates?.updatedRange ?? '';
    const rowMatch = updatedRange.match(/!A(\d+)/i);
    const rowNumber = rowMatch ? Number.parseInt(rowMatch[1], 10) : null;

    if (!rowNumber) {
      return { status: 'failed', error: 'Could not determine appended row number' };
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TAB_NAME}!G${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[initial]],
      },
    });

    return { status: 'synced' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Sheets API error';
    return { status: 'failed', error: message };
  }
}

export async function updateTransactionInSheet(
  row: TransactionSheetRow,
  previousRow: TransactionSheetRow,
): Promise<SheetsSyncResult> {
  if (!isSheetsSyncEnabled()) {
    return { status: 'skipped' };
  }

  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    return { status: 'failed', error: 'GOOGLE_SHEETS_SPREADSHEET_ID is not set' };
  }

  try {
    const rowNumber = await findRowNumber(previousRow);
    if (!rowNumber) {
      return { status: 'failed', error: 'Matching row not found in spreadsheet' };
    }

    await writeRowAt(spreadsheetId, rowNumber, row);
    return { status: 'synced' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Sheets API error';
    return { status: 'failed', error: message };
  }
}

export async function readDetailSheetRows(): Promise<(string | number | undefined)[][]> {
  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  }

  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A:G`,
  });

  return res.data.values ?? [];
}

export async function deleteDetailRows(rowNumbers: number[]): Promise<void> {
  if (rowNumbers.length === 0) return;

  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  }

  const sheetId = await getSheetId(spreadsheetId);
  const sheets = await getSheetsClient();
  const sorted = [...rowNumbers].sort((a, b) => b - a);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: sorted.map((rowNumber) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      })),
    },
  });
}

export async function appendDetailRows(rows: TransactionSheetRow[]): Promise<void> {
  if (rows.length === 0) return;

  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  }

  const sheets = await getSheetsClient();
  const values = rows.map((row) => {
    const [a, b, c, d, e] = rowCoreValues(row);
    return [a, b, c, d, e, '', picInitial(row.pic)];
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB_NAME}!A:G`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

export async function deleteTransactionFromSheet(
  row: TransactionSheetRow,
): Promise<SheetsSyncResult> {
  if (!isSheetsSyncEnabled()) {
    return { status: 'skipped' };
  }

  const spreadsheetId = await getSpreadsheetId();
  if (!spreadsheetId) {
    return { status: 'failed', error: 'GOOGLE_SHEETS_SPREADSHEET_ID is not set' };
  }

  try {
    const rowNumber = await findRowNumber(row);
    if (!rowNumber) {
      return { status: 'failed', error: 'Matching row not found in spreadsheet' };
    }

    const sheetId = await getSheetId(spreadsheetId);
    const sheets = await getSheetsClient();

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowNumber - 1,
                endIndex: rowNumber,
              },
            },
          },
        ],
      },
    });

    return { status: 'synced' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Sheets API error';
    return { status: 'failed', error: message };
  }
}
