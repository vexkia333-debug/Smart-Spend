import crypto from 'node:crypto';
import { db } from '../db.js';
import { getVietnamTimeParts, parseTxDateToISO } from '../utils/time.js';
import { generatePeriodicAiReport, generateFallbackPeriodicReport } from '../gemini.js';
import { dispatchDailyReportNotification } from '../notifications.js';
import { broadcastEvent } from './sse.js';

const inFlightReportKeys = new Set();
let isCronRunning = false;

function computeReportMetrics(txs = []) {
  const totalIncome = txs
    .filter((t) => t.type === 'INCOME' && !t.category_id?.startsWith('cat_transfer_') && t.category_id !== 'cat_debt_collect')
    .reduce((s, t) => s + (t.amount || 0), 0);
  const totalExpense = txs
    .filter((t) => t.type === 'EXPENSE' && !t.category_id?.startsWith('cat_transfer_') && t.category_id !== 'cat_loan' && t.category_id !== 'cat_debt_repay')
    .reduce((s, t) => s + (t.amount || 0), 0);
  const netFlow = totalIncome - totalExpense;

  const catMap = {};
  txs
    .filter((t) => t.type === 'EXPENSE' && !t.category_id?.startsWith('cat_transfer_') && t.category_id !== 'cat_loan' && t.category_id !== 'cat_debt_repay')
    .forEach((t) => {
      const cName = t.category_name || 'Khác';
      catMap[cName] = (catMap[cName] || 0) + (t.amount || 0);
    });

  const accMap = {};
  txs.forEach((t) => {
    const aName = t.account_name || 'Tài khoản khác';
    if (!accMap[aName]) accMap[aName] = { in: 0, out: 0, count: 0 };
    accMap[aName].count += 1;
    if (t.type === 'INCOME') accMap[aName].in += t.amount || 0;
    else accMap[aName].out += t.amount || 0;
  });

  return { totalIncome, totalExpense, netFlow, catMap, accMap };
}

