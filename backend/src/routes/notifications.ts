import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { notifications } from '../db/schema.js';
import {
  syncOpenTransferNotifications,
  syncTransferNotifications,
} from '../lib/notifications.js';
import { isValidPic } from '../lib/pic.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { period?: string } }>('/api/notifications/sync', async (request, reply) => {
    const projectId = request.projectId!;
    const period = request.body?.period?.trim();
    if (!period) return reply.code(400).send({ error: 'period is required' });

    const result = await syncTransferNotifications(period, projectId);
    return { ok: true, period, ...result };
  });

  app.get<{ Querystring: { pic?: string; period?: string } }>(
    '/api/notifications',
    async (request, reply) => {
      const projectId = request.projectId!;
      const pic = request.query.pic?.trim() ?? '';
      if (!isValidPic(pic)) {
        return reply.code(400).send({ error: 'Valid pic query is required' });
      }

      const period = request.query.period?.trim();
      // Also re-sync any periods with lingering open pay_dues so settled debts clear.
      await syncOpenTransferNotifications(period, projectId);

      const rows = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.projectId, projectId),
            eq(notifications.toPic, pic),
            isNull(notifications.resolvedAt),
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(50);

      const unreadCount = rows.filter((r) => !r.readAt).length;

      reply.header('Cache-Control', 'no-store');
      return {
        pic,
        unreadCount,
        notifications: rows.map((r) => ({
          id: r.id,
          toPic: r.toPic,
          fromPic: r.fromPic,
          type: r.type,
          itemLabel: r.itemLabel ?? '',
          amount: r.amount,
          period: r.period,
          readAt: r.readAt,
          createdAt: r.createdAt,
        })),
      };
    },
  );

  app.get<{ Querystring: { pic?: string; period?: string } }>(
    '/api/notifications/unread-count',
    async (request, reply) => {
      const projectId = request.projectId!;
      const pic = request.query.pic?.trim() ?? '';
      if (!isValidPic(pic)) {
        return reply.code(400).send({ error: 'Valid pic query is required' });
      }

      const period = request.query.period?.trim();
      await syncOpenTransferNotifications(period, projectId);

      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(
            eq(notifications.projectId, projectId),
            eq(notifications.toPic, pic),
            isNull(notifications.resolvedAt),
            isNull(notifications.readAt),
          ),
        );

      reply.header('Cache-Control', 'no-store');
      return { pic, unreadCount: row?.count ?? 0 };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/notifications/:id/read',
    async (request, reply) => {
      const projectId = request.projectId!;
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.code(400).send({ error: 'Invalid id' });
      }

      const [updated] = await db
        .update(notifications)
        .set({ readAt: new Date().toISOString() })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.projectId, projectId),
            isNull(notifications.readAt),
          ),
        )
        .returning();

      if (!updated) {
        const [existing] = await db
          .select()
          .from(notifications)
          .where(and(eq(notifications.id, id), eq(notifications.projectId, projectId)))
          .limit(1);
        if (!existing) return reply.code(404).send({ error: 'Notification not found' });
        return { notification: existing };
      }

      return { notification: updated };
    },
  );

  app.post<{ Body: { pic?: string } }>('/api/notifications/read-all', async (request, reply) => {
    const projectId = request.projectId!;
    const pic = request.body?.pic?.trim() ?? '';
    if (!isValidPic(pic)) {
      return reply.code(400).send({ error: 'Valid pic is required' });
    }

    await db
      .update(notifications)
      .set({ readAt: new Date().toISOString() })
      .where(
        and(
          eq(notifications.projectId, projectId),
          eq(notifications.toPic, pic),
          isNull(notifications.readAt),
          isNull(notifications.resolvedAt),
        ),
      );

    return { ok: true };
  });
}
