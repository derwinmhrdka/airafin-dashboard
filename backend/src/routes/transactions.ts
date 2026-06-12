import { count, desc, eq, and, ilike, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { budgets, categories, transactions } from '../db/schema.js';
import {
  appendTransactionToSheet,
  deleteTransactionFromSheet,
  updateTransactionInSheet,
} from '../lib/google-sheets.js';
import { requireApiToken } from '../middleware/api-token.js';
import { isValidPic } from '../lib/pic.js';

const VALID_PIC = ['Derwin', 'Anggita'] as const;
const VALID_STATUS = ['Done', 'On Going', 'Not Yet'] as const;

type Pic = (typeof VALID_PIC)[number];
type Status = (typeof VALID_STATUS)[number];

interface CreateTransactionBody {
  date: string;
  categoryId: number;
  detail: string;
  cost: number;
  period: string;
  pic: Pic;
  status?: Status;
}

interface UpdateTransactionBody {
  date: string;
  categoryId: number;
  detail: string;
  cost: number;
  pic: Pic;
}

interface UpdateStatusBody {
  status: Status;
}

function toSheetRow(
  row: {
    date: string;
    detail: string;
    cost: string;
    period: string;
    pic: string;
  },
  categoryName: string,
) {
  return {
    date: row.date,
    categoryName,
    detail: row.detail,
    cost: row.cost,
    period: row.period,
    pic: row.pic,
  };
}

function transactionListFilters(query: {
  period?: string;
  categoryId?: string;
  pic?: string;
  search?: string;
}): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.period) {
    conditions.push(eq(transactions.period, query.period));
  }

  const categoryId = Number.parseInt(query.categoryId ?? '', 10);
  if (Number.isFinite(categoryId) && categoryId > 0) {
    conditions.push(eq(transactions.categoryId, categoryId));
  }

  const pic = query.pic?.trim();
  if (pic && isValidPic(pic)) {
    conditions.push(eq(transactions.pic, pic));
  }

  const search = query.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_\\]/g, '\\$&');
    conditions.push(ilike(transactions.detail, `%${escaped}%`));
  }

  return conditions.length ? and(...conditions) : undefined;
}

async function getTransactionWithCategory(id: number) {
  const [row] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      detail: transactions.detail,
      cost: transactions.cost,
      period: transactions.period,
      pic: transactions.pic,
      status: transactions.status,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.id, id))
    .limit(1);

  return row ?? null;
}

