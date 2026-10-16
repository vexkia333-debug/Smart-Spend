import React, { useState, useRef, useMemo } from 'react';
import { LineChart as LineChartIcon, Layers, Wallet } from 'lucide-react';
import { formatCompactVND, parseTxDate } from '../../utils/formatters.js';

const ACCOUNT_COLORS = {
  acc_primary: '#10b981', // Agribank - Emerald
  acc_tcb: '#ef4444',     // Techcombank - Red
  acc_vtm: '#f43f5e',     // Viettel Money - Rose
  acc_cash: '#f59e0b'     // Ví Tiền Mặt - Amber
};

export default function InteractiveTrendLineChart({ transactions = [], accounts = [], formatVND }) {
  const [rangeDays, setRangeDays] = useState(14); // 7 | 14 | 30
  const [chartMode, setChartMode] = useState('ACCOUNTS'); // 'ACCOUNTS' | 'OVERVIEW'

  // Series visibility for Overview mode
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);
  const [showNet, setShowNet] = useState(false);

  // Active accounts for Accounts mode
  const defaultAccountIds = useMemo(() => {
    return accounts.length > 0 ? accounts.map((a) => a.id) : ['acc_primary', 'acc_tcb', 'acc_vtm', 'acc_cash'];
  }, [accounts]);

  const [activeAccountIds, setActiveAccountIds] = useState(defaultAccountIds);

  const toggleAccount = (accId) => {
    setActiveAccountIds((prev) => {
      if (prev.includes(accId)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((id) => id !== accId);
      } else {
        return [...prev, accId];
      }
    });
  };

  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

  // Target accounts list
  const displayAccounts = useMemo(() => {
    if (accounts.length > 0) return accounts;
    return [
      { id: 'acc_primary', name: 'Agribank Plus', bank_code: 'AGRI', color: '#10b981' },
      { id: 'acc_tcb', name: 'Techcombank', bank_code: 'TCB', color: '#ef4444' },
      { id: 'acc_vtm', name: 'Viettel Money', bank_code: 'VTM', color: '#f43f5e' },
      { id: 'acc_cash', name: 'Ví Tiền Mặt', bank_code: 'CASH', color: '#f59e0b' }
    ];
  }, [accounts]);

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

      // Account-specific activity on this day
      const accFlows = {};
      displayAccounts.forEach((acc) => {
        accFlows[acc.id] = { income: 0, expense: 0, net: 0, total: 0 };
      });

      transactions.forEach((t) => {
        if (t.status === 'IGNORED') return;
        const txDate = parseTxDate(t.transaction_time, t.created_at);
        if (!txDate || isNaN(txDate.getTime())) return;
        const txKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;

        if (txKey === dateKey) {
          const amt = t.amount || 0;
          if (t.type === 'INCOME' && !t.category_id?.startsWith('cat_transfer_')) {
            income += amt;
          } else if (t.type === 'EXPENSE' && !t.category_id?.startsWith('cat_transfer_')) {
            expense += amt;
          }

          const targetAccId = t.account_id || 'acc_primary';
          if (accFlows[targetAccId]) {
            if (t.type === 'INCOME') {
              accFlows[targetAccId].income += amt;
              accFlows[targetAccId].net += amt;
            } else {
              accFlows[targetAccId].expense += amt;
              accFlows[targetAccId].net -= amt;
            }
            accFlows[targetAccId].total += amt;
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
        accFlows,
        isToday: i === 0
      });
    }

    return points;
  }, [transactions, rangeDays, displayAccounts]);

  // Aggregate stats
  const totalIncomeInRange = dailyPoints.reduce((s, p) => s + p.income, 0);
  const totalExpenseInRange = dailyPoints.reduce((s, p) => s + p.expense, 0);
  const avgExpensePerDay = Math.round(totalExpenseInRange / rangeDays);

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

  // Scaling maximum
  const rawMax = useMemo(() => {
    if (chartMode === 'OVERVIEW') {
      const vals = dailyPoints.flatMap((p) => [
        showIncome ? p.income : 0,
        showExpense ? p.expense : 0,
        showNet ? Math.max(0, p.net) : 0
      ]);
      return Math.max(...vals, 100000);
    } else {
      const vals = dailyPoints.flatMap((p) =>
        activeAccountIds.map((accId) => p.accFlows[accId]?.total || 0)
      );
      return Math.max(...vals, 100000);
    }
  }, [chartMode, dailyPoints, showIncome, showExpense, showNet, activeAccountIds]);

  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const stepVal = magnitude >= 100000 ? magnitude / 2 : 50000;
  const maxVal = Math.ceil(rawMax / stepVal) * stepVal || 100000;

  // Coordinate mapping
  const coords = useMemo(() => {
    return dailyPoints.map((p, i) => {
      const x = padLeft + (i / Math.max(1, dailyPoints.length - 1)) * chartW;
      const yIncome = bottomY - Math.min(chartH, (p.income / maxVal) * chartH);
      const yExpense = bottomY - Math.min(chartH, (p.expense / maxVal) * chartH);
      const yNet = bottomY - Math.min(chartH, (Math.max(0, p.net) / maxVal) * chartH);

      const accY = {};
      displayAccounts.forEach((acc) => {
        const val = p.accFlows[acc.id]?.total || 0;
        accY[acc.id] = bottomY - Math.min(chartH, (val / maxVal) * chartH);
      });

      return { ...p, x, yIncome, yExpense, yNet, accY, index: i };
    });
  }, [dailyPoints, maxVal, chartW, chartH, bottomY, padLeft, displayAccounts]);

  // Spline generator
  const getSplinePath = (pts, keyY, isAcc = false, accId = null) => {
    if (pts.length === 0) return '';
    const getY = (pt) => (isAcc ? pt.accY[accId] : pt[keyY]);

    if (pts.length === 1) return `M ${pts[0].x} ${getY(pts[0])}`;
    if (pts.length === 2) return `M ${pts[0].x} ${getY(pts[0])} L ${pts[1].x} ${getY(pts[1])}`;

    let path = `M ${pts[0].x} ${getY(pts[0])}`;
    const tension = 0.2;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;

      const y0 = getY(p0);
      const y1 = getY(p1);
      const y2 = getY(p2);
      const y3 = getY(p3);

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = y1 + (y2 - y0) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = y2 + (y3 - y1) * tension;

      path += ` C ${cp1x.toFixed(1)} ${Math.min(bottomY, Math.max(padTop - 5, cp1y)).toFixed(1)}, ${cp2x.toFixed(1)} ${Math.min(bottomY, Math.max(padTop - 5, cp2y)).toFixed(1)}, ${p2.x.toFixed(1)} ${y2.toFixed(1)}`;
    }
    return path;
  };

  const incomeLinePath = getSplinePath(coords, 'yIncome');
  const expenseLinePath = getSplinePath(coords, 'yExpense');
  const incomeAreaPath = coords.length > 0 ? `${incomeLinePath} L ${coords[coords.length - 1].x} ${bottomY} L ${coords[0].x} ${bottomY} Z` : '';
  const expenseAreaPath = coords.length > 0 ? `${expenseLinePath} L ${coords[coords.length - 1].x} ${bottomY} L ${coords[0].x} ${bottomY} Z` : '';

  // Mouse hover event
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
                {chartMode === 'ACCOUNTS'
                  ? 'Biểu đồ biến động từng Nguồn tiền'
                  : 'Biểu đồ xu hướng Thu - Chi & Dòng tiền'}
              </h4>
              <span className="trend-range-indicator">
                {rangeDays} ngày qua
              </span>
            </div>
            <p className="card-sub-desc">
              {chartMode === 'ACCOUNTS'
                ? 'Theo dõi đường cong biến động riêng biệt của Agribank, Techcombank, Viettel Money và Tiền mặt'
                : 'Theo dõi biến động dòng tiền thực tế theo từng ngày và phát hiện các điểm chi tiêu đột biến'}
            </p>
          </div>
        </div>

        {/* View Mode & Range Controls */}
        <div className="trend-line-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {/* Chuyển đổi giữa 2 chế độ biểu đồ */}
          <div className="trend-range-tabs">
            <button
              type="button"
              className={`range-tab-btn ${chartMode === 'ACCOUNTS' ? 'active' : ''}`}
              onClick={() => setChartMode('ACCOUNTS')}
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Wallet size={13} />
              Theo Nguồn tiền
            </button>
            <button
              type="button"
              className={`range-tab-btn ${chartMode === 'OVERVIEW' ? 'active' : ''}`}
              onClick={() => setChartMode('OVERVIEW')}
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Layers size={13} />
              Tổng quan Thu/Chi
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

      {/* Series Toggles Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '8px 16px',
          background: 'var(--bg-input)',
          borderBottom: '1px solid var(--border-subtle)'
        }}
      >
        {chartMode === 'ACCOUNTS' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Bật/Tắt nguồn tiền:
            </span>
            {displayAccounts.map((acc) => {
              const isActive = activeAccountIds.includes(acc.id);
              const color = ACCOUNT_COLORS[acc.id] || acc.color || '#38bdf8';
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => toggleAccount(acc.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    border: `1px solid ${isActive ? color : 'var(--border-subtle)'}`,
                    background: isActive ? `${color}20` : 'transparent',
                    color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: color,
                      opacity: isActive ? 1 : 0.4
                    }}
                  ></span>
                  <span>{acc.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
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
        )}
      </div>

      {/* Summary Stats Bar */}
      <div className="trend-line-summary-bar">
        {chartMode === 'ACCOUNTS' ? (
          displayAccounts.map((acc, idx) => {
            const color = ACCOUNT_COLORS[acc.id] || acc.color || '#38bdf8';
            const totalVol = dailyPoints.reduce((s, p) => s + (p.accFlows[acc.id]?.total || 0), 0);
            return (
              <React.Fragment key={acc.id}>
                {idx > 0 && <div className="summary-pill-divider"></div>}
                <div className="summary-pill-item">
                  <span className="summary-pill-label" style={{ color, fontWeight: 600 }}>● {acc.name}:</span>
                  <span className="summary-pill-val">{formatVND(totalVol)}</span>
                </div>
              </React.Fragment>
            );
          })
        ) : (
          <>
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

          {/* OVERVIEW MODE RENDERING */}
          {chartMode === 'OVERVIEW' && (
            <>
              {showIncome && incomeAreaPath && (
                <path d={incomeAreaPath} fill="url(#incomeAreaGrad)" />
              )}
              {showExpense && expenseAreaPath && (
                <path d={expenseAreaPath} fill="url(#expenseAreaGrad)" />
              )}
              {showIncome && (
                <path
                  d={incomeLinePath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
                />
              )}
            </>
          )}

          {/* ACCOUNTS MODE RENDERING */}
          {chartMode === 'ACCOUNTS' && (
            <>
              {displayAccounts.map((acc) => {
                if (!activeAccountIds.includes(acc.id)) return null;
                const path = getSplinePath(coords, null, true, acc.id);
                const color = ACCOUNT_COLORS[acc.id] || acc.color || '#38bdf8';
                return (
                  <path
                    key={acc.id}
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
            </>
          )}

          {/* Vertical inspection crosshair on hover */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={padTop}
                x2={activePoint.x}
                y2={bottomY}
                className="chart-crosshair-line"
              />

              {chartMode === 'OVERVIEW' ? (
                <>
                  {showIncome && activePoint.income > 0 && (
                    <circle cx={activePoint.x} cy={activePoint.yIncome} r="5" fill="#10b981" stroke="var(--bg-card-solid, #ffffff)" strokeWidth="2" />
                  )}
                  {showExpense && activePoint.expense > 0 && (
                    <circle cx={activePoint.x} cy={activePoint.yExpense} r="5" fill="#f43f5e" stroke="var(--bg-card-solid, #ffffff)" strokeWidth="2" />
                  )}
                </>
              ) : (
                displayAccounts.map((acc) => {
                  if (!activeAccountIds.includes(acc.id)) return null;
                  const y = activePoint.accY[acc.id];
                  const color = ACCOUNT_COLORS[acc.id] || acc.color || '#38bdf8';
                  return (
                    <circle key={acc.id} cx={activePoint.x} cy={y} r="5" fill={color} stroke="var(--bg-card-solid, #ffffff)" strokeWidth="2" />
                  );
                })
              )}
            </g>
          )}
        </svg>

        {/* Hover Tooltip Overlay */}
        {activePoint && (
          <div
            className="line-chart-floating-tooltip"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              transform: activePoint.x > width * 0.65 ? 'translateX(-105%)' : 'translateX(10px)'
            }}
          >
            <div className="tooltip-header-date">
              <span>{activePoint.fullDate}</span>
              {activePoint.isToday && <span className="today-tag">Hôm nay</span>}
            </div>

            {chartMode === 'ACCOUNTS' ? (
              <div className="tooltip-metrics-list">
                {displayAccounts.map((acc) => {
                  if (!activeAccountIds.includes(acc.id)) return null;
                  const flow = activePoint.accFlows[acc.id];
                  const color = ACCOUNT_COLORS[acc.id] || acc.color || '#38bdf8';
                  return (
                    <div key={acc.id} className="tooltip-metric-row">
                      <span style={{ color, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }}></span>
                        {acc.name}:
                      </span>
                      <strong style={{ color: flow.total > 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                        {formatVND(flow.total)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="tooltip-metrics-list">
                {showIncome && (
                  <div className="tooltip-metric-row income">
                    <span>Thu:</span>
                    <strong>+{formatVND(activePoint.income)}</strong>
                  </div>
                )}
                {showExpense && (
                  <div className="tooltip-metric-row expense">
                    <span>Chi:</span>
                    <strong>-{formatVND(activePoint.expense)}</strong>
                  </div>
                )}
                {showNet && (
                  <div className="tooltip-metric-row net">
                    <span>Dòng tiền:</span>
                    <strong>{activePoint.net >= 0 ? '+' : ''}{formatVND(activePoint.net)}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
