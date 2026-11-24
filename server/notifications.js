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
export async function sendWebPushNotificationToAll({ title, body, url = '/', data = {} }) {
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
    url,
    ...data
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

function fmtCompactVND(num) {
  const abs = Math.abs(Number(num || 0));
  if (abs === 0) return '0đ';
  if (abs >= 1_000_000) {
    const tr = abs / 1_000_000;
    const str = (tr >= 10 ? tr.toFixed(1) : tr.toFixed(2))
      .replace(/\.?0+$/, '')
      .replace('.', ',');
    return `${str}tr`;
  }
  if (abs >= 1_000) {
    return `${Math.round(abs / 1_000)}k`;
  }
  return `${Math.round(abs)}đ`;
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
    categoryBreakdown = {},
    contextMetrics = null,
    aiEvaluation
  } = report;

  const dateParts = (date || '').split('-');
  const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : date;
  const shortDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : (dateLabel || '');
  const displayLabel = dateLabel || dateRange || formattedDate;

  const fmtVND = (num) => new Intl.NumberFormat('vi-VN').format(Math.abs(num || 0)) + 'đ';

  const rating = aiEvaluation?.rating || (totalExpense === 0 ? 'Xuất sắc 🌟' : 'Cân đối 👍');
  const anomalies = Array.isArray(aiEvaluation?.anomalies) ? aiEvaluation.anomalies : [];
  const hasAnomalies = anomalies.length > 0 && !anomalies[0].toLowerCase().includes('không phát hiện');
  const highlights = Array.isArray(aiEvaluation?.highlights) ? aiEvaluation.highlights : [];

  const topCats = Object.entries(categoryBreakdown || {})
    .filter(([, amt]) => Number(amt) > 0)
    .sort(([, a], [, b]) => Number(b) - Number(a));

  const prevComp = contextMetrics?.prevComparison || null;
  const mg = contextMetrics?.monthlyGoalContext || null;
  const totalBalance = contextMetrics?.totalBalance;
  const pendingCount = Number(contextMetrics?.pendingCount || 0);

  const shortHook = (aiEvaluation?.pushHook || aiEvaluation?.advice || '').trim();
  const compactHook = shortHook.length > 92 ? shortHook.slice(0, 89).trimEnd() + '…' : shortHook;

  const targetUrl = `/?report=${encodeURIComponent(period)}${date ? `&date=${encodeURIComponent(date)}` : ''}`;

  let title = '';
  let summaryLines = [];
  let markdownText = '';

  if (period === 'WEEK') {
    const shortRange = displayLabel.replace(/\/\d{4}$/, '');
    title = `📈 Tuần ${shortRange}: Chi ${fmtCompactVND(totalExpense)} · ${rating}`;

    // Dòng 1: So sánh tuần trước + TB/ngày
    const dailyAvg = Math.round(totalExpense / 7);
    let line1 = `📊 TB ${fmtCompactVND(dailyAvg)}/ngày (${txCount} GD)`;
    if (prevComp) {
      const dir = prevComp.diffAmount > 0 ? 'Tăng' : 'Giảm';
      const pctStr = prevComp.diffPct !== 0 ? ` (${prevComp.diffPct > 0 ? '+' : ''}${prevComp.diffPct}%)` : '';
      line1 = `📊 ${dir} ${fmtCompactVND(prevComp.diffAmount)}${pctStr} so với ${prevComp.label} · TB ${fmtCompactVND(dailyAvg)}/ngày`;
    }

    // Dòng 2: Top 2 danh mục chi
    const top2 = topCats
      .slice(0, 2)
      .map(([name, amt]) => `${name} ${fmtCompactVND(amt)} (${totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0}%)`)
      .join(', ');
    const line2 = top2
      ? `🏆 Chi nhiều nhất: ${top2}`
      : `💰 Thu tuần: +${fmtCompactVND(totalIncome)} · Dòng tiền ${netFlow >= 0 ? '+' : '-'}${fmtCompactVND(netFlow)}`;

    // Dòng 3: Quỹ tháng + định hướng ngắn
    const goalTag = mg
      ? mg.isProtected && !mg.isTight
        ? `Quỹ ${fmtCompactVND(mg.goal)} an toàn`
        : mg.isTight
          ? `Quỹ ${fmtCompactVND(mg.goal)} eo hẹp ⚠️`
          : `Quỹ ${fmtCompactVND(mg.goal)} đang bị lẹm ⚠️`
      : '';
    const line3 = `🎯 ${goalTag ? `${goalTag} · ` : ''}${compactHook || 'Chạm để xem tổng kết tuần chi tiết.'}`;

    summaryLines = [line1, line2, line3];

    markdownText = `*${title}*\n\n` +
      `💸 *Tổng chi tuần*: ${fmtVND(totalExpense)}${prevComp ? ` (${prevComp.diffAmount >= 0 ? '↑' : '↓'} ${fmtCompactVND(prevComp.diffAmount)} / ${prevComp.diffPct >= 0 ? '+' : ''}${prevComp.diffPct}% so với ${prevComp.label})` : ''}\n` +
      `💰 *Tổng thu tuần*: ${fmtVND(totalIncome)}\n` +
      `⚖️ *Dòng tiền ròng*: ${netFlow >= 0 ? '+' : '-'}${fmtVND(netFlow)} (${txCount} GD)\n` +
      (typeof totalBalance === 'number' ? `🏦 *Tổng số dư ví*: ${fmtVND(totalBalance)}\n` : '') +
      `\n🌟 *Đánh giá*: ${rating}\n` +
      `📝 *Tổng quan*: ${aiEvaluation?.overview || 'Đã phân tích toàn bộ giao dịch trong tuần qua.'}\n\n` +
      (highlights.length > 0 ? `🔍 *Điểm nổi bật tuần*:\n${highlights.map(h => `• ${h}`).join('\n')}\n\n` : '') +
      (hasAnomalies ? `⚠️ *Lưu ý/Bất thường*:\n${anomalies.map(a => `• ${a}`).join('\n')}\n\n` : '') +
      (aiEvaluation?.advice ? `💡 *Chiến lược tuần tới*: ${aiEvaluation.advice}\n` : '');
  } else if (period === 'MONTH') {
    const monthTitle = displayLabel.startsWith('Tháng') ? displayLabel : `Tháng ${displayLabel}`;
    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;
    title = netFlow >= 0
      ? `🏆 Tổng kết ${monthTitle}: Dư +${fmtCompactVND(netFlow)} · ${rating}`
      : `⚠️ Tổng kết ${monthTitle}: Chi vượt thu -${fmtCompactVND(netFlow)}`;

    // Dòng 1: Thu | Chi & Kết quả mục tiêu để dành
    const goalGoalStr = mg
      ? mg.isAchieved
        ? `Mục tiêu ${fmtCompactVND(mg.goal)}: Đạt 100% 🎉`
        : `Mục tiêu ${fmtCompactVND(mg.goal)}: Đạt ${Math.max(0, Math.round((Math.max(0, netFlow) / mg.goal) * 100))}%`
      : `Tiết kiệm ${savingsRate}%`;
    const line1 = `💰 Thu ${fmtCompactVND(totalIncome)} | Chi ${fmtCompactVND(totalExpense)} · ${goalGoalStr}`;

    // Dòng 2: Top 2 danh mục chi tháng
    const top2 = topCats
      .slice(0, 2)
      .map(([name, amt]) => `${name} ${fmtCompactVND(amt)} (${totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0}%)`)
      .join(' · ');
    const line2 = top2 ? `📊 Top chi: ${top2}` : `📊 Tổng ${txCount} giao dịch trong tháng`;

    // Dòng 3: Số dư cuối tháng + lời khuyên
    const line3 = typeof totalBalance === 'number'
      ? `✨ Số dư cuối tháng: ${fmtCompactVND(totalBalance)} — ${compactHook || 'Chạm để xem báo cáo đầy đủ.'}`
      : `✨ ${compactHook || 'Chạm để xem báo cáo tháng đầy đủ.'}`;

    summaryLines = [line1, line2, line3];

    markdownText = `*${title}*\n\n` +
      `💸 *Tổng chi tháng*: ${fmtVND(totalExpense)}${prevComp ? ` (${prevComp.diffAmount >= 0 ? '↑' : '↓'} ${fmtCompactVND(prevComp.diffAmount)} so với ${prevComp.label})` : ''}\n` +
      `💰 *Tổng thu tháng*: ${fmtVND(totalIncome)}\n` +
      `💎 *Tích lũy ròng*: ${netFlow >= 0 ? '+' : '-'}${fmtVND(netFlow)} (${savingsRate}%)\n` +
      (typeof totalBalance === 'number' ? `🏦 *Tổng số dư cuối tháng*: ${fmtVND(totalBalance)}\n` : '') +
      `\n🌟 *Sức khỏe tài chính*: ${rating}\n` +
      `📝 *Toàn cảnh*: ${aiEvaluation?.overview || 'Báo cáo tổng hợp tài chính cả tháng.'}\n\n` +
      (highlights.length > 0 ? `📊 *Cơ cấu & Điểm nhấn*:\n${highlights.map(h => `• ${h}`).join('\n')}\n\n` : '') +
      (hasAnomalies ? `⚠️ *Khoản đột biến*:\n${anomalies.map(a => `• ${a}`).join('\n')}\n\n` : '') +
      (aiEvaluation?.advice ? `🎯 *Kế hoạch tháng mới*: ${aiEvaluation.advice}\n` : '');
  } else {
    // DAY
    if (totalExpense === 0 && totalIncome === 0) {
      title = `🌟 Chốt ngày ${shortDate}: 0đ chi tiêu — Giữ trọn quỹ!`;
      const balStr = typeof totalBalance === 'number' ? `💰 Số dư: ${fmtCompactVND(totalBalance)}` : '💰 Dòng tiền giữ nguyên vẹn';
      const goalLine = mg
        ? mg.isProtected && !mg.isTight
          ? `🎯 Quỹ ${fmtCompactVND(mg.goal)} an toàn · Còn ~${fmtCompactVND(mg.dailyAllowance)}/ngày (${mg.daysRemaining} ngày cuối)`
          : `🎯 Quỹ ${fmtCompactVND(mg.goal)}: còn dư ${fmtCompactVND(Math.max(0, mg.safeToSpend))} cho ${mg.daysRemaining} ngày cuối`
        : '🎯 Tiếp tục duy trì kỷ luật tài chính tuyệt vời này!';
      const line3 = pendingCount > 0
        ? `⏳ Còn ${pendingCount} khoản chờ phân loại — chạm để xử lý nhanh.`
        : `💡 ${compactHook || 'Một ngày 0đ cực kỷ luật — giữ vững phong độ nhé!'}`;
      summaryLines = [balStr, goalLine, line3];
    } else {
      title = totalIncome > 0
        ? `🌙 ${shortDate}: Chi ${fmtCompactVND(totalExpense)} | Thu +${fmtCompactVND(totalIncome)} · ${rating}`
        : `🌙 Chốt ngày ${shortDate}: -${fmtCompactVND(totalExpense)} · ${rating}`;

      // Dòng 1: Top 2 danh mục + so sánh TB 7 ngày
      const top2 = topCats
        .slice(0, 2)
        .map(([name, amt]) => `${name} ${fmtCompactVND(amt)}`)
        .join(', ');
      const compTag = prevComp
        ? prevComp.diffAmount > 0
          ? ` (↑ hơn TB tuần ${fmtCompactVND(prevComp.diffAmount)})`
          : prevComp.diffAmount < 0
            ? ` (↓ thấp hơn TB tuần ${fmtCompactVND(prevComp.diffAmount)})`
            : ''
        : '';
      const line1 = top2
        ? `📌 ${top2}${compTag}`
        : `📌 ${txCount} giao dịch trong ngày${compTag}`;

      // Dòng 2: Số dư + trạng thái Quỹ để dành tháng
      const balPart = typeof totalBalance === 'number' ? `💰 Số dư: ${fmtCompactVND(totalBalance)}` : `⚖️ Ròng: ${netFlow >= 0 ? '+' : '-'}${fmtCompactVND(netFlow)}`;
      let goalPart = '';
      if (mg) {
        if (!mg.isProtected) {
          goalPart = ` · Quỹ ${fmtCompactVND(mg.goal)} bị lẹm ${fmtCompactVND(Math.abs(mg.safeToSpend))} ⚠️`;
        } else if (mg.isTight) {
          goalPart = ` · Quỹ ${fmtCompactVND(mg.goal)}: dư mỏng ${fmtCompactVND(mg.safeToSpend)} (${mg.daysRemaining} ngày cuối) ⚠️`;
        } else {
          goalPart = ` · Còn ~${fmtCompactVND(mg.dailyAllowance)}/ngày để giữ quỹ ${fmtCompactVND(mg.goal)}`;
        }
      }
      const line2 = `${balPart}${goalPart}`;

      // Dòng 3: Lời khuyên gọn + nhắc pending (nếu có)
      const pendingTag = pendingCount > 0 ? ` (⏳ ${pendingCount} GD chờ duyệt)` : '';
      const line3 = `💡 ${compactHook || 'Chạm để xem chi tiết báo cáo cuối ngày.'}${pendingTag}`;

      summaryLines = [line1, line2, line3];
    }

    markdownText = `*${title}*\n\n` +
      `💸 *Tổng chi*: ${fmtVND(totalExpense)}${prevComp ? ` (${prevComp.diffAmount >= 0 ? '↑' : '↓'} ${fmtCompactVND(prevComp.diffAmount)} so với ${prevComp.label})` : ''}\n` +
      `💰 *Tổng thu*: ${fmtVND(totalIncome)}\n` +
      `⚖️ *Chênh lệch*: ${netFlow >= 0 ? '+' : '-'}${fmtVND(netFlow)} (${txCount} GD)\n` +
      (typeof totalBalance === 'number' ? `🏦 *Tổng số dư ví*: ${fmtVND(totalBalance)}\n` : '') +
      `\n🌟 *Đánh giá*: ${rating}\n` +
      `📝 *Tổng quan*: ${aiEvaluation?.overview || 'Đã phân tích toàn bộ giao dịch trong ngày.'}\n\n` +
      (hasAnomalies ? `⚠️ *Khoản nghi vấn/bất thường*:\n${anomalies.map(a => `• ${a}`).join('\n')}\n\n` : '') +
      (aiEvaluation?.advice ? `💡 *Lời khuyên ngày mai*: ${aiEvaluation.advice}\n` : '');
  }

  const shortText = summaryLines.join('\n');

  return {
    title,
    pushTitle: title,
    pushBody: shortText,
    shortText,
    markdownText,
    targetUrl,
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
      title: formatted.pushTitle,
      body: formatted.pushBody,
      url: formatted.targetUrl,
      data: {
        period: report.period || 'DAY',
        date: report.date || ''
      }
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
      const baseAppUrl = (settings.app_url || 'https://smart-spend-23th.onrender.com').replace(/\/$/, '');
      const ntfyRes = await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
        method: 'POST',
        headers: {
          'Title': formatted.pushTitle,
          'Priority': formatted.hasAnomalies ? 'high' : 'default',
          'Tags': formatted.hasAnomalies ? 'warning,chart_with_upwards_trend' : 'sparkles,moneybag',
          'Click': `${baseAppUrl}${formatted.targetUrl}`
        },
        body: formatted.pushBody
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

/**
 * Gửi thông báo đề xuất trích 500k tiết kiệm ngay khi nhận lương
 */
export async function sendSalarySavingsPromptNotification({ amount = 0, description = '', accountName = '' } = {}) {
  const title = `💰 Lương đã về${amount > 0 ? ` (+${fmtCompactVND(amount)})` : ''}! Đề xuất trích 500k tiết kiệm`;
  const body = `Hãy chuyển ngay 500.000 ₫ vào tài khoản tiết kiệm Agribank Plus và ghi nhận vào mục "Tiền tiết kiệm" nhé!${accountName ? ` (Nguồn nhận: ${accountName})` : ''}`;
  const targetUrl = '/?action=save-savings';

  try {
    const settingRows = await db
      .prepare("SELECT key, value FROM settings WHERE key LIKE '%report%' OR key LIKE 'ntfy%' OR key LIKE 'telegram%' OR key LIKE 'macrodroid%'")
      .all();
    const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));

    await sendWebPushNotificationToAll({
      title,
      body,
      url: targetUrl,
      data: { action: 'save-savings', amount }
    });

    const ntfyTopic = settings.ntfy_topic || process.env.NTFY_TOPIC;
    if (ntfyTopic && ntfyTopic !== 'smartspend_kienvu') {
      const baseAppUrl = (settings.app_url || 'https://smart-spend-23th.onrender.com').replace(/\/$/, '');
      await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
        method: 'POST',
        headers: {
          'Title': title,
          'Priority': 'high',
          'Tags': 'moneybag,sparkles',
          'Click': `${baseAppUrl}${targetUrl}`
        },
        body
      }).catch(() => {});
    }

    const macrodroidUrl = settings.macrodroid_webhook_url || process.env.MACRODROID_WEBHOOK_URL;
    if (macrodroidUrl) {
      await fetch(macrodroidUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, action: 'save-savings', amount, description })
      }).catch(() => {});
    }

    const tgToken = settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;
    const tgChatId = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChatId) {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: `*${title}*\n\n${body}`,
          parse_mode: 'Markdown'
        })
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[Salary Savings Notification Error]:', err.message);
  }
}

