import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { budgetSubcategories, budgets, pockets } from '../db/schema.js';

interface PocketBody {
  name?: string;
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings/pockets', async () => {
    const rows = await db.select().from(pockets).orderBy(asc(pockets.name));
    return { pockets: rows };
  });

  app.post<{ Body: PocketBody }>('/api/settings/pockets', async (request, reply) => {
    const name = request.body?.name?.trim().toUpperCase();
    if (!name) return reply.code(400).send({ error: 'name is required' });

    const [created] = await db
      .insert(pockets)
      .values({ name })
      .onConflictDoNothing()
      .returning();

    if (!created) {
      const [existing] = await db.select().from(pockets).where(eq(pockets.name, name)).limit(1);
      return { pocket: existing ?? null, created: false };
    }
    return { pocket: created, created: true };
  });

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
}
