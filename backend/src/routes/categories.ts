import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { categories } from '../db/schema.js';

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/categories', async () => {
    const rows = await db.select().from(categories).orderBy(categories.id);
    return { categories: rows };
  });

  app.post<{ Body: { name?: string } }>('/api/categories', async (request, reply) => {
    const name = request.body?.name?.trim();

    if (!name) {
      return reply.code(400).send({ error: 'name is required' });
    }

    try {
      const [created] = await db.insert(categories).values({ name }).returning();
      return reply.code(201).send({ category: created });
    } catch {
      return reply.code(409).send({ error: 'Category already exists' });
    }
  });
}
