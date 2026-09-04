import { count, desc, eq, and, ilike, notInArray, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { categories, transactions } from '../db/schema.js';
import { autoDoneChecklistForDetailSpend } from '../lib/checklist-auto-done.js';
import { getPlanPicForTransaction } from '../lib/plan-pic.js';
import {
  appendTransactionToSheet,
  deleteTransactionFromSheet,
  updateTransactionInSheet,
} from '../lib/google-sheets.js';
import { requireApiToken } from '../middleware/api-token.js';
import { isValidPic } from '../lib/pic.js';

const VALID_STATUS = ['Done', 'On Going', 'Not Yet'] as const;
type Status = (typeof VALID_STATUS)[number];
const SUGGEST_EXCLUDED_STATUS = ['Transfer', 'Carryover'] as const;

interface CreateTransactionBody {
  date: string;
  categoryId: number;
  subCategory?: string;
  detail: string;
  cost: number;
  period: string;
  pic: string;
  status?: Status;
}

interface UpdateTransactionBody {
  date: string;
  categoryId: number;
  subCategory?: string;
  detail: string;
  cost: number;
  pic: string;
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

function transactionListFilters(
  query: {
    period?: string;
    categoryId?: string;
    pic?: string;
    search?: string;
  },
  projectId: number,
): SQL {
  const conditions: SQL[] = [eq(transactions.projectId, projectId)];

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

  return and(...conditions)!;
}

async function getTransactionWithCategory(id: number, projectId: number) {
  const [row] = await db
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
      reimbursedFromPic: transactions.reimbursedFromPic,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.id, id), eq(transactions.projectId, projectId)))
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
      const projectId = request.projectId!;
      const { period, categoryId, pic, search } = request.query;
      const limit = Math.min(Math.max(Number.parseInt(request.query.limit ?? '50', 10) || 50, 1), 200);
      const offset = Math.max(Number.parseInt(request.query.offset ?? '0', 10) || 0, 0);
      const where = transactionListFilters({ period, categoryId, pic, search }, projectId);
      const periodOnly = period
        ? and(eq(transactions.projectId, projectId), eq(transactions.period, period))
        : eq(transactions.projectId, projectId);

      const rows = await db
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
        .where(where)
        .orderBy(desc(transactions.date), desc(transactions.id))
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

  /** Recent similar details (for Quick Insert autocomplete). */
  app.get<{ Querystring: { q?: string; limit?: string } }>(
    '/api/transactions/suggest',
    async (request) => {
      const projectId = request.projectId!;
      const q = request.query.q?.trim() ?? '';
      if (q.length < 3) return { suggestions: [] };

      const limit = Math.min(Math.max(Number.parseInt(request.query.limit ?? '3', 10) || 3, 1), 10);
      const escaped = q.replace(/[%_\\]/g, '\\$&');

      const rows = await db
        .select({
          id: transactions.id,
          date: transactions.date,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          subCategory: transactions.subCategory,
          detail: transactions.detail,
          cost: transactions.cost,
          pic: transactions.pic,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.projectId, projectId),
            ilike(transactions.detail, `%${escaped}%`),
            notInArray(transactions.status, [...SUGGEST_EXCLUDED_STATUS]),
          ),
        )
        .orderBy(desc(transactions.date), desc(transactions.id))
        .limit(40);

      const seen = new Set<string>();
      const suggestions: typeof rows = [];
      for (const row of rows) {
        const key = row.detail.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        suggestions.push(row);
        if (suggestions.length >= limit) break;
      }

      return { suggestions };
    },
  );

  app.post<{ Body: CreateTransactionBody }>(    '/api/transactions',
    { preHandler: requireApiToken },
    async (request, reply) => {
      const projectId = request.projectId!;
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

      if (!isValidPic(body.pic)) {
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
          projectId,
          date: body.date,
          categoryId: body.categoryId,
          subCategory: body.subCategory?.trim() ?? '',
          detail: body.detail.trim(),
          cost: String(Math.round(body.cost)),
          period: body.period.trim(),
          pic: body.pic,
          status,
        })
        .returning();

      await autoDoneChecklistForDetailSpend({
        projectId,
        period: created.period,
        categoryId: created.categoryId,
        subcategoryName: created.subCategory,
        amount: Math.round(Number(created.cost)),
      });

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
      const projectId = request.projectId!;
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

      if (!isValidPic(body.pic)) {
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

      const existing = await getTransactionWithCategory(id, projectId);
      if (!existing) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      const [updated] = await db
        .update(transactions)
        .set({
          date: body.date,
          categoryId: body.categoryId,
          subCategory: body.subCategory?.trim() ?? '',
          detail: body.detail.trim(),
          cost: String(Math.round(body.cost)),
          pic: body.pic,
        })
        .where(and(eq(transactions.id, id), eq(transactions.projectId, projectId)))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      await autoDoneChecklistForDetailSpend({
        projectId,
        period: updated.period,
        categoryId: updated.categoryId,
        subcategoryName: updated.subCategory,
        amount: Math.round(Number(updated.cost)),
      });

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
    const projectId = request.projectId!;
    const id = Number.parseInt(request.params.id, 10);

    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: 'Invalid transaction id' });
    }

    const existing = await getTransactionWithCategory(id, projectId);
    if (!existing) {
      return reply.code(404).send({ error: 'Transaction not found' });
    }

    await db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.projectId, projectId)));

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
      const projectId = request.projectId!;
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
        .where(and(eq(transactions.id, id), eq(transactions.projectId, projectId)))
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
      const projectId = request.projectId!;
      const id = Number.parseInt(request.params.id, 10);

      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: 'Invalid transaction id' });
      }

      const existing = await getTransactionWithCategory(id, projectId);
      if (!existing) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      const planPic = await getPlanPicForTransaction(
        existing.categoryId,
        existing.period,
        existing.subCategory,
        projectId,
      );
      if (!planPic) {
        return reply.code(400).send({ error: 'No plan PIC for this category' });
      }

      if (existing.pic === planPic) {
        return reply.code(400).send({ error: 'Already settled' });
      }

      const [updated] = await db
        .update(transactions)
        .set({ pic: planPic, reimbursedFromPic: existing.pic })
        .where(and(eq(transactions.id, id), eq(transactions.projectId, projectId)))
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

  /** Undo reimbursement settlement — restore original payer PIC. */
  app.patch<{ Params: { id: string } }>(
    '/api/transactions/:id/unreimburse',
    async (request, reply) => {
      const projectId = request.projectId!;
      const id = Number.parseInt(request.params.id, 10);

      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: 'Invalid transaction id' });
      }

      const existing = await getTransactionWithCategory(id, projectId);
      if (!existing) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      const reimbursedFrom = existing.reimbursedFromPic?.trim() ?? '';
      if (!reimbursedFrom || !isValidPic(reimbursedFrom)) {
        return reply.code(400).send({ error: 'Not a settled reimbursement' });
      }

      const [updated] = await db
        .update(transactions)
        .set({ pic: reimbursedFrom, reimbursedFromPic: null })
        .where(and(eq(transactions.id, id), eq(transactions.projectId, projectId)))
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: 'Transaction not found' });
      }

      const sheetsSync = await updateTransactionInSheet(
        toSheetRow(updated, existing.categoryName),
        toSheetRow(existing, existing.categoryName),
      );

      if (sheetsSync.status === 'failed') {
        request.log.warn({ sheetsSync }, 'Unreimburse updated in DB but Sheets sync failed');
      }

      return { transaction: updated, sheetsSync };
    },
  );
}
