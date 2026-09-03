import type { FastifyInstance } from 'fastify';
import {
  createInfoUpdate,
  deleteInfoUpdate,
  getInfoUpdateWithPages,
  getPendingInfoForEmail,
  listInfoUpdates,
  skipInfoUpdate,
  updateInfoUpdate,
  type PageInput,
} from '../lib/info-updates.js';

function userEmailFromRequest(request: { headers: Record<string, unknown> }): string {
  const raw = request.headers['x-user-email'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export async function infoUpdateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/info-updates/pending', async (request, reply) => {
    const email = userEmailFromRequest(request);
    if (!email) return reply.code(400).send({ error: 'X-User-Email required' });
    const update = await getPendingInfoForEmail(email);
    return { update };
  });

  app.post<{ Params: { id: string } }>('/api/info-updates/:id/skip', async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Invalid id' });
    const email = userEmailFromRequest(request);
    if (!email) return reply.code(400).send({ error: 'X-User-Email required' });
    try {
      const result = await skipInfoUpdate(id, email);
      if (!result) return reply.code(404).send({ error: 'Info update not found' });
      return result;
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed' });
    }
  });

  app.get('/api/info-updates', async () => {
    const updates = await listInfoUpdates();
    return { updates };
  });

  app.get<{ Params: { id: string } }>('/api/info-updates/:id', async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Invalid id' });
    const update = await getInfoUpdateWithPages(id);
    if (!update) return reply.code(404).send({ error: 'Not found' });
    return { update };
  });

  app.post<{
    Body: { title?: string; active?: boolean; pages?: PageInput[] };
  }>('/api/info-updates', async (request, reply) => {
    try {
      const update = await createInfoUpdate({
        title: request.body?.title ?? '',
        active: request.body?.active,
        pages: request.body?.pages,
      });
      return reply.code(201).send({ update });
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed' });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { title?: string; active?: boolean; pages?: PageInput[] };
  }>('/api/info-updates/:id', async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Invalid id' });
    try {
      const update = await updateInfoUpdate(id, {
        title: request.body?.title,
        active: request.body?.active,
        pages: request.body?.pages,
      });
      if (!update) return reply.code(404).send({ error: 'Not found' });
      return { update };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed' });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/info-updates/:id', async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Invalid id' });
    const deleted = await deleteInfoUpdate(id);
    if (!deleted) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });
}
