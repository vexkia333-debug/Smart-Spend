import React, { useState, useRef, useMemo } from 'react';
import { LineChart as LineChartIcon } from 'lucide-react';
import { formatCompactVND } from '../../utils/formatters.js';

export default function InteractiveTrendLineChart({ transactions = [], formatVND }) {
  const [rangeDays, setRangeDays] = useState(14); // 7 | 14 | 30
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);
  const [showNet, setShowNet] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

  // Parse transactions into daily data points
  const dailyPoints = useMemo(() => {
    const points = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const label = i === 0 ? 'Hôm nay' : i === 1 ? 'Hôm qua' : `${d.getDate()}/${d.getMonth() + 1}`;
      const weekdayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      const fullDate = `${weekdayNames[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

      let income = 0;
      let expense = 0;

      transactions.forEach((t) => {
        if (t.status === 'IGNORED') return;
        let txDate;
        if (t.created_at && t.created_at.includes('-')) {
          txDate = new Date(t.created_at.replace(' ', 'T'));
        } else if (t.transaction_time && t.transaction_time.includes('-')) {
          txDate = new Date(t.transaction_time.replace(' ', 'T'));
        } else {
          return;
        }
        txDate.setHours(0, 0, 0, 0);
        const txKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;

        if (txKey === dateKey) {
          if (t.type === 'INCOME') {
            income += t.amount || 0;
          } else if (t.type === 'EXPENSE' && t.category_id !== 'cat_transfer_cash') {
            expense += t.amount || 0;
          }
        }
      });

      points.push({
        dateKey,
        label,
        fullDate,
        income,
        expense,
        net: income - expense,
        isToday: i === 0
      });
    }

    return points;
  }, [transactions, rangeDays]);

  // Aggregate stats
  const totalIncomeInRange = dailyPoints.reduce((s, p) => s + p.income, 0);
  const totalExpenseInRange = dailyPoints.reduce((s, p) => s + p.expense, 0);
  const avgExpensePerDay = Math.round(totalExpenseInRange / rangeDays);
  const maxExpensePoint = [...dailyPoints].sort((a, b) => b.expense - a.expense)[0];

  // SVG Geometry Constants
  const width = 800;
  const height = 240;
  const padLeft = 65;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 40;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const bottomY = padTop + chartH;

  // Maximum value for scaling
  const allValues = dailyPoints.flatMap((p) => [
    showIncome ? p.income : 0,
    showExpense ? p.expense : 0,
    showNet ? Math.max(0, p.net) : 0
  ]);
  const rawMax = Math.max(...allValues, 100000);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const stepVal = magnitude >= 100000 ? magnitude / 2 : 50000;
  const maxVal = Math.ceil(rawMax / stepVal) * stepVal || 100000;

  // Coordinate mapping
  const coords = dailyPoints.map((p, i) => {
    const x = padLeft + (i / Math.max(1, dailyPoints.length - 1)) * chartW;
    const yIncome = bottomY - Math.min(chartH, (p.income / maxVal) * chartH);
    const yExpense = bottomY - Math.min(chartH, (p.expense / maxVal) * chartH);
    const yNet = bottomY - Math.min(chartH, (Math.max(0, p.net) / maxVal) * chartH);
    return { ...p, x, yIncome, yExpense, yNet, index: i };
  });

  // Smooth Bezier spline path generator
  const getSplinePath = (pts, keyY) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0][keyY]}`;
    if (pts.length === 2) return `M ${pts[0].x} ${pts[0][keyY]} L ${pts[1].x} ${pts[1][keyY]}`;

    let path = `M ${pts[0].x} ${pts[0][keyY]}`;
    const tension = 0.2;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1[keyY] + (p2[keyY] - p0[keyY]) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2[keyY] + (p3[keyY] - p1[keyY]) * tension;

      path += ` C ${cp1x.toFixed(1)} ${Math.min(bottomY, Math.max(padTop - 5, cp1y)).toFixed(1)}, ${cp2x.toFixed(1)} ${Math.min(bottomY, Math.max(padTop - 5, cp2y)).toFixed(1)}, ${p2.x.toFixed(1)} ${p2[keyY].toFixed(1)}`;
    }
    return path;
  };

  const incomeLinePath = getSplinePath(coords, 'yIncome');
  const expenseLinePath = getSplinePath(coords, 'yExpense');
  const netLinePath = getSplinePath(coords, 'yNet');

  const incomeAreaPath = coords.length > 0 ? `${incomeLinePath} L ${coords[coords.length - 1].x} ${bottomY} L ${coords[0].x} ${bottomY} Z` : '';
  const expenseAreaPath = coords.length > 0 ? `${expenseLinePath} L ${coords[coords.length - 1].x} ${bottomY} L ${coords[0].x} ${bottomY} Z` : '';

  // Mouse hover event handler
  const handleMouseMove = (e) => {
    if (!svgRef.current || coords.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * width;

    let closestIdx = 0;
    let minDiff = Infinity;
    coords.forEach((c, idx) => {
      const diff = Math.abs(c.x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    setHoverIndex(closestIdx);
  };

  const activePoint = hoverIndex !== null ? coords[hoverIndex] : null;

  // Grid tick lines
  const gridTicks = [
    { val: maxVal, y: padTop },
    { val: maxVal * 0.66, y: padTop + chartH * 0.34 },
    { val: maxVal * 0.33, y: padTop + chartH * 0.67 },
    { val: 0, y: bottomY }
  ];

  return (
    <div className="glass-panel trend-line-card">
      <div className="trend-line-header">
        <div className="trend-line-title-group">
          <div className="card-badge-icon line-chart-badge">
            <LineChartIcon size={20} color="#38bdf8" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Biểu đồ xu hướng Thu - Chi & Dòng tiền
              </h4>
              <span className="trend-range-indicator">
                {rangeDays} ngày qua
              </span>
            </div>
            <p className="card-sub-desc">
              Theo dõi biến động dòng tiền thực tế theo từng ngày và phát hiện các điểm chi tiêu đột biến
            </p>
          </div>
        </div>

        {/* Range Selector & Series Toggles */}
        <div className="trend-line-controls">
          <div className="trend-series-toggles">
            <button
              type="button"
              className={`series-toggle-pill income ${showIncome ? 'active' : ''}`}
              onClick={() => setShowIncome(!showIncome)}
              title="Bật/Tắt đường Thu nhập"
            >
              <span className="series-dot income"></span>
              Thu nhập
            </button>
            <button
              type="button"
              className={`series-toggle-pill expense ${showExpense ? 'active' : ''}`}
              onClick={() => setShowExpense(!showExpense)}
              title="Bật/Tắt đường Chi tiêu"
            >
              <span className="series-dot expense"></span>
              Chi tiêu
            </button>
            <button
              type="button"
              className={`series-toggle-pill net ${showNet ? 'active' : ''}`}
              onClick={() => setShowNet(!showNet)}
              title="Bật/Tắt đường Tích lũy ròng"
            >
              <span className="series-dot net"></span>
              Dòng tiền ròng
            </button>
          </div>

          <div className="trend-range-tabs">
            <button
              type="button"
              className={`range-tab-btn ${rangeDays === 7 ? 'active' : ''}`}
              onClick={() => setRangeDays(7)}
            >
              7 ngày
            </button>
            <button
              type="button"
              className={`range-tab-btn ${rangeDays === 14 ? 'active' : ''}`}
              onClick={() => setRangeDays(14)}
            >
              14 ngày
            </button>
            <button
              type="button"
              className={`range-tab-btn ${rangeDays === 30 ? 'active' : ''}`}
              onClick={() => setRangeDays(30)}
            >
              30 ngày
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats Bar */}
      <div className="trend-line-summary-bar">
        <div className="summary-pill-item">
          <span className="summary-pill-label">Tổng thu {rangeDays} ngày:</span>
          <span className="summary-pill-val income">+{formatVND(totalIncomeInRange)}</span>
        </div>
        <div className="summary-pill-divider"></div>
        <div className="summary-pill-item">
          <span className="summary-pill-label">Tổng chi {rangeDays} ngày:</span>
          <span className="summary-pill-val expense">-{formatVND(totalExpenseInRange)}</span>
        </div>
        <div className="summary-pill-divider"></div>
        <div className="summary-pill-item">
          <span className="summary-pill-label">Trung bình mỗi ngày:</span>
          <span className="summary-pill-val">~{formatVND(avgExpensePerDay)}/ngày</span>
        </div>
        {maxExpensePoint && maxExpensePoint.expense > 0 && (
          <>
            <div className="summary-pill-divider"></div>
            <div className="summary-pill-item">
              <span className="summary-pill-label">Đỉnh chi ({maxExpensePoint.label}):</span>
              <span className="summary-pill-val highlight">{formatVND(maxExpensePoint.expense)}</span>
            </div>
          </>
        )}
      </div>

      {/* SVG Line Chart Canvas */}
      <div className="line-chart-svg-wrapper">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="trend-line-svg"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="incomeAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="expenseAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y-axis labels */}
          {gridTicks.map((tick, idx) => (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={tick.y}
                x2={width - padRight}
                y2={tick.y}
                className="chart-grid-line"
              />
              <text
                x={padLeft - 10}
                y={tick.y + 4}
                textAnchor="end"
                className="chart-axis-label y-axis"
              >
                {formatCompactVND(tick.val)}
              </text>
            </g>
          ))}

          {/* X-axis date labels */}
          {coords.map((c, idx) => {
            const step = rangeDays <= 7 ? 1 : rangeDays <= 14 ? 2 : 5;
            const distFromEnd = coords.length - 1 - idx;
            const shouldShowLabel = distFromEnd % step === 0;
            if (!shouldShowLabel) return null;

            return (
              <text
                key={c.dateKey}
                x={c.x}
                y={bottomY + 22}
                textAnchor="middle"
                className={`chart-axis-label x-axis ${c.isToday ? 'is-today' : ''}`}
              >
                {c.label}
              </text>
            );
          })}

          {/* Area Fills */}
          {showIncome && incomeAreaPath && (
            <path d={incomeAreaPath} fill="url(#incomeAreaGrad)" />
          )}
          {showExpense && expenseAreaPath && (
            <path d={expenseAreaPath} fill="url(#expenseAreaGrad)" />
          )}

          {/* Smooth Lines */}
          {showIncome && (
            <path
              d={incomeLinePath}
              fill="none"
              stroke="#10b981"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-spline-line income"
            />
          )}

          {showExpense && (
            <path
              d={expenseLinePath}
              fill="none"
              stroke="#f43f5e"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-spline-line expense"
            />
          )}

          {showNet && (
            <path
              d={netLinePath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-spline-line net"
            />
          )}

          {/* Data Points */}
          {coords.map((c) => {
            const isHovered = activePoint && activePoint.index === c.index;
            if (!isHovered && c.expense === 0 && c.income === 0) return null;

            return (
              <g key={c.dateKey}>
                {showIncome && (c.income > 0 || isHovered) && (
                  <circle
                    cx={c.x}
                    cy={c.yIncome}
                    r={isHovered ? 6 : 3.5}
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    className="chart-data-dot"
                    style={{
                      filter: isHovered ? 'drop-shadow(0 0 8px #10b981)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  />
                )}
                {showExpense && (c.expense > 0 || isHovered) && (
                  <circle
                    cx={c.x}
                    cy={c.yExpense}
                    r={isHovered ? 6 : 3.5}
                    fill="#f43f5e"
                    stroke="#ffffff"
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    className="chart-data-dot"
                    style={{
                      filter: isHovered ? 'drop-shadow(0 0 8px #f43f5e)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  />
                )}
              </g>
            );
          })}

          {/* Active Guide Crosshair Line */}
          {activePoint && (
            <line
              x1={activePoint.x}
              y1={padTop}
              x2={activePoint.x}
              y2={bottomY}
              className="chart-crosshair-line"
            />
          )}
        </svg>

        {/* Floating Tooltip HTML Overlay */}
        {activePoint && (
          <div
            className="line-chart-floating-tooltip"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              transform: `translate(${activePoint.x > width * 0.72 ? '-105%' : activePoint.x < width * 0.28 ? '5%' : '-50%'}, -100%)`
            }}
          >
            <div className="tooltip-header-date">
              {activePoint.fullDate} {activePoint.isToday && <span className="today-tag">Hôm nay</span>}
            </div>
            <div className="tooltip-metrics-list">
              {showIncome && (
                <div className="tooltip-metric-row income">
                  <span>● Thu nhập:</span>
                  <strong>+{formatVND(activePoint.income)}</strong>
                </div>
              )}
              {showExpense && (
                <div className="tooltip-metric-row expense">
                  <span>● Chi tiêu:</span>
                  <strong>-{formatVND(activePoint.expense)}</strong>
                </div>
              )}
              <div className="tooltip-metric-row net">
                <span>● Ròng ngày:</span>
                <strong>
                  {activePoint.net >= 0 ? '+' : ''}{formatVND(activePoint.net)}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
