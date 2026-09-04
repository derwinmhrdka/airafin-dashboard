import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { appSettings, pushSubscriptions } from '../db/schema.js';
import { isValidPic } from './pic.js';

const VAPID_PUBLIC = 'vapid_public_key';
const VAPID_PRIVATE = 'vapid_private_key';
const VAPID_SUBJECT = 'vapid_subject';

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function vapidSubjectFromEnv(): string {
  const domain = process.env.DOMAIN?.trim() || process.env.ORIGIN?.trim() || '';
  if (domain.startsWith('http://') || domain.startsWith('https://')) {
    try {
      const host = new URL(domain).hostname;
      if (host) return `mailto:noreply@${host}`;
    } catch {
      /* fall through */
    }
  }
  if (domain.includes('.') && !domain.includes('://')) {
    return `mailto:noreply@${domain}`;
  }
  return 'mailto:noreply@localhost';
}

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const existing = await getSetting(key);
  if (existing != null) {
    await db.update(appSettings).set({ value }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value });
  }
}

/** Ensure VAPID keys exist in DB (auto-generate once) and configure web-push. */
export async function ensureWebPushConfigured(): Promise<{ publicKey: string }> {
  let publicKey = await getSetting(VAPID_PUBLIC);
  let privateKey = await getSetting(VAPID_PRIVATE);
  let subject = await getSetting(VAPID_SUBJECT);

  if (!publicKey || !privateKey) {
    const generated = webpush.generateVAPIDKeys();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    await setSetting(VAPID_PUBLIC, publicKey);
    await setSetting(VAPID_PRIVATE, privateKey);
  }

  if (!subject) {
    subject = vapidSubjectFromEnv();
    await setSetting(VAPID_SUBJECT, subject);
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey };
}

export async function getVapidPublicKey(): Promise<string> {
  const { publicKey } = await ensureWebPushConfigured();
  return publicKey;
}

export async function upsertPushSubscription(input: {
  pic: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  if (!isValidPic(input.pic)) throw new Error('Invalid PIC');
  const endpoint = input.endpoint.trim();
  const p256dh = input.p256dh.trim();
  const auth = input.auth.trim();
  if (!endpoint || !p256dh || !auth) throw new Error('Invalid subscription');

  const stamp = nowIso();
  const [existing] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({
        pic: input.pic,
        p256dh,
        auth,
        updatedAt: stamp,
      })
      .where(eq(pushSubscriptions.id, existing.id));
    return;
  }

  await db.insert(pushSubscriptions).values({
    pic: input.pic,
    endpoint,
    p256dh,
    auth,
    createdAt: stamp,
    updatedAt: stamp,
  });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const trimmed = endpoint.trim();
  if (!trimmed) return;
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, trimmed));
}

function notificationTitle(type: string, itemLabel: string): string {
  const label = itemLabel.trim() || 'Item';
  if (type === 'paid_received') return `${label} just paid!`;
  if (type === 'pay_due') return `${label} needs payment`;
  return label;
}

function formatIdr(amount: number | string): string {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  const value = Number.isFinite(n) ? Math.round(n) : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Fire-and-forget push to all devices registered for a PIC. */
export async function sendPushToPic(
  pic: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  if (!isValidPic(pic)) return { sent: 0, removed: 0 };
  await ensureWebPushConfigured();

  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.pic, pic));

  if (rows.length === 0) return { sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? '',
    url: payload.url ?? '/transfer',
    tag: payload.tag ?? 'airafin',
  });

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
          { TTL: 60 * 60 * 12, urgency: 'normal' },
        );
        sent += 1;
      } catch (err) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(row.endpoint);
          removed += 1;
        }
      }
    }),
  );

  return { sent, removed };
}

export async function pushAppNotification(input: {
  toPic: string;
  type: string;
  itemLabel: string;
  amount: string | number;
  period: string;
  refKey: string;
}): Promise<void> {
  try {
    await sendPushToPic(input.toPic, {
      title: notificationTitle(input.type, input.itemLabel),
      body: `${formatIdr(input.amount)} · ${input.period}`,
      url: `/transfer?period=${encodeURIComponent(input.period)}`,
      tag: input.refKey,
    });
  } catch {
    /* never block transfer sync on push failure */
  }
}