export async function transactionRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      period?: string;
      limit?: string;
      offset?: string;
      categoryId?: string;
      pic?: string;
      search?: string;
    };
  }>(
    '/api/transactions',
    async (request) => {
      const { period, categoryId, pic, search } = request.query;
      const limit = Math.min(Math.max(Number.parseInt(request.query.limit ?? '50', 10) || 50, 1), 200);
      const offset = Math.max(Number.parseInt(request.query.offset ?? '0', 10) || 0, 0);
      const where = transactionListFilters({ period, categoryId, pic, search });
      const periodOnly = period ? eq(transactions.period, period) : undefined;

      const rows = await db
        .select({
          id: transactions.id,
          date: transactions.date,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          detail: transactions.detail,
          cost: transactions.cost,
          period: transactions.period,
          pic: transactions.pic,
          status: transactions.status,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(where)
        .orderBy(desc(transactions.id))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await db
        .select({ total: count() })
        .from(transactions)
        .where(where);

      const [monthTotalRow] = await db
        .select({ total: count() })
        .from(transactions)
        .where(periodOnly);

      const total = totalRow?.total ?? 0;
      const monthTotal = monthTotalRow?.total ?? 0;

      return {
        transactions: rows,
        total,
        monthTotal,
        hasMore: offset + rows.length < total,
      };
    },
  );

  app.post<{ Body: CreateTransactionBody }>(
    '/api/transactions',
    { preHandler: requireApiToken },
    async (request, reply) => {
      const body = request.body;

      if (
        !body?.date ||
        !body.categoryId ||
        !body.detail?.trim() ||
        body.cost == null ||
        !body.period?.trim() ||
        !body.pic
      ) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      if (!VALID_PIC.includes(body.pic)) {
        return reply.code(400).send({ error: 'Invalid pic value' });
      }

      const status: Status = body.status ?? 'Not Yet';
      if (!VALID_STATUS.includes(status)) {
        return reply.code(400).send({ error: 'Invalid status value' });
      }

      const [category] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, body.categoryId))
        .limit(1);

      if (!category) {
        return reply.code(400).send({ error: 'Category not found' });
      }

      const [created] = await db
        .insert(transactions)
        .values({
          date: body.date,
          categoryId: body.categoryId,
          detail: body.detail.trim(),
          cost: String(Math.round(body.cost)),
          period: body.period.trim(),
          pic: body.pic,
          status,
        })
        .returning();

      const sheetsSync = await appendTransactionToSheet(toSheetRow(created, category.name));

      if (sheetsSync.status === 'failed') {
        request.log.warn({ sheetsSync }, 'Transaction saved to DB but Sheets sync failed');
      }

      return reply.code(201).send({ transaction: created, sheetsSync });
    },
  );

  app.put<{ Params: { id: string }; Body: UpdateTransactionBody }>(
    '/api/transactions/:id',
    async (request, reply) => {
      const id = Number.parseInt(request.params.id, 10);
      const body = request.body;

      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: 'Invalid transaction id' });
      }

      if (
        !body?.date ||
        !body.categoryId ||
        !body.detail?.trim() ||
        body.cost == null ||
        !body.pic
      ) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      if (!VALID_PIC.includes(body.pic)) {
        return reply.code(400).send({ error: 'Invalid pic value' });
      }

      const [category] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, body.categoryId))
        .limit(1);

      if (!category) {
        return reply.code(400).send({ error: 'Category not found' });
      }

      const existing = await getTransactionWithCategory(id);
      if (!existing) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      const [updated] = await db
        .update(transactions)
        .set({
          date: body.date,
          categoryId: body.categoryId,
          detail: body.detail.trim(),
          cost: String(Math.round(body.cost)),
          pic: body.pic,
        })
        .where(eq(transactions.id, id))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      const sheetsSync = await updateTransactionInSheet(
        toSheetRow(updated, category.name),
        toSheetRow(existing, existing.categoryName),
      );

      if (sheetsSync.status === 'failed') {
        request.log.warn({ sheetsSync }, 'Transaction updated in DB but Sheets sync failed');
      }

      return { transaction: updated, sheetsSync };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/transactions/:id', async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);

    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: 'Invalid transaction id' });
    }

    const existing = await getTransactionWithCategory(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Transaction not found' });
    }

    await db.delete(transactions).where(eq(transactions.id, id));

    const sheetsSync = await deleteTransactionFromSheet(
      toSheetRow(existing, existing.categoryName),
    );

    if (sheetsSync.status === 'failed') {
      request.log.warn({ sheetsSync }, 'Transaction deleted from DB but Sheets sync failed');
    }

    return { ok: true, sheetsSync };
  });

  app.patch<{ Params: { id: string }; Body: UpdateStatusBody }>(
    '/api/transactions/:id/status',
    async (request, reply) => {
      const id = Number.parseInt(request.params.id, 10);
      const { status } = request.body ?? {};

      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: 'Invalid transaction id' });
      }

      if (!status || !VALID_STATUS.includes(status)) {
        return reply.code(400).send({ error: 'Invalid status value' });
      }

      const [updated] = await db
        .update(transactions)
        .set({ status })
        .where(eq(transactions.id, id))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      return { transaction: updated };
    },
  );

  /** Plan owner reimburses the PIC who paid — updates transaction PIC to plan PIC. */
  app.patch<{ Params: { id: string } }>(
    '/api/transactions/:id/reimburse',
    async (request, reply) => {
      const id = Number.parseInt(request.params.id, 10);

      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: 'Invalid transaction id' });
      }

      const existing = await getTransactionWithCategory(id);
      if (!existing) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      const [budget] = await db
        .select({ pic: budgets.pic })
        .from(budgets)
        .where(
          and(
            eq(budgets.categoryId, existing.categoryId),
            eq(budgets.period, existing.period),
          ),
        )
        .limit(1);

      const planPic = budget?.pic?.trim() ?? '';
      if (!planPic || !isValidPic(planPic)) {
        return reply.code(400).send({ error: 'No plan PIC for this category' });
      }

      if (existing.pic === planPic) {
        return reply.code(400).send({ error: 'Already settled' });
      }

      const [updated] = await db
        .update(transactions)
        .set({ pic: planPic })
        .where(eq(transactions.id, id))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      const sheetsSync = await updateTransactionInSheet(
        toSheetRow(updated, existing.categoryName),
        toSheetRow(existing, existing.categoryName),
      );

      if (sheetsSync.status === 'failed') {
        request.log.warn({ sheetsSync }, 'Reimburse updated in DB but Sheets sync failed');
      }

      return { transaction: updated, sheetsSync };
    },
  );
}
