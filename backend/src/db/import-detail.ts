import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db } from './index.js';
import { categories, transactions } from './schema.js';
import { isValidPic, type Pic } from '../lib/pic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV =
  process.env.NODE_ENV === 'production'
    ? '/app/data/import/detail.csv'
    : path.resolve(__dirname, '../../data/import/detail.csv');

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n' || (ch === '\r' && next === '\n')) {
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      if (ch === '\r') i += 1;
      continue;
    }
    if (ch === '\r') continue;
    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }

  return rows;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  let normalized = cleaned;
  // US export from Sheets: 1,500,000.00
  if (normalized.includes(',') && normalized.includes('.')) {
    const lastDot = normalized.lastIndexOf('.');
    const frac = normalized.slice(lastDot + 1);
    if (frac.length <= 2) {
      normalized = normalized.slice(0, lastDot).replace(/,/g, '');
      if (frac && frac !== '00') normalized += `.${frac}`;
    } else {
      normalized = normalized.replace(/[,.]/g, '');
    }
  } else if (normalized.includes('.')) {
    const parts = normalized.split('.');
    if (parts.length > 2 || (parts[1]?.length === 3 && parts.length === 2)) {
      normalized = normalized.replace(/\./g, '');
    }
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const day = Number.parseInt(slash[1], 10);
    const month = Number.parseInt(slash[2], 10);
    let year = Number.parseInt(slash[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Empty CSV PIC stays empty — not a reimbursement candidate. */
function normalizePic(raw: string): Pic | '' {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const s = trimmed.toLowerCase();
  if (s === 'a' || s.includes('anggita')) return 'Anggita';
  if (s === 'd' || s.includes('derwin')) return 'Derwin';
  if (isValidPic(trimmed)) return trimmed;
  return '';
}

function periodLabel(date: Date, periodeCell: string): string {
  const periode = periodeCell.trim();
  if (periode) {
    const monthWord = periode.split(/\s+/)[0]?.toLowerCase() ?? '';
    const monthIdx = MONTH_NAMES.indexOf(monthWord);
    if (monthIdx >= 0) {
      const d = new Date(date.getFullYear(), monthIdx, 1);
      return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }
  }
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function picFromCells(cells: string[]): string {
  const colG = (cells[6] ?? '').trim();
  if (colG) return colG;
  const colF = (cells[5] ?? '').trim();
  if (!colF || colF.startsWith('#') || /^\d+$/.test(colF)) return '';
  return colF;
}

function isHeaderRow(cells: string[]): boolean {
  const first = (cells[0] ?? '').trim().toLowerCase();
  return first === 'date' || first === 'tanggal';
}

interface DetailRow {
  date: string;
  categoryName: string;
  detail: string;
  cost: number;
  period: string;
  pic: Pic;
  status: string;
}

function mapRow(cells: string[]): DetailRow | { error: string } {
  const dateRaw = cells[0] ?? '';
  const categoryName = (cells[1] ?? '').trim();
  const detail = (cells[2] ?? '').trim();
  const costRaw = cells[3] ?? '';
  const periode = cells[4] ?? '';
  const picRaw = picFromCells(cells);

  const date = parseDate(dateRaw);
  if (!date) return { error: `invalid date: ${dateRaw}` };
  if (!categoryName) return { error: 'missing category' };

  const cost = parseAmount(costRaw);
  if (cost == null || cost <= 0) return { error: `invalid cost: ${costRaw}` };

  return {
    date: toIsoDate(date),
    categoryName,
    detail: detail || '—',
    cost,
    period: periodLabel(date, periode),
    pic: normalizePic(picRaw),
    status: process.env.IMPORT_DEFAULT_STATUS?.trim() || 'Done',
  };
}

async function loadCategoryMap(): Promise<Map<string, number>> {
  const rows = await db.select().from(categories);
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.name.toLowerCase(), row.id);
  }
  return map;
}

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--yes') || process.env.IMPORT_CONFIRM === 'true';
  if (!confirmed) {
    console.error('Refusing to run without --yes (truncates all transactions first).');
    console.error('Usage: npm run db:import-detail -- --yes');
    process.exit(1);
  }

  const csvPath = process.env.IMPORT_DETAIL_CSV?.trim() || DEFAULT_CSV;
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    console.error('Place your export at backend/data/import/detail.csv');
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
  const parsed = parseCsv(content);
  if (parsed.length === 0) {
    console.error('CSV is empty.');
    process.exit(1);
  }

  const categoryMap = await loadCategoryMap();
  const toInsert: (typeof transactions.$inferInsert)[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < parsed.length; i += 1) {
    const cells = parsed[i];
    if (isHeaderRow(cells)) continue;

    const mapped = mapRow(cells);
    if ('error' in mapped) {
      skipped.push(`row ${i + 1}: ${mapped.error}`);
      continue;
    }

    const categoryId = categoryMap.get(mapped.categoryName.toLowerCase());
    if (!categoryId) {
      skipped.push(`row ${i + 1}: unknown category "${mapped.categoryName}"`);
      continue;
    }

    toInsert.push({
      date: mapped.date,
      categoryId,
      detail: mapped.detail,
      cost: String(mapped.cost),
      period: mapped.period,
      pic: mapped.pic,
      status: mapped.status,
    });
  }

  if (toInsert.length === 0) {
    console.error('No valid rows to import.');
    for (const line of skipped.slice(0, 20)) console.error(`  ${line}`);
    process.exit(1);
  }

  console.log(`Truncating transactions table…`);
  await db.execute(sql`TRUNCATE TABLE transactions RESTART IDENTITY`);

  console.log(`Inserting ${toInsert.length} transactions from ${path.basename(csvPath)}…`);
  await db.insert(transactions).values(toInsert);

  console.log(`Done. Imported ${toInsert.length} rows.`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} rows:`);
    for (const line of skipped.slice(0, 30)) console.log(`  ${line}`);
    if (skipped.length > 30) console.log(`  … and ${skipped.length - 30} more`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
