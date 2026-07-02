/**
 * Eranos Service Worker
 *
 * Handles incoming Web Push notifications from the nostr-push server and
 * opens/focuses the app when the user taps a notification.
 */

// --- Push received ---

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Eranos', body: event.data.text() };
  }

  const title = payload.title ?? 'Eranos';
  const options = {
    body: payload.body ?? '',
    icon: payload.icon ?? '/icon-192.png',
    badge: payload.badge ?? '/icon-192.png',
    data: payload.data ?? {},
    requireInteraction: false,
    tag: payload.data?.subscription_id ?? 'eranos-notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(title, options),
  );
});

// --- Notification click ---

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing Eranos tab if one is open
        for (const client of clientList) {
          if (new URL(client.url).origin === self.location.origin) {
            client.navigate('/notifications');
            return client.focus();
          }
        }
        // Otherwise open a new tab
        return self.clients.openWindow('/notifications');
      }),
  );
});

// --- Activate immediately ---
//
// On activate:
//   1. Wipe every Cache Storage entry. A previous version of Eranos deployed
//      a precaching service worker (Workbox-style) that's still serving stale
//      HTML/JS to returning users on this origin. Clearing caches means future
//      requests bypass anything the old SW left behind.
//   2. Take control of all open clients via clients.claim().
//   3. Force each controlled tab to navigate to its own URL. clients.claim()
//      only changes which SW handles future fetches — it does not re-render
//      pages that already finished loading. Without the explicit navigate,
//      the user is stuck on the old rendered bundle until they manually
//      close and reopen the tab. Since this SW has no fetch handler, the
//      navigation falls through to the network and gets the new build.
//
// This SW has no 'fetch' handler, so it never repopulates a cache — push
// notifications are the only thing it intercepts.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();

      // Soft-reload every open same-origin tab so it picks up the fresh
      // index.html + hashed bundle from the network. WindowClient.navigate()
      // is same-origin-only by spec, which is exactly what we want.
      const windowClients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(
        windowClients.map((client) =>
          'navigate' in client
            ? client.navigate(client.url).catch(() => {})
            : Promise.resolve(),
        ),
      );
    })(),
  );
});
