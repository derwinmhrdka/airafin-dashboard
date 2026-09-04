import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  budgetSubcategories,
  budgets,
  categories,
  notifications,
  planChecklist,
  transactions,
} from '../db/schema.js';
import { isNonSpendTransaction } from './budget-move.js';
import { toNumber } from './money.js';
import { isValidPic } from './pic.js';
import { resolvePlanPicFromMaps, subcategoryPicKey } from './plan-pic.js';
import { pushAppNotification } from './web-push.js';

export type NotificationType = 'pay_due' | 'paid_received';

/** One pending transfer line (checklist or reimbursement) — not netted. */
export interface TransferItemDue {
  senderPic: string;
  receiverPic: string;
  amount: number;
  itemLabel: string;
  refKey: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function checklistPayDueRefKey(projectId: number, checklistId: number): string {
  return `pay_due:checklist:${projectId}:${checklistId}`;
}

function txPayDueRefKey(projectId: number, txId: number): string {
  return `pay_due:tx:${projectId}:${txId}`;
}

/** Stable key so settle sync upserts one paid_received per cleared due (no stamp spam). */
function paidReceivedRefKey(payDueRef: string): string {
  return `paid_received:${payDueRef}`;
}

function normalizeItemLabel(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Item';
  return trimmed;
}

/** Collect pending directed lines (plan checklist + unsettled reimbursements). No netting. */
export async function computePeriodTransferItems(
  period: string,
  projectId: number,
): Promise<TransferItemDue[]> {
  const items: TransferItemDue[] = [];

  const checklist = await db
    .select({
      id: planChecklist.id,
      senderPic: planChecklist.senderPic,
      receiverPic: planChecklist.receiverPic,
      amount: planChecklist.amount,
      done: planChecklist.done,
      subcategoryName: planChecklist.subcategoryName,
    })
    .from(planChecklist)
    .where(and(eq(planChecklist.period, period), eq(planChecklist.projectId, projectId)));

  for (const item of checklist) {
    if (item.done) continue;
    if (!isValidPic(item.senderPic) || !isValidPic(item.receiverPic)) continue;
    const amt = toNumber(item.amount);
    if (amt <= 0) continue;
    items.push({
      senderPic: item.senderPic,
      receiverPic: item.receiverPic,
      amount: amt,
      itemLabel: normalizeItemLabel(item.subcategoryName || 'Transfer'),
      refKey: checklistPayDueRefKey(projectId, item.id),
    });
  }

  const budgetRows = await db
    .select({
      categoryId: budgets.categoryId,
      planPic: budgets.pic,
    })
    .from(budgets)
    .where(and(eq(budgets.period, period), eq(budgets.projectId, projectId)));

  const subcategoryRows = await db
    .select({
      categoryId: budgetSubcategories.categoryId,
      name: budgetSubcategories.name,
      pic: budgetSubcategories.pic,
    })
    .from(budgetSubcategories)
    .where(
      and(eq(budgetSubcategories.period, period), eq(budgetSubcategories.projectId, projectId)),
    );

  const mainPicByCategory = new Map(budgetRows.map((b) => [b.categoryId, b.planPic]));
  const subPicByKey = new Map(
    subcategoryRows.map((s) => [subcategoryPicKey(s.categoryId, s.name), s.pic]),
  );

  const txRows = await db
    .select({
      id: transactions.id,
      categoryId: transactions.categoryId,
      subCategory: transactions.subCategory,
      detail: transactions.detail,
      cost: transactions.cost,
      pic: transactions.pic,
      status: transactions.status,
      reimbursedFromPic: transactions.reimbursedFromPic,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.period, period), eq(transactions.projectId, projectId)));

  for (const tx of txRows) {
    if (isNonSpendTransaction(tx)) continue;
    const reimbursedFrom = tx.reimbursedFromPic?.trim() ?? '';
    if (reimbursedFrom) continue; // already settled

    const txPic = tx.pic?.trim() ?? '';
    if (!txPic || !isValidPic(txPic)) continue;

    const planPic = resolvePlanPicFromMaps(
      tx.categoryId,
      tx.subCategory,
      mainPicByCategory,
      subPicByKey,
    );
    if (!planPic || !isValidPic(planPic) || planPic === txPic) continue;

    const amt = toNumber(tx.cost);
    if (amt <= 0) continue;

    const label =
      tx.detail?.trim() ||
      tx.subCategory?.trim() ||
      'Reimbursement';

    items.push({
      senderPic: planPic,
      receiverPic: txPic,
      amount: amt,
      itemLabel: normalizeItemLabel(label),
      refKey: txPayDueRefKey(projectId, tx.id),
    });
  }

  return items;
}

/** @deprecated Use computePeriodTransferItems — kept for any older imports. */
export async function computePeriodTransferNets(
  period: string,
  projectId: number,
): Promise<{ senderPic: string; receiverPic: string; total: number }[]> {
  const items = await computePeriodTransferItems(period, projectId);
  const directed = new Map<string, number>();
  for (const item of items) {
    const key = `${item.senderPic}\0${item.receiverPic}`;
    directed.set(key, (directed.get(key) ?? 0) + item.amount);
  }
  return [...directed.entries()].map(([key, total]) => {
    const [senderPic, receiverPic] = key.split('\0');
    return { senderPic, receiverPic, total };
  });
}

