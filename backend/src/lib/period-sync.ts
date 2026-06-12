import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { budgets, categories, transactions } from '../db/schema.js';
import {
  appendDetailRows,
  deleteDetailRows,
  isSheetsSyncEnabled,
  readDetailSheetRows,
  type TransactionSheetRow,
} from './google-sheets.js';
import { isValidPic, type Pic } from './pic.js';
import {
  isHeaderRow,
  parseSheetCellsToRow,
  resolvePic,
  rowMatchesPeriod,
} from './sheet-row.js';

export interface SyncResult {
  ok: boolean;
  period: string;
  direction: 'db-to-sheet' | 'sheet-to-db';
  deleted?: number;
  written?: number;
  skipped?: number;
  error?: string;
  skipReasons?: string[];
}

async function loadCategoryMap(): Promise<Map<string, number>> {
  const rows = await db.select().from(categories);
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.name.toLowerCase(), row.id);
  }
  return map;
}

async function loadPlanPicMap(): Promise<Map<string, Pic>> {
  const rows = await db
    .select({
      categoryId: budgets.categoryId,
      period: budgets.period,
      pic: budgets.pic,
    })
    .from(budgets);

  const map = new Map<string, Pic>();
  for (const row of rows) {
    const pic = row.pic?.trim() ?? '';
    if (isValidPic(pic)) {
      map.set(`${row.categoryId}|${row.period}`, pic);
    }
  }
  return map;
}

function sheetRowsInPeriod(
  values: (string | number | undefined)[][],
  period: string,
): { rowNumber: number; cells: (string | number | undefined)[] }[] {
  const result: { rowNumber: number; cells: (string | number | undefined)[] }[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const cells = values[i];
    if (!cells || isHeaderRow(cells)) continue;
    if (rowMatchesPeriod(cells, period)) {
      result.push({ rowNumber: i + 1, cells });
    }
  }
  return result;
}

export async function syncDbToSheet(period: string): Promise<SyncResult> {
  const trimmed = period.trim();
  if (!trimmed) {
    return { ok: false, period: trimmed, direction: 'db-to-sheet', error: 'period is required' };
  }

  if (!isSheetsSyncEnabled()) {
    return {
      ok: false,
      period: trimmed,
      direction: 'db-to-sheet',
      error: 'Google Sheets is not configured',
    };
  }

  try {
    const dbRows = await db
      .select({
        date: transactions.date,
        categoryName: categories.name,
        detail: transactions.detail,
        cost: transactions.cost,
        period: transactions.period,
        pic: transactions.pic,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(eq(transactions.period, trimmed));

    const sheetValues = await readDetailSheetRows();
    const existing = sheetRowsInPeriod(sheetValues, trimmed);
    await deleteDetailRows(existing.map((r) => r.rowNumber));

    const sheetRows: TransactionSheetRow[] = dbRows.map((row) => ({
      date: String(row.date),
      categoryName: row.categoryName,
      detail: row.detail,
      cost: String(row.cost),
      period: row.period,
      pic: row.pic,
    }));

    await appendDetailRows(sheetRows);

    return {
      ok: true,
      period: trimmed,
      direction: 'db-to-sheet',
      deleted: existing.length,
      written: sheetRows.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    return { ok: false, period: trimmed, direction: 'db-to-sheet', error: message };
  }
}

export async function syncSheetToDb(period: string): Promise<SyncResult> {
  const trimmed = period.trim();
  if (!trimmed) {
    return { ok: false, period: trimmed, direction: 'sheet-to-db', error: 'period is required' };
  }

  if (!isSheetsSyncEnabled()) {
    return {
      ok: false,
      period: trimmed,
      direction: 'sheet-to-db',
      error: 'Google Sheets is not configured',
    };
  }

  try {
    const [categoryMap, planPicMap, sheetValues] = await Promise.all([
      loadCategoryMap(),
      loadPlanPicMap(),
      readDetailSheetRows(),
    ]);

    const inPeriod = sheetRowsInPeriod(sheetValues, trimmed);
    const toInsert: (typeof transactions.$inferInsert)[] = [];
    const skipReasons: string[] = [];
    const defaultStatus = process.env.IMPORT_DEFAULT_STATUS?.trim() || 'Done';

    for (const { rowNumber, cells } of inPeriod) {
      const mapped = parseSheetCellsToRow(cells);
      if ('error' in mapped) {
        skipReasons.push(`row ${rowNumber}: ${mapped.error}`);
        continue;
      }

      if (mapped.period !== trimmed) continue;

      const categoryId = categoryMap.get(mapped.categoryName.toLowerCase());
      if (!categoryId) {
        skipReasons.push(`row ${rowNumber}: unknown category "${mapped.categoryName}"`);
        continue;
      }

      const pic = resolvePic(mapped.picRaw, categoryId, mapped.period, planPicMap);
      toInsert.push({
        date: mapped.date,
        categoryId,
        detail: mapped.detail,
        cost: String(mapped.cost),
        period: mapped.period,
        pic,
        status: defaultStatus,
      });
    }

    const beforeRows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.period, trimmed));
    const deletedCount = beforeRows.length;

    await db.delete(transactions).where(eq(transactions.period, trimmed));

    if (toInsert.length > 0) {
      await db.insert(transactions).values(toInsert);
    }

    return {
      ok: true,
      period: trimmed,
      direction: 'sheet-to-db',
      deleted: deletedCount,
      written: toInsert.length,
      skipped: skipReasons.length,
      skipReasons: skipReasons.slice(0, 20),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    return { ok: false, period: trimmed, direction: 'sheet-to-db', error: message };
  }
}
