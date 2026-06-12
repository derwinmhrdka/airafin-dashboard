import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { budgetSubcategories, budgets } from '../db/schema.js';
import { isValidPic } from './pic.js';

export function subcategoryPicKey(categoryId: number, name: string): string {
  return `${categoryId}|${name.trim().toLowerCase()}`;
}

export function resolvePlanPicFromMaps(
  categoryId: number,
  subCategory: string,
  mainPicByCategory: Map<number, string>,
  subPicByKey: Map<string, string>,
): string {
  const sub = subCategory.trim();
  if (sub) {
    const subPic = subPicByKey.get(subcategoryPicKey(categoryId, sub))?.trim() ?? '';
    if (subPic && isValidPic(subPic)) return subPic;
  }

  const mainPic = mainPicByCategory.get(categoryId)?.trim() ?? '';
  return mainPic && isValidPic(mainPic) ? mainPic : '';
}

export async function getPlanPicForTransaction(
  categoryId: number,
  period: string,
  subCategory: string,
): Promise<string> {
  const sub = subCategory.trim();
  if (sub) {
    const [subRow] = await db
      .select({ pic: budgetSubcategories.pic })
      .from(budgetSubcategories)
      .where(
        and(
          eq(budgetSubcategories.categoryId, categoryId),
          eq(budgetSubcategories.period, period),
          eq(budgetSubcategories.name, sub),
        ),
      )
      .limit(1);

    const subPic = subRow?.pic?.trim() ?? '';
    if (subPic && isValidPic(subPic)) return subPic;
  }

  const [budget] = await db
    .select({ pic: budgets.pic })
    .from(budgets)
    .where(and(eq(budgets.categoryId, categoryId), eq(budgets.period, period)))
    .limit(1);

  const mainPic = budget?.pic?.trim() ?? '';
  return mainPic && isValidPic(mainPic) ? mainPic : '';
}
