import { periodToIsoDate } from './period.js';

/** Status used for Detail rows created by budget allocation moves. */
export const BUDGET_MOVE_STATUS = 'Transfer';

/** Status used for Detail rows created when carrying surplus into the next month. */
export const BUDGET_CARRYOVER_STATUS = 'Carryover';

export const NON_SPEND_STATUSES = [BUDGET_MOVE_STATUS, BUDGET_CARRYOVER_STATUS] as const;

export function isNonSpendTransaction(tx: { status?: string | null }): boolean {
  const status = tx.status?.trim() ?? '';
  return (NON_SPEND_STATUSES as readonly string[]).includes(status);
}

/** @deprecated Prefer isNonSpendTransaction — kept for existing call sites. */
export function isBudgetMoveTransaction(tx: { status?: string | null }): boolean {
  return isNonSpendTransaction(tx);
}

export function budgetMoveDate(period: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const isoPrefix = periodToIsoDate(period, 1).slice(0, 7);
  if (today.startsWith(`${isoPrefix}-`)) return today;
  return periodToIsoDate(period, 1);
}

export function budgetMoveLabels(input: {
  fromCategoryName: string;
  fromSubName: string;
  toCategoryName: string;
  toSubName: string;
}): { fromDetail: string; toDetail: string } {
  const fromBucket = input.fromSubName || 'Main';
  const toBucket = input.toSubName || 'Main';
  return {
    fromDetail: `Move to ${input.toCategoryName} / ${toBucket}`,
    toDetail: `Move from ${input.fromCategoryName} / ${fromBucket}`,
  };
}

export function carryoverIncomeSource(fromPeriod: string, pic: string): string {
  return `Carryover from ${fromPeriod} (${pic})`;
}

export function carryoverDetail(
  fromPeriod: string,
  categoryName: string,
  subcategoryName: string,
): string {
  const bucket = subcategoryName.trim() || 'Main';
  return `Carryover from ${fromPeriod} → ${categoryName} / ${bucket}`;
}

export function deficitDetail(
  fromPeriod: string,
  categoryName: string,
  subcategoryName: string,
): string {
  const bucket = subcategoryName.trim() || 'Main';
  return `Deficit from ${fromPeriod} → ${categoryName} / ${bucket}`;
}

export const MAIN_BUCKET_LABEL = 'Main (default)';
