/** Web Push client helpers (no new env vars — VAPID public key from API). */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { publicKey?: string };
    return data.publicKey?.trim() || null;
  } catch {
    return null;
  }
}

async function postSubscribe(pic: string, subscription: PushSubscription): Promise<boolean> {
  const json = subscription.toJSON();
  const endpoint = json.endpoint ?? '';
  const p256dh = json.keys?.p256dh ?? '';
  const auth = json.keys?.auth ?? '';
  if (!endpoint || !p256dh || !auth) return false;

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pic,
      subscription: { endpoint, keys: { p256dh, auth } },
    }),
  });
  return res.ok;
}

/**
 * Request permission (if needed), subscribe, and store on server for this PIC.
 * Safe to call repeatedly; no-ops when unsupported or denied.
 */
export async function ensureWebPushSubscription(pic: string): Promise<'subscribed' | 'denied' | 'unsupported' | 'error'> {
  if (!pic || !pushSupported()) return 'unsupported';

  const registration = await registerPushServiceWorker();
  if (!registration) return 'error';

  await navigator.serviceWorker.ready;

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return 'denied';

  const publicKey = await getVapidPublicKey();
  if (!publicKey) return 'error';

  try {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const ok = await postSubscribe(pic, subscription);
    return ok ? 'subscribed' : 'error';
  } catch {
    return 'error';
  }
}
