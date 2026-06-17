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

const DEFAULT_POCKET = 'UNSET';

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
      const periodSubcategories = await db
        .select()
        .from(budgetSubcategories)
        .where(eq(budgetSubcategories.period, period));
      const periodTransactions = await db
        .select()
        .from(transactions)
        .where(eq(transactions.period, period));

      const allocatedByCategory = new Map(
        periodBudgets.map((b) => [b.categoryId, toNumber(b.allocatedAmount)]),
      );
      const spentByCategory = new Map<number, number>();
      const spentBySubKey = new Map<string, number>();

      for (const tx of periodTransactions) {
        const cost = toNumber(tx.cost);
        const current = spentByCategory.get(tx.categoryId) ?? 0;
        spentByCategory.set(tx.categoryId, current + cost);

        const sub = tx.subCategory?.trim();
        if (sub) {
          const key = `${tx.categoryId}|${sub.toLowerCase()}`;
          spentBySubKey.set(key, (spentBySubKey.get(key) ?? 0) + cost);
        }
      }

      const subsByCategory = new Map<number, typeof periodSubcategories>();
      for (const sub of periodSubcategories) {
        const list = subsByCategory.get(sub.categoryId) ?? [];
        list.push(sub);
        subsByCategory.set(sub.categoryId, list);
      }

      const totalIncome = roundMoney(toNumber(incomeRow?.total));
      const totalBudgetAllocated = roundMoney(toNumber(budgetRow?.total));
      const totalSpent = roundMoney(toNumber(spentRow?.total));
      const totalSisa = roundMoney(totalBudgetAllocated - totalSpent);
      const subTotalsByCategory = new Map<number, number>();
      for (const sub of periodSubcategories) {
        subTotalsByCategory.set(
          sub.categoryId,
          (subTotalsByCategory.get(sub.categoryId) ?? 0) + toNumber(sub.allocatedAmount),
        );
      }

      const pocketByPic = new Map<string, Map<string, number>>();
      const addToPocket = (picRaw: string, pocketRaw: string, amount: number) => {
        const pic = picRaw?.trim() ?? '';
        if (!pic || !isValidPic(pic) || amount <= 0) return;
        const pocket = pocketRaw?.trim().toUpperCase() || DEFAULT_POCKET;
        const byPocket = pocketByPic.get(pic) ?? new Map<string, number>();
        byPocket.set(pocket, (byPocket.get(pocket) ?? 0) + amount);
        pocketByPic.set(pic, byPocket);
      };

      for (const budget of periodBudgets) {
        const total = toNumber(budget.allocatedAmount);
        const subTotal = subTotalsByCategory.get(budget.categoryId) ?? 0;
        const mainAmount = Math.max(0, total - subTotal);
        addToPocket(budget.pic, budget.pocket, mainAmount);
      }
      for (const sub of periodSubcategories) {
        addToPocket(sub.pic, sub.pocket, toNumber(sub.allocatedAmount));
      }

      const picPocketTotals = [...pocketByPic.entries()]
        .map(([pic, byPocket]) => {
          const pockets = [...byPocket.entries()]
            .map(([pocket, total]) => ({ pocket, total: roundMoney(total) }))
            .sort((a, b) => b.total - a.total);
          return {
            pic,
            pockets,
            total: roundMoney(pockets.reduce((sum, item) => sum + item.total, 0)),
          };
        })
        .sort((a, b) => b.total - a.total);

      const categoriesSummary = allCategories.map((cat) => {
        const allocated = roundMoney(allocatedByCategory.get(cat.id) ?? 0);
        const spent = roundMoney(spentByCategory.get(cat.id) ?? 0);
        const subs = subsByCategory.get(cat.id) ?? [];
        const subAllocatedSum = roundMoney(
          subs.reduce((sum, sub) => sum + toNumber(sub.allocatedAmount), 0),
        );

        const subcategories = subs.map((sub) => {
          const subAllocated = roundMoney(toNumber(sub.allocatedAmount));
          const subSpent = roundMoney(
            spentBySubKey.get(`${cat.id}|${sub.name.toLowerCase()}`) ?? 0,
          );
          return {
            name: sub.name,
            allocated: subAllocated,
            spent: subSpent,
            sisa: roundMoney(subAllocated - subSpent),
          };
        });

        if (subs.length > 0) {
          const mainAllocated = roundMoney(Math.max(0, allocated - subAllocatedSum));
          const subSpentSum = roundMoney(
            subcategories.reduce((sum, sub) => sum + sub.spent, 0),
          );
          const mainSpent = roundMoney(Math.max(0, spent - subSpentSum));
          subcategories.unshift({
            name: 'Main (default)',
            allocated: mainAllocated,
            spent: mainSpent,
            sisa: roundMoney(mainAllocated - mainSpent),
          });
        }

        return {
          categoryId: cat.id,
          categoryName: cat.name,
          allocated,
          spent,
          sisa: roundMoney(allocated - spent),
          subcategories,
        };
      });

      return {
        period,
        totalIncome,
        totalBudgetAllocated,
        totalSpent,
        totalSisa,
        picPocketTotals,
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
