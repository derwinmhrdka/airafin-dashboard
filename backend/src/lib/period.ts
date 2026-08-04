/** Format like "June 2026" — matches spreadsheet period labels. */
export function currentPeriod(date = new Date()): string {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function monthFromPeriod(period: string): string {
  return period.trim().split(/\s+/)[0] ?? period;
}

export function parsePeriod(period: string): { month: number; year: number } | null {
  const parsed = new Date(`${period} 1`);
  if (Number.isNaN(parsed.getTime())) return null;
  return { month: parsed.getMonth(), year: parsed.getFullYear() };
}

export function shiftPeriod(period: string, deltaMonths: number): string {
  const parsed = parsePeriod(period);
  if (!parsed) return currentPeriod();
  return currentPeriod(new Date(parsed.year, parsed.month + deltaMonths, 1));
}

/** ISO date `YYYY-MM-DD` for a day within a period label. */
export function periodToIsoDate(period: string, day = 1): string {
  const parsed = parsePeriod(period);
  if (!parsed) return new Date().toISOString().slice(0, 10);
  const mm = String(parsed.month + 1).padStart(2, '0');
  const dd = String(Math.min(Math.max(day, 1), 28)).padStart(2, '0');
  return `${parsed.year}-${mm}-${dd}`;
}
