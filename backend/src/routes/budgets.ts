import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  budgetSubcategories,
  budgets,
  categories,
  incomes,
  planChecklist,
  pockets,
  transactions,
} from '../db/schema.js';
import {
  BUDGET_CARRYOVER_STATUS,
  BUDGET_MOVE_STATUS,
  MAIN_BUCKET_LABEL,
  budgetMoveDate,
  budgetMoveLabels,
  carryoverDetail,
  carryoverIncomeSource,
  deficitDetail,
  isBudgetMoveTransaction,
} from '../lib/budget-move.js';
import { hasMatchingDetailSpend } from '../lib/checklist-auto-done.js';
import { appendTransactionToSheet } from '../lib/google-sheets.js';
import {
  BALANCING_ITEM_NAME,
  computeBalancingTransfer,
} from '../lib/checklist-balancing.js';
import { defaultPic, isValidPic } from '../lib/pic.js';
import { shiftPeriod } from '../lib/period.js';

interface IncomeInput {
  source: string;
  amount: number;
}

interface BudgetInput {
  categoryId: number;
  allocatedAmount: number;
  pic?: string;
  pocket?: string;
}

interface SubcategoryInput {
  categoryId: number;
  name: string;
  allocatedAmount?: number;
  pic?: string;
  pocket?: string;
}

interface PlanBody {
  period: string;
  incomes?: IncomeInput[];
  budgets?: BudgetInput[];
  subcategories?: SubcategoryInput[];
}

interface TransferEndpoint {
  categoryId: number;
  /** Empty / omitted = Main (default) residual of the category. */
  subcategoryName?: string | null;
}

interface TransferBody {
  period: string;
  amount: number;
  from: TransferEndpoint;
  to: TransferEndpoint;
}

interface CloseMonthBody {
  period: string;
}

interface ChecklistBody {
  period: string;
  categoryId?: number | null;
  subcategoryName: string;
  amount: number;
  senderPic: string;
  receiverPic: string;
  pocket?: string;
}

interface ChecklistPatchBody {
  done: boolean;
}

interface CloseMonthBucket {
  categoryId: number;
  categoryName: string;
  subcategoryName: string;
  amount: number;
  kind: 'surplus' | 'deficit';
  pic: string;
  pocket: string;
}

