import { parseAmountInput } from '$lib/format';
import { defaultPic, incomePicFromSource, type Pic } from '$lib/pics';

export const MAIN_SUB_LABEL = 'Main (default)';

export function subAmountTotal(
  subs: readonly { amount: string }[],
): number {
  return subs.reduce((sum, row) => sum + parseAmountInput(row.amount || ''), 0);
}

/** Remaining main-category budget after sub-category splits. */
export function mainCategoryRemainder(
  categoryBudget: string,
  subs: readonly { amount: string }[],
): number {
  return Math.max(0, parseAmountInput(categoryBudget || '') - subAmountTotal(subs));
}

/** Total plan = sum of main category budgets only (subs are splits, not extra). */
export function totalPlanFromCategories(
  categoryIds: readonly number[],
  budgetInputs: Record<number, string>,
): number {
  return categoryIds.reduce((sum, id) => sum + parseAmountInput(budgetInputs[id] || ''), 0);
}

export interface PicPlanRow {
  pic: Pic;
  income: number;
  plan: number;
  balancing: number;
}

export function picPlanSummary(input: {
  pics: readonly string[];
  incomeRows: readonly { source: string; amount: string }[];
  categories: readonly { id: number }[];
  budgetInputs: Record<number, string>;
  picInputs: Record<number, Pic>;
  subcategoryInputs: Record<number, readonly { amount: string; pic: Pic }[]>;
}): PicPlanRow[] {
  const names = input.pics.length > 0 ? [...input.pics] : [defaultPic()];
  const incomeByPic: Record<string, number> = Object.fromEntries(names.map((p) => [p, 0]));
  const planByPic: Record<string, number> = Object.fromEntries(names.map((p) => [p, 0]));

  for (const row of input.incomeRows) {
    const owner = incomePicFromSource(row.source, names);
    if (owner) {
      incomeByPic[owner] = (incomeByPic[owner] ?? 0) + parseAmountInput(row.amount || '');
    }
  }

  for (const cat of input.categories) {
    const pic = input.picInputs[cat.id] ?? defaultPic(names);
    const subs = input.subcategoryInputs[cat.id] ?? [];
    planByPic[pic] = (planByPic[pic] ?? 0) + mainCategoryRemainder(input.budgetInputs[cat.id] || '', subs);
    for (const sub of subs) {
      planByPic[sub.pic] = (planByPic[sub.pic] ?? 0) + parseAmountInput(sub.amount || '');
    }
  }

  const all = [...new Set([...names, ...Object.keys(incomeByPic), ...Object.keys(planByPic)])];
  return all.map((pic) => ({
    pic,
    income: incomeByPic[pic] ?? 0,
    plan: planByPic[pic] ?? 0,
    balancing: (incomeByPic[pic] ?? 0) - (planByPic[pic] ?? 0),
  }));
}

export function subExceedsCategory(
  categoryBudget: string,
  subs: readonly { amount: string }[],
): boolean {
  return subAmountTotal(subs) > parseAmountInput(categoryBudget || '');
}
