export function currentPeriod(date = new Date()): string {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
