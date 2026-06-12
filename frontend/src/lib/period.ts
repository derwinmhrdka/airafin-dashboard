/** Format like "June 2026" — matches spreadsheet period labels. */
export function dateToPeriod(date: Date): string {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function currentPeriod(date = new Date()): string {
  return dateToPeriod(date);
}

export function parsePeriodToDate(period: string): Date | null {
  const trimmed = period.trim();
  if (!trimmed) return null;
  const parsed = new Date(`${trimmed} 1`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
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

/** Newest first — current month near the top of the list. */
export function listPeriodOptions(
  anchor = new Date(),
  monthsBefore = 23,
  monthsAfter = 6,
): string[] {
  const options: string[] = [];
  for (let i = monthsAfter; i >= -monthsBefore; i--) {
    options.push(dateToPeriod(new Date(anchor.getFullYear(), anchor.getMonth() + i, 1)));
  }
  return options;
}