/**
 * Gửi thông báo xác nhận khi rút tiền từ Quỹ tiết kiệm
 */
export async function sendSavingsWithdrawNotification({ amount = 0, description = '', accountName = '' } = {}) {
  try {
    const depRow = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE category_id = 'cat_savings' AND status != 'IGNORED'").get();
    const wdrRow = await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE category_id = 'cat_savings_withdraw' AND status != 'IGNORED'").get();
    const remaining = Math.max(0, Number(depRow?.total || 0) - Number(wdrRow?.total || 0));

    const fmtVND = (num) => new Intl.NumberFormat('vi-VN').format(Math.abs(num || 0)) + ' ₫';
    const title = `⚠️ Vừa rút ${fmtCompactVND(amount)} từ Quỹ tiết kiệm`;
    const body = `${description || 'Rút tiền từ quỹ tiết kiệm'}${accountName ? ` (${accountName})` : ''}. Số dư Quỹ tiết kiệm còn lại: ${fmtVND(remaining)}.`;
    const targetUrl = '/?tab=dashboard';

    const settingRows = await db
      .prepare("SELECT key, value FROM settings WHERE key LIKE '%report%' OR key LIKE 'ntfy%' OR key LIKE 'telegram%' OR key LIKE 'macrodroid%'")
      .all();
    const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));

    await sendWebPushNotificationToAll({
      title,
      body,
      url: targetUrl,
      data: { action: 'savings-withdraw', amount, remaining }
    });

    const ntfyTopic = settings.ntfy_topic || process.env.NTFY_TOPIC;
    if (ntfyTopic && ntfyTopic !== 'smartspend_kienvu') {
      const baseAppUrl = (settings.app_url || 'https://smart-spend-23th.onrender.com').replace(/\/$/, '');
      await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
        method: 'POST',
        headers: {
          'Title': title,
          'Priority': 'high',
          'Tags': 'warning,piggy_bank',
          'Click': `${baseAppUrl}${targetUrl}`
        },
        body
      }).catch(() => {});
    }

    const macrodroidUrl = settings.macrodroid_webhook_url || process.env.MACRODROID_WEBHOOK_URL;
    if (macrodroidUrl) {
      await fetch(macrodroidUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, action: 'savings-withdraw', amount, remaining, description })
      }).catch(() => {});
    }

    const tgToken = settings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;
    const tgChatId = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChatId) {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: `*${title}*\n\n${body}`,
          parse_mode: 'Markdown'
        })
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[Savings Withdraw Notification Error]:', err.message);
  }
}
