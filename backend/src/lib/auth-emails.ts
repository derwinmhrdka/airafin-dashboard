import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authEmails } from '../db/schema.js';
import { isValidPic, defaultPic, type Pic } from './pic.js';

const DEFAULT_SUPER_PIC = () => defaultPic();

/** Single super-user email from AUTH_EMAIL env. */
export function parseAuthEmailEnv(raw = process.env.AUTH_EMAIL ?? ''): string | null {
  const email = raw.split(',')[0]?.trim().toLowerCase() ?? '';
  return email.includes('@') ? email : null;
}

export function getSuperUserEmail(): string | null {
  return parseAuthEmailEnv();
}

/** Ensure the env super-user email exists in DB. */
export async function ensureSuperUserAuthEmail(): Promise<void> {
  const email = parseAuthEmailEnv();
  if (!email) return;
  await db
    .insert(authEmails)
    .values({ email, pic: DEFAULT_SUPER_PIC() })
    .onConflictDoNothing();
}

export async function listAuthEmails() {
  await ensureSuperUserAuthEmail();
  const superEmail = getSuperUserEmail();
  const rows = await db.select().from(authEmails).orderBy(asc(authEmails.email));
  return rows.map((row) => ({
    ...row,
    isSuperUser: superEmail != null && row.email === superEmail,
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

export async function isSuperUserEmail(email: string): Promise<boolean> {
  const superEmail = getSuperUserEmail();
  return superEmail != null && email.trim().toLowerCase() === superEmail;
}
