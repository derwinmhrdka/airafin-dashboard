import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import {
  categories,
  notifications,
  planChecklist,
  transactions,
  transferApprovals,
  transferComments,
} from '../db/schema.js';
import { updateTransactionInSheet } from '../lib/google-sheets.js';
import { toNumber } from '../lib/money.js';
import { syncTransferNotifications } from '../lib/notifications.js';
import { getPlanPicForTransaction } from '../lib/plan-pic.js';
import { isValidPic } from '../lib/pic.js';
import { sendPushToPic } from '../lib/web-push.js';

type TargetKind = 'checklist' | 'reimbursement';
type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface TransferTarget {
  kind: TargetKind;
  id: number;
  period: string;
  senderPic: string;
  receiverPic: string;
  label: string;
  amount: number;
  settled: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function headerPic(request: FastifyRequest): string {
  const raw = request.headers['x-user-pic'];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
}

function samePic(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function parseKind(value: unknown): TargetKind | null {
  return value === 'checklist' || value === 'reimbursement' ? value : null;
}

async function loadChecklist(projectId: number, id: number): Promise<TransferTarget | null> {
  const [row] = await db
    .select()
    .from(planChecklist)
    .where(and(eq(planChecklist.id, id), eq(planChecklist.projectId, projectId)))
    .limit(1);
  if (!row) return null;
  if (!isValidPic(row.senderPic) || !isValidPic(row.receiverPic)) return null;
  return {
    kind: 'checklist',
    id: row.id,
    period: row.period,
    senderPic: row.senderPic,
    receiverPic: row.receiverPic,
    label: row.subcategoryName.trim() || 'Transfer',
    amount: toNumber(row.amount),
    settled: row.done,
  };
}

async function loadReimbursement(projectId: number, id: number): Promise<TransferTarget | null> {
  const [row] = await db
    .select({
      id: transactions.id,
      period: transactions.period,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      subCategory: transactions.subCategory,
      detail: transactions.detail,
      cost: transactions.cost,
      pic: transactions.pic,
      date: transactions.date,
      reimbursedFromPic: transactions.reimbursedFromPic,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.id, id), eq(transactions.projectId, projectId)))
    .limit(1);
  if (!row) return null;

  const planPic = await getPlanPicForTransaction(row.categoryId, row.period, row.subCategory, projectId);
  const reimbursedFrom = row.reimbursedFromPic?.trim() ?? '';
  const settled = Boolean(reimbursedFrom);
  const receiverPic = settled ? reimbursedFrom : row.pic.trim();
  const senderPic = settled ? row.pic.trim() : planPic;
  if (!senderPic || !receiverPic || samePic(senderPic, receiverPic)) return null;
  if (!isValidPic(senderPic) || !isValidPic(receiverPic)) return null;

  return {
    kind: 'reimbursement',
    id: row.id,
    period: row.period,
    senderPic,
    receiverPic,
    label: row.detail.trim() || row.subCategory.trim() || 'Reimbursement',
    amount: toNumber(row.cost),
    settled,
  };
}

async function loadTarget(
  projectId: number,
  kind: TargetKind,
  id: number,
): Promise<TransferTarget | null> {
  return kind === 'checklist' ? loadChecklist(projectId, id) : loadReimbursement(projectId, id);
}

async function setApproval(projectId: number, kind: TargetKind, id: number, status: ApprovalStatus) {
  const [existing] = await db
    .select({ id: transferApprovals.id })
    .from(transferApprovals)
    .where(
      and(
        eq(transferApprovals.projectId, projectId),
        eq(transferApprovals.targetKind, kind),
        eq(transferApprovals.targetId, id),
      ),
    )
    .limit(1);
  if (existing) {
    await db.update(transferApprovals).set({ status }).where(eq(transferApprovals.id, existing.id));
    return;
  }
  await db.insert(transferApprovals).values({
    projectId,
    targetKind: kind,
    targetId: id,
    status,
  });
}

async function notifyPics(input: {
  projectId: number;
  period: string;
  amount: number;
  itemLabel: string;
  fromPic: string;
  toPics: string[];
  type: string;
  title: string;
  body: string;
  refBase: string;
}) {
  const stamp = nowIso();
  const amount = String(Math.round(input.amount));
  for (const toPic of input.toPics) {
    if (!toPic || samePic(toPic, input.fromPic) || !isValidPic(toPic)) continue;
    const refKey = `${input.refBase}:${toPic}`;
    await db.insert(notifications).values({
      projectId: input.projectId,
      toPic,
      fromPic: input.fromPic,
      type: input.type,
      itemLabel: input.itemLabel,
      amount,
      period: input.period,
      refKey,
      readAt: null,
      resolvedAt: null,
      createdAt: stamp,
    });
    void sendPushToPic(toPic, {
      title: input.title,
      body: input.body,
      url: `/transfer?period=${encodeURIComponent(input.period)}`,
      tag: refKey,
    }).catch(() => undefined);
  }
}

async function settleReimbursement(projectId: number, id: number, settle: boolean) {
  const [existing] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      detail: transactions.detail,
      cost: transactions.cost,
      period: transactions.period,
      pic: transactions.pic,
      categoryId: transactions.categoryId,
      subCategory: transactions.subCategory,
      categoryName: categories.name,
      reimbursedFromPic: transactions.reimbursedFromPic,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.id, id), eq(transactions.projectId, projectId)))
    .limit(1);
  if (!existing) return;

  const planPic = await getPlanPicForTransaction(
    existing.categoryId,
    existing.period,
    existing.subCategory,
    projectId,
  );
  const sheetBefore = {
    date: existing.date,
    categoryName: existing.categoryName,
    detail: existing.detail,
    cost: existing.cost,
    period: existing.period,
    pic: existing.pic,
  };

  if (settle) {
    if (!planPic || existing.pic === planPic) return;
    const [updated] = await db
      .update(transactions)
      .set({ pic: planPic, reimbursedFromPic: existing.pic })
      .where(and(eq(transactions.id, id), eq(transactions.projectId, projectId)))
      .returning();
    if (!updated) return;
    await updateTransactionInSheet(
      { ...sheetBefore, pic: updated.pic },
      sheetBefore,
    ).catch(() => undefined);
    return;
  }

  const reimbursedFrom = existing.reimbursedFromPic?.trim() ?? '';
  if (!reimbursedFrom) return;
  const [updated] = await db
    .update(transactions)
    .set({ pic: reimbursedFrom, reimbursedFromPic: null })
    .where(and(eq(transactions.id, id), eq(transactions.projectId, projectId)))
    .returning();
  if (!updated) return;
  await updateTransactionInSheet(
    { ...sheetBefore, pic: updated.pic },
    sheetBefore,
  ).catch(() => undefined);
}

