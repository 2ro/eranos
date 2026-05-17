/**
 * Agora Service Worker
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
    payload = { title: 'Agora', body: event.data.text() };
  }

  const title = payload.title ?? 'Agora';
  const options = {
    body: payload.body ?? '',
    icon: payload.icon ?? '/icon-192.png',
    badge: payload.badge ?? '/icon-192.png',
    data: payload.data ?? {},
    requireInteraction: false,
    tag: payload.data?.subscription_id ?? 'agora-notification',
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
        // Focus an existing Agora tab if one is open
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
// On activate, nuke every Cache Storage entry. A previous version of Agora
// deployed a precaching service worker (Workbox-style) that's still serving
// stale HTML/JS to returning users on the same origin. Wiping caches here
// means the first request a returning user makes after this SW takes over
// will hit the network and get the new build.
//
// This SW itself does not intercept fetches (no 'fetch' handler), so it
// never repopulates a cache — only push notifications are handled below.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});
