import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects } from '../db/schema.js';

const MAX_NAME = 64;
const MAX_PHOTO_CHARS = 900_000; // ~0.9MB data URL

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeProjectName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export async function listProjects() {
  return db.select().from(projects).orderBy(asc(projects.id));
}

export async function getProjectById(id: number) {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

export async function createProject(input: { name: string; photo?: string | null }) {
  const name = normalizeProjectName(input.name);
  if (!name) throw new Error('name is required');
  if (name.length > MAX_NAME) throw new Error('Project name is too long');

  const photo = normalizePhoto(input.photo);
  const [created] = await db
    .insert(projects)
    .values({ name, photo, createdAt: nowIso() })
    .returning();
  return created;
}

export async function updateProject(
  id: number,
  input: { name?: string; photo?: string | null },
) {
  const existing = await getProjectById(id);
  if (!existing) return null;

  const patch: { name?: string; photo?: string | null } = {};
  if (input.name !== undefined) {
    const name = normalizeProjectName(input.name);
    if (!name) throw new Error('name is required');
    if (name.length > MAX_NAME) throw new Error('Project name is too long');
    patch.name = name;
  }
  if (input.photo !== undefined) {
    patch.photo = normalizePhoto(input.photo);
  }

  const [updated] = await db
    .update(projects)
    .set(patch)
    .where(eq(projects.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteProject(id: number): Promise<{ ok: true } | { error: string; status: number }> {
  const existing = await getProjectById(id);
  if (!existing) return { error: 'Project not found', status: 404 };

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(projects);
  if ((count ?? 0) <= 1) {
    return { error: 'Keep at least one project', status: 409 };
  }

  await db.delete(projects).where(eq(projects.id, id));
  return { ok: true };
}

function normalizePhoto(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const photo = String(raw).trim();
  if (!photo) return null;
  if (photo.length > MAX_PHOTO_CHARS) {
    throw new Error('Photo is too large (max ~700KB)');
  }
  if (photo.startsWith('data:image/') || photo.startsWith('https://') || photo.startsWith('http://')) {
    return photo;
  }
  throw new Error('Photo must be an image data URL or http(s) URL');
}

export function parseProjectIdHeader(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}
