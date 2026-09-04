import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { planChecklist, transactions } from '../db/schema.js';
import { BUDGET_CARRYOVER_STATUS, BUDGET_MOVE_STATUS } from './budget-move.js';
import { syncTransferNotifications } from './notifications.js';

/** Detail spend already recorded for this plan subcategory + amount. */
export async function hasMatchingDetailSpend(input: {
  projectId: number;
  period: string;
  categoryId: number | null;
  subcategoryName: string;
  amount: number;
}): Promise<boolean> {
  const subKey = input.subcategoryName.trim().toLowerCase();
  if (!subKey || input.amount <= 0) return false;

  const conditions = [
    eq(transactions.projectId, input.projectId),
    eq(transactions.period, input.period),
    sql`lower(trim(${transactions.subCategory})) = ${subKey}`,
    sql`round(${transactions.cost}::numeric, 0) = ${input.amount}`,
    notInArray(transactions.status, [BUDGET_MOVE_STATUS, BUDGET_CARRYOVER_STATUS]),
  ];
  if (input.categoryId != null) {
    conditions.push(eq(transactions.categoryId, input.categoryId));
  }

  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

/**
 * When a Detail spend is saved, mark the oldest pending transfer checklist
 * with the same subcategory + amount (and category when set) as done.
 */
export async function autoDoneChecklistForDetailSpend(input: {
  projectId: number;
  period: string;
  categoryId: number;
  subcategoryName: string;
  amount: number;
}): Promise<{ checklistId: number } | null> {
  const subKey = input.subcategoryName.trim().toLowerCase();
  if (!subKey || input.amount <= 0) return null;

  const pending = await db
    .select({
      id: planChecklist.id,
      categoryId: planChecklist.categoryId,
    })
    .from(planChecklist)
    .where(
      and(
        eq(planChecklist.projectId, input.projectId),
        eq(planChecklist.period, input.period),
        eq(planChecklist.done, false),
        eq(planChecklist.isBalancing, false),
        sql`lower(trim(${planChecklist.subcategoryName})) = ${subKey}`,
        sql`round(${planChecklist.amount}::numeric, 0) = ${input.amount}`,
      ),
    )
    .orderBy(asc(planChecklist.id))
    .limit(20);

  const match = pending.find(
    (row) => row.categoryId == null || row.categoryId === input.categoryId,
  );
  if (!match) return null;

  await db
    .update(planChecklist)
    .set({ done: true })
    .where(and(eq(planChecklist.id, match.id), eq(planChecklist.projectId, input.projectId)));

  try {
    await syncTransferNotifications(input.period, input.projectId);
  } catch {
    /* non-blocking */
  }

  return { checklistId: match.id };
}
