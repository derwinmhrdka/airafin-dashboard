/* Airafin Web Push service worker */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'Airafin',
    body: '',
    url: '/transfer',
    tag: 'airafin',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = {
        title: typeof parsed.title === 'string' && parsed.title ? parsed.title : data.title,
        body: typeof parsed.body === 'string' ? parsed.body : '',
        url: typeof parsed.url === 'string' && parsed.url ? parsed.url : '/transfer',
        tag: typeof parsed.tag === 'string' && parsed.tag ? parsed.tag : 'airafin',
      };
    }
  } catch {
    try {
      const text = event.data?.text?.() ?? '';
      if (text) data.body = text;
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: true,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || '/transfer';
  const absolute = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(absolute);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(absolute);
      }
    })(),
  );
});
