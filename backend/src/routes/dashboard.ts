import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { budgets, categories, incomes, transactions } from '../db/schema.js';
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
}
