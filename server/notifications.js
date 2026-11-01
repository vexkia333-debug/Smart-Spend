/**
 * Module gửi thông báo ứng dụng (Web Push Notification trực tiếp tới điện thoại, ntfy.sh, MacroDroid, Telegram)
 */
import webpush from 'web-push';
import { db } from './db.js';

let isVapidConfigured = false;
let cachedVapidPublicKey = null;

/**
 * Khởi tạo VAPID keys cho Web Push
 */
export async function initWebPush() {
  if (isVapidConfigured && cachedVapidPublicKey) {
    return cachedVapidPublicKey;
  }

  try {
    const pubRow = await db.prepare("SELECT value FROM settings WHERE key = 'vapid_public_key'").get();
    const privRow = await db.prepare("SELECT value FROM settings WHERE key = 'vapid_private_key'").get();

    let pubKey = pubRow?.value;
    let privKey = privRow?.value;

    if (!pubKey || !privKey) {
      console.log('[WebPush] Chưa có VAPID Keys, đang tạo mới...');
      const keys = webpush.generateVAPIDKeys();
      pubKey = keys.publicKey;
      privKey = keys.privateKey;

      await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('vapid_public_key', ?, datetime('now', 'localtime')) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(pubKey);
      await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('vapid_private_key', ?, datetime('now', 'localtime')) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(privKey);
    }

    webpush.setVapidDetails(
      'mailto:admin@smartspend.app',
      pubKey,
      privKey
    );

    cachedVapidPublicKey = pubKey;
    isVapidConfigured = true;
    console.log('[WebPush] Đã khởi tạo VAPID thành công');
    return cachedVapidPublicKey;
  } catch (err) {
    console.error('[WebPush] Lỗi khởi tạo VAPID:', err.message);
    return null;
  }
}

/**
 * Bắn thông báo đẩy trực tiếp tới tất cả thiết bị đã đăng ký nhận thông báo
 */
export async function sendWebPushNotificationToAll({ title, body, url = '/' }) {
  await initWebPush();
  if (!isVapidConfigured) {
    return { sentCount: 0, failedCount: 0 };
  }

  let subs = [];
  try {
    subs = await db.prepare('SELECT id, subscription_json FROM push_subscriptions').all();
  } catch (e) {
    console.warn('[WebPush] Không đọc được push_subscriptions:', e.message);
    return { sentCount: 0, failedCount: 0 };
  }

  let sentCount = 0;
  let failedCount = 0;

  const payload = JSON.stringify({
    title,
    body,
    icon: '/pwa-192x192.png',
    badge: '/favicon.png',
    url
  });

  for (const subRow of subs) {
    try {
      const sub = JSON.parse(subRow.subscription_json);
      await webpush.sendNotification(sub, payload);
      sentCount++;
    } catch (err) {
      failedCount++;
      // Nếu subscription hết hạn hoặc bị hủy (410 Gone / 404 Not Found), tự động dọn dẹp khỏi DB
      if (err.statusCode === 410 || err.statusCode === 404) {
        try {
          await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(subRow.id);
        } catch { }
      }
      console.warn(`[WebPush Send Error] Sub ID ${subRow.id}:`, err.message);
    }
  }

  return { sentCount, failedCount };
}