function parseAmount(value: string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function amountStr(n: number): string {
  return String(Math.round(n));
}

function normalizeSubName(name?: string | null): string {
  return name?.trim() ?? '';
}

function findSubByName<T extends { name: string }>(
  rows: T[],
  name: string,
): T | undefined {
  const key = name.toLowerCase();
  return rows.find((row) => row.name.trim().toLowerCase() === key);
}

const checklistSelectFields = {
  id: planChecklist.id,
  period: planChecklist.period,
  categoryId: planChecklist.categoryId,
  categoryName: categories.name,
  subcategoryName: planChecklist.subcategoryName,
  amount: planChecklist.amount,
  senderPic: planChecklist.senderPic,
  receiverPic: planChecklist.receiverPic,
  pocket: planChecklist.pocket,
  done: planChecklist.done,
  isBalancing: planChecklist.isBalancing,
};

async function fetchChecklistForPeriod(period: string, projectId: number) {
  return db
    .select(checklistSelectFields)
    .from(planChecklist)
    .leftJoin(categories, eq(planChecklist.categoryId, categories.id))
    .where(and(eq(planChecklist.period, period), eq(planChecklist.projectId, projectId)))
    .orderBy(desc(planChecklist.isBalancing), asc(planChecklist.id));
}

async function fetchChecklistItemById(id: number, projectId: number) {
  const [row] = await db
    .select(checklistSelectFields)
    .from(planChecklist)
    .leftJoin(categories, eq(planChecklist.categoryId, categories.id))
    .where(and(eq(planChecklist.id, id), eq(planChecklist.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

async function syncBalancingChecklist(
  period: string,
  projectId: number,
  incomeRows: typeof incomes.$inferSelect[],
  budgetRows: typeof budgets.$inferSelect[],
  subcategoryRows: typeof budgetSubcategories.$inferSelect[],
): Promise<void> {
  const transfer = computeBalancingTransfer({
    incomes: incomeRows,
    budgets: budgetRows,
    subcategories: subcategoryRows,
  });

  const [existing] = await db
    .select()
    .from(planChecklist)
    .where(
      and(
        eq(planChecklist.period, period),
        eq(planChecklist.projectId, projectId),
        eq(planChecklist.isBalancing, true),
      ),
    )
    .limit(1);

  if (!transfer) {
    if (existing) {
      await db
        .delete(planChecklist)
        .where(and(eq(planChecklist.id, existing.id), eq(planChecklist.projectId, projectId)));
    }
    return;
  }

  if (existing) {
    if (existing.done) return;
    await db
      .update(planChecklist)
      .set({
        amount: amountStr(transfer.amount),
        senderPic: transfer.senderPic,
        receiverPic: transfer.receiverPic,
        pocket: transfer.pocket.toUpperCase(),
        subcategoryName: BALANCING_ITEM_NAME,
      })
      .where(and(eq(planChecklist.id, existing.id), eq(planChecklist.projectId, projectId)));
    return;
  }

  await db.insert(planChecklist).values({
    projectId,
    period,
    categoryId: null,
    subcategoryName: BALANCING_ITEM_NAME,
    amount: amountStr(transfer.amount),
    senderPic: transfer.senderPic,
    receiverPic: transfer.receiverPic,
    pocket: transfer.pocket.toUpperCase(),
    isBalancing: true,
    done: false,
  });
}

export async function budgetRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { period?: string } }>(
    '/api/plan',
    async (request, reply) => {
      const projectId = request.projectId!;
      const period = request.query.period?.trim();

      if (!period) {
        return reply.code(400).send({ error: 'period query parameter is required' });
      }

      const incomeRows = await db
        .select()
        .from(incomes)
        .where(and(eq(incomes.period, period), eq(incomes.projectId, projectId)));

      const budgetRows = await db
        .select({
          id: budgets.id,
          categoryId: budgets.categoryId,
          categoryName: categories.name,
          allocatedAmount: budgets.allocatedAmount,
          pic: budgets.pic,
          pocket: budgets.pocket,
          period: budgets.period,
        })
        .from(budgets)
        .innerJoin(categories, eq(budgets.categoryId, categories.id))
        .where(and(eq(budgets.period, period), eq(budgets.projectId, projectId)))
        .orderBy(categories.id);

      const budgetRowsRaw = await db
        .select()
        .from(budgets)
        .where(and(eq(budgets.period, period), eq(budgets.projectId, projectId)));

      const subcategoryRows = await db
        .select({
          id: budgetSubcategories.id,
          categoryId: budgetSubcategories.categoryId,
          name: budgetSubcategories.name,
          allocatedAmount: budgetSubcategories.allocatedAmount,
          pic: budgetSubcategories.pic,
          pocket: budgetSubcategories.pocket,
          period: budgetSubcategories.period,
        })
        .from(budgetSubcategories)
        .where(and(eq(budgetSubcategories.period, period), eq(budgetSubcategories.projectId, projectId)))
        .orderBy(budgetSubcategories.categoryId, budgetSubcategories.name);

      const subcategoryRowsRaw = await db
        .select()
        .from(budgetSubcategories)
        .where(and(eq(budgetSubcategories.period, period), eq(budgetSubcategories.projectId, projectId)));

      await syncBalancingChecklist(period, projectId, incomeRows, budgetRowsRaw, subcategoryRowsRaw);
      const checklistRows = await fetchChecklistForPeriod(period, projectId);

      return {
        period,
        incomes: incomeRows,
        budgets: budgetRows,
        subcategories: subcategoryRows,
        checklist: checklistRows,
      };
    },
  );

  app.post<{ Body: ChecklistBody }>('/api/plan/checklist', async (request, reply) => {
    const projectId = request.projectId!;
    const body = request.body ?? {};
    const period = body.period?.trim();
    const subcategoryName = body.subcategoryName?.trim();
    const categoryIdRaw = body.categoryId;
    const categoryId =
      categoryIdRaw == null || categoryIdRaw === ('' as unknown as number)
        ? null
        : Number(categoryIdRaw);
    const amount = Math.round(Number(body.amount));
    const senderPic = body.senderPic?.trim() ?? '';
    const receiverPic = body.receiverPic?.trim() ?? '';
    const pocket = body.pocket?.trim().toUpperCase() || 'BCA';

    if (!period || !subcategoryName) {
      return reply.code(400).send({ error: 'period and subcategoryName are required' });
    }
    if (categoryId != null && (!Number.isFinite(categoryId) || categoryId <= 0)) {
      return reply.code(400).send({ error: 'Invalid categoryId' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return reply.code(400).send({ error: 'amount must be a positive number' });
    }
    if (!isValidPic(senderPic) || !isValidPic(receiverPic)) {
      return reply.code(400).send({ error: 'Invalid sender or receiver PIC' });
    }
    if (senderPic === receiverPic) {
      return reply.code(400).send({ error: 'Sender and receiver must be different' });
    }

    const allowedPocketRows = await db.select({ name: pockets.name }).from(pockets);
    const allowedPockets = new Set(allowedPocketRows.map((row) => row.name.toUpperCase()));
    if (pocket && !allowedPockets.has(pocket)) {
      return reply.code(400).send({ error: 'Invalid pocket value' });
    }

    if (categoryId != null) {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, categoryId))
        .limit(1);
      if (!category) {
        return reply.code(400).send({ error: 'Category not found' });
      }
    }

    const autoDone = await hasMatchingDetailSpend({
      projectId,
      period,
      categoryId: categoryId ?? null,
      subcategoryName,
      amount,
    });

    const [created] = await db
      .insert(planChecklist)
      .values({
        projectId,
        period,
        categoryId: categoryId ?? null,
        subcategoryName,
        amount: amountStr(amount),
        senderPic,
        receiverPic,
        pocket,
        done: autoDone,
        isBalancing: false,
      })
      .returning();

    const row = await fetchChecklistItemById(created.id, projectId);
    return reply.code(201).send({ item: row });
  });

  app.patch<{ Params: { id: string }; Body: ChecklistPatchBody }>(
    '/api/plan/checklist/:id',
    async (request, reply) => {
      const projectId = request.projectId!;
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: 'Invalid checklist id' });
      }

      const { done } = request.body ?? {};
      if (typeof done !== 'boolean') {
        return reply.code(400).send({ error: 'done must be a boolean' });
      }

      const [updated] = await db
        .update(planChecklist)
        .set({ done })
        .where(and(eq(planChecklist.id, id), eq(planChecklist.projectId, projectId)))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'Checklist item not found' });
      }

      const row = await fetchChecklistItemById(id, projectId);
      return { item: row };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/plan/checklist/:id', async (request, reply) => {
    const projectId = request.projectId!;
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: 'Invalid checklist id' });
    }

    const [existing] = await db
      .select({ id: planChecklist.id, isBalancing: planChecklist.isBalancing })
      .from(planChecklist)
      .where(and(eq(planChecklist.id, id), eq(planChecklist.projectId, projectId)))
      .limit(1);

    if (!existing) {
      return reply.code(404).send({ error: 'Checklist item not found' });
    }
    if (existing.isBalancing) {
      return reply.code(400).send({ error: 'Balancing item cannot be deleted' });
    }

    await db
      .delete(planChecklist)
      .where(and(eq(planChecklist.id, id), eq(planChecklist.projectId, projectId)));
    return { ok: true };
  });

  app.post<{ Body: PlanBody }>('/api/budgets', async (request, reply) => {
    const projectId = request.projectId!;
    const {
      period,
      incomes: incomeInputs,
      budgets: budgetInputs,
      subcategories: subcategoryInputs,
    } = request.body ?? {};

    if (!period?.trim()) {
      return reply.code(400).send({ error: 'period is required' });
    }

    const trimmedPeriod = period.trim();
    const allowedPocketRows = await db.select({ name: pockets.name }).from(pockets);
    const allowedPockets = new Set(allowedPocketRows.map((row) => row.name.toUpperCase()));

    if (Array.isArray(incomeInputs)) {
      await db
        .delete(incomes)
        .where(and(eq(incomes.period, trimmedPeriod), eq(incomes.projectId, projectId)));

      for (const income of incomeInputs) {
        const source = income.source?.trim();
        if (!source || income.amount == null || !Number.isFinite(income.amount) || income.amount <= 0) {
          continue;
        }

        await db.insert(incomes).values({
          projectId,
          source,
          amount: String(Math.round(income.amount)),
          period: trimmedPeriod,
        });
      }
    }

    if (Array.isArray(budgetInputs)) {
      await db
        .delete(budgets)
        .where(and(eq(budgets.period, trimmedPeriod), eq(budgets.projectId, projectId)));

      for (const budget of budgetInputs) {
        if (!budget.categoryId || budget.allocatedAmount == null) {
          return reply
            .code(400)
            .send({ error: 'Each budget requires categoryId and allocatedAmount' });
        }

        if (!Number.isFinite(budget.allocatedAmount) || budget.allocatedAmount <= 0) {
          continue;
        }

        const [category] = await db
          .select()
          .from(categories)
          .where(eq(categories.id, budget.categoryId))
          .limit(1);

        if (!category) {
          return reply.code(400).send({ error: `Category ${budget.categoryId} not found` });
        }

        const pic = budget.pic?.trim() ?? '';
        if (pic && !isValidPic(pic)) {
          return reply.code(400).send({ error: 'Invalid pic value' });
        }
        const pocket = budget.pocket?.trim() ?? '';
        if (pocket && !allowedPockets.has(pocket.toUpperCase())) {
          return reply.code(400).send({ error: 'Invalid pocket value' });
        }

        const amount = String(Math.round(budget.allocatedAmount));

        await db.insert(budgets).values({
          projectId,
          categoryId: budget.categoryId,
          allocatedAmount: amount,
          pic,
          pocket: pocket.toUpperCase(),
          period: trimmedPeriod,
        });
      }
    }

    if (subcategoryInputs) {
      await db
        .delete(budgetSubcategories)
        .where(
          and(
            eq(budgetSubcategories.period, trimmedPeriod),
            eq(budgetSubcategories.projectId, projectId),
          ),
        );

      for (const sub of subcategoryInputs) {
        const name = sub.name?.trim();
        if (!sub.categoryId || !name) continue;

        const [category] = await db
          .select()
          .from(categories)
          .where(eq(categories.id, sub.categoryId))
          .limit(1);

        if (!category) {
          return reply.code(400).send({ error: `Category ${sub.categoryId} not found` });
        }

        const pic = sub.pic?.trim() ?? '';
        if (pic && !isValidPic(pic)) {
          return reply.code(400).send({ error: 'Invalid pic value' });
        }
        const pocket = sub.pocket?.trim() ?? '';
        if (pocket && !allowedPockets.has(pocket.toUpperCase())) {
          return reply.code(400).send({ error: 'Invalid pocket value' });
        }

        const amount = String(Math.round(sub.allocatedAmount ?? 0));

        await db.insert(budgetSubcategories).values({
          projectId,
          categoryId: sub.categoryId,
          period: trimmedPeriod,
          name,
          allocatedAmount: amount,
          pic,
          pocket: pocket.toUpperCase(),
        });
      }
    }

    const savedIncomes = await db
      .select()
      .from(incomes)
      .where(and(eq(incomes.period, trimmedPeriod), eq(incomes.projectId, projectId)));
    const savedBudgets = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.period, trimmedPeriod), eq(budgets.projectId, projectId)));
    const savedSubs = await db
      .select()
      .from(budgetSubcategories)
      .where(
        and(
          eq(budgetSubcategories.period, trimmedPeriod),
          eq(budgetSubcategories.projectId, projectId),
        ),
      );
    await syncBalancingChecklist(trimmedPeriod, projectId, savedIncomes, savedBudgets, savedSubs);

    return reply.code(200).send({ ok: true, period: trimmedPeriod });
  });

  app.post<{ Body: TransferBody }>('/api/budgets/transfer', async (request, reply) => {
    const projectId = request.projectId!;
    const { period, amount, from, to } = request.body ?? {};

    if (!period?.trim()) {
      return reply.code(400).send({ error: 'period is required' });
    }

    const fromCategoryId = Number(from?.categoryId);
    const toCategoryId = Number(to?.categoryId);
    if (!fromCategoryId || !toCategoryId) {
      return reply.code(400).send({ error: 'from and to categoryId are required' });
    }

    const roundedAmount = Math.round(Number(amount));
    if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
      return reply.code(400).send({ error: 'amount must be a positive number' });
    }

    const trimmedPeriod = period.trim();
    const fromSubName = normalizeSubName(from.subcategoryName);
    const toSubName = normalizeSubName(to.subcategoryName);

    if (fromCategoryId === toCategoryId && fromSubName.toLowerCase() === toSubName.toLowerCase()) {
      return reply.code(400).send({ error: 'from and to must be different' });
    }

    const categoryIds = [...new Set([fromCategoryId, toCategoryId])];
    for (const categoryId of categoryIds) {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, categoryId))
        .limit(1);
      if (!category) {
        return reply.code(400).send({ error: `Category ${categoryId} not found` });
      }
    }

    try {
      const moved = await db.transaction(async (tx) => {
        const periodBudgets = await tx
          .select()
          .from(budgets)
          .where(and(eq(budgets.period, trimmedPeriod), eq(budgets.projectId, projectId)));

        const periodSubs = await tx
          .select()
          .from(budgetSubcategories)
          .where(
            and(
              eq(budgetSubcategories.period, trimmedPeriod),
              eq(budgetSubcategories.projectId, projectId),
            ),
          );

        const periodTx = await tx
          .select({
            categoryId: transactions.categoryId,
            subCategory: transactions.subCategory,
            cost: transactions.cost,
            status: transactions.status,
          })
          .from(transactions)
          .where(and(eq(transactions.period, trimmedPeriod), eq(transactions.projectId, projectId)));

        const budgetByCategory = new Map(periodBudgets.map((row) => [row.categoryId, row]));
        const subsByCategory = new Map<number, typeof periodSubs>();
        for (const row of periodSubs) {
          const list = subsByCategory.get(row.categoryId) ?? [];
          list.push(row);
          subsByCategory.set(row.categoryId, list);
        }

        const spentByCategory = new Map<number, number>();
        const spentBySubKey = new Map<string, number>();
        for (const txRow of periodTx) {
          if (isBudgetMoveTransaction(txRow)) continue;
          const cost = parseAmount(txRow.cost);
          spentByCategory.set(txRow.categoryId, (spentByCategory.get(txRow.categoryId) ?? 0) + cost);
          const sub = txRow.subCategory?.trim();
          if (sub) {
            const key = `${txRow.categoryId}|${sub.toLowerCase()}`;
            spentBySubKey.set(key, (spentBySubKey.get(key) ?? 0) + cost);
          }
        }

        function categoryAllocated(categoryId: number): number {
          return parseAmount(budgetByCategory.get(categoryId)?.allocatedAmount);
        }

        function subAllocated(categoryId: number, name: string): number {
          const row = findSubByName(subsByCategory.get(categoryId) ?? [], name);
          return parseAmount(row?.allocatedAmount);
        }

        function mainRemainder(categoryId: number): number {
          const subs = subsByCategory.get(categoryId) ?? [];
          const subTotal = subs.reduce((sum, row) => sum + parseAmount(row.allocatedAmount), 0);
          return Math.max(0, categoryAllocated(categoryId) - subTotal);
        }

        function available(categoryId: number, subName: string): number {
          if (subName) {
            const allocated = subAllocated(categoryId, subName);
            const spent = spentBySubKey.get(`${categoryId}|${subName.toLowerCase()}`) ?? 0;
            return Math.max(0, allocated - spent);
          }
          const allocated = mainRemainder(categoryId);
          const categorySpent = spentByCategory.get(categoryId) ?? 0;
          const subs = subsByCategory.get(categoryId) ?? [];
          let subSpent = 0;
          for (const row of subs) {
            subSpent += spentBySubKey.get(`${categoryId}|${row.name.trim().toLowerCase()}`) ?? 0;
          }
          const mainSpent = Math.max(0, categorySpent - subSpent);
          return Math.max(0, allocated - mainSpent);
        }

        if (available(fromCategoryId, fromSubName) < roundedAmount) {
          throw new Error(
            fromSubName
              ? `Not enough remaining allocation in "${fromSubName}" to move ${roundedAmount}`
              : `Not enough remaining Main allocation to move ${roundedAmount}`,
          );
        }

        const nextCategoryAllocated = new Map<number, number>();
        for (const categoryId of categoryIds) {
          nextCategoryAllocated.set(categoryId, categoryAllocated(categoryId));
        }

        const nextSubAllocated = new Map<string, number>();
        function subKey(categoryId: number, name: string): string {
          return `${categoryId}|${name.trim().toLowerCase()}`;
        }
        for (const row of periodSubs) {
          nextSubAllocated.set(subKey(row.categoryId, row.name), parseAmount(row.allocatedAmount));
        }

        // Cross-category moves shift category totals so Main residuals stay coherent.
        if (fromCategoryId !== toCategoryId) {
          nextCategoryAllocated.set(
            fromCategoryId,
            (nextCategoryAllocated.get(fromCategoryId) ?? 0) - roundedAmount,
          );
          nextCategoryAllocated.set(
            toCategoryId,
            (nextCategoryAllocated.get(toCategoryId) ?? 0) + roundedAmount,
          );
        }

        if (fromSubName) {
          const key = subKey(fromCategoryId, fromSubName);
          nextSubAllocated.set(key, (nextSubAllocated.get(key) ?? 0) - roundedAmount);
        }

        if (toSubName) {
          const key = subKey(toCategoryId, toSubName);
          nextSubAllocated.set(key, (nextSubAllocated.get(key) ?? 0) + roundedAmount);
        }

        for (const categoryId of categoryIds) {
          const catTotal = nextCategoryAllocated.get(categoryId) ?? 0;
          if (catTotal < 0) {
            throw new Error('Category allocation cannot go below zero');
          }
          const subs = periodSubs.filter((row) => row.categoryId === categoryId);
          let subTotal = 0;
          for (const row of subs) {
            const next = nextSubAllocated.get(subKey(categoryId, row.name)) ?? 0;
            if (next < 0) {
              throw new Error(`Sub-category "${row.name}" allocation cannot go below zero`);
            }
            subTotal += next;
          }
          // Destination sub may be brand new.
          if (toCategoryId === categoryId && toSubName) {
            const existing = findSubByName(subs, toSubName);
            if (!existing) {
              subTotal += nextSubAllocated.get(subKey(categoryId, toSubName)) ?? 0;
            }
          }
          if (subTotal > catTotal) {
            throw new Error('Sub-category allocations cannot exceed the category budget');
          }
        }

        async function upsertCategoryAmount(categoryId: number, nextAmount: number): Promise<void> {
          const existing = budgetByCategory.get(categoryId);
          if (existing) {
            await tx
              .update(budgets)
              .set({ allocatedAmount: amountStr(nextAmount) })
              .where(
                and(
                  eq(budgets.categoryId, categoryId),
                  eq(budgets.period, trimmedPeriod),
                  eq(budgets.projectId, projectId),
                ),
              );
            return;
          }
          if (nextAmount <= 0) return;
          await tx.insert(budgets).values({
            projectId,
            categoryId,
            allocatedAmount: amountStr(nextAmount),
            pic: '',
            pocket: '',
            period: trimmedPeriod,
          });
        }

        for (const categoryId of categoryIds) {
          await upsertCategoryAmount(categoryId, nextCategoryAllocated.get(categoryId) ?? 0);
        }

        if (fromSubName) {
          const sourceRow = findSubByName(subsByCategory.get(fromCategoryId) ?? [], fromSubName);
          if (!sourceRow) {
            throw new Error(`Sub-category "${fromSubName}" not found`);
          }
          const next = nextSubAllocated.get(subKey(fromCategoryId, fromSubName)) ?? 0;
          await tx
            .update(budgetSubcategories)
            .set({ allocatedAmount: amountStr(next) })
            .where(
              and(
                eq(budgetSubcategories.id, sourceRow.id),
                eq(budgetSubcategories.projectId, projectId),
              ),
            );
        }

        if (toSubName) {
          const destRow = findSubByName(subsByCategory.get(toCategoryId) ?? [], toSubName);
          const next = nextSubAllocated.get(subKey(toCategoryId, toSubName)) ?? 0;
          if (destRow) {
            await tx
              .update(budgetSubcategories)
              .set({ allocatedAmount: amountStr(next) })
              .where(
                and(
                  eq(budgetSubcategories.id, destRow.id),
                  eq(budgetSubcategories.projectId, projectId),
                ),
              );
          } else {
            const destBudget = budgetByCategory.get(toCategoryId);
            await tx.insert(budgetSubcategories).values({
              projectId,
              categoryId: toCategoryId,
              period: trimmedPeriod,
              name: toSubName,
              allocatedAmount: amountStr(next),
              pic: destBudget?.pic ?? '',
              pocket: destBudget?.pocket ?? '',
            });
          }
        }

        function bucketPic(categoryId: number, subName: string): string {
          if (subName) {
            const row = findSubByName(subsByCategory.get(categoryId) ?? [], subName);
            const pic = row?.pic?.trim() ?? '';
            if (pic && isValidPic(pic)) return pic;
          }
          const pic = budgetByCategory.get(categoryId)?.pic?.trim() ?? '';
          return pic && isValidPic(pic) ? pic : defaultPic();
        }

        const [fromCatRow] = await tx
          .select({ name: categories.name })
          .from(categories)
          .where(eq(categories.id, fromCategoryId))
          .limit(1);
        const [toCatRow] = await tx
          .select({ name: categories.name })
          .from(categories)
          .where(eq(categories.id, toCategoryId))
          .limit(1);

        const labels = budgetMoveLabels({
          fromCategoryName: fromCatRow?.name ?? 'Category',
          fromSubName: fromSubName,
          toCategoryName: toCatRow?.name ?? 'Category',
          toSubName: toSubName,
        });

        const moveDate = budgetMoveDate(trimmedPeriod);
        const costStr = amountStr(roundedAmount);

        const [fromTx] = await tx
          .insert(transactions)
          .values({
            projectId,
            date: moveDate,
            categoryId: fromCategoryId,
            subCategory: fromSubName,
            detail: labels.fromDetail,
            cost: costStr,
            period: trimmedPeriod,
            pic: bucketPic(fromCategoryId, fromSubName),
            status: BUDGET_MOVE_STATUS,
          })
          .returning();

        const [toTx] = await tx
          .insert(transactions)
          .values({
            projectId,
            date: moveDate,
            categoryId: toCategoryId,
            subCategory: toSubName,
            detail: labels.toDetail,
            cost: costStr,
            period: trimmedPeriod,
            pic: bucketPic(toCategoryId, toSubName),
            status: BUDGET_MOVE_STATUS,
          })
          .returning();

        return {
          fromTx,
          toTx,
          fromCategoryName: fromCatRow?.name ?? '',
          toCategoryName: toCatRow?.name ?? '',
        };
      });

      if (moved.fromTx) {
        await appendTransactionToSheet({
          date: moved.fromTx.date,
          categoryName: moved.fromCategoryName,
          detail: moved.fromTx.detail,
          cost: moved.fromTx.cost,
          period: moved.fromTx.period,
          pic: moved.fromTx.pic,
        });
      }
      if (moved.toTx) {
        await appendTransactionToSheet({
          date: moved.toTx.date,
          categoryName: moved.toCategoryName,
          detail: moved.toTx.detail,
          cost: moved.toTx.cost,
          period: moved.toTx.period,
          pic: moved.toTx.pic,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to transfer budget';
      return reply.code(400).send({ error: message });
    }

    return reply.code(200).send({ ok: true, period: trimmedPeriod, amount: roundedAmount });
  });

  app.post<{ Body: CloseMonthBody }>('/api/budgets/close-month', async (request, reply) => {
    const projectId = request.projectId!;
    const period = request.body?.period?.trim();
    if (!period) {
      return reply.code(400).send({ error: 'period is required' });
    }

    const toPeriod = shiftPeriod(period, 1);
    if (toPeriod === period) {
      return reply.code(400).send({ error: 'Invalid period' });
    }

    const alreadyClosedIncomes = await db
      .select({ id: incomes.id })
      .from(incomes)
      .where(
        and(
          eq(incomes.projectId, projectId),
          eq(incomes.period, toPeriod),
          ilike(incomes.source, `Carryover from ${period}%`),
        ),
      )
      .limit(1);

    if (alreadyClosedIncomes.length > 0) {
      return reply.code(409).send({ error: `${period} is already closed into ${toPeriod}` });
    }

    const alreadyClosedTx = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.projectId, projectId),
          eq(transactions.period, toPeriod),
          or(
            ilike(transactions.detail, `Carryover from ${period}%`),
            ilike(transactions.detail, `Deficit from ${period}%`),
          ),
        ),
      )
      .limit(1);

    if (alreadyClosedTx.length > 0) {
      return reply.code(409).send({ error: `${period} is already closed into ${toPeriod}` });
    }

    type SheetRow = {
      date: string;
      categoryName: string;
      detail: string;
      cost: string;
      period: string;
      pic: string;
    };

    let carried: CloseMonthBucket[] = [];
    let sheetRows: SheetRow[] = [];
    let incomeAdded = 0;

    try {
      const result = await db.transaction(async (tx) => {
        const allCategories = await tx.select().from(categories);
        const categoryNameById = new Map(allCategories.map((c) => [c.id, c.name]));

        const periodBudgets = await tx
          .select()
          .from(budgets)
          .where(and(eq(budgets.period, period), eq(budgets.projectId, projectId)));
        const periodSubs = await tx
          .select()
          .from(budgetSubcategories)
          .where(
            and(eq(budgetSubcategories.period, period), eq(budgetSubcategories.projectId, projectId)),
          );
        const periodTx = await tx
          .select({
            categoryId: transactions.categoryId,
            subCategory: transactions.subCategory,
            cost: transactions.cost,
            status: transactions.status,
          })
          .from(transactions)
          .where(and(eq(transactions.period, period), eq(transactions.projectId, projectId)));

        const budgetByCategory = new Map(periodBudgets.map((row) => [row.categoryId, row]));
        const subsByCategory = new Map<number, typeof periodSubs>();
        for (const row of periodSubs) {
          const list = subsByCategory.get(row.categoryId) ?? [];
          list.push(row);
          subsByCategory.set(row.categoryId, list);
        }

        const spentByCategory = new Map<number, number>();
        const spentBySubKey = new Map<string, number>();
        for (const txRow of periodTx) {
          if (isBudgetMoveTransaction(txRow)) continue;
          const cost = parseAmount(txRow.cost);
          spentByCategory.set(txRow.categoryId, (spentByCategory.get(txRow.categoryId) ?? 0) + cost);
          const sub = txRow.subCategory?.trim();
          if (sub) {
            const key = `${txRow.categoryId}|${sub.toLowerCase()}`;
            spentBySubKey.set(key, (spentBySubKey.get(key) ?? 0) + cost);
          }
        }

        const buckets: CloseMonthBucket[] = [];

        for (const budget of periodBudgets) {
          const categoryId = budget.categoryId;
          const categoryName = categoryNameById.get(categoryId) ?? 'Category';
          const allocated = parseAmount(budget.allocatedAmount);
          const spent = spentByCategory.get(categoryId) ?? 0;
          const subs = subsByCategory.get(categoryId) ?? [];

          if (subs.length === 0) {
            const sisa = Math.round(allocated - spent);
            if (sisa === 0) continue;
            buckets.push({
              categoryId,
              categoryName,
              subcategoryName: '',
              amount: Math.abs(sisa),
              kind: sisa > 0 ? 'surplus' : 'deficit',
              pic: budget.pic?.trim() && isValidPic(budget.pic.trim()) ? budget.pic.trim() : defaultPic(),
              pocket: budget.pocket?.trim() ?? '',
            });
            continue;
          }

          let subAllocatedSum = 0;
          let subSpentSum = 0;
          for (const sub of subs) {
            const subAllocated = parseAmount(sub.allocatedAmount);
            const subSpent = spentBySubKey.get(`${categoryId}|${sub.name.trim().toLowerCase()}`) ?? 0;
            subAllocatedSum += subAllocated;
            subSpentSum += subSpent;
            const sisa = Math.round(subAllocated - subSpent);
            if (sisa === 0) continue;
            buckets.push({
              categoryId,
              categoryName,
              subcategoryName: sub.name.trim(),
              amount: Math.abs(sisa),
              kind: sisa > 0 ? 'surplus' : 'deficit',
              pic: sub.pic?.trim() && isValidPic(sub.pic.trim()) ? sub.pic.trim() : defaultPic(),
              pocket: sub.pocket?.trim() || budget.pocket?.trim() || '',
            });
          }

          const mainAllocated = Math.max(0, allocated - subAllocatedSum);
          const mainSpent = Math.max(0, spent - subSpentSum);
          const mainSisa = Math.round(mainAllocated - mainSpent);
          if (mainSisa !== 0) {
            buckets.push({
              categoryId,
              categoryName,
              subcategoryName: '',
              amount: Math.abs(mainSisa),
              kind: mainSisa > 0 ? 'surplus' : 'deficit',
              pic: budget.pic?.trim() && isValidPic(budget.pic.trim()) ? budget.pic.trim() : defaultPic(),
              pocket: budget.pocket?.trim() ?? '',
            });
          }
        }

        if (buckets.length === 0) {
          throw new Error(`Nothing to close for ${period} — all buckets are settled`);
        }

        const nextBudgets = await tx
          .select()
          .from(budgets)
          .where(and(eq(budgets.period, toPeriod), eq(budgets.projectId, projectId)));
        const nextSubs = await tx
          .select()
          .from(budgetSubcategories)
          .where(
            and(
              eq(budgetSubcategories.period, toPeriod),
              eq(budgetSubcategories.projectId, projectId),
            ),
          );
        const nextBudgetByCategory = new Map(nextBudgets.map((row) => [row.categoryId, row]));
        const nextSubsByCategory = new Map<number, typeof nextSubs>();
        for (const row of nextSubs) {
          const list = nextSubsByCategory.get(row.categoryId) ?? [];
          list.push(row);
          nextSubsByCategory.set(row.categoryId, list);
        }

        const incomeByPic = new Map<string, number>();
        const createdSheetRows: SheetRow[] = [];
        const moveDate = budgetMoveDate(toPeriod);

        async function bumpCategoryAllocation(
          categoryId: number,
          amount: number,
          pic: string,
          pocket: string,
        ): Promise<void> {
          const existing = nextBudgetByCategory.get(categoryId);
          if (existing) {
            const nextAmount = parseAmount(existing.allocatedAmount) + amount;
            await tx
              .update(budgets)
              .set({ allocatedAmount: amountStr(nextAmount) })
              .where(
                and(
                  eq(budgets.categoryId, categoryId),
                  eq(budgets.period, toPeriod),
                  eq(budgets.projectId, projectId),
                ),
              );
            existing.allocatedAmount = amountStr(nextAmount);
            return;
          }
          await tx.insert(budgets).values({
            projectId,
            categoryId,
            allocatedAmount: amountStr(amount),
            pic,
            pocket: pocket.toUpperCase(),
            period: toPeriod,
          });
          nextBudgetByCategory.set(categoryId, {
            id: 0,
            projectId,
            categoryId,
            allocatedAmount: amountStr(amount),
            pic,
            pocket: pocket.toUpperCase(),
            period: toPeriod,
          });
        }

        async function bumpSubAllocation(
          categoryId: number,
          name: string,
          amount: number,
          pic: string,
          pocket: string,
        ): Promise<void> {
          const list = nextSubsByCategory.get(categoryId) ?? [];
          const existing = findSubByName(list, name);
          if (existing) {
            const nextAmount = parseAmount(existing.allocatedAmount) + amount;
            await tx
              .update(budgetSubcategories)
              .set({ allocatedAmount: amountStr(nextAmount) })
              .where(
                and(
                  eq(budgetSubcategories.id, existing.id),
                  eq(budgetSubcategories.projectId, projectId),
                ),
              );
            existing.allocatedAmount = amountStr(nextAmount);
            return;
          }
          const [inserted] = await tx
            .insert(budgetSubcategories)
            .values({
              projectId,
              categoryId,
              period: toPeriod,
              name,
              allocatedAmount: amountStr(amount),
              pic,
              pocket: pocket.toUpperCase(),
            })
            .returning();
          list.push(inserted);
          nextSubsByCategory.set(categoryId, list);
        }

        for (const bucket of buckets) {
          if (bucket.kind === 'surplus') {
            incomeByPic.set(bucket.pic, (incomeByPic.get(bucket.pic) ?? 0) + bucket.amount);
            await bumpCategoryAllocation(
              bucket.categoryId,
              bucket.amount,
              bucket.pic,
              bucket.pocket,
            );
            if (bucket.subcategoryName) {
              await bumpSubAllocation(
                bucket.categoryId,
                bucket.subcategoryName,
                bucket.amount,
                bucket.pic,
                bucket.pocket,
              );
            }

            const [created] = await tx
              .insert(transactions)
              .values({
                projectId,
                date: moveDate,
                categoryId: bucket.categoryId,
                subCategory: bucket.subcategoryName,
                detail: carryoverDetail(period, bucket.categoryName, bucket.subcategoryName),
                cost: amountStr(bucket.amount),
                period: toPeriod,
                pic: bucket.pic,
                status: BUDGET_CARRYOVER_STATUS,
              })
              .returning();

            createdSheetRows.push({
              date: created.date,
              categoryName: bucket.categoryName,
              detail: created.detail,
              cost: created.cost,
              period: created.period,
              pic: created.pic,
            });
          } else {
            const [created] = await tx
              .insert(transactions)
              .values({
                projectId,
                date: moveDate,
                categoryId: bucket.categoryId,
                subCategory: bucket.subcategoryName,
                detail: deficitDetail(period, bucket.categoryName, bucket.subcategoryName),
                cost: amountStr(bucket.amount),
                period: toPeriod,
                pic: bucket.pic,
                status: 'Not Yet',
              })
              .returning();

            createdSheetRows.push({
              date: created.date,
              categoryName: bucket.categoryName,
              detail: created.detail,
              cost: created.cost,
              period: created.period,
              pic: created.pic,
            });
          }
        }

        let totalIncome = 0;
        for (const [pic, amount] of incomeByPic) {
          if (amount <= 0) continue;
          totalIncome += amount;
          const source = carryoverIncomeSource(period, pic);
          await tx
            .insert(incomes)
            .values({
              projectId,
              source,
              amount: amountStr(amount),
              period: toPeriod,
            })
            .onConflictDoUpdate({
              target: [incomes.projectId, incomes.source, incomes.period],
              set: { amount: amountStr(amount) },
            });
        }

        return { buckets, createdSheetRows, totalIncome };
      });

      carried = result.buckets;
      sheetRows = result.createdSheetRows;
      incomeAdded = result.totalIncome;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to close month';
      const code = message.includes('Nothing to close') ? 400 : 400;
      return reply.code(code).send({ error: message });
    }

    for (const row of sheetRows) {
      await appendTransactionToSheet(row);
    }

    const surplus = carried
      .filter((b) => b.kind === 'surplus')
      .reduce((sum, b) => sum + b.amount, 0);
    const deficit = carried
      .filter((b) => b.kind === 'deficit')
      .reduce((sum, b) => sum + b.amount, 0);

    return reply.code(200).send({
      ok: true,
      fromPeriod: period,
      toPeriod,
      carried: carried.map((b) => ({
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        subcategoryName: b.subcategoryName || MAIN_BUCKET_LABEL,
        amount: b.amount,
        kind: b.kind,
        pic: b.pic,
      })),
      totals: { surplus, deficit, incomeAdded },
    });
  });
}
