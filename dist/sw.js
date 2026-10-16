// SmartSpend Service Worker - Hỗ trợ Thông báo đẩy Ứng dụng (Web Push Notifications)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
