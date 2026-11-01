import { Router } from 'express';
import { db } from '../db.js';
import { formatDailyReportNotification } from '../notifications.js';
import { generateAndSavePeriodicReport } from '../services/reportService.js';

const router = Router();

// Lấy nội dung thông báo báo cáo định kỳ (Hỗ trợ MacroDroid & iOS Shortcuts)
router.get('/ai/daily-report/notification', async (req, res) => {
  try {
    const { format = 'text', date, force, period = 'DAY' } = req.query;
    const isForce = force === 'true' || force === '1';
    const report = await generateAndSavePeriodicReport({
      period: String(period).toUpperCase(),
      date,
      force: isForce,
      triggerSource: 'NOTIFICATION_REQUEST'
    });

    const formatted = formatDailyReportNotification(report);

    if (format === 'text') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(formatted.shortText);
    }

    if (format === 'markdown') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(formatted.markdownText);
    }

    res.json({
      success: true,
      title: formatted.title,
      message: formatted.shortText,
      rating: formatted.rating,
      hasAnomalies: formatted.hasAnomalies,
      report
    });
  } catch (err) {
    console.error('Lỗi /api/ai/daily-report/notification:', err);
    res.status(500).send('Lỗi tạo thông báo báo cáo: ' + err.message);
  }
});

// Kích hoạt chạy và bắn thử thông báo tới điện thoại (Ngày / Tuần / Tháng)
router.post('/ai/daily-report/trigger', async (req, res) => {
  try {
    const { date, period = 'DAY' } = req.body || {};
    const report = await generateAndSavePeriodicReport({
      period: String(period).toUpperCase(),
      date,
      force: true,
      triggerSource: 'TEST_PUSH'
    });
    res.json({
      success: true,
      message: `Đã kích hoạt tạo báo cáo (${report.period}) và bắn thông báo tới điện thoại thành công!`,
      report
    });
  } catch (err) {
    console.error('Lỗi /api/ai/daily-report/trigger:', err);
    res.status(500).json({ error: err.message });
  }
});

// Lấy cài đặt lịch gửi thông báo tự động (Ngày, Tuần, Tháng)
router.get('/settings/daily-report', async (req, res) => {
  try {
    const rows = await db.prepare("SELECT key, value FROM settings WHERE key LIKE '%report%' OR key LIKE 'ntfy%' OR key LIKE 'telegram%' OR key LIKE 'macrodroid%'").all();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({
      success: true,
      settings: {
        // Hàng ngày
        time: map.daily_report_time || '22:00',
        enabled: map.daily_report_enabled !== 'false',
        // Hàng tuần
        weeklyTime: map.weekly_report_time || '21:00',
        weeklyEnabled: map.weekly_report_enabled !== 'false',
        weeklyDay: map.weekly_report_day || '0', // 0 = CN, 1 = T2
        // Hàng tháng
        monthlyTime: map.monthly_report_time || '21:30',
        monthlyEnabled: map.monthly_report_enabled !== 'false',
        // Kênh thông báo
        ntfyTopic: map.ntfy_topic || 'smartspend_kienvu',
        macrodroidWebhookUrl: map.macrodroid_webhook_url || '',
        telegramBotToken: map.telegram_bot_token ? '******' : '',
        telegramChatId: map.telegram_chat_id || ''
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lưu cài đặt lịch gửi thông báo tự động
router.post('/settings/daily-report', async (req, res) => {
  try {
    const {
      time,
      enabled,
      weeklyTime,
      weeklyEnabled,
      weeklyDay,
      monthlyTime,
      monthlyEnabled,
      ntfyTopic,
      macrodroidWebhookUrl,
      telegramBotToken,
      telegramChatId
    } = req.body || {};

    const updates = [];

    // Hàng ngày
    if (time !== undefined) updates.push({ key: 'daily_report_time', value: String(time).trim() });
    if (enabled !== undefined) updates.push({ key: 'daily_report_enabled', value: String(enabled) });

    // Hàng tuần
    if (weeklyTime !== undefined) updates.push({ key: 'weekly_report_time', value: String(weeklyTime).trim() });
    if (weeklyEnabled !== undefined) updates.push({ key: 'weekly_report_enabled', value: String(weeklyEnabled) });
    if (weeklyDay !== undefined) updates.push({ key: 'weekly_report_day', value: String(weeklyDay) });

    // Hàng tháng
    if (monthlyTime !== undefined) updates.push({ key: 'monthly_report_time', value: String(monthlyTime).trim() });
    if (monthlyEnabled !== undefined) updates.push({ key: 'monthly_report_enabled', value: String(monthlyEnabled) });

    // Kênh ngoài
    if (ntfyTopic !== undefined) updates.push({ key: 'ntfy_topic', value: String(ntfyTopic).trim() });
    if (macrodroidWebhookUrl !== undefined) updates.push({ key: 'macrodroid_webhook_url', value: String(macrodroidWebhookUrl).trim() });
    if (telegramBotToken !== undefined && telegramBotToken !== '******') updates.push({ key: 'telegram_bot_token', value: String(telegramBotToken).trim() });
    if (telegramChatId !== undefined) updates.push({ key: 'telegram_chat_id', value: String(telegramChatId).trim() });

    for (const item of updates) {
      await db.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(item.key, item.value);
    }

    res.json({ success: true, message: 'Đã lưu cấu hình thông báo báo cáo định kỳ' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Báo cáo tài chính định kỳ cho Modal UI (Ngày / Tuần / Tháng & cache)
router.post('/ai/daily-report', async (req, res) => {
  try {
    const { date, refresh = false, period = 'DAY' } = req.body || {};
    const report = await generateAndSavePeriodicReport({
      period: String(period).toUpperCase(),
      date,
      force: Boolean(refresh),
      triggerSource: 'UI_MODAL'
    });
    res.json(report);
  } catch (err) {
    console.error('Lỗi periodic-report:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