export function formatDailyReportNotification(report) {
  const {
    date,
    dateRange,
    dateLabel,
    period = 'DAY',
    totalIncome = 0,
    totalExpense = 0,
    netFlow = 0,
    txCount = 0,
    aiEvaluation
  } = report;

  const dateParts = (date || '').split('-');
  const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : date;
  const displayLabel = dateLabel || dateRange || formattedDate;

  const fmtVND = (num) => new Intl.NumberFormat('vi-VN').format(Math.abs(num || 0)) + 'đ';

  const rating = aiEvaluation?.rating || (totalExpense === 0 ? 'Xuất sắc 🌟' : 'Bình thường 👍');
  const anomalies = Array.isArray(aiEvaluation?.anomalies) ? aiEvaluation.anomalies : [];
  const hasAnomalies = anomalies.length > 0 && !anomalies[0].toLowerCase().includes('không phát hiện');
  const highlights = Array.isArray(aiEvaluation?.highlights) ? aiEvaluation.highlights : [];

  let title = `📊 SmartSpend: Báo cáo ngày ${displayLabel}`;
  let summaryLines = [];
  let markdownText = '';

  if (period === 'WEEK') {
    title = `📈 SmartSpend: Tổng kết tài chính tuần (${displayLabel})`;
    summaryLines = [
      `💸 Chi tuần: ${fmtVND(totalExpense)} | 💰 Thu tuần: ${fmtVND(totalIncome)}`,
      `⚖️ Dòng tiền ròng: ${netFlow >= 0 ? '+' : '-'}${fmtVND(netFlow)} (${txCount} GD)`,
      `🌟 Kỷ luật tuần: ${rating}`
    ];
    if (highlights.length > 0) {
      summaryLines.push(`🔍 Nổi bật: ${highlights[0]}`);
    }
    if (aiEvaluation?.advice) {
      summaryLines.push(`💡 Định hướng tuần tới: ${aiEvaluation.advice}`);
    }

    markdownText = `*${title}*\n\n` +
      `💸 *Tổng chi tuần*: ${fmtVND(totalExpense)}\n` +
      `💰 *Tổng thu tuần*: ${fmtVND(totalIncome)}\n` +
      `⚖️ *Dòng tiền ròng*: ${netFlow >= 0 ? '+' : '-'}${fmtVND(netFlow)}\n` +
      `🔢 *Số giao dịch*: ${txCount}\n\n` +
      `🌟 *Đánh giá*: ${rating}\n` +
      `📝 *Tổng quan*: ${aiEvaluation?.overview || 'Đã phân tích toàn bộ giao dịch trong tuần qua.'}\n\n` +
      (highlights.length > 0 ? `🔍 *Điểm nổi bật tuần*:\n${highlights.map(h => `• ${h}`).join('\n')}\n\n` : '') +
      (hasAnomalies ? `⚠️ *Lưu ý/Bất thường*:\n${anomalies.map(a => `• ${a}`).join('\n')}\n\n` : '') +
      (aiEvaluation?.advice ? `💡 *Chiến lược tuần tới*: ${aiEvaluation.advice}\n` : '');
  } else if (period === 'MONTH') {
    title = `🏆 SmartSpend: Báo cáo tài chính ${displayLabel.startsWith('Tháng') ? displayLabel : 'tháng ' + displayLabel}`;
    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;
    summaryLines = [
      `💸 Tổng chi tháng: ${fmtVND(totalExpense)} | 💰 Thu: ${fmtVND(totalIncome)}`,
      `💎 Tích lũy tháng: ${netFlow >= 0 ? '+' : '-'}${fmtVND(netFlow)} (Tiết kiệm ${savingsRate}%)`,
      `🌟 Sức khỏe tài chính: ${rating}`
    ];
    if (highlights.length > 0) {
      summaryLines.push(`📊 Phân tích: ${highlights[0]}`);
    }
    if (aiEvaluation?.advice) {
      summaryLines.push(`🎯 Chiến lược tháng mới: ${aiEvaluation.advice}`);
    }

    markdownText = `*${title}*\n\n` +
      `💸 *Tổng chi tháng*: ${fmtVND(totalExpense)}\n` +
      `💰 *Tổng thu tháng*: ${fmtVND(totalIncome)}\n` +
      `💎 *Tích lũy*: ${netFlow >= 0 ? '+' : '-'}${fmtVND(netFlow)} (${savingsRate}%)\n` +
      `🔢 *Số giao dịch*: ${txCount}\n\n` +
      `🌟 *Sức khỏe tài chính*: ${rating}\n` +
      `📝 *Toàn cảnh*: ${aiEvaluation?.overview || 'Báo cáo tổng hợp tài chính cả tháng.'}\n\n` +
      (highlights.length > 0 ? `📊 *Cơ cấu & Điểm nhấn*:\n${highlights.map(h => `• ${h}`).join('\n')}\n\n` : '') +
      (hasAnomalies ? `⚠️ *Khoản đột biến*:\n${anomalies.map(a => `• ${a}`).join('\n')}\n\n` : '') +
      (aiEvaluation?.advice ? `🎯 *Kế hoạch tháng mới*: ${aiEvaluation.advice}\n` : '');
  } else {
    // DAY
    summaryLines = [
      `💸 Chi: ${fmtVND(totalExpense)} | 💰 Thu: ${fmtVND(totalIncome)}`,
      `⚖️ Dòng tiền: ${netFlow >= 0 ? '+' : '-'}${fmtVND(netFlow)} (${txCount} GD)`,
      `🌟 Đánh giá AI: ${rating}`
    ];

    if (hasAnomalies) {
      summaryLines.push(`⚠️ Cần chú ý: ${anomalies[0]}`);
    }

    if (aiEvaluation?.advice) {
      summaryLines.push(`💡 Lời khuyên: ${aiEvaluation.advice}`);
    }

    markdownText = `*${title}*\n\n` +
      `💸 *Tổng chi*: ${fmtVND(totalExpense)}\n` +
      `💰 *Tổng thu*: ${fmtVND(totalIncome)}\n` +
      `⚖️ *Chênh lệch*: ${netFlow >= 0 ? '+' : '-'}${fmtVND(netFlow)}\n` +
      `🔢 *Số giao dịch*: ${txCount}\n\n` +
      `🌟 *Đánh giá*: ${rating}\n` +
      `📝 *Tổng quan*: ${aiEvaluation?.overview || 'Đã phân tích toàn bộ giao dịch trong ngày.'}\n\n` +
      (hasAnomalies ? `⚠️ *Khoản nghi vấn/bất thường*:\n${anomalies.map(a => `• ${a}`).join('\n')}\n\n` : '') +
      (aiEvaluation?.advice ? `💡 *Lời khuyên ngày mai*: ${aiEvaluation.advice}\n` : '');
  }

  const shortText = summaryLines.join('\n');

  return {
    title,
    shortText,
    markdownText,
    hasAnomalies,
    rating
  };
}