/**
 * Upsert pay_due per pending item (to = payer).
 * When a pay_due clears, resolve it and upsert paid_received for the receiver.
 */
export async function syncTransferNotifications(
  period: string,
  projectId: number,
): Promise<{
  payDue: number;
  paidReceivedCreated: number;
  resolved: number;
}> {
  const dues = await computePeriodTransferItems(period, projectId);
  const activeRefKeys = new Set(dues.map((d) => d.refKey));
  const stamp = nowIso();
  let payDue = 0;
  let paidReceivedCreated = 0;
  let resolved = 0;

  for (const due of dues) {
    const amount = String(Math.round(due.amount));

    const [existing] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.projectId, projectId), eq(notifications.refKey, due.refKey)))
      .limit(1);

    if (existing) {
      const amountChanged = toNumber(existing.amount) !== Math.round(due.amount);
      const labelChanged = (existing.itemLabel ?? '') !== due.itemLabel;
      const wasResolved = Boolean(existing.resolvedAt);
      await db
        .update(notifications)
        .set({
          amount,
          itemLabel: due.itemLabel,
          // Re-open only when debt is active again
          resolvedAt: null,
          readAt: wasResolved || amountChanged || labelChanged ? null : existing.readAt,
          toPic: due.senderPic,
          fromPic: due.receiverPic,
          type: 'pay_due',
        })
        .where(and(eq(notifications.id, existing.id), eq(notifications.projectId, projectId)));

      if (wasResolved || amountChanged) {
        void pushAppNotification({
          toPic: due.senderPic,
          type: 'pay_due',
          itemLabel: due.itemLabel,
          amount,
          period,
          refKey: due.refKey,
        });
      }
    } else {
      await db.insert(notifications).values({
        projectId,
        toPic: due.senderPic,
        fromPic: due.receiverPic,
        type: 'pay_due',
        itemLabel: due.itemLabel,
        amount,
        period,
        refKey: due.refKey,
        readAt: null,
        resolvedAt: null,
        createdAt: stamp,
      });
      void pushAppNotification({
        toPic: due.senderPic,
        type: 'pay_due',
        itemLabel: due.itemLabel,
        amount,
        period,
        refKey: due.refKey,
      });
    }
    payDue += 1;
  }

  const openPayDue = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.projectId, projectId),
        eq(notifications.type, 'pay_due'),
        eq(notifications.period, period),
        isNull(notifications.resolvedAt),
      ),
    );

  for (const row of openPayDue) {
    if (activeRefKeys.has(row.refKey)) continue;

    await db
      .update(notifications)
      .set({ resolvedAt: stamp })
      .where(and(eq(notifications.id, row.id), eq(notifications.projectId, projectId)));
    resolved += 1;

    // Only emit paid_received for per-item dues (skip legacy netted ref keys).
    const isPerItem =
      row.refKey.startsWith('pay_due:checklist:') || row.refKey.startsWith('pay_due:tx:');
    if (!isPerItem) continue;

    const itemLabel = normalizeItemLabel(row.itemLabel || 'Item');

    // Notify the previous receiver that payment was made (stable ref → upsert)
    const paidRef = paidReceivedRefKey(row.refKey);
    const [already] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.projectId, projectId), eq(notifications.refKey, paidRef)))
      .limit(1);

    if (already) {
      await db
        .update(notifications)
        .set({
          toPic: row.fromPic,
          fromPic: row.toPic,
          type: 'paid_received',
          itemLabel,
          amount: row.amount,
          period,
          readAt: null,
          resolvedAt: null,
          createdAt: stamp,
        })
        .where(and(eq(notifications.id, already.id), eq(notifications.projectId, projectId)));
      paidReceivedCreated += 1;
    } else {
      await db.insert(notifications).values({
        projectId,
        toPic: row.fromPic,
        fromPic: row.toPic,
        type: 'paid_received',
        itemLabel,
        amount: row.amount,
        period,
        refKey: paidRef,
        readAt: null,
        resolvedAt: null,
        createdAt: stamp,
      });
      paidReceivedCreated += 1;
    }

    void pushAppNotification({
      toPic: row.fromPic,
      type: 'paid_received',
      itemLabel,
      amount: row.amount,
      period,
      refKey: paidRef,
    });
  }

  return { payDue, paidReceivedCreated, resolved };
}

/** Sync the given period plus any periods that still have open pay_dues. */
export async function syncOpenTransferNotifications(
  primaryPeriod: string | undefined,
  projectId: number,
): Promise<string[]> {
  const periods = new Set<string>();
  if (primaryPeriod?.trim()) periods.add(primaryPeriod.trim());

  const openDues = await db
    .select({ period: notifications.period })
    .from(notifications)
    .where(
      and(
        eq(notifications.projectId, projectId),
        eq(notifications.type, 'pay_due'),
        isNull(notifications.resolvedAt),
      ),
    );

  for (const row of openDues) {
    if (row.period) periods.add(row.period);
  }

  for (const period of periods) {
    await syncTransferNotifications(period, projectId);
  }

  return [...periods];
}
