import type { Budget, BudgetSubcategory, Income } from '../db/schema.js';
import { defaultPic, isValidPic, listCachedPics, type Pic } from './pic.js';

export const BALANCING_ITEM_NAME = 'Balancing';

function parseAmount(value: string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function incomePicFromSource(source: string): Pic | null {
  const s = source.toLowerCase();
  const names = [...listCachedPics()].sort((a, b) => b.length - a.length);
  return names.find((p) => s.includes(p.toLowerCase())) ?? null;
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
  const incomeByPic: Record<string, number> = {};
  const planByPic: Record<string, number> = {};
  for (const pic of listCachedPics()) {
    incomeByPic[pic] = 0;
    planByPic[pic] = 0;
  }

  for (const row of input.incomes) {
    const owner = incomePicFromSource(row.source);
    if (owner) incomeByPic[owner] = (incomeByPic[owner] ?? 0) + parseAmount(row.amount);
  }

  const subsByCategory = new Map<number, BudgetSubcategory[]>();
  for (const sub of input.subcategories) {
    const list = subsByCategory.get(sub.categoryId) ?? [];
    list.push(sub);
    subsByCategory.set(sub.categoryId, list);
  }

  for (const budget of input.budgets) {
    const pic = isValidPic(budget.pic?.trim() ?? '') ? budget.pic.trim() : defaultPic();
    const subs = subsByCategory.get(budget.categoryId) ?? [];
    const subTotal = subAmountTotal(subs);
    const mainAmount = Math.max(0, parseAmount(budget.allocatedAmount) - subTotal);
    planByPic[pic] = (planByPic[pic] ?? 0) + mainAmount;
    for (const sub of subs) {
      const subPic = isValidPic(sub.pic?.trim() ?? '') ? sub.pic.trim() : pic;
      planByPic[subPic] = (planByPic[subPic] ?? 0) + parseAmount(sub.allocatedAmount);
    }
  }

  const pics = [...new Set([...Object.keys(incomeByPic), ...Object.keys(planByPic)])];
  const balancing = pics.map((pic) => ({
    pic,
    value: (incomeByPic[pic] ?? 0) - (planByPic[pic] ?? 0),
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
