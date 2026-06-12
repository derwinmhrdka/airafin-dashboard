const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number | string): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return idr.format(0);
  return idr.format(Math.round(n));
}

const amountDigits = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
});

/** Format whole-number amounts for inputs (e.g. 1000 → 1.000). */
export function formatAmountInput(value: number | string): string {
  if (typeof value === 'string') {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    return amountDigits.format(Number.parseInt(digits, 10));
  }
  if (!Number.isFinite(value) || value === 0) return '';
  return amountDigits.format(Math.round(value));
}

/** Parse formatted amount input back to a whole number. */
export function parseAmountInput(value: string): number {
  const cleaned = value.replace(/\D/g, '');
  if (!cleaned) return 0;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
