import { parseAmountInput } from '$lib/format';
import { DEFAULT_PIC, incomePicFromSource, PICS, type Pic } from '$lib/pics';

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
  incomeRows: readonly { source: string; amount: string }[];
  categories: readonly { id: number }[];
  budgetInputs: Record<number, string>;
  picInputs: Record<number, Pic>;
  subcategoryInputs: Record<number, readonly { amount: string; pic: Pic }[]>;
}): PicPlanRow[] {
  const incomeByPic: Record<Pic, number> = { Derwin: 0, Anggita: 0 };
  const planByPic: Record<Pic, number> = { Derwin: 0, Anggita: 0 };

  for (const row of input.incomeRows) {
    const owner = incomePicFromSource(row.source);
    if (owner) {
      incomeByPic[owner] += parseAmountInput(row.amount || '');
    }
  }

  for (const cat of input.categories) {
    const pic = input.picInputs[cat.id] ?? DEFAULT_PIC;
    const subs = input.subcategoryInputs[cat.id] ?? [];
    planByPic[pic] += mainCategoryRemainder(input.budgetInputs[cat.id] || '', subs);
    for (const sub of subs) {
      planByPic[sub.pic] += parseAmountInput(sub.amount || '');
    }
  }

  return PICS.map((pic) => ({
    pic,
    income: incomeByPic[pic],
    plan: planByPic[pic],
    balancing: incomeByPic[pic] - planByPic[pic],
  }));
}

export function subExceedsCategory(
  categoryBudget: string,
  subs: readonly { amount: string }[],
): boolean {
  return subAmountTotal(subs) > parseAmountInput(categoryBudget || '');
}
