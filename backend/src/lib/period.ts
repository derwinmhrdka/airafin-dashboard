/** Format like "June 2026" — matches spreadsheet period labels. */
export function currentPeriod(date = new Date()): string {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function parsePeriod(period: string): { month: number; year: number } | null {
  const parsed = new Date(`${period} 1`);
  if (Number.isNaN(parsed.getTime())) return null;
  return { month: parsed.getMonth(), year: parsed.getFullYear() };
}