/**
 * Gửi thông báo tới các kênh điện thoại đã cấu hình
 */
export async function dispatchDailyReportNotification(report, settings = {}) {
  const formatted = formatDailyReportNotification(report);
  const results = {
    webPush: false,
    webPushCount: 0,
    ntfy: false,
    macrodroid: false,
    telegram: false,
    errors: []
  };

  // 1. Gửi qua Web Push Ứng dụng TRỰC TIẾP đến điện thoại người dùng (Không cần công cụ bên thứ 3)
  try {
    const webPushRes = await sendWebPushNotificationToAll({
      title: formatted.title,
      body: formatted.shortText,
      url: '/'
    });
    results.webPush = webPushRes.sentCount > 0;
    results.webPushCount = webPushRes.sentCount;
  } catch (err) {
    console.warn('[WebPush dispatch error]:', err.message);
    results.errors.push(`WebPush: ${err.message}`);
  }

  // 2. Gửi qua ntfy.sh (Nếu có cấu hình)
  const ntfyTopic = settings.ntfy_topic || process.env.NTFY_TOPIC;
  if (ntfyTopic && ntfyTopic !== 'smartspend_kienvu') {
    try {
      const ntfyRes = await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
        method: 'POST',
        headers: {
          'Title': formatted.title,
          'Priority': formatted.hasAnomalies ? 'high' : 'default',
          'Tags': formatted.hasAnomalies ? 'warning,chart_with_upwards_trend' : 'sparkles,moneybag',
          'Click': settings.app_url || 'https://smartspend.onrender.com'
        },
        body: formatted.shortText
      });
      results.ntfy = ntfyRes.ok;
    } catch (err) {
      results.errors.push(`ntfy: ${err.message}`);
    }
  }

  // 3. Gửi qua MacroDroid Webhook (Nếu người dùng cài đặt)
  const macrodroidUrl = settings.macrodroid_webhook_url || process.env.MACRODROID_WEBHOOK_URL;
  if (macrodroidUrl) {
    try {
      const mdRes = await fetch(macrodroidUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formatted.title,
          body: formatted.shortText,
          rating: formatted.rating,
          hasAnomalies: formatted.hasAnomalies,
          date: report.date
        })
      });
      results.macrodroid = mdRes.ok;
    } catch (err) {
      results.errors.push(`MacroDroid: ${err.message}`);
    }
  }

  // 4. Gửi qua Telegram Bot (Nếu có Token và Chat ID)
  const tgToken = settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;
  const tgChatId = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChatId) {
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: formatted.markdownText,
          parse_mode: 'Markdown'
        })
      });
      results.telegram = tgRes.ok;
    } catch (err) {
      results.errors.push(`Telegram: ${err.message}`);
    }
  }

  return {
    success: results.webPush || results.ntfy || results.macrodroid || results.telegram,
    results,
    formatted
  };
}
