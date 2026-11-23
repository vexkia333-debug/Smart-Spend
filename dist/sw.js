// SmartSpend Service Worker - Hỗ trợ Thông báo đẩy & App Shell Offline
const OFFLINE_CACHE = 'smartspend-shell-v2';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = ['/', OFFLINE_URL, '/manifest.json', '/pwa-192x192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // Điều hướng trang: ưu tiên mạng, nếu mất mạng trả về shell đã cache (để đọc localStorage), fallback /offline.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(OFFLINE_CACHE).then((cache) => cache.put('/', copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cachedShell = (await caches.match('/')) || (await caches.match(req));
          if (cachedShell) return cachedShell;
          const offlinePage = await caches.match(OFFLINE_URL);
          return offlinePage || Response.error();
        })
    );
    return;
  }

  // Tài nguyên tĩnh (/assets/*, ảnh nền, icon): Network-first + lưu cache cho chế độ offline
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(OFFLINE_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        return cached || Response.error();
      })
  );
});

// Lắng nghe sự kiện thông báo đẩy từ server
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'SmartSpend - Quản Lý Chi Tiêu';
  const options = {
    body: data.body || data.message || 'Bạn có thông báo mới từ SmartSpend.',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/favicon.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'smartspend-notification',
    renotify: true,
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Xử lý khi người dùng chạm/click vào thông báo trên điện thoại
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Nếu app đang mở sẵn tab, focus vào tab đó
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Nếu chưa mở, mở cửa sổ mới
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
