/**
 * Client helper cho Web Push Notification (Thông báo đẩy trực tiếp trên điện thoại & trình duyệt)
 */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function checkPushSubscriptionStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, permission: 'unsupported', isSubscribed: false };
  }

  const permission = Notification.permission;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return {
      supported: true,
      permission,
      isSubscribed: Boolean(subscription)
    };
  } catch {
    return {
      supported: true,
      permission,
      isSubscribed: false
    };
  }
}

export async function subscribeUserToPush(authFetch) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Trình duyệt hoặc thiết bị này không hỗ trợ Web Push Notification.');
  }

  // 1. Xin quyền hiển thị thông báo
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Bạn chưa cấp quyền nhận thông báo cho ứng dụng. Vui lòng cho phép quyền thông báo trong cài đặt trình duyệt.');
  }

  // 2. Lấy VAPID public key từ server
  const keyRes = await authFetch('/api/notifications/vapid-public-key');
  const keyData = await keyRes.json();
  if (!keyData.publicKey) {
    throw new Error('Không lấy được khóa định danh VAPID từ server.');
  }

  // 3. Đăng ký Push với trình duyệt
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const convertedKey = urlBase64ToUint8Array(keyData.publicKey);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey
    });
  }

  // 4. Gửi subscription lên server để lưu vào database
  const subRes = await authFetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription })
  });

  const subData = await subRes.json();
  if (!subRes.ok) {
    throw new Error(subData.error || 'Lỗi lưu đăng ký thông báo');
  }

  return { success: true, message: 'Đã kích hoạt thông báo ứng dụng thành công!' };
}

export async function testPushNotification(authFetch) {
  const res = await authFetch('/api/notifications/test-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Lỗi gửi test push');
  }

  // Nếu trình duyệt hỗ trợ local notification, bắn thêm một thông báo trực tiếp
  if (Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification('SmartSpend 🔔', {
        body: 'Thông báo ứng dụng hoạt động hoàn hảo!',
        icon: '/pwa-192x192.png',
        badge: '/favicon.png'
      });
    } catch { }
  }

  return data;
}
