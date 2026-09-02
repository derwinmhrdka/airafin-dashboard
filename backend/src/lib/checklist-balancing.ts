import type { Budget, BudgetSubcategory, Income } from '../db/schema.js';
import { isValidPic, type Pic, VALID_PIC } from './pic.js';

export const BALANCING_ITEM_NAME = 'Balancing';

function parseAmount(value: string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function incomePicFromSource(source: string): Pic | null {
  const s = source.toLowerCase();
  if (s.includes('derwin')) return 'Derwin';
  if (s.includes('anggita')) return 'Anggita';
  return null;
}

function subAmountTotal(subs: readonly BudgetSubcategory[]): number {
  return subs.reduce((sum, row) => sum + parseAmount(row.allocatedAmount), 0);
}

export interface BalancingTransfer {
  amount: number;
  senderPic: Pic;
  receiverPic: Pic;
  pocket: string;
}

export function computeBalancingTransfer(input: {
  incomes: readonly Income[];
  budgets: readonly Budget[];
  subcategories: readonly BudgetSubcategory[];
}): BalancingTransfer | null {
  const incomeByPic: Record<Pic, number> = { Derwin: 0, Anggita: 0 };
  const planByPic: Record<Pic, number> = { Derwin: 0, Anggita: 0 };

  for (const row of input.incomes) {
    const owner = incomePicFromSource(row.source);
    if (owner) incomeByPic[owner] += parseAmount(row.amount);
  }

  const subsByCategory = new Map<number, BudgetSubcategory[]>();
  for (const sub of input.subcategories) {
    const list = subsByCategory.get(sub.categoryId) ?? [];
    list.push(sub);
    subsByCategory.set(sub.categoryId, list);
  }

  for (const budget of input.budgets) {
    const pic = isValidPic(budget.pic?.trim() ?? '') ? (budget.pic.trim() as Pic) : 'Derwin';
    const subs = subsByCategory.get(budget.categoryId) ?? [];
    const subTotal = subAmountTotal(subs);
    const mainAmount = Math.max(0, parseAmount(budget.allocatedAmount) - subTotal);
    planByPic[pic] += mainAmount;
    for (const sub of subs) {
      const subPic = isValidPic(sub.pic?.trim() ?? '') ? (sub.pic.trim() as Pic) : pic;
      planByPic[subPic] += parseAmount(sub.allocatedAmount);
    }
  }

  const balancing = VALID_PIC.map((pic) => ({
    pic,
    value: incomeByPic[pic] - planByPic[pic],
  }));

  const surplus = balancing.filter((r) => r.value > 0).sort((a, b) => b.value - a.value)[0];
  const deficit = balancing.filter((r) => r.value < 0).sort((a, b) => a.value - b.value)[0];
  if (!surplus || !deficit) return null;

  const amount = Math.min(surplus.value, Math.abs(deficit.value));
  if (amount <= 0) return null;

  const senderPic = surplus.pic;
  const pocket =
    input.subcategories.find((s) => s.pic?.trim() === senderPic)?.pocket?.trim().toUpperCase() ??
    input.budgets.find((b) => b.pic?.trim() === senderPic)?.pocket?.trim().toUpperCase() ??
    'BCA';

  return {
    amount,
    senderPic,
    receiverPic: deficit.pic,
    pocket,
  };
}
