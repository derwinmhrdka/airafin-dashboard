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

export type NotificationType = 'pay_due' | 'paid_received';

export interface TransferNet {
  senderPic: string;
  receiverPic: string;
  total: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function peoplePairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function directedKey(sender: string, receiver: string): string {
  return `${sender}\0${receiver}`;
}

function payDueRefKey(
  projectId: number,
  period: string,
  senderPic: string,
  receiverPic: string,
): string {
  return `pay_due:${projectId}:${period}:${senderPic}->${receiverPic}`;
}

/** Stable key so settle sync upserts one paid_received per cleared due (no stamp spam). */
function paidReceivedRefKey(payDueRef: string): string {
  return `paid_received:${payDueRef}`;
}

/** Collect pending directed amounts (plan + unsettled reimbursements), then net. */
export async function computePeriodTransferNets(
  period: string,
  projectId: number,
): Promise<TransferNet[]> {
  const directed = new Map<string, number>();

  const checklist = await db
    .select({
      senderPic: planChecklist.senderPic,
      receiverPic: planChecklist.receiverPic,
      amount: planChecklist.amount,
      done: planChecklist.done,
    })
    .from(planChecklist)
    .where(and(eq(planChecklist.period, period), eq(planChecklist.projectId, projectId)));

  for (const item of checklist) {
    if (item.done) continue;
    if (!isValidPic(item.senderPic) || !isValidPic(item.receiverPic)) continue;
    const amt = toNumber(item.amount);
    if (amt <= 0) continue;
    const key = directedKey(item.senderPic, item.receiverPic);
    directed.set(key, (directed.get(key) ?? 0) + amt);
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
      categoryId: transactions.categoryId,
      subCategory: transactions.subCategory,
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
    // planPic pays the person who paid (txPic)
    const key = directedKey(planPic, txPic);
    directed.set(key, (directed.get(key) ?? 0) + amt);
  }

  const peoplePairs = new Set<string>();
  for (const key of directed.keys()) {
    const [a, b] = key.split('\0');
    peoplePairs.add(peoplePairKey(a, b));
  }

  const nets: TransferNet[] = [];
  for (const pair of peoplePairs) {
    const [personA, personB] = pair.split('|');
    const forward = directed.get(directedKey(personA, personB)) ?? 0;
    const backward = directed.get(directedKey(personB, personA)) ?? 0;
    const diff = forward - backward;
    if (diff === 0) continue;
    nets.push({
      senderPic: diff > 0 ? personA : personB,
      receiverPic: diff > 0 ? personB : personA,
      total: Math.abs(diff),
    });
  }

  return nets;
}

/**
 * Upsert pay_due for current nets (to = payer).
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
  const nets = await computePeriodTransferNets(period, projectId);
  const activeRefKeys = new Set(
    nets.map((n) => payDueRefKey(projectId, period, n.senderPic, n.receiverPic)),
  );
  const stamp = nowIso();
  let payDue = 0;
  let paidReceivedCreated = 0;
  let resolved = 0;

  for (const net of nets) {
    const refKey = payDueRefKey(projectId, period, net.senderPic, net.receiverPic);
    const amount = String(Math.round(net.total));

    const [existing] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.projectId, projectId), eq(notifications.refKey, refKey)))
      .limit(1);

    if (existing) {
      const amountChanged = toNumber(existing.amount) !== Math.round(net.total);
      const wasResolved = Boolean(existing.resolvedAt);
      await db
        .update(notifications)
        .set({
          amount,
          // Re-open only when debt is active again
          resolvedAt: null,
          readAt: wasResolved || amountChanged ? null : existing.readAt,
          toPic: net.senderPic,
          fromPic: net.receiverPic,
          type: 'pay_due',
        })
        .where(and(eq(notifications.id, existing.id), eq(notifications.projectId, projectId)));
    } else {
      await db.insert(notifications).values({
        projectId,
        toPic: net.senderPic,
        fromPic: net.receiverPic,
        type: 'pay_due',
        amount,
        period,
        refKey,
        readAt: null,
        resolvedAt: null,
        createdAt: stamp,
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
        amount: row.amount,
        period,
        refKey: paidRef,
        readAt: null,
        resolvedAt: null,
        createdAt: stamp,
      });
      paidReceivedCreated += 1;
    }
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
