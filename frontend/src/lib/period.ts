/** Format like "June 2026" — matches spreadsheet period labels. */
export function dateToPeriod(date: Date): string {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function currentPeriod(date = new Date()): string {
  return dateToPeriod(date);
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function parsePeriodToDate(period: string): Date | null {
  const trimmed = period.trim();
  if (!trimmed) return null;
  const parsed = new Date(`${trimmed} 1`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function periodParts(period: string): { month: number; year: number } {
  const parsed = parsePeriodToDate(period);
  if (!parsed) {
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  }
  return { month: parsed.getMonth(), year: parsed.getFullYear() };
}

export function periodFromParts(month: number, year: number): string {
  return dateToPeriod(new Date(year, month, 1));
}

export function periodFromUrl(searchParams: URLSearchParams): string {
  const raw = searchParams.get('period')?.trim();
  if (raw && parsePeriodToDate(raw)) return raw;
  return currentPeriod();
}

export function withPeriodParam(path: string, period: string): string {
  const url = new URL(path, 'http://local');
  url.searchParams.set('period', period);
  return `${url.pathname}${url.search}`;
}

export function shiftPeriod(period: string, deltaMonths: number): string {
  const parsed = parsePeriodToDate(period);
  if (!parsed) return currentPeriod();
  return dateToPeriod(new Date(parsed.getFullYear(), parsed.getMonth() + deltaMonths, 1));
}

export function listYearOptions(
  anchor = new Date(),
  yearsBefore = 1,
  yearsAfter = 1,
): number[] {
  const years: number[] = [];
  const start = anchor.getFullYear() - yearsBefore;
  const end = anchor.getFullYear() + yearsAfter;
  for (let y = end; y >= start; y--) years.push(y);
  return years;
}

/** Ensures the active period year is always selectable in the dropdown. */
export function listYearOptionsForPeriod(
  selectedYear: number,
  anchor = new Date(),
  yearsBefore = 1,
  yearsAfter = 1,
): number[] {
  const years = new Set(listYearOptions(anchor, yearsBefore, yearsAfter));
  years.add(selectedYear);
  return [...years].sort((a, b) => b - a);
}
