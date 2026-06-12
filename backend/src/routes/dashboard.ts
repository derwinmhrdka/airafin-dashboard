import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { budgetSubcategories, budgets, categories, incomes, transactions } from '../db/schema.js';
import {
  resolvePlanPicFromMaps,
  subcategoryPicKey,
} from '../lib/plan-pic.js';
import { isValidPic } from '../lib/pic.js';
import { roundMoney, toNumber } from '../lib/money.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { period?: string } }>(
    '/api/dashboard/summary',
    async (request, reply) => {
      const period = request.query.period?.trim();

      if (!period) {
        return reply.code(400).send({ error: 'period query parameter is required' });
      }

      const [incomeRow] = await db
        .select({ total: sql<string>`coalesce(sum(${incomes.amount}), 0)` })
        .from(incomes)
        .where(eq(incomes.period, period));

      const [budgetRow] = await db
        .select({ total: sql<string>`coalesce(sum(${budgets.allocatedAmount}), 0)` })
        .from(budgets)
        .where(eq(budgets.period, period));

      const [spentRow] = await db
        .select({ total: sql<string>`coalesce(sum(${transactions.cost}), 0)` })
        .from(transactions)
        .where(eq(transactions.period, period));

      const allCategories = await db.select().from(categories).orderBy(categories.id);
      const periodBudgets = await db.select().from(budgets).where(eq(budgets.period, period));
      const periodTransactions = await db
        .select()
        .from(transactions)
        .where(eq(transactions.period, period));

      const allocatedByCategory = new Map(
        periodBudgets.map((b) => [b.categoryId, toNumber(b.allocatedAmount)]),
      );
      const spentByCategory = new Map<number, number>();

      for (const tx of periodTransactions) {
        const current = spentByCategory.get(tx.categoryId) ?? 0;
        spentByCategory.set(tx.categoryId, current + toNumber(tx.cost));
      }

      const totalIncome = roundMoney(toNumber(incomeRow?.total));
      const totalBudgetAllocated = roundMoney(toNumber(budgetRow?.total));
      const totalSpent = roundMoney(toNumber(spentRow?.total));
      const totalSisa = roundMoney(totalBudgetAllocated - totalSpent);

      const categoriesSummary = allCategories.map((cat) => {
        const allocated = roundMoney(allocatedByCategory.get(cat.id) ?? 0);
        const spent = roundMoney(spentByCategory.get(cat.id) ?? 0);
        return {
          categoryId: cat.id,
          categoryName: cat.name,
          allocated,
          spent,
          sisa: roundMoney(allocated - spent),
        };
      });

      return {
        period,
        totalIncome,
        totalBudgetAllocated,
        totalSpent,
        totalSisa,
        categories: categoriesSummary,
      };
    },
  );

  app.get<{ Querystring: { period?: string } }>(
    '/api/dashboard/reimbursements',
    async (request, reply) => {
      const period = request.query.period?.trim();

      if (!period) {
        return reply.code(400).send({ error: 'period query parameter is required' });
      }

      const budgetRows = await db
        .select({
          categoryId: budgets.categoryId,
          categoryName: categories.name,
          planPic: budgets.pic,
        })
        .from(budgets)
        .innerJoin(categories, eq(budgets.categoryId, categories.id))
        .where(eq(budgets.period, period));

      const subcategoryRows = await db
        .select({
          categoryId: budgetSubcategories.categoryId,
          name: budgetSubcategories.name,
          pic: budgetSubcategories.pic,
        })
        .from(budgetSubcategories)
        .where(eq(budgetSubcategories.period, period));

      const mainPicByCategory = new Map(
        budgetRows.map((b) => [b.categoryId, b.planPic]),
      );
      const categoryNameById = new Map(
        budgetRows.map((b) => [b.categoryId, b.categoryName]),
      );
      const subPicByKey = new Map(
        subcategoryRows.map((s) => [subcategoryPicKey(s.categoryId, s.name), s.pic]),
      );

      const txRows = await db
        .select({
          id: transactions.id,
          date: transactions.date,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          subCategory: transactions.subCategory,
          detail: transactions.detail,
          cost: transactions.cost,
          period: transactions.period,
          pic: transactions.pic,
          status: transactions.status,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(eq(transactions.period, period))
        .orderBy(desc(transactions.id));

      const reimbursements = txRows
        .map((tx) => {
          const txPic = tx.pic?.trim() ?? '';
          if (!txPic || !isValidPic(txPic)) return null;

          const planPic = resolvePlanPicFromMaps(
            tx.categoryId,
            tx.subCategory,
            mainPicByCategory,
            subPicByKey,
          );
          if (!planPic || planPic === txPic) return null;

          return {
            ...tx,
            planPic,
            categoryName: categoryNameById.get(tx.categoryId) ?? tx.categoryName,
          };
        })
        .filter((row) => row != null);

      return { period, reimbursements };
    },
  );
}