export async function transferThreadRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { period?: string } }>('/api/transfers/threads', async (request, reply) => {
    const projectId = request.projectId!;
    const period = request.query.period?.trim() ?? '';
    if (!period) return reply.code(400).send({ error: 'Period is required' });

    const comments = await db
      .select()
      .from(transferComments)
      .where(and(eq(transferComments.projectId, projectId), eq(transferComments.period, period)))
      .orderBy(asc(transferComments.id));

    const approvals = await db
      .select()
      .from(transferApprovals)
      .where(eq(transferApprovals.projectId, projectId));

    const byTarget = new Map<
      string,
      { targetKind: string; targetId: number; approval: ApprovalStatus; comments: typeof comments }
    >();

    for (const row of approvals) {
      const key = `${row.targetKind}:${row.targetId}`;
      const status: ApprovalStatus =
        row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending';
      byTarget.set(key, { targetKind: row.targetKind, targetId: row.targetId, approval: status, comments: [] });
    }

    for (const row of comments) {
      const key = `${row.targetKind}:${row.targetId}`;
      const bucket = byTarget.get(key) ?? {
        targetKind: row.targetKind,
        targetId: row.targetId,
        approval: 'pending' as ApprovalStatus,
        comments: [],
      };
      bucket.comments.push(row);
      byTarget.set(key, bucket);
    }

    return {
      threads: [...byTarget.values()].map((thread) => ({
        targetKind: thread.targetKind,
        targetId: thread.targetId,
        approval: thread.approval,
        comments: thread.comments.map((row) => ({
          id: row.id,
          parentId: row.parentId,
          pic: row.pic,
          body: row.body,
          createdAt: row.createdAt,
        })),
      })),
    };
  });

  app.post<{
    Body: { targetKind?: string; targetId?: number; parentId?: number | null; body?: string };
  }>('/api/transfers/comments', async (request, reply) => {
    const projectId = request.projectId!;
    const actor = headerPic(request);
    if (!actor || !isValidPic(actor)) return reply.code(400).send({ error: 'PIC is required' });

    const kind = parseKind(request.body?.targetKind);
    const targetId = Number(request.body?.targetId);
    const text = request.body?.body?.trim().replace(/\s+/g, ' ') ?? '';
    if (!kind || !Number.isFinite(targetId) || targetId <= 0) {
      return reply.code(400).send({ error: 'Invalid transfer' });
    }
    if (!text || text.length > 500) {
      return reply.code(400).send({ error: 'Comment must be 1–500 characters' });
    }

    const target = await loadTarget(projectId, kind, targetId);
    if (!target) return reply.code(404).send({ error: 'Transfer not found' });

    let parentId: number | null = null;
    let parentPic = '';
    if (request.body?.parentId != null) {
      parentId = Number(request.body.parentId);
      if (!Number.isFinite(parentId) || parentId <= 0) {
        return reply.code(400).send({ error: 'Invalid reply' });
      }
      const [parent] = await db
        .select()
        .from(transferComments)
        .where(and(eq(transferComments.id, parentId), eq(transferComments.projectId, projectId)))
        .limit(1);
      if (!parent || parent.targetKind !== kind || parent.targetId !== targetId || parent.parentId != null) {
        return reply.code(400).send({ error: 'Reply target not found' });
      }
      parentPic = parent.pic;
    }

    const [created] = await db
      .insert(transferComments)
      .values({
        projectId,
        period: target.period,
        targetKind: kind,
        targetId,
        parentId,
        pic: actor,
        body: text,
        createdAt: nowIso(),
      })
      .returning();

    const recipients = [target.senderPic, target.receiverPic];
    if (parentPic) recipients.push(parentPic);
    const unique = [...new Map(recipients.map((pic) => [pic.toLowerCase(), pic])).values()];
    const type = parentId ? 'transfer_reply' : 'transfer_comment';
    const title = parentId ? `${actor} replied on ${target.label}` : `${actor} commented on ${target.label}`;

    await notifyPics({
      projectId,
      period: target.period,
      amount: target.amount,
      itemLabel: target.label,
      fromPic: actor,
      toPics: unique,
      type,
      title,
      body: text,
      refBase: `transfer_comment:${created.id}`,
    });

    return reply.code(201).send({
      comment: {
        id: created.id,
        parentId: created.parentId,
        pic: created.pic,
        body: created.body,
        createdAt: created.createdAt,
      },
    });
  });

  app.post<{
    Body: { targetKind?: string; targetId?: number; decision?: string };
  }>('/api/transfers/approval', async (request, reply) => {
    const projectId = request.projectId!;
    const actor = headerPic(request);
    if (!actor || !isValidPic(actor)) return reply.code(400).send({ error: 'PIC is required' });

    const kind = parseKind(request.body?.targetKind);
    const targetId = Number(request.body?.targetId);
    const decision = request.body?.decision;
    if (!kind || !Number.isFinite(targetId) || targetId <= 0) {
      return reply.code(400).send({ error: 'Invalid transfer' });
    }
    if (decision !== 'approved' && decision !== 'rejected') {
      return reply.code(400).send({ error: 'Decision must be approved or rejected' });
    }

    const target = await loadTarget(projectId, kind, targetId);
    if (!target) return reply.code(404).send({ error: 'Transfer not found' });
    if (!samePic(actor, target.receiverPic)) {
      return reply.code(403).send({ error: 'Only the receiver can approve this transfer' });
    }

    if (kind === 'checklist') {
      await db
        .update(planChecklist)
        .set({ done: decision === 'approved' })
        .where(and(eq(planChecklist.id, targetId), eq(planChecklist.projectId, projectId)));
    } else {
      await settleReimbursement(projectId, targetId, decision === 'approved');
    }

    await setApproval(projectId, kind, targetId, decision);

    try {
      await syncTransferNotifications(target.period, projectId);
    } catch {
      /* approval still stands */
    }

    const title =
      decision === 'approved'
        ? `${target.label} approved`
        : `${target.label} rejected`;
    await notifyPics({
      projectId,
      period: target.period,
      amount: target.amount,
      itemLabel: target.label,
      fromPic: actor,
      toPics: [target.senderPic],
      type: decision === 'approved' ? 'transfer_approved' : 'transfer_rejected',
      title,
      body: `${actor} ${decision === 'approved' ? 'approved' : 'rejected'} this transfer`,
      refBase: `transfer_${decision}:${kind}:${targetId}:${Date.now()}`,
    });

    return { approval: decision };
  });
}
