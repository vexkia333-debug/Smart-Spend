import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, PieChart as PieChartIcon, Wallet, Sparkles, 
  Coins, Smartphone, Building2, SlidersHorizontal,
  Eye, EyeOff, ArrowUpRight, ArrowDownLeft,
  X, Clock, ChevronRight, ChevronDown, ChevronUp, Pencil
} from 'lucide-react';
import InteractiveDonutChart from '../charts/InteractiveDonutChart.jsx';
import InteractiveTrendLineChart from '../charts/InteractiveTrendLineChart.jsx';
import DebtLoanTracker from '../debt/DebtLoanTracker.jsx';
import MonthlyGoalCard from '../common/MonthlyGoalCard.jsx';
import { formatVND, formatTxTime, formatCompactVND, parseTxDate } from '../../utils/formatters.js';

export default function DashboardTab({
  timeFilter = 'MONTH',
  timeLabel = 'Tháng này',
  customStartDate = null,
  customEndDate = null,
  spendRatio = 0,
  savingsRate = 0,
  netSavings = 0,
  displayedIncome = 0,
  displayedExpense = 0,
  transactions = [],
  categoryBreakdown = [],
  hoveredCatId,
  setHoveredCatId,
  accounts = [],
  totalBalance = 0,
  monthlyBudgetGoal = 500000,
  currentMonthSavings = 0,
  currentMonthIncome = 0,
  currentMonthExpense = 0,
  daysRemaining = 1,
  currentMonthNumber = null,
  monthlySavingsHistory = [],
  onUpdateBudgetGoal,
  onReconcile,
  onOpenDailyReport,
  onEditTransaction
}) {
  const [hideBalance, setHideBalance] = useState(() => {
    try {
      return localStorage.getItem('smartspend_hide_balance') === 'true';
    } catch {
      return false;
    }
  });
  const [isHeroChartExpanded, setIsHeroChartExpanded] = useState(false);
  const [heroHoverIdx, setHeroHoverIdx] = useState(null);
  const [categoryTxSort, setCategoryTxSort] = useState('NEWEST'); // 'NEWEST' | 'AMOUNT_DESC' | 'AMOUNT_ASC'
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

  const selectedCategory = categoryBreakdown.find((c) => c.id === selectedCategoryId) || null;
  const sortedCategoryItems = useMemo(() => {
    const items = [...(selectedCategory?.items || [])];
    if (categoryTxSort === 'AMOUNT_DESC') {
      return items.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    }
    if (categoryTxSort === 'AMOUNT_ASC') {
      return items.sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
    }
    return items;
  }, [selectedCategory, categoryTxSort]);

  useEffect(() => {
    if (!selectedCategory) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedCategoryId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedCategory]);

  const toggleHideBalance = () => {
    setHideBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('smartspend_hide_balance', String(next));
      } catch {
        // Ignore storage write failure in private browsing
      }
      return next;
    });
  };

  const balanceSparkData = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const toDateKey = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayKey = toDateKey(today);
    const currentTotal = Number(totalBalance || 0);

    const validTx = [];
    for (const t of transactions) {
      if (t.status === 'IGNORED' || t.category_id?.startsWith('cat_transfer_')) continue;
      const txDate = parseTxDate(t.transaction_time, t.created_at);
      if (!txDate || isNaN(txDate.getTime())) continue;
      const amt = Number(t.amount || 0);
      const delta = t.type === 'INCOME' ? amt : -amt;
      validTx.push({
        txDate,
        dateKey: toDateKey(txDate),
        delta
      });
    }

    let points = [];
    let periodLabel = 'Tháng này';

    if (timeFilter === 'DAY') {
      periodLabel = 'Hôm nay';
      const todayTxs = validTx
        .filter((item) => item.dateKey === todayKey)
        .sort((a, b) => a.txDate.getTime() - b.txDate.getTime());
      const todayNetFlow = todayTxs.reduce((sum, item) => sum + item.delta, 0);
      const startOfDayBal = Math.max(0, currentTotal - todayNetFlow);
      const checkpoints = [0, 6, 10, 14, 18, 24];

      points = checkpoints.map((hourMark) => {
        const label = hourMark === 24 ? 'Hiện tại' : `${String(hourMark).padStart(2, '0')}:00`;
        if (hourMark === 0) return { label, dateKey: todayKey, balance: startOfDayBal };
        if (hourMark === 24) return { label, dateKey: todayKey, balance: currentTotal };
        let bal = startOfDayBal;
        for (const item of todayTxs) {
          if (item.txDate.getHours() < hourMark) {
            bal = Math.max(0, bal + item.delta);
          }
        }
        return { label, dateKey: todayKey, balance: bal };
      });
    } else {
      let startDate = new Date(today);
      let endDate = new Date(today);

      if (timeFilter === 'WEEK') {
        periodLabel = '7 ngày qua';
        startDate.setDate(today.getDate() - 6);
      } else if (timeFilter === 'MONTH') {
        periodLabel = 'Tháng này';
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      } else if (timeFilter === 'CUSTOM') {
        periodLabel = 'Kỳ đã chọn';
        if (customStartDate) {
          const parsedStart = new Date(customStartDate);
          if (!isNaN(parsedStart.getTime())) {
            startDate = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate());
          }
        } else {
          startDate.setDate(today.getDate() - 13);
        }
        if (customEndDate) {
          const parsedEnd = new Date(customEndDate);
          if (!isNaN(parsedEnd.getTime())) {
            endDate = new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate());
          }
        }
      } else {
        periodLabel = '30 ngày qua';
        startDate.setDate(today.getDate() - 29);
      }

      if (startDate > endDate) startDate = new Date(endDate);
      let dayCount = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
      if (dayCount < 2) {
        startDate.setDate(startDate.getDate() - 1);
        dayCount = 2;
      }
      if (dayCount > 45) {
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 44);
        dayCount = 45;
      }

      const flowsByKey = {};
      for (const item of validTx) {
        flowsByKey[item.dateKey] = (flowsByKey[item.dateKey] || 0) + item.delta;
      }

      const endDateKey = toDateKey(endDate);
      let endBalance = currentTotal;
      if (endDate.getTime() < today.getTime()) {
        for (const item of validTx) {
          if (item.dateKey > endDateKey && item.dateKey <= todayKey) {
            endBalance = Math.max(0, endBalance - item.delta);
          }
        }
      }

      const dayList = [];
      for (let i = 0; i < dayCount; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const label = `${d.getDate()}/${d.getMonth() + 1}`;
        dayList.push({ dateKey: toDateKey(d), label, balance: 0 });
      }

      dayList[dayList.length - 1].balance = endBalance;
      for (let i = dayList.length - 1; i >= 1; i--) {
        const dayDelta = flowsByKey[dayList[i].dateKey] || 0;
        dayList[i - 1].balance = Math.max(0, dayList[i].balance - dayDelta);
      }
      if (dayList.length > 0) {
        dayList[dayList.length - 1].label = 'Hôm nay';
      }

      points = dayList;
    }

    const startBalance = points[0]?.balance ?? currentTotal;
    const endBalance = points[points.length - 1]?.balance ?? currentTotal;
    const deltaAmount = endBalance - startBalance;
    const deltaPct =
      startBalance > 0
        ? Number(((deltaAmount / startBalance) * 100).toFixed(1))
        : endBalance > 0 && deltaAmount > 0
          ? 100
          : 0;

    const vals = points.map((p) => Number(p.balance || 0));
    const maxVal = Math.max(...vals);
    const minVal = Math.min(...vals);
    const span = maxVal - minVal;

    let peakIdx = 0;
    let troughIdx = 0;
    vals.forEach((v, idx) => {
      if (v >= vals[peakIdx]) peakIdx = idx;
      if (v <= vals[troughIdx]) troughIdx = idx;
    });

    const peakPoint = points[peakIdx]
      ? { index: peakIdx, balance: vals[peakIdx], label: points[peakIdx].label }
      : { index: 0, balance: currentTotal, label: 'Hôm nay' };
    const troughPoint = points[troughIdx]
      ? { index: troughIdx, balance: vals[troughIdx], label: points[troughIdx].label }
      : { index: 0, balance: currentTotal, label: 'Hôm nay' };

    const coords = vals.map((val, idx) => {
      const x = vals.length > 1 ? 4 + (idx / (vals.length - 1)) * 126 : 68;
      const y = span === 0 ? 27 : 44 - ((val - minVal) / span) * 34;
      return { x, y };
    });

    let linePath = '';
    if (coords.length > 0) {
      linePath = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
      for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[i];
        const p1 = coords[i + 1];
        const midX = (p0.x + p1.x) / 2;
        linePath += ` C ${midX.toFixed(1)},${p0.y.toFixed(1)} ${midX.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
      }
    }
    const firstCoord = coords[0] || { x: 4, y: 27 };
    const lastCoord = coords[coords.length - 1] || { x: 130, y: 27 };
    const areaPath = linePath
      ? `${linePath} L ${lastCoord.x.toFixed(1)},50 L ${firstCoord.x.toFixed(1)},50 Z`
      : '';

    return {
      periodLabel,
      deltaAmount,
      deltaPct,
      linePath,
      areaPath,
      lastCoord,
      points,
      peakPoint,
      troughPoint,
      minVal,
      maxVal
    };
  }, [transactions, totalBalance, timeFilter, customStartDate, customEndDate]);

  const sparkStrokeColor =
    balanceSparkData.deltaAmount < 0
      ? '#fecdd3'
      : balanceSparkData.deltaAmount > 0
        ? '#fef08a'
        : '#ffffff';

  const heroDeltaTone =
    balanceSparkData.deltaAmount > 0 ? 'up' : balanceSparkData.deltaAmount < 0 ? 'down' : 'flat';

  return (
    <div className="dashboard-content-wrapper">
      {/* 1. Hero Tổng số dư khả dụng + Sparkline biến động số dư + Báo cáo AI */}
      <section className="fintech-hero-card">
        <div className="hero-top-row">
          <div className="hero-balance-block">
            {(() => {
              const hoveredHeroPoint =
                isHeroChartExpanded && heroHoverIdx !== null
                  ? balanceSparkData.points?.[heroHoverIdx] || null
                  : null;
              const displayedHeroBalance = hoveredHeroPoint ? hoveredHeroPoint.balance : totalBalance;
              const startBal = balanceSparkData.points?.[0]?.balance ?? totalBalance;
              const activeDelta = hoveredHeroPoint
                ? hoveredHeroPoint.balance - startBal
                : balanceSparkData.deltaAmount;
              const activeDeltaPct =
                hoveredHeroPoint
                  ? startBal > 0
                    ? Number(((activeDelta / startBal) * 100).toFixed(1))
                    : hoveredHeroPoint.balance > 0 && activeDelta > 0
                      ? 100
                      : 0
                  : balanceSparkData.deltaPct;
              const activeLabel = hoveredHeroPoint
                ? `Mốc ${hoveredHeroPoint.label}`
                : balanceSparkData.periodLabel;
              const activeTone = activeDelta > 0 ? 'up' : activeDelta < 0 ? 'down' : heroDeltaTone;

              return (
                <>
                  <div className="hero-label-row">
                    <span>Tổng số dư khả dụng</span>
                    <button
                      type="button"
                      className="hero-eye-btn"
                      onClick={toggleHideBalance}
                      aria-label={hideBalance ? 'Hiện số dư' : 'Ẩn số dư'}
                      title={hideBalance ? 'Hiện số dư' : 'Ẩn số dư'}
                    >
                      {hideBalance ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <div className="hero-balance-amount tabular-nums">
                    {hideBalance ? '•••••••• ₫' : formatVND(displayedHeroBalance)}
                  </div>
                  <div className="hero-delta-row">
                    <span className={`hero-delta-pill ${activeTone} tabular-nums`}>
                      {hideBalance
                        ? `••• · ${activeLabel}`
                        : activeDelta > 0
                          ? `↑ +${activeDeltaPct}% (+${formatCompactVND(activeDelta)}) · ${activeLabel}`
                          : activeDelta < 0
                            ? `↓ ${activeDeltaPct}% (-${formatCompactVND(Math.abs(activeDelta))}) · ${activeLabel}`
                            : `→ 0% (Số dư ổn định) · ${activeLabel}`}
                    </span>
                  </div>
                </>
              );
            })()}
          </div>

          <button
            type="button"
            className={`hero-sparkline-wrap ${isHeroChartExpanded ? 'is-expanded' : ''}`}
            onClick={() => {
              setIsHeroChartExpanded((prev) => !prev);
              setHeroHoverIdx(null);
            }}
            aria-expanded={isHeroChartExpanded}
            aria-label={isHeroChartExpanded ? 'Thu gọn biểu đồ biến động số dư' : 'Mở rộng biểu đồ xem đỉnh và đáy số dư'}
          >
            <div className="hero-sparkline-box">
              <svg viewBox="0 0 136 54" width="100%" height="100%">
                <defs>
                  <linearGradient id="heroSparkFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={sparkStrokeColor} stopOpacity="0.42" />
                    <stop offset="100%" stopColor={sparkStrokeColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {balanceSparkData.areaPath && (
                  <path fill="url(#heroSparkFill)" d={balanceSparkData.areaPath} />
                )}
                {balanceSparkData.linePath && (
                  <path
                    fill="none"
                    stroke={sparkStrokeColor}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={balanceSparkData.linePath}
                  />
                )}
                <circle
                  cx={balanceSparkData.lastCoord.x}
                  cy={balanceSparkData.lastCoord.y}
                  r="6"
                  fill={sparkStrokeColor}
                  opacity="0.28"
                />
                <circle
                  cx={balanceSparkData.lastCoord.x}
                  cy={balanceSparkData.lastCoord.y}
                  r="3.4"
                  fill={sparkStrokeColor}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <span className="hero-sparkline-caption">
              <span>{isHeroChartExpanded ? 'Thu gọn biểu đồ' : 'Xem đỉnh & đáy'}</span>
              {isHeroChartExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          </button>
        </div>

        {isHeroChartExpanded && (() => {
          const pts = balanceSparkData.points || [];
          const svgW = 600;
          const svgH = 174;
          const padL = 16;
          const padR = 16;
          const padT = 24;
          const padB = 26;
          const plotW = svgW - padL - padR;
          const plotH = svgH - padT - padB;
          const bottomY = padT + plotH;
          const span = balanceSparkData.maxVal - balanceSparkData.minVal;

          const expCoords = pts.map((pt, idx) => {
            const x = pts.length > 1 ? padL + (idx / (pts.length - 1)) * plotW : padL + plotW / 2;
            const y = span === 0
              ? padT + plotH / 2
              : bottomY - ((pt.balance - balanceSparkData.minVal) / span) * plotH;
            return { ...pt, x, y, idx };
          });

          let expLine = '';
          if (expCoords.length > 0) {
            expLine = `M ${expCoords[0].x.toFixed(1)},${expCoords[0].y.toFixed(1)}`;
            for (let i = 0; i < expCoords.length - 1; i++) {
              const p0 = expCoords[i];
              const p1 = expCoords[i + 1];
              const midX = (p0.x + p1.x) / 2;
              expLine += ` C ${midX.toFixed(1)},${p0.y.toFixed(1)} ${midX.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
            }
          }
          const expArea = expCoords.length > 0
            ? `${expLine} L ${expCoords[expCoords.length - 1].x.toFixed(1)},${bottomY} L ${expCoords[0].x.toFixed(1)},${bottomY} Z`
            : '';

          const peakIdx = balanceSparkData.peakPoint?.index ?? 0;
          const troughIdx = balanceSparkData.troughPoint?.index ?? 0;
          const peakCoord = expCoords[peakIdx] || expCoords[0];
          const troughCoord = expCoords[troughIdx] || expCoords[0];
          const activeCoord = heroHoverIdx !== null && expCoords[heroHoverIdx] ? expCoords[heroHoverIdx] : null;

          const clampLabelX = (rawX, halfW = 36) => Math.max(halfW + 4, Math.min(svgW - halfW - 4, rawX));

          const handleExpandedPointer = (clientX, rect) => {
            if (!rect || expCoords.length === 0) return;
            const relX = ((clientX - rect.left) / rect.width) * svgW;
            let bestIdx = 0;
            let bestDiff = Infinity;
            expCoords.forEach((c, i) => {
              const d = Math.abs(c.x - relX);
              if (d < bestDiff) {
                bestDiff = d;
                bestIdx = i;
              }
            });
            setHeroHoverIdx(bestIdx);
          };

          const midIdx = Math.floor((expCoords.length - 1) / 2);

          return (
            <div className="hero-expanded-chart-drawer">
              <div className="hero-expanded-svg-wrap">
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="hero-expanded-svg"
                  onMouseMove={(e) => handleExpandedPointer(e.clientX, e.currentTarget.getBoundingClientRect())}
                  onMouseLeave={() => setHeroHoverIdx(null)}
                  onTouchStart={(e) => {
                    if (e.touches[0]) handleExpandedPointer(e.touches[0].clientX, e.currentTarget.getBoundingClientRect());
                  }}
                  onTouchMove={(e) => {
                    if (e.touches[0]) handleExpandedPointer(e.touches[0].clientX, e.currentTarget.getBoundingClientRect());
                  }}
                  onTouchEnd={() => setHeroHoverIdx(null)}
                >
                  <defs>
                    <linearGradient id="heroExpandedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={sparkStrokeColor} stopOpacity="0.38" />
                      <stop offset="100%" stopColor={sparkStrokeColor} stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {[0, 0.5, 1].map((ratio) => {
                    const gy = padT + ratio * plotH;
                    return (
                      <line
                        key={ratio}
                        x1={padL}
                        x2={svgW - padR}
                        y1={gy}
                        y2={gy}
                        stroke="rgba(255,255,255,0.14)"
                        strokeDasharray="4 4"
                      />
                    );
                  })}

                  {expArea && <path fill="url(#heroExpandedFill)" d={expArea} />}
                  {expLine && (
                    <path
                      fill="none"
                      stroke={sparkStrokeColor}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={expLine}
                    />
                  )}

                  {/* Compact Peak Label */}
                  {peakCoord && (
                    <g>
                      <circle cx={peakCoord.x} cy={peakCoord.y} r="3.8" fill="#6ee7b7" stroke="#ffffff" strokeWidth="1.4" />
                      <text
                        x={clampLabelX(peakCoord.x, 38)}
                        y={Math.max(13, peakCoord.y - 10)}
                        textAnchor="middle"
                        fill="#d1fae5"
                        stroke="rgba(4, 47, 34, 0.78)"
                        strokeWidth="3"
                        paintOrder="stroke"
                        fontSize="10.5"
                        fontWeight="700"
                      >
                        {hideBalance ? '•••' : formatVND(peakCoord.balance)}
                      </text>
                    </g>
                  )}

                  {/* Compact Trough Label */}
                  {troughCoord && span > 0 && (
                    <g>
                      <circle cx={troughCoord.x} cy={troughCoord.y} r="3.8" fill="#fda4af" stroke="#ffffff" strokeWidth="1.4" />
                      <text
                        x={clampLabelX(troughCoord.x, 38)}
                        y={Math.min(bottomY + 13, troughCoord.y + 16)}
                        textAnchor="middle"
                        fill="#ffe4e6"
                        stroke="rgba(4, 47, 34, 0.78)"
                        strokeWidth="3"
                        paintOrder="stroke"
                        fontSize="10.5"
                        fontWeight="700"
                      >
                        {hideBalance ? '•••' : formatVND(troughCoord.balance)}
                      </text>
                    </g>
                  )}

                  {/* Interactive Hover Crosshair */}
                  {activeCoord && (
                    <g>
                      <line
                        x1={activeCoord.x}
                        x2={activeCoord.x}
                        y1={padT}
                        y2={bottomY}
                        stroke="rgba(255,255,255,0.65)"
                        strokeWidth="1.2"
                      />
                      <circle cx={activeCoord.x} cy={activeCoord.y} r="5" fill="#ffffff" stroke="#059669" strokeWidth="2" />
                    </g>
                  )}

                  {/* X-axis labels */}
                  {expCoords.length > 0 && (
                    <g fill="rgba(255,255,255,0.75)" fontSize="11" fontWeight="600">
                      <text x={padL} y={svgH - 6} textAnchor="start">
                        {expCoords[0].label}
                      </text>
                      {expCoords.length > 2 && (
                        <text x={expCoords[midIdx].x} y={svgH - 6} textAnchor="middle">
                          {expCoords[midIdx].label}
                        </text>
                      )}
                      {expCoords.length > 1 && (
                        <text x={svgW - padR} y={svgH - 6} textAnchor="end">
                          {expCoords[expCoords.length - 1].label}
                        </text>
                      )}
                    </g>
                  )}
                </svg>
              </div>
            </div>
          );
        })()}

        <div className="hero-footer-row">
          <span className="hero-meta-pill">
            {accounts.length} ví liên kết · {timeLabel}
          </span>
          <button type="button" onClick={onOpenDailyReport} className="hero-briefing-pill">
            <Sparkles size={13} />
            <span>Báo cáo AI cuối ngày</span>
          </button>
        </div>
      </section>

      {/* 2. Cụm 2 thẻ Tổng chi tiêu / Tổng thu nhập */}
      <div className="fintech-dual-stats">
        <div className="dual-stat-card expense">
          <div className="dual-stat-header">
            <span className="dual-stat-label">Tổng chi tiêu ({timeLabel})</span>
            <span className="dual-stat-icon">
              <ArrowUpRight size={17} />
            </span>
          </div>
          <div className="dual-stat-value tabular-nums">
            {hideBalance ? '•••••• ₫' : formatVND(displayedExpense)}
          </div>
          <div className="dual-stat-sub">
            {displayedIncome > 0 ? `Chiếm ${spendRatio}% thu nhập` : `Kỳ: ${timeLabel}`}
          </div>
        </div>

        <div className="dual-stat-card income">
          <div className="dual-stat-header">
            <span className="dual-stat-label">Tổng thu nhập ({timeLabel})</span>
            <span className="dual-stat-icon">
              <ArrowDownLeft size={17} />
            </span>
          </div>
          <div className="dual-stat-value tabular-nums">
            {hideBalance ? '•••••• ₫' : formatVND(displayedIncome)}
          </div>
          <div className="dual-stat-sub tabular-nums">
            Tiết kiệm ròng: {hideBalance ? '••••' : formatVND(netSavings)}
          </div>
        </div>
      </div>

      {/* 3. Kế hoạch giữ mục tiêu tiết kiệm tháng (tách biệt tháng trước) */}
      <MonthlyGoalCard
        monthlyBudgetGoal={monthlyBudgetGoal}
        currentMonthSavings={currentMonthSavings}
        currentMonthIncome={currentMonthIncome}
        currentMonthExpense={currentMonthExpense}
        daysRemaining={daysRemaining}
        currentMonthNumber={currentMonthNumber}
        monthlySavingsHistory={monthlySavingsHistory}
        formatVND={formatVND}
        onUpdateBudgetGoal={onUpdateBudgetGoal}
      />

      {/* 2. Dòng tiền & Tiết kiệm ({timeLabel}) - Toàn chiều rộng, sang trọng, rõ ràng */}
      <div className="glass-panel analytics-health-card">
        <div className="card-header-clean">
          <div className="card-header-left">
            <div className="card-badge-icon pulse">
              <Activity size={18} color="#10b981" />
            </div>
            <div>
              <h4 className="health-card-title">Dòng tiền & Tiết kiệm ({timeLabel})</h4>
              <p className="card-sub-desc">Cân đối dòng tiền thực tế giữa Thu nhập & Chi tiêu sinh hoạt</p>
            </div>
          </div>
          <span
            className={`health-status-badge ${
              spendRatio <= 50
                ? 'safe'
                : spendRatio <= 80
                ? 'good'
                : spendRatio <= 100
                ? 'warning'
                : 'danger'
            }`}
          >
            {spendRatio <= 50
              ? 'Dòng tiền rất tốt'
              : spendRatio <= 80
              ? 'Dòng tiền ổn định'
              : spendRatio <= 100
              ? 'Cận biên thu nhập'
              : 'Chi vượt thu'}
          </span>
        </div>

        <div className="health-metrics-row">
          <div className="health-metric-item">
            <span className="health-metric-label">Tổng thu nhập</span>
            <span className="health-metric-val income-val tabular-nums">+{formatVND(displayedIncome)}</span>
          </div>
          <div className="health-metric-divider"></div>
          <div className="health-metric-item">
            <span className="health-metric-label">Chi tiêu sinh hoạt</span>
            <span className="health-metric-val expense-val tabular-nums">-{formatVND(displayedExpense)}</span>
          </div>
          <div className="health-metric-divider"></div>
          <div className="health-metric-item">
            <span className="health-metric-label">Dòng tiền ròng</span>
            <span
              className={`health-metric-val tabular-nums ${
                netSavings >= 0 ? 'savings-positive' : 'savings-negative'
              }`}
            >
              {netSavings >= 0 ? '+' : ''}
              {formatVND(netSavings)}
            </span>
          </div>
        </div>

        {/* Thanh tỷ trọng Thu - Chi Dual-tone */}
        <div className="dual-progress-wrapper">
          <div className="dual-progress-header">
            <span>
              Tỷ lệ chi tiêu: <strong>{spendRatio}%</strong>
            </span>
            <span>
              Tích lũy ròng: <strong>{savingsRate}%</strong>
            </span>
          </div>
          <div className="dual-progress-track">
            <div
              className="dual-progress-expense"
              style={{ width: `${Math.min(spendRatio, 100)}%` }}
              title={`Chi tiêu sinh hoạt: ${spendRatio}%`}
            ></div>
            <div
              className="dual-progress-savings"
              style={{ width: `${Math.max(0, 100 - Math.min(spendRatio, 100))}%` }}
              title={`Tích lũy ròng: ${savingsRate}%`}
            ></div>
          </div>
        </div>
      </div>

      {/* 3. Biểu đồ đường xu hướng Nguồn tiền (Follow theo bộ lọc thời gian) */}
      <InteractiveTrendLineChart
        transactions={transactions}
        accounts={accounts}
        formatVND={formatVND}
        timeFilter={timeFilter}
        timeLabel={timeLabel}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
      />

      {/* 4. Hai cột cân xứng: Cơ cấu chi tiêu & Danh sách Tài khoản */}
      <div className="dashboard-columns">
        {/* Cột trái: Phân bổ danh mục chi tiêu với Interactive Donut */}
        <div className="glass-panel dashboard-card-panel">
          <div className="dashboard-card-header">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PieChartIcon size={20} color="#10b981" style={{ flexShrink: 0 }} />
                <h3 className="dashboard-card-title" style={{ margin: 0 }}>
                  Cơ cấu chi tiêu sinh hoạt ({timeLabel})
                </h3>
              </div>
              <p className="dashboard-card-sub-p">
                Chạm vào từng danh mục để xem danh sách các khoản chi tương ứng
              </p>
            </div>
            <span className="cat-count-badge">{categoryBreakdown.length} danh mục</span>
          </div>

          {/* Donut Chart tương tác trực quan */}
          <InteractiveDonutChart
            categories={categoryBreakdown}
            totalExpense={displayedExpense}
            formatVND={formatVND}
            activeCatId={hoveredCatId}
            onHoverCat={setHoveredCatId}
            onSelectCat={(cat) => setSelectedCategoryId(cat.id)}
          />

          {/* Danh sách phân bổ chi tiết với Progress Bars */}
          {categoryBreakdown.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
              Chưa có dữ liệu chi tiêu sinh hoạt trong kỳ ({timeLabel}).
            </p>
          ) : (
            <div className="cat-breakdown-list" style={{ marginTop: '20px' }}>
              {categoryBreakdown.map((cat) => {
                const percent =
                  displayedExpense > 0
                    ? Math.round((cat.total_amount / displayedExpense) * 100)
                    : 0;
                const isHovered = hoveredCatId === cat.id;

                return (
                  <div
                    key={cat.id}
                    className={`cat-breakdown-row ${isHovered ? 'highlighted' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCategoryId(cat.id);
                      }
                    }}
                    onMouseEnter={() => setHoveredCatId(cat.id)}
                    onMouseLeave={() => setHoveredCatId(null)}
                  >
                    <div className="cat-breakdown-meta">
                      <span className="cat-breakdown-left">
                        <span
                          className="cat-dot-indicator"
                          style={{
                            backgroundColor: cat.color,
                            boxShadow: isHovered ? `0 0 12px ${cat.color}` : `0 0 6px ${cat.color}66`
                          }}
                        ></span>
                        <span className="cat-name-text">{cat.name}</span>
                        <span className="cat-tx-pill">{cat.tx_count} GD</span>
                      </span>
                      <div className="cat-breakdown-right">
                        <span className="cat-amount-val tabular-nums">
                          {formatVND(cat.total_amount)}
                        </span>
                        <span
                          className="cat-percent-pill tabular-nums"
                          style={{ backgroundColor: `${cat.color}22`, color: cat.color }}
                        >
                          {percent}%
                        </span>
                        <ChevronRight size={15} className="cat-row-chevron" />
                      </div>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${percent}%`,
                          background: `linear-gradient(90deg, ${cat.color}cc 0%, ${cat.color} 100%)`,
                          boxShadow: isHovered ? `0 0 10px ${cat.color}` : `0 0 6px ${cat.color}55`
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cột phải: Danh sách Tài khoản & Số dư */}
        <div className="glass-panel dashboard-card-panel">
          <div className="dashboard-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wallet size={20} color="#10b981" style={{ flexShrink: 0 }} />
              <h3 className="dashboard-card-title" style={{ margin: 0 }}>
                Tài khoản & Ví liên kết
              </h3>
            </div>
            <div className="total-balance-pill">
              Tổng: <strong>{formatVND(totalBalance)}</strong>
            </div>
          </div>

          <div>
            {accounts.map((acc) => {
              const accPercent =
                totalBalance > 0 ? Math.round((acc.balance / totalBalance) * 100) : 0;

              return (
                <div key={acc.id} className="account-card">
                  <div className="account-left">
                    <div
                      className="account-icon-box"
                      style={{
                        background: `${acc.color || '#10b981'}22`,
                        color: acc.color || '#10b981'
                      }}
                    >
                      {acc.id === 'acc_cash' ? (
                        <Coins size={18} />
                      ) : acc.bank_code === 'VTM' ? (
                        <Smartphone size={18} />
                      ) : (
                        <Building2 size={18} />
                      )}
                    </div>
                    <div className="account-info">
                      <div className="account-title-row">
                        <h4>{acc.name}</h4>
                        <span className={`acc-type-pill ${acc.id === 'acc_cash' ? 'cash' : acc.bank_code === 'VTM' ? 'ewallet' : 'bank'}`}>
                          {acc.id === 'acc_cash' ? 'Tiền mặt' : acc.bank_code === 'VTM' ? 'Ví điện tử' : 'Ngân hàng'}
                        </span>
                      </div>
                      <p>
                        {acc.account_number ||
                          (acc.id === 'acc_cash' ? 'Tiền mặt trong ví' : acc.bank_code === 'VTM' ? 'Ví điện tử Viettel' : 'Tài khoản chính')}
                      </p>
                    </div>
                  </div>
                  <div className="account-right">
                    <div className="account-balance tabular-nums">{formatVND(acc.balance)}</div>
                    <div className="account-action-row">
                      <span className="account-asset-percent">
                        {accPercent}% tài sản
                      </span>
                      <button
                        type="button"
                        className="btn-reconcile"
                        onClick={() => onReconcile(acc)}
                        title="Kiểm kê và điều chỉnh số dư"
                      >
                        <SlidersHorizontal size={11} style={{ flexShrink: 0 }} />
                        <span>Kiểm kê</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. Sổ theo dõi Cho vay & Thu hồi nợ (Debt & Loan Ledger) */}
      <DebtLoanTracker
        transactions={transactions}
        accounts={accounts}
        onEditTransaction={onEditTransaction}
      />

      {/* Popup danh sách các khoản chi theo danh mục */}
      {selectedCategory && (
        <div
          className="modal-overlay category-tx-modal-backdrop"
          onClick={() => setSelectedCategoryId(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Chi tiết danh mục ${selectedCategory.name}`}
        >
          <div className="glass-panel modal-container category-tx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="category-tx-header">
              <div className="category-tx-title-group">
                <span
                  className="category-tx-color-dot"
                  style={{
                    backgroundColor: selectedCategory.color,
                    boxShadow: `0 0 14px ${selectedCategory.color}88`
                  }}
                />
                <div className="category-tx-title-text">
                  <h3>{selectedCategory.name}</h3>
                  <p>
                    {selectedCategory.tx_count} khoản chi · {timeLabel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedCategoryId(null)}
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <div className="category-tx-summary-bar">
              <div>
                <span className="category-tx-summary-label">Tổng chi danh mục</span>
                <strong className="category-tx-summary-val tabular-nums">
                  {formatVND(selectedCategory.total_amount)}
                </strong>
              </div>
              <span
                className="category-tx-summary-pct tabular-nums"
                style={{
                  backgroundColor: `${selectedCategory.color}22`,
                  color: selectedCategory.color
                }}
              >
                {displayedExpense > 0
                  ? Math.round((selectedCategory.total_amount / displayedExpense) * 100)
                  : 0}
                % tổng chi
              </span>
            </div>

            {sortedCategoryItems.length > 1 && (
              <div className="category-tx-sort-bar" role="group" aria-label="Sắp xếp các khoản chi">
                <span className="category-tx-sort-label">Sắp xếp:</span>
                <div className="category-tx-sort-pills">
                  {[
                    { key: 'NEWEST', label: 'Mới nhất' },
                    { key: 'AMOUNT_DESC', label: 'Giá giảm dần ↓' },
                    { key: 'AMOUNT_ASC', label: 'Giá tăng dần ↑' }
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      className={`category-tx-sort-pill ${categoryTxSort === opt.key ? 'is-active' : ''}`}
                      onClick={() => setCategoryTxSort(opt.key)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="category-tx-list">
              {sortedCategoryItems.length === 0 ? (
                <p className="category-tx-empty">Chưa có khoản chi nào trong danh mục này.</p>
              ) : (
                sortedCategoryItems.map((tx) => (
                  <div key={tx.id} className="category-tx-item">
                    <div className="category-tx-item-left">
                      <div className="category-tx-item-desc">
                        {tx.description || selectedCategory.name}
                      </div>
                      <div className="category-tx-item-meta">
                        <span className="category-tx-item-time">
                          <Clock size={12} />
                          <span>{formatTxTime(tx.transaction_time, tx.created_at) || 'Vừa ghi'}</span>
                        </span>
                        <span className="category-tx-wallet-pill">
                          {tx.account_name || tx.bank_name || 'Ví'}
                        </span>
                      </div>
                    </div>

                    <div className="category-tx-item-right">
                      <span className="category-tx-item-amount tabular-nums">
                        -{formatVND(tx.amount)}
                      </span>
                      {onEditTransaction && (
                        <button
                          type="button"
                          className="category-tx-edit-btn"
                          onClick={() => onEditTransaction(tx)}
                          title="Chỉnh sửa giao dịch"
                          aria-label="Chỉnh sửa giao dịch"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="category-tx-footer">
              <button
                type="button"
                className="btn btn-secondary category-tx-close-footer"
                onClick={() => setSelectedCategoryId(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
