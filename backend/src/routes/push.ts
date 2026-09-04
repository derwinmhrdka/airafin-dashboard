import type { FastifyInstance } from 'fastify';
import {
  ensureWebPushConfigured,
  getVapidPublicKey,
  removePushSubscription,
  upsertPushSubscription,
} from '../lib/web-push.js';
import { isValidPic } from '../lib/pic.js';

type SubscribeBody = {
  pic?: string;
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
};

type UnsubscribeBody = {
  endpoint?: string;
};

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/push/vapid-public-key', async () => {
    const publicKey = await getVapidPublicKey();
    return { publicKey };
  });

  app.post<{ Body: SubscribeBody }>('/api/push/subscribe', async (request, reply) => {
    const pic = request.body?.pic?.trim() ?? '';
    const sub = request.body?.subscription;
    const endpoint = sub?.endpoint?.trim() ?? '';
    const p256dh = sub?.keys?.p256dh?.trim() ?? '';
    const auth = sub?.keys?.auth?.trim() ?? '';

    if (!isValidPic(pic)) {
      return reply.code(400).send({ error: 'Valid pic is required' });
    }
    if (!endpoint || !p256dh || !auth) {
      return reply.code(400).send({ error: 'Valid PushSubscription is required' });
    }

    try {
      await upsertPushSubscription({ pic, endpoint, p256dh, auth });
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Subscribe failed' });
    }
  });

  app.post<{ Body: UnsubscribeBody }>('/api/push/unsubscribe', async (request, reply) => {
    const endpoint = request.body?.endpoint?.trim() ?? '';
    if (!endpoint) {
      return reply.code(400).send({ error: 'endpoint is required' });
    }
    await removePushSubscription(endpoint);
    return { ok: true };
  });

  // Warm VAPID on first push route load (also called at boot).
  await ensureWebPushConfigured();
}
