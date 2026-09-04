import { and, asc, desc, eq, notInArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { infoUpdatePages, infoUpdates, infoUpdateSkips } from '../db/schema.js';
import {
  deleteManagedPhotos,
  persistPhotoInput,
  pruneReplacedPhotos,
} from './photo-storage.js';

const MAX_PAGES = 12;

function nowIso(): string {
  return new Date().toISOString();
}

export type PageInput = { body?: string; photo?: string | null };

export async function listInfoUpdates() {
  const rows = await db.select().from(infoUpdates).orderBy(desc(infoUpdates.updatedAt));
  const counts = await db
    .select({
      infoUpdateId: infoUpdatePages.infoUpdateId,
      count: sql<number>`count(*)::int`,
    })
    .from(infoUpdatePages)
    .groupBy(infoUpdatePages.infoUpdateId);
  const countById = new Map(counts.map((c) => [c.infoUpdateId, c.count]));
  return rows.map((r) => ({
    ...r,
    pageCount: countById.get(r.id) ?? 0,
  }));
}

export async function getInfoUpdateWithPages(id: number) {
  const [row] = await db.select().from(infoUpdates).where(eq(infoUpdates.id, id)).limit(1);
  if (!row) return null;
  const pages = await db
    .select()
    .from(infoUpdatePages)
    .where(eq(infoUpdatePages.infoUpdateId, id))
    .orderBy(asc(infoUpdatePages.sortOrder), asc(infoUpdatePages.id));
  return { ...row, pages };
}

export async function createInfoUpdate(input: {
  title: string;
  active?: boolean;
  pages?: PageInput[];
}) {
  const title = input.title.trim();
  if (!title) throw new Error('title is required');
  const stamp = nowIso();
  const [created] = await db
    .insert(infoUpdates)
    .values({
      title,
      active: Boolean(input.active),
      createdAt: stamp,
      updatedAt: stamp,
    })
    .returning();

  const pages = await replacePages(created.id, input.pages ?? [{ body: '' }]);
  return { ...created, pages };
}

export async function updateInfoUpdate(
  id: number,
  input: { title?: string; active?: boolean; pages?: PageInput[] },
) {
  const existing = await getInfoUpdateWithPages(id);
  if (!existing) return null;

  const patch: { title?: string; active?: boolean; updatedAt: string } = {
    updatedAt: nowIso(),
  };
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new Error('title is required');
    patch.title = title;
  }
  if (input.active !== undefined) patch.active = Boolean(input.active);

  const [updated] = await db
    .update(infoUpdates)
    .set(patch)
    .where(eq(infoUpdates.id, id))
    .returning();

  let pages = existing.pages;
  if (input.pages) {
    pages = await replacePages(id, input.pages);
  }
  return { ...updated, pages };
}

async function replacePages(infoUpdateId: number, pages: PageInput[]) {
  if (pages.length > MAX_PAGES) throw new Error(`Max ${MAX_PAGES} pages`);

  const oldRows = await db
    .select({ photo: infoUpdatePages.photo })
    .from(infoUpdatePages)
    .where(eq(infoUpdatePages.infoUpdateId, infoUpdateId));
  const previous = oldRows.map((r) => r.photo);

  const list = pages.length === 0 ? [{ body: '', photo: null as string | null }] : pages;
  const persisted: (string | null)[] = [];
  for (const p of list) {
    persisted.push(await persistPhotoInput(p.photo, 'info'));
  }

  await db.delete(infoUpdatePages).where(eq(infoUpdatePages.infoUpdateId, infoUpdateId));

  const inserted = await db
    .insert(infoUpdatePages)
    .values(
      list.map((p, i) => ({
        infoUpdateId,
        sortOrder: i,
        body: String(p.body ?? '').trim(),
        photo: persisted[i] ?? null,
      })),
    )
    .returning();

  await pruneReplacedPhotos(previous, persisted);
  return inserted.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export async function deleteInfoUpdate(id: number) {
  const existing = await getInfoUpdateWithPages(id);
  if (!existing) return null;

  const photos = existing.pages.map((p) => p.photo);
  const [deleted] = await db.delete(infoUpdates).where(eq(infoUpdates.id, id)).returning();
  await deleteManagedPhotos(photos);
  return deleted ?? null;
}

/** Next active info the user has not skipped (oldest active first). */
export async function getPendingInfoForEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const skipped = await db
    .select({ infoUpdateId: infoUpdateSkips.infoUpdateId })
    .from(infoUpdateSkips)
    .where(eq(infoUpdateSkips.email, normalized));
  const skippedIds = skipped.map((s) => s.infoUpdateId);

  const activeRows = await db
    .select()
    .from(infoUpdates)
    .where(
      skippedIds.length > 0
        ? and(eq(infoUpdates.active, true), notInArray(infoUpdates.id, skippedIds))
        : eq(infoUpdates.active, true),
    )
    .orderBy(asc(infoUpdates.createdAt), asc(infoUpdates.id))
    .limit(1);

  const row = activeRows[0];
  if (!row) return null;

  const pages = await db
    .select()
    .from(infoUpdatePages)
    .where(eq(infoUpdatePages.infoUpdateId, row.id))
    .orderBy(asc(infoUpdatePages.sortOrder), asc(infoUpdatePages.id));

  return { ...row, pages };
}

export async function skipInfoUpdate(infoUpdateId: number, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error('email is required');
  const [exists] = await db
    .select({ id: infoUpdates.id })
    .from(infoUpdates)
    .where(eq(infoUpdates.id, infoUpdateId))
    .limit(1);
  if (!exists) return null;

  await db
    .insert(infoUpdateSkips)
    .values({
      infoUpdateId,
      email: normalized,
      skippedAt: nowIso(),
    })
    .onConflictDoNothing();
  return { ok: true as const };
}
