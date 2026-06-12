import { isValidPic, type Pic } from './pic.js';
import { parsePeriod } from './period.js';

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

export function isHeaderRow(cells: (string | number | undefined)[]): boolean {
  const first = String(cells[0] ?? '').trim().toLowerCase();
  return first === 'date' || first === 'tanggal';
}

export function monthFromPeriod(period: string): string {
  return period.trim().split(/\s+/)[0] ?? period;
}

export function parseSheetDate(raw: string): Date | null {
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

export function parseAmount(raw: string | number | undefined): number | null {
  const cleaned = String(raw ?? '')
    .replace(/\s/g, '')
    .replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  let normalized = cleaned;
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
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function periodLabel(date: Date, periodeCell: string): string {
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

export function rowMatchesPeriod(
  cells: (string | number | undefined)[],
  period: string,
): boolean {
  const parts = parsePeriod(period);
  if (!parts) return false;

  const month = monthFromPeriod(period);
  const sheetMonth = String(cells[4] ?? '').trim();
  if (!sheetMonth.toLowerCase().startsWith(month.toLowerCase())) return false;

  const date = parseSheetDate(String(cells[0] ?? ''));
  if (!date) return false;
  return date.getFullYear() === parts.year;
}

export function picFromSheetCells(cells: (string | number | undefined)[]): string {
  const colG = String(cells[6] ?? '').trim();
  if (colG) return colG;
  const colF = String(cells[5] ?? '').trim();
  if (!colF || colF.startsWith('#') || /^\d+$/.test(colF)) return '';
  return colF;
}

export function parseExplicitPic(raw: string): Pic | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const s = trimmed.toLowerCase();
  if (s === 'a' || s.includes('anggita')) return 'Anggita';
  if (s === 'd' || s.includes('derwin')) return 'Derwin';
  if (isValidPic(trimmed)) return trimmed;
  return null;
}

export function resolvePic(
  csvPic: string,
  categoryId: number,
  period: string,
  planPicByKey: Map<string, Pic>,
): Pic {
  const explicit = parseExplicitPic(csvPic);
  if (explicit) return explicit;

  const fromPlan = planPicByKey.get(`${categoryId}|${period}`);
  if (fromPlan) return fromPlan;

  return 'Derwin';
}

export interface ParsedSheetRow {
  date: string;
  categoryName: string;
  detail: string;
  cost: number;
  period: string;
  picRaw: string;
}

export function parseSheetCellsToRow(
  cells: (string | number | undefined)[],
): ParsedSheetRow | { error: string } {
  const dateRaw = String(cells[0] ?? '');
  const categoryName = String(cells[1] ?? '').trim();
  const detail = String(cells[2] ?? '').trim();
  const costRaw = cells[3];
  const periode = String(cells[4] ?? '');
  const picRaw = picFromSheetCells(cells);

  const date = parseSheetDate(dateRaw);
  if (!date) return { error: `invalid date: ${dateRaw}` };
  if (!categoryName) return { error: 'missing category' };

  const cost = parseAmount(costRaw);
  if (cost == null || cost <= 0) return { error: `invalid cost: ${String(costRaw ?? '')}` };

  return {
    date: date.toISOString().slice(0, 10),
    categoryName,
    detail: detail || '—',
    cost,
    period: periodLabel(date, periode),
    picRaw,
  };
}
