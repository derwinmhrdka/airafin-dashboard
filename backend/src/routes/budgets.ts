import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { budgetSubcategories, budgets, categories, incomes } from '../db/schema.js';
import { isValidPic } from '../lib/pic.js';

interface IncomeInput {
  source: string;
  amount: number;
}

interface BudgetInput {
  categoryId: number;
  allocatedAmount: number;
  pic?: string;
}

interface SubcategoryInput {
  categoryId: number;
  name: string;
  pic?: string;
}

interface PlanBody {
  period: string;
  incomes?: IncomeInput[];
  budgets?: BudgetInput[];
  subcategories?: SubcategoryInput[];
}

export async function budgetRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { period?: string } }>(
    '/api/plan',
    async (request, reply) => {
      const period = request.query.period?.trim();

      if (!period) {
        return reply.code(400).send({ error: 'period query parameter is required' });
      }

      const incomeRows = await db.select().from(incomes).where(eq(incomes.period, period));

      const budgetRows = await db
        .select({
          id: budgets.id,
          categoryId: budgets.categoryId,
          categoryName: categories.name,
          allocatedAmount: budgets.allocatedAmount,
          pic: budgets.pic,
          period: budgets.period,
        })
        .from(budgets)
        .innerJoin(categories, eq(budgets.categoryId, categories.id))
        .where(eq(budgets.period, period))
        .orderBy(categories.id);

      const subcategoryRows = await db
        .select({
          id: budgetSubcategories.id,
          categoryId: budgetSubcategories.categoryId,
          name: budgetSubcategories.name,
          pic: budgetSubcategories.pic,
          period: budgetSubcategories.period,
        })
        .from(budgetSubcategories)
        .where(eq(budgetSubcategories.period, period))
        .orderBy(budgetSubcategories.categoryId, budgetSubcategories.name);

      return { period, incomes: incomeRows, budgets: budgetRows, subcategories: subcategoryRows };
    },
  );

  app.post<{ Body: PlanBody }>('/api/budgets', async (request, reply) => {
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

    if (incomeInputs?.length) {
      for (const income of incomeInputs) {
        if (!income.source?.trim() || income.amount == null) {
          return reply.code(400).send({ error: 'Each income requires source and amount' });
        }

        await db
          .insert(incomes)
          .values({
            source: income.source.trim(),
            amount: String(Math.round(income.amount)),
            period: trimmedPeriod,
          })
          .onConflictDoUpdate({
            target: [incomes.source, incomes.period],
            set: { amount: String(Math.round(income.amount)) },
          });
      }
    }

    if (budgetInputs?.length) {
      for (const budget of budgetInputs) {
        if (!budget.categoryId || budget.allocatedAmount == null) {
          return reply
            .code(400)
            .send({ error: 'Each budget requires categoryId and allocatedAmount' });
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

        const amount = String(Math.round(budget.allocatedAmount));

        await db
          .insert(budgets)
          .values({
            categoryId: budget.categoryId,
            allocatedAmount: amount,
            pic,
            period: trimmedPeriod,
          })
          .onConflictDoUpdate({
            target: [budgets.categoryId, budgets.period],
            set: { allocatedAmount: amount, pic },
          });
      }
    }

    if (subcategoryInputs) {
      await db.delete(budgetSubcategories).where(eq(budgetSubcategories.period, trimmedPeriod));

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

        await db.insert(budgetSubcategories).values({
          categoryId: sub.categoryId,
          period: trimmedPeriod,
          name,
          pic,
        });
      }
    }

    return reply.code(200).send({ ok: true, period: trimmedPeriod });
  });
}
