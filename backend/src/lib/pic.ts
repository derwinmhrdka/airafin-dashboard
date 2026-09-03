import { asc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  authEmails,
  budgetSubcategories,
  budgets,
  notifications,
  pics,
  planChecklist,
  transactions,
} from '../db/schema.js';

export type Pic = string;

const FALLBACK_PICS = ['Derwin', 'Anggita'] as const;

let cachedNames: string[] = [...FALLBACK_PICS];

export function listCachedPics(): string[] {
  return cachedNames;
}

export function defaultPic(): Pic {
  return cachedNames.includes('Derwin') ? 'Derwin' : (cachedNames[0] ?? 'Derwin');
}

export function isValidPic(value: string): boolean {
  const name = value.trim();
  return name.length > 0 && cachedNames.includes(name);
}

export function normalizePicName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export async function refreshPicCache(): Promise<string[]> {
  try {
    const rows = await db.select({ name: pics.name }).from(pics).orderBy(asc(pics.name));
    cachedNames = rows.map((r) => r.name);
    if (cachedNames.length === 0) cachedNames = [...FALLBACK_PICS];
  } catch {
    cachedNames = [...FALLBACK_PICS];
  }
  return cachedNames;
}

export async function listPics() {
  await refreshPicCache();
  return db.select().from(pics).orderBy(asc(pics.name));
}

export async function createPic(rawName: string) {
  const name = normalizePicName(rawName);
  if (!name) throw new Error('name is required');
  if (name.length > 32) throw new Error('PIC name is too long');

  const [existing] = await db
    .select()
    .from(pics)
    .where(sql`lower(${pics.name}) = ${name.toLowerCase()}`)
    .limit(1);
  if (existing) {
    return { pic: existing, created: false as const };
  }

  const [created] = await db.insert(pics).values({ name }).returning();
  await refreshPicCache();
  return { pic: created, created: true as const };
}

export async function findPicByNameCi(name: string) {
  const [row] = await db
    .select()
    .from(pics)
    .where(sql`lower(${pics.name}) = ${name.trim().toLowerCase()}`)
    .limit(1);
  return row ?? null;
}

export async function deletePic(id: number): Promise<{ ok: true } | { error: string; status: number }> {
  const [target] = await db.select().from(pics).where(eq(pics.id, id)).limit(1);
  if (!target) return { error: 'PIC not found', status: 404 };

  const remaining = await db.select({ id: pics.id }).from(pics);
  if (remaining.length <= 1) {
    return { error: 'Keep at least one PIC', status: 409 };
  }

  const name = target.name;
  const [authRef] = await db.select({ id: authEmails.id }).from(authEmails).where(eq(authEmails.pic, name)).limit(1);
  const [budgetRef] = await db.select({ id: budgets.id }).from(budgets).where(eq(budgets.pic, name)).limit(1);
  const [subRef] = await db
    .select({ id: budgetSubcategories.id })
    .from(budgetSubcategories)
    .where(eq(budgetSubcategories.pic, name))
    .limit(1);
  const [txRef] = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.pic, name)).limit(1);
  const [checkRef] = await db
    .select({ id: planChecklist.id })
    .from(planChecklist)
    .where(or(eq(planChecklist.senderPic, name), eq(planChecklist.receiverPic, name)))
    .limit(1);
  const [notifRef] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(or(eq(notifications.toPic, name), eq(notifications.fromPic, name)))
    .limit(1);

  if (authRef || budgetRef || subRef || txRef || checkRef || notifRef) {
    return { error: 'PIC is still assigned to a user or used in data', status: 409 };
  }

  await db.delete(pics).where(eq(pics.id, id));
  await refreshPicCache();
  return { ok: true };
}
