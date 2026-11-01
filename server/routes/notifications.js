import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { initWebPush, sendWebPushNotificationToAll } from '../notifications.js';

const router = Router();

// Lấy public VAPID key cho client
router.get('/vapid-public-key', async (req, res) => {
  try {
    const key = await initWebPush();
    res.json({ success: true, publicKey: key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Đăng ký nhận Web Push từ trình duyệt / PWA
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Dữ liệu subscription là bắt buộc' });
    }

    const endpoint = subscription.endpoint;
    const subJson = JSON.stringify(subscription);
    const userAgent = req.headers['user-agent'] || '';
    const id = 'sub_' + crypto.randomUUID().slice(0, 8);

    await db.prepare(`
      INSERT INTO push_subscriptions (id, endpoint, subscription_json, user_agent, created_at)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(endpoint) DO UPDATE SET
        subscription_json = excluded.subscription_json,
        user_agent = excluded.user_agent
    `).run(id, endpoint, subJson, userAgent);

    // Bắn thông báo xác nhận ngay tức thì tới thiết bị vừa đăng ký
    try {
      await sendWebPushNotificationToAll({
        title: 'SmartSpend 🔔',
        body: 'Thông báo ứng dụng đã được kích hoạt thành công trên thiết bị của bạn!',
        url: '/'
      });
    } catch { }

    res.json({ success: true, message: 'Đã đăng ký nhận thông báo ứng dụng thành công!' });
  } catch (err) {
    console.error('Lỗi subscribe push:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bắn thử thông báo Web Push test
router.post('/test-push', async (req, res) => {
  try {
    const result = await sendWebPushNotificationToAll({
      title: 'SmartSpend Test 🔔',
      body: 'Thông báo ứng dụng hoạt động hoàn hảo lúc ' + new Date().toLocaleTimeString('vi-VN'),
      url: '/'
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
