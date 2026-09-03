import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authEmails } from '../db/schema.js';
import { isValidPic, defaultPic, type Pic } from './pic.js';

const DEFAULT_SUPER_PIC = () => defaultPic();

/** Single root super-user email from AUTH_EMAIL env. */
export function parseAuthEmailEnv(raw = process.env.AUTH_EMAIL ?? ''): string | null {
  const email = raw.split(',')[0]?.trim().toLowerCase() ?? '';
  return email.includes('@') ? email : null;
}

export function getSuperUserEmail(): string | null {
  return parseAuthEmailEnv();
}

export function isRootSuperUserEmail(email: string | undefined | null): boolean {
  const superEmail = getSuperUserEmail();
  return Boolean(superEmail && email?.trim().toLowerCase() === superEmail);
}

/** Ensure the env super-user email exists in DB and is marked admin. */
export async function ensureSuperUserAuthEmail(): Promise<void> {
  const email = parseAuthEmailEnv();
  if (!email) return;
  await db
    .insert(authEmails)
    .values({ email, pic: DEFAULT_SUPER_PIC(), isAdmin: true })
    .onConflictDoNothing();
  await db.update(authEmails).set({ isAdmin: true }).where(eq(authEmails.email, email));
}

export async function listAuthEmails() {
  await ensureSuperUserAuthEmail();
  const superEmail = getSuperUserEmail();
  const rows = await db.select().from(authEmails).orderBy(asc(authEmails.email));
  return rows.map((row) => ({
    ...row,
    isSuperUser: superEmail != null && row.email === superEmail,
    isAdmin: Boolean(row.isAdmin) || (superEmail != null && row.email === superEmail),
  }));
}

export async function resolveAuthEmail(email: string): Promise<{ email: string; pic: Pic } | null> {
  await ensureSuperUserAuthEmail();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const [row] = await db
    .select()
    .from(authEmails)
    .where(eq(authEmails.email, normalized))
    .limit(1);

  if (!row || !isValidPic(row.pic)) return null;
  return { email: row.email, pic: row.pic };
}

export async function emailIsAdmin(email: string | undefined | null): Promise<boolean> {
  if (!email?.trim()) return false;
  const normalized = email.trim().toLowerCase();
  if (isRootSuperUserEmail(normalized)) return true;

  await ensureSuperUserAuthEmail();
  const [row] = await db
    .select({ isAdmin: authEmails.isAdmin })
    .from(authEmails)
    .where(eq(authEmails.email, normalized))
    .limit(1);
  return Boolean(row?.isAdmin);
}

export async function setAuthEmailAdmin(
  id: number,
  isAdmin: boolean,
): Promise<{
  id: number;
  email: string;
  pic: string;
  isAdmin: boolean;
  isSuperUser: boolean;
} | null> {
  await ensureSuperUserAuthEmail();
  const [existing] = await db.select().from(authEmails).where(eq(authEmails.id, id)).limit(1);
  if (!existing) return null;

  if (isRootSuperUserEmail(existing.email) && !isAdmin) {
    throw new Error('Cannot demote the root super-user (AUTH_EMAIL)');
  }

  const [updated] = await db
    .update(authEmails)
    .set({ isAdmin })
    .where(eq(authEmails.id, id))
    .returning();
  if (!updated) return null;

  return {
    id: updated.id,
    email: updated.email,
    pic: updated.pic,
    isAdmin: Boolean(updated.isAdmin) || isRootSuperUserEmail(updated.email),
    isSuperUser: isRootSuperUserEmail(updated.email),
  };
}

export async function authEmailExists(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select({ id: authEmails.id })
    .from(authEmails)
    .where(eq(authEmails.email, normalized))
    .limit(1);
  return Boolean(row);
}

/** @deprecated use emailIsAdmin */
export async function isSuperUserEmail(email: string): Promise<boolean> {
  return emailIsAdmin(email);
}