function shiftIsoDate(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

async function computeExtendedContext({ period, targetDate, startDate, endDate, allTxs, totalExpense }) {
  // 1. Tổng số dư khả dụng hiện tại
  let totalBalance = 0;
  try {
    const balRow = await db.prepare('SELECT COALESCE(SUM(balance), 0) as total FROM accounts').get();
    totalBalance = Number(balRow?.total || 0);
  } catch {
    totalBalance = 0;
  }

  // 2. Số giao dịch đang chờ phân loại
  const pendingCount = allTxs.filter((t) => t.status === 'PENDING').length;

  // 3. Bối cảnh Kế hoạch để dành tháng hiện tại (monthly_budget_goal)
  let monthlyGoal = 500000;
  try {
    const goalRow = await db.prepare("SELECT value FROM settings WHERE key = 'monthly_budget_goal'").get();
    if (goalRow?.value && Number(goalRow.value) > 0) {
      monthlyGoal = Number(goalRow.value);
    }
  } catch {
    monthlyGoal = 500000;
  }

  const [ty, tm, td] = targetDate.split('-').map(Number);
  const monthPrefix = `${ty}-${String(tm).padStart(2, '0')}`;
  const lastDayOfMonth = new Date(ty, tm, 0).getDate();
  const daysRemaining = Math.max(1, lastDayOfMonth - td + 1);

  const monthTxs = allTxs.filter((t) => parseTxDateToISO(t).startsWith(monthPrefix));
  const monthMetrics = computeReportMetrics(monthTxs);
  const monthSavings = monthMetrics.totalIncome - monthMetrics.totalExpense;
  const safeToSpend = monthSavings - monthlyGoal;
  const dailyAllowance = safeToSpend > 0 ? Math.floor(safeToSpend / daysRemaining) : 0;

  const monthlyGoalContext = {
    goal: monthlyGoal,
    monthIncome: monthMetrics.totalIncome,
    monthExpense: monthMetrics.totalExpense,
    monthSavings,
    safeToSpend,
    daysRemaining,
    dailyAllowance,
    isProtected: safeToSpend >= 0,
    isTight: safeToSpend >= 0 && dailyAllowance < 80000,
    isAchieved: monthSavings >= monthlyGoal
  };

  // 4. So sánh với kỳ liền trước
  let prevComparison = null;
  if (period === 'DAY') {
    const prevStart = shiftIsoDate(startDate, -7);
    const prevEnd = shiftIsoDate(startDate, -1);
    const prevTxs = allTxs.filter((t) => {
      const iso = parseTxDateToISO(t);
      return iso >= prevStart && iso <= prevEnd;
    });
    const prevExp = computeReportMetrics(prevTxs).totalExpense;
    const prevAvg = Math.round(prevExp / 7);
    if (prevAvg > 0) {
      const diffAmount = totalExpense - prevAvg;
      const diffPct = Math.round((diffAmount / prevAvg) * 100);
      prevComparison = { label: 'TB 7 ngày', prevBase: prevAvg, diffAmount, diffPct };
    }
  } else if (period === 'WEEK') {
    const prevStart = shiftIsoDate(startDate, -7);
    const prevEnd = shiftIsoDate(endDate, -7);
    const prevTxs = allTxs.filter((t) => {
      const iso = parseTxDateToISO(t);
      return iso >= prevStart && iso <= prevEnd;
    });
    const prevExp = computeReportMetrics(prevTxs).totalExpense;
    if (prevExp > 0) {
      const diffAmount = totalExpense - prevExp;
      const diffPct = Math.round((diffAmount / prevExp) * 100);
      prevComparison = { label: 'tuần trước', prevBase: prevExp, diffAmount, diffPct };
    }
  } else if (period === 'MONTH') {
    const prevMonthDate = new Date(ty, tm - 2, 1);
    const py = prevMonthDate.getFullYear();
    const pm = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
    const prevPrefix = `${py}-${pm}`;
    const prevTxs = allTxs.filter((t) => parseTxDateToISO(t).startsWith(prevPrefix));
    const prevExp = computeReportMetrics(prevTxs).totalExpense;
    if (prevExp > 0) {
      const diffAmount = totalExpense - prevExp;
      const diffPct = Math.round((diffAmount / prevExp) * 100);
      prevComparison = { label: `tháng ${prevMonthDate.getMonth() + 1}`, prevBase: prevExp, diffAmount, diffPct };
    }
  }

  return {
    totalBalance,
    pendingCount,
    monthlyGoalContext,
    prevComparison
  };
}

/**
 * Core Pipeline: Tạo và lưu trữ báo cáo tài chính định kỳ (Ngày / Tuần / Tháng), đồng thời gửi thông báo tới điện thoại
 */
export async function generateAndSavePeriodicReport({
  period = 'DAY', // 'DAY' | 'WEEK' | 'MONTH'
  date,
  force = false,
  triggerSource = 'MANUAL'
} = {}) {
  const vnTime = getVietnamTimeParts();
  const targetDate = date || vnTime.isoDate;

  // 1. Xác định khoảng ngày [startDate, endDate], dateLabel và cacheKey
  let startDate = targetDate;
  let endDate = targetDate;
  let dateLabel = targetDate;
  let cacheKey = targetDate;

  if (period === 'WEEK') {
    const [y, m, d] = targetDate.split('-').map(Number);
    const refD = new Date(y, m - 1, d);
    const dayOfWeek = (refD.getDay() + 6) % 7; // 0 = Thứ 2, 6 = Chủ Nhật
    const monD = new Date(refD);
    monD.setDate(refD.getDate() - dayOfWeek);
    const sunD = new Date(monD);
    sunD.setDate(monD.getDate() + 6);

    startDate = `${monD.getFullYear()}-${String(monD.getMonth() + 1).padStart(2, '0')}-${String(monD.getDate()).padStart(2, '0')}`;
    endDate = `${sunD.getFullYear()}-${String(sunD.getMonth() + 1).padStart(2, '0')}-${String(sunD.getDate()).padStart(2, '0')}`;

    const [sy, sm, sd] = startDate.split('-');
    const [ey, em, ed] = endDate.split('-');
    dateLabel = `${sd}/${sm} - ${ed}/${em}/${ey}`;
    cacheKey = `WEEK_${startDate}_${endDate}`;
  } else if (period === 'MONTH') {
    const [y, m] = targetDate.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    dateLabel = `Tháng ${m}/${y}`;
    cacheKey = `MONTH_${y}-${String(m).padStart(2, '0')}`;
  } else {
    // DAY
    const [y, m, d] = targetDate.split('-');
    dateLabel = `${d}/${m}/${y}`;
    cacheKey = targetDate;
  }

  inFlightReportKeys.add(cacheKey);
  try {
    // 2. Lấy toàn bộ giao dịch trong phạm vi [startDate, endDate]
    const allTxs = await db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.status != 'IGNORED'
      ORDER BY t.created_at ASC
    `).all();

    const txs = allTxs.filter((t) => {
      const iso = parseTxDateToISO(t);
      return iso >= startDate && iso <= endDate;
    });

    const { totalIncome, totalExpense, netFlow, catMap, accMap } = computeReportMetrics(txs);
    const contextMetrics = await computeExtendedContext({
      period,
      targetDate,
      startDate,
      endDate,
      allTxs,
      totalExpense
    });

    // 3. Kiểm tra cache trong DB nếu không ép buộc (force) và số liệu vẫn khớp giao dịch thực tế
    if (!force) {
      const cached = await db.prepare('SELECT * FROM daily_reports WHERE report_date = ?').get(cacheKey);
      const isCacheFresh = cached &&
        Number(cached.total_income) === totalIncome &&
        Number(cached.total_expense) === totalExpense &&
        Number(cached.tx_count) === txs.length;

      if (isCacheFresh) {
        const cachedAi = cached.raw_ai_json ? JSON.parse(cached.raw_ai_json) : {
          rating: cached.rating_badge || 'Cân đối 👍',
          overview: cached.overview || '',
          highlights: [],
          anomalies: cached.anomalies_json ? JSON.parse(cached.anomalies_json) : [],
          advice: cached.advice_tomorrow || ''
        };

        return {
          success: true,
          period,
          date: targetDate,
          startDate,
          endDate,
          dateRange: dateLabel,
          dateLabel,
          totalIncome: Number(cached.total_income) || 0,
          totalExpense: Number(cached.total_expense) || 0,
          netFlow: Number(cached.net_flow) || 0,
          txCount: Number(cached.tx_count) || 0,
          categoryBreakdown: cached.category_breakdown ? JSON.parse(cached.category_breakdown) : {},
          accountBreakdown: cached.account_breakdown ? JSON.parse(cached.account_breakdown) : {},
          contextMetrics,
          transactions: txs,
          aiEvaluation: cachedAi,
          aiAnalysis: cachedAi,
          fromCache: true
        };
      }
    }

    const keyRow = await db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
    const apiKey = keyRow?.value || process.env.GEMINI_API_KEY;

    const allCategories = await db.prepare('SELECT id, name, type FROM categories').all();

    let aiEvaluation = null;
    if (apiKey && txs.length > 0) {
      aiEvaluation = await generatePeriodicAiReport({
        period,
        dateRange: dateLabel,
        txs,
        totalIncome,
        totalExpense,
        netFlow,
        catMap,
        categories: allCategories,
        contextMetrics,
        apiKey
      });
    }

    if (!aiEvaluation) {
      aiEvaluation = generateFallbackPeriodicReport({
        period,
        dateRange: dateLabel,
        txs,
        totalIncome,
        totalExpense,
        netFlow,
        catMap,
        contextMetrics
      });
    }

    const reportData = {
      success: true,
      period,
      date: targetDate,
      startDate,
      endDate,
      dateRange: dateLabel,
      dateLabel,
      totalIncome,
      totalExpense,
      netFlow,
      txCount: txs.length,
      categoryBreakdown: catMap,
      accountBreakdown: accMap,
      contextMetrics,
      transactions: txs,
      aiEvaluation,
      aiAnalysis: aiEvaluation,
      fromCache: false
    };

    // 4. Lưu vào bảng daily_reports (bảo toàn sent_notification hiện có nếu chỉ làm mới số liệu)
    try {
      await db.prepare(`
        INSERT INTO daily_reports (
          report_date, total_income, total_expense, net_flow, tx_count,
          category_breakdown, account_breakdown, rating_badge, overview,
          anomalies_json, advice_tomorrow, raw_ai_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        ON CONFLICT(report_date) DO UPDATE SET
          total_income = excluded.total_income,
          total_expense = excluded.total_expense,
          net_flow = excluded.net_flow,
          tx_count = excluded.tx_count,
          category_breakdown = excluded.category_breakdown,
          account_breakdown = excluded.account_breakdown,
          rating_badge = excluded.rating_badge,
          overview = excluded.overview,
          anomalies_json = excluded.anomalies_json,
          advice_tomorrow = excluded.advice_tomorrow,
          raw_ai_json = excluded.raw_ai_json,
          updated_at = datetime('now', 'localtime')
      `).run(
        cacheKey,
        totalIncome,
        totalExpense,
        netFlow,
        txs.length,
        JSON.stringify(catMap),
        JSON.stringify(accMap),
        aiEvaluation?.rating || 'Cân đối 👍',
        aiEvaluation?.overview || '',
        JSON.stringify(aiEvaluation?.anomalies || []),
        aiEvaluation?.advice || '',
        JSON.stringify(aiEvaluation)
      );
    } catch (dbErr) {
      console.error('Lỗi lưu report cache:', dbErr.message);
    }

    // 5. Gửi thông báo tới điện thoại nếu được kích hoạt
    let dispatchResult = null;
    if (triggerSource.startsWith('CRON') || triggerSource === 'TEST_PUSH' || triggerSource === 'NOTIFICATION_REQUEST') {
      try {
        const settingRows = await db.prepare("SELECT key, value FROM settings WHERE key LIKE '%report%' OR key LIKE 'ntfy%' OR key LIKE 'telegram%' OR key LIKE 'macrodroid%'").all();
        const settingsMap = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));

        dispatchResult = await dispatchDailyReportNotification(reportData, settingsMap);

        await db.prepare('UPDATE daily_reports SET sent_notification = 1 WHERE report_date = ?').run(cacheKey);

        await db.prepare(`
          INSERT INTO notification_logs (id, title, body, actions_payload, status)
          VALUES (?, ?, ?, ?, 'SENT')
        `).run(
          'log_' + crypto.randomUUID().slice(0, 8),
          dispatchResult.formatted.title,
          dispatchResult.formatted.shortText,
          JSON.stringify({ triggerSource, period, date: targetDate, results: dispatchResult.results })
        );
      } catch (pushErr) {
        console.error('Lỗi dispatch thông báo điện thoại:', pushErr.message);
      }
    }

    // Phát tín hiệu realtime tới giao diện web
    broadcastEvent('PERIODIC_REPORT_READY', reportData);
    broadcastEvent('DAILY_REPORT_READY', reportData);

    return {
      ...reportData,
      dispatchResult
    };
  } finally {
    inFlightReportKeys.delete(cacheKey);
  }
}

export async function generateAndSaveDailyReport(date, opts = {}) {
  return generateAndSavePeriodicReport({ ...opts, period: 'DAY', date });
}

/**
 * Khởi động Standing Cron: kiểm tra mỗi 30s và bắn thông báo Ngày, Tuần, Tháng
 */
export function startReportCronJob() {
  setInterval(async () => {
    if (isCronRunning) return;
    isCronRunning = true;
    try {
      const nowVn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
      const curHour = String(nowVn.getHours()).padStart(2, '0');
      const curMin = String(nowVn.getMinutes()).padStart(2, '0');
      const currentTime = `${curHour}:${curMin}`;

      const curY = nowVn.getFullYear();
      const curM = String(nowVn.getMonth() + 1).padStart(2, '0');
      const curD = String(nowVn.getDate()).padStart(2, '0');
      const todayDate = `${curY}-${curM}-${curD}`;
      const dayOfWeek = String(nowVn.getDay()); // 0 = CN, 1 = T2...
      const lastDayOfMonth = new Date(curY, nowVn.getMonth() + 1, 0).getDate();
      const isLastDay = nowVn.getDate() === lastDayOfMonth;

      const rows = await db.prepare("SELECT key, value FROM settings WHERE key LIKE '%report%'").all();
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

      // 1. Cron Hàng ngày
      const dailyTargetTime = map.daily_report_time || '22:00';
      const isDailyEnabled = map.daily_report_enabled !== 'false';
      if (isDailyEnabled && currentTime === dailyTargetTime && !inFlightReportKeys.has(todayDate)) {
        const existing = await db.prepare('SELECT sent_notification FROM daily_reports WHERE report_date = ?').get(todayDate);
        if (!existing || Number(existing.sent_notification) !== 1) {
          console.log(`[Auto Cron] 🔔 Đã tới ${currentTime}. Tự động tạo và gửi Báo cáo Cuối ngày (${todayDate})...`);
          await generateAndSavePeriodicReport({ period: 'DAY', date: todayDate, force: true, triggerSource: 'CRON_AUTO_DAILY' });
        }
      }

      // 2. Cron Tổng kết Tuần (Mặc định Chủ Nhật lúc 21:00)
      const weeklyTargetDay = map.weekly_report_day || '0';
      const weeklyTargetTime = map.weekly_report_time || '21:00';
      const isWeeklyEnabled = map.weekly_report_enabled !== 'false';
      if (isWeeklyEnabled && dayOfWeek === weeklyTargetDay && currentTime === weeklyTargetTime) {
        const weekDayOffset = (nowVn.getDay() + 6) % 7;
        const monD = new Date(nowVn);
        monD.setDate(nowVn.getDate() - weekDayOffset);
        const startStr = `${monD.getFullYear()}-${String(monD.getMonth() + 1).padStart(2, '0')}-${String(monD.getDate()).padStart(2, '0')}`;
        const weekKey = `WEEK_${startStr}_${todayDate}`;
        if (!inFlightReportKeys.has(weekKey)) {
          const checkWeek = await db.prepare('SELECT sent_notification FROM daily_reports WHERE report_date LIKE ?').get(`WEEK_%_${todayDate}`);
          if (!checkWeek || Number(checkWeek.sent_notification) !== 1) {
            console.log(`[Auto Cron] 📈 Đã tới ${currentTime} Chủ Nhật. Tự động tạo và gửi Tổng kết Tuần (${todayDate})...`);
            await generateAndSavePeriodicReport({ period: 'WEEK', date: todayDate, force: true, triggerSource: 'CRON_AUTO_WEEKLY' });
          }
        }
      }

      // 3. Cron Tổng hợp Tháng (Mặc định Ngày cuối cùng của tháng lúc 21:30)
      const monthlyTargetTime = map.monthly_report_time || '21:30';
      const isMonthlyEnabled = map.monthly_report_enabled !== 'false';
      if (isMonthlyEnabled && isLastDay && currentTime === monthlyTargetTime) {
        const monthKey = `MONTH_${curY}-${curM}`;
        if (!inFlightReportKeys.has(monthKey)) {
          const checkMonth = await db.prepare('SELECT sent_notification FROM daily_reports WHERE report_date = ?').get(monthKey);
          if (!checkMonth || Number(checkMonth.sent_notification) !== 1) {
            console.log(`[Auto Cron] 🏆 Đã tới ${currentTime} ngày cuối tháng. Tự động tạo và gửi Tổng hợp Tháng (${monthKey})...`);
            await generateAndSavePeriodicReport({ period: 'MONTH', date: todayDate, force: true, triggerSource: 'CRON_AUTO_MONTHLY' });
          }
        }
      }
    } catch (err) {
      console.error('[Periodic Auto Cron Error]', err.message);
    } finally {
      isCronRunning = false;
    }
  }, 30000);
}

