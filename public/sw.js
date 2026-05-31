const CACHE_NAME = 'stocksync-v1';
const PRECACHE_URLS = [
  '/dashboard',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('push', function (event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'StockSync', body: event.data.text() };
  }

  const options = {
    body: data.body || 'Portfolio alert triggered.',
    icon: '/icons/icon.svg',
    badge: '/icons/icon-maskable.svg',
    vibrate: [100, 50, 100],
    tag: data.tag || 'stocksync-alert',
    renotify: true,
    data: {
      url: data.url || '/dashboard',
      timestamp: Date.now(),
    },
  };

  event.waitUntil(self.registration.showNotification(data.title || 'StockSync Alert', options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
