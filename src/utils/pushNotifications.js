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
  if (!('Notification' in window)) {
    return { supported: false, permission: 'unsupported', isSubscribed: false, mode: 'NONE' };
  }

  const permission = Notification.permission;
  const localMode = localStorage.getItem('smartspend_push_mode');

  if (permission !== 'granted') {
    return { supported: true, permission, isSubscribed: false, mode: 'NONE' };
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: true, permission: 'granted', isSubscribed: true, mode: 'BROWSER_LOCAL' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      return { supported: true, permission, isSubscribed: true, mode: 'FCM_PUSH' };
    }
    // Nếu quyền đã cấp nhưng chưa có FCM subscription (hoặc FCM bị hạn chế trên Xiaomi/MIUI)
    return {
      supported: true,
      permission,
      isSubscribed: localMode === 'BROWSER_LOCAL',
      mode: localMode || 'BROWSER_LOCAL'
    };
  } catch {
    return {
      supported: true,
      permission,
      isSubscribed: permission === 'granted',
      mode: 'BROWSER_LOCAL'
    };
  }
}

export async function subscribeUserToPush(authFetch) {
  if (!('Notification' in window)) {
    throw new Error('Trình duyệt hoặc thiết bị này không hỗ trợ tính năng thông báo.');
  }

  // 1. Xin quyền hiển thị thông báo hệ thống
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Bạn chưa cấp quyền thông báo. Vui lòng cho phép quyền thông báo trong cài đặt trình duyệt để app có thể báo cáo lúc 22:00.');
  }

  // 2. Thử đăng ký Web Push qua PushManager (FCM)
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const keyRes = await authFetch('/api/notifications/vapid-public-key');
      const keyData = await keyRes.json();

      if (keyData?.publicKey) {
        const registration = await navigator.serviceWorker.ready;
        const convertedKey = urlBase64ToUint8Array(keyData.publicKey);

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          try {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedKey
            });
          } catch (subErr) {
            console.warn('[PushManager subscribe first attempt]:', subErr);
            throw subErr;
          }
        }

        if (subscription) {
          await authFetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription })
          });

          localStorage.setItem('smartspend_push_mode', 'FCM_PUSH');
          return {
            success: true,
            mode: 'FCM_PUSH',
            message: '🎉 Đã bật thông báo ứng dụng thành công! Điện thoại của bạn sẽ nhận thông báo báo cáo lúc 22:00 mỗi ngày.'
          };
        }
      }
    } catch (pushErr) {
      console.warn('[PushManager subscribe warning]:', pushErr);

      // Nếu gặp lỗi FCM Google Play Services ("push service error" thường thấy trên Xiaomi / MIUI / HyperOS)
      const errStr = (pushErr.message || '').toLowerCase();
      if (errStr.includes('push service error') || pushErr.name === 'AbortError' || errStr.includes('registration failed')) {
        localStorage.setItem('smartspend_push_mode', 'BROWSER_LOCAL');
        return {
          success: true,
          mode: 'BROWSER_LOCAL',
          isPushServiceIssue: true,
          message: 'Đã cấp quyền thông báo hệ thống! Dịch vụ Google FCM trên máy bạn (MIUI/Xiaomi) đang hạn chế kết nối ngầm. App đã kích hoạt chế độ thông báo trực tiếp & hỗ trợ MacroDroid dự phòng.'
        };
      }
      throw pushErr;
    }
  }

  localStorage.setItem('smartspend_push_mode', 'BROWSER_LOCAL');
  return {
    success: true,
    mode: 'BROWSER_LOCAL',
    message: 'Đã cấp quyền thông báo ứng dụng thành công!'
  };
}

export async function testPushNotification(authFetch) {
  // Bắn thử trực tiếp qua Service Worker notification nếu đã cấp quyền
  if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification('SmartSpend 🔔', {
        body: 'Thông báo ứng dụng hoạt động hoàn hảo lúc ' + new Date().toLocaleTimeString('vi-VN') + '!',
        icon: '/pwa-192x192.png',
        badge: '/favicon.png',
        vibrate: [200, 100, 200]
      });
    } catch (swErr) {
      console.warn('Lỗi hiển thị notification từ ServiceWorker:', swErr);
      try {
        new Notification('SmartSpend 🔔', {
          body: 'Thông báo ứng dụng hoạt động hoàn hảo lúc ' + new Date().toLocaleTimeString('vi-VN') + '!',
          icon: '/pwa-192x192.png'
        });
      } catch { }
    }
  }

  try {
    const res = await authFetch('/api/notifications/test-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return await res.json();
  } catch (e) {
    return { success: true, localOnly: true };
  }
}
