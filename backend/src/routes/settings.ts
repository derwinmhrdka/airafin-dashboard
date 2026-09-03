import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { authEmails, budgetSubcategories, budgets, pockets } from '../db/schema.js';
import { listAuthEmails, resolveAuthEmail, getSuperUserEmail } from '../lib/auth-emails.js';
import { createPic, deletePic, isValidPic, listPics } from '../lib/pic.js';

interface PocketBody {
  name?: string;
  color?: string;
}

interface AuthEmailBody {
  email?: string;
  pic?: string;
}

function normalizePocketColor(input?: string): string {
  const color = input?.trim() || '#71717a';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error('Invalid color format (expected #RRGGBB)');
  }
  return color.toLowerCase();
}

function normalizeEmail(input?: string): string {
  return input?.trim().toLowerCase() ?? '';
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings/pockets', async () => {
    const rows = await db.select().from(pockets).orderBy(asc(pockets.name));
    return { pockets: rows };
  });

  app.post<{ Body: PocketBody }>('/api/settings/pockets', async (request, reply) => {
    const name = request.body?.name?.trim().toUpperCase();
    if (!name) return reply.code(400).send({ error: 'name is required' });
    let color = '#71717a';
    try {
      color = normalizePocketColor(request.body?.color);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Invalid color' });
    }

    const [created] = await db
      .insert(pockets)
      .values({ name, color })
      .onConflictDoNothing()
      .returning();

    if (!created) {
      const [existing] = await db.select().from(pockets).where(eq(pockets.name, name)).limit(1);
      return { pocket: existing ?? null, created: false };
    }
    return { pocket: created, created: true };
  });

  app.patch<{ Params: { id: string }; Body: Pick<PocketBody, 'color'> }>(
    '/api/settings/pockets/:id/color',
    async (request, reply) => {
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Invalid id' });

      let color: string;
      try {
        color = normalizePocketColor(request.body?.color);
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : 'Invalid color' });
      }

      const [updated] = await db
        .update(pockets)
        .set({ color })
        .where(eq(pockets.id, id))
        .returning();
      if (!updated) return reply.code(404).send({ error: 'Pocket not found' });

      return { pocket: updated };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/settings/pockets/:id', async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Invalid id' });

    const [target] = await db.select().from(pockets).where(eq(pockets.id, id)).limit(1);
    if (!target) return reply.code(404).send({ error: 'Pocket not found' });

    const [budgetRef] = await db.select({ id: budgets.id }).from(budgets).where(eq(budgets.pocket, target.name)).limit(1);
    const [subRef] = await db
      .select({ id: budgetSubcategories.id })
      .from(budgetSubcategories)
      .where(eq(budgetSubcategories.pocket, target.name))
      .limit(1);

    if (budgetRef || subRef) {
      return reply.code(409).send({ error: 'Pocket is still used in plan data' });
    }

    await db.delete(pockets).where(eq(pockets.id, id));
    return { ok: true };
  });

  app.get('/api/settings/pics', async () => {
    const rows = await listPics();
    return { pics: rows };
  });

  app.post<{ Body: { name?: string } }>('/api/settings/pics', async (request, reply) => {
    const name = request.body?.name ?? '';
    try {
      const result = await createPic(name);
      if (!result.created) {
        return reply.code(409).send({ error: 'PIC already exists', pic: result.pic });
      }
      return result;
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Invalid PIC' });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/settings/pics/:id', async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Invalid id' });
    const result = await deletePic(id);
    if ('error' in result) return reply.code(result.status).send({ error: result.error });
    return { ok: true };
  });

  app.get('/api/settings/auth-emails', async () => {
    const emails = await listAuthEmails();
    return { emails };
  });

  app.post<{ Body: AuthEmailBody }>('/api/settings/auth-emails', async (request, reply) => {
    const email = normalizeEmail(request.body?.email);
    const pic = request.body?.pic?.trim() ?? '';
    if (!email || !email.includes('@')) {
      return reply.code(400).send({ error: 'Valid email is required' });
    }
    if (!isValidPic(pic)) {
      return reply.code(400).send({ error: 'Invalid PIC' });
    }

    const [created] = await db
      .insert(authEmails)
      .values({ email, pic })
      .onConflictDoNothing()
      .returning();

    if (!created) {
      return reply.code(409).send({ error: 'Email already registered' });
    }
    return { email: created, created: true };
  });

  app.patch<{ Params: { id: string }; Body: Pick<AuthEmailBody, 'pic'> }>(
    '/api/settings/auth-emails/:id',
    async (request, reply) => {
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Invalid id' });

      const pic = request.body?.pic?.trim() ?? '';
      if (!isValidPic(pic)) {
        return reply.code(400).send({ error: 'Invalid PIC' });
      }

      const [updated] = await db
        .update(authEmails)
        .set({ pic })
        .where(eq(authEmails.id, id))
        .returning();
      if (!updated) return reply.code(404).send({ error: 'Email not found' });
      return { email: updated };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/settings/auth-emails/:id', async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: 'Invalid id' });

    const [target] = await db.select().from(authEmails).where(eq(authEmails.id, id)).limit(1);
    if (!target) return reply.code(404).send({ error: 'Email not found' });

    const superEmail = getSuperUserEmail();
    if (superEmail && target.email === superEmail) {
      return reply.code(403).send({ error: 'Cannot remove the super-user email (AUTH_EMAIL)' });
    }

    await db.delete(authEmails).where(eq(authEmails.id, id));
    return { ok: true };
  });

  /** Used by frontend OAuth callback (unauthenticated). */
  app.post<{ Body: { email?: string } }>('/api/auth/resolve-email', async (request, reply) => {
    const email = normalizeEmail(request.body?.email);
    if (!email) return reply.code(400).send({ error: 'email is required' });

    const resolved = await resolveAuthEmail(email);
    if (!resolved) {
      return reply.code(404).send({ error: 'Email not allowed' });
    }
    return resolved;
  });
}
