/**
 * Module gửi thông báo tự động tới điện thoại (MacroDroid, ntfy.sh, Telegram, SSE)
 */

export function formatDailyReportNotification(report) {
  const {
    date,
    totalIncome = 0,
    totalExpense = 0,
    netFlow = 0,
    txCount = 0,
    aiEvaluation
  } = report;

  const dateParts = (date || '').split('-');
  const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : date;

  const fmtVND = (num) => new Intl.NumberFormat('vi-VN').format(Math.abs(num || 0)) + 'đ';

  const rating = aiEvaluation?.rating || (totalExpense === 0 ? 'Xuất sắc 🌟' : 'Bình thường 👍');
  const anomalies = Array.isArray(aiEvaluation?.anomalies) ? aiEvaluation.anomalies : [];
  const hasAnomalies = anomalies.length > 0 && !anomalies[0].toLowerCase().includes('không phát hiện');

  const title = `📊 SmartSpend: Báo cáo ngày ${formattedDate}`;

  let summaryLines = [
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

  const shortText = summaryLines.join('\n');

  // Format chi tiết cho Telegram / Markdown
  const markdownText = `*${title}*\n\n` +
    `💸 *Tổng chi*: ${fmtVND(totalExpense)}\n` +
    `💰 *Tổng thu*: ${fmtVND(totalIncome)}\n` +
    `⚖️ *Chênh lệch*: ${netFlow >= 0 ? '+' : '-'}${fmtVND(netFlow)}\n` +
    `🔢 *Số giao dịch*: ${txCount}\n\n` +
    `🌟 *Đánh giá*: ${rating}\n` +
    `📝 *Tổng quan*: ${aiEvaluation?.overview || 'Đã phân tích toàn bộ giao dịch trong ngày.'}\n\n` +
    (hasAnomalies ? `⚠️ *Khoản nghi vấn/bất thường*:\n${anomalies.map(a => `• ${a}`).join('\n')}\n\n` : '') +
    (aiEvaluation?.advice ? `💡 *Lời khuyên ngày mai*: ${aiEvaluation.advice}\n` : '');

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
    ntfy: false,
    macrodroid: false,
    telegram: false,
    errors: []
  };

  // 1. Gửi qua ntfy.sh (Miễn phí, tức thì về điện thoại Android/iOS qua app ntfy)
  const ntfyTopic = settings.ntfy_topic || process.env.NTFY_TOPIC || 'smartspend_kienvu';
  if (ntfyTopic) {
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
      console.warn('[Notification ntfy error]:', err.message);
      results.errors.push(`ntfy: ${err.message}`);
    }
  }

  // 2. Gửi qua MacroDroid Webhook (Nếu người dùng nhập Webhook URL của MacroDroid trên điện thoại)
  const macrodroidUrl = settings.macrodroid_webhook_url || process.env.MACRODROID_WEBHOOK_URL;
  if (macrodroidUrl) {
    try {
      // MacroDroid webhook hỗ trợ cả query params và JSON body
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
      console.warn('[Notification MacroDroid error]:', err.message);
      results.errors.push(`MacroDroid: ${err.message}`);
    }
  }

  // 3. Gửi qua Telegram Bot (Nếu có Token và Chat ID)
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
      console.warn('[Notification Telegram error]:', err.message);
      results.errors.push(`Telegram: ${err.message}`);
    }
  }

  return {
    success: results.ntfy || results.macrodroid || results.telegram,
    results,
    formatted
  };
}
