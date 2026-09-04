import { createReadStream, promises as fsp } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';

/** Public URL prefix (proxied via frontend /api → backend). */
export const UPLOAD_URL_PREFIX = '/api/uploads';

const MAX_BYTES = 700_000;
const MAX_DATA_URL_CHARS = 900_000;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function uploadRoot(): string {
  const fromEnv = process.env.UPLOAD_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), 'data', 'uploads');
}

export function isManagedPhotoUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith(`${UPLOAD_URL_PREFIX}/`);
}

/** Resolve a managed URL to an absolute filesystem path, or null if unsafe/invalid. */
export function managedPhotoAbsolutePath(urlPath: string): string | null {
  if (!isManagedPhotoUrl(urlPath)) return null;
  const rel = urlPath.slice(UPLOAD_URL_PREFIX.length).replace(/^\/+/, '');
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return null;
  const root = uploadRoot();
  const abs = path.resolve(root, rel);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) return null;
  return abs;
}

export async function deleteManagedPhoto(url: string | null | undefined): Promise<void> {
  if (!url || !isManagedPhotoUrl(url)) return;
  const abs = managedPhotoAbsolutePath(url);
  if (!abs) return;
  try {
    await fsp.unlink(abs);
  } catch {
    /* already gone */
  }
}

export async function deleteManagedPhotos(urls: Iterable<string | null | undefined>): Promise<void> {
  const seen = new Set<string>();
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    await deleteManagedPhoto(url);
  }
}

/**
 * Persist a client photo into a managed file when needed.
 * - data URL → write file, return `/api/uploads/{folder}/{id}.ext`
 * - already managed path → keep as-is
 * - http(s) URL → keep as-is (external)
 * - empty/null → null
 */
export async function persistPhotoInput(
  raw: string | null | undefined,
  folder: string,
): Promise<string | null> {
  if (raw == null) return null;
  const photo = String(raw).trim();
  if (!photo) return null;

  if (isManagedPhotoUrl(photo)) {
    if (!managedPhotoAbsolutePath(photo)) throw new Error('Invalid photo path');
    return photo;
  }

  if (photo.startsWith('http://') || photo.startsWith('https://')) {
    if (photo.length > MAX_DATA_URL_CHARS) throw new Error('Photo URL is too long');
    return photo;
  }

  if (!photo.startsWith('data:image/')) {
    throw new Error('Photo must be an image data URL or http(s) URL');
  }
  if (photo.length > MAX_DATA_URL_CHARS) {
    throw new Error('Photo is too large (max ~700KB)');
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(photo);
  if (!match) throw new Error('Invalid image data URL');

  const mime = match[1]!.toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext) throw new Error('Unsupported image type');

  const buffer = Buffer.from(match[2]!, 'base64');
  if (buffer.length === 0) return null;
  if (buffer.length > MAX_BYTES) throw new Error('Photo is too large (max ~700KB)');

  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'misc';
  const name = `${randomUUID()}.${ext}`;
  const dir = path.join(uploadRoot(), safeFolder);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, name), buffer);
  return `${UPLOAD_URL_PREFIX}/${safeFolder}/${name}`;
}

/** Delete managed files in `previous` that are not referenced in `next`. */
export async function pruneReplacedPhotos(
  previous: Iterable<string | null | undefined>,
  next: Iterable<string | null | undefined>,
): Promise<void> {
  const keep = new Set<string>();
  for (const url of next) {
    if (url && isManagedPhotoUrl(url)) keep.add(url);
  }
  const toDelete: string[] = [];
  for (const url of previous) {
    if (url && isManagedPhotoUrl(url) && !keep.has(url)) toDelete.push(url);
  }
  await deleteManagedPhotos(toDelete);
}

export async function registerUploadRoutes(app: FastifyInstance): Promise<void> {
  await fsp.mkdir(uploadRoot(), { recursive: true });

  app.get<{ Params: { '*': string } }>('/api/uploads/*', async (request, reply) => {
    const rel = String(request.params['*'] ?? '').replace(/^\/+/, '');
    const urlPath = `${UPLOAD_URL_PREFIX}/${rel}`;
    const abs = managedPhotoAbsolutePath(urlPath);
    if (!abs) return reply.code(404).send({ error: 'Not found' });

    try {
      await fsp.access(abs);
    } catch {
      return reply.code(404).send({ error: 'Not found' });
    }

    const ext = path.extname(abs).toLowerCase();
    const type = EXT_MIME[ext] ?? 'application/octet-stream';
    return sendFile(reply, abs, type);
  });
}

function sendFile(reply: FastifyReply, abs: string, type: string) {
  reply.header('Cache-Control', 'public, max-age=31536000, immutable');
  return reply.type(type).send(createReadStream(abs));
}
