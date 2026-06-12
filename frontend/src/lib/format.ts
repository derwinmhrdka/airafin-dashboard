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

/** Parse API/DB amount or formatted input to a whole IDR number. */
export function toAmountNumber(value: number | string): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }
  const s = value.trim().replace(/,/g, '');
  if (!s) return 0;
  if (/^\d+$/.test(s)) {
    return Number.parseInt(s, 10);
  }
  // Indonesian thousand separators: 1.000, 1.000.000
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return parseAmountInput(s);
  }
  // Plain decimal from API/DB: 1000.00
  if (/^\d+\.\d{1,2}$/.test(s)) {
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  return parseAmountInput(s);
}

/** Format whole-number amounts for inputs (e.g. 1000 → 1.000). */
export function formatAmountInput(value: number | string): string {
  const n = toAmountNumber(value);
  if (n === 0) return '';
  return amountDigits.format(n);
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
