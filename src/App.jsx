import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Bell,
  Clock,
  CheckCircle2,
  X,
  Smartphone,
  Tag,
  Zap,
  Layers,
  ChevronRight,
  ChevronDown,
  Check,
  RefreshCw,
  Sparkles,
  HelpCircle,
  Copy,
  Plus,
  Send,
  PieChart as PieChartIcon,
  Sun,
  Moon,
  Key,
  Bot,
  Settings,
  Banknote,
  HandCoins,
  Activity,
  TrendingUp,
  LineChart as LineChartIcon
} from 'lucide-react';
import './App.css';

const DEFAULT_QUICK_ACTIONS = [
  { id: 'cat_transfer_cash', name: '💵 Rút vào Ví', color: '#06b6d4' },
  { id: 'cat_food', name: 'Ăn uống & Cà phê', color: '#f59e0b' },
  { id: 'cat_shopping', name: 'Mua sắm & Siêu thị', color: '#ec4899' },
  { id: 'cat_transport', name: 'Di chuyển & Xăng xe', color: '#3b82f6' },
  { id: 'cat_loan', name: '🤝 Cho vay', color: '#ec4899' }
];

function CustomSelect({ value, onChange, options = [], style, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="custom-select-container" ref={containerRef} style={style}>
      <button
        type="button"
        className={`custom-select-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="custom-select-value">
          {selectedOption ? selectedOption.label : placeholder || 'Chọn...'}
        </span>
        <ChevronDown size={15} className={`custom-select-arrow ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="custom-select-menu">
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={14} className="custom-select-check" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InteractiveDonutChart({ categories = [], totalExpense = 0, formatVND, activeCatId, onHoverCat }) {
  const [internalHoveredCat, setInternalHoveredCat] = useState(null);

  const activeCategories = categories.filter((c) => c.total_amount > 0 && c.id !== 'cat_transfer_cash');
  const sumAmount = activeCategories.reduce((s, c) => s + c.total_amount, 0) || totalExpense || 1;

  const hoveredCat = activeCatId !== undefined
    ? (activeCategories.find((c) => c.id === activeCatId) || null)
    : internalHoveredCat;

  const handleHover = (cat) => {
    if (onHoverCat) {
      onHoverCat(cat ? cat.id : null);
    } else {
      setInternalHoveredCat(cat);
    }
  };

  const radius = 68;
  const circumference = 2 * Math.PI * radius; // ~427.26

  let accumulatedPercent = 0;

  if (activeCategories.length === 0) {
    return (
      <div className="donut-chart-wrapper empty">
        <div className="donut-empty-state">
          <PieChartIcon size={40} color="var(--text-dim)" />
          <p style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Chưa có dữ liệu chi tiêu trong kỳ
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="donut-chart-wrapper">
      <div className="donut-chart-svg-container">
        <svg viewBox="0 0 200 200" className="donut-svg">
          <circle
            cx="100"
            cy="100"
            r={radius}
            className="donut-bg-track"
          />
          {activeCategories.map((cat) => {
            const pct = cat.total_amount / sumAmount;
            const strokeDasharray = `${pct * circumference} ${circumference * (1 - pct)}`;
            const strokeDashoffset = -accumulatedPercent * circumference;
            accumulatedPercent += pct;

            const isHovered = hoveredCat?.id === cat.id;

            return (
              <circle
                key={cat.id}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={cat.color}
                strokeWidth={isHovered ? 26 : 20}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="donut-slice"
                style={{
                  opacity: hoveredCat ? (isHovered ? 1 : 0.35) : 1,
                  filter: isHovered ? `drop-shadow(0 0 8px ${cat.color})` : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.25s ease'
                }}
                onMouseEnter={() => handleHover(cat)}
                onMouseLeave={() => handleHover(null)}
              />
            );
          })}
        </svg>

        <div className="donut-center-content">
          <span className="donut-center-label">
            {hoveredCat ? hoveredCat.name : 'Tổng chi tiêu'}
          </span>
          <span className="donut-center-val">
            {formatVND(hoveredCat ? hoveredCat.total_amount : totalExpense)}
          </span>
          <span className="donut-center-sub">
            {hoveredCat
              ? `${Math.round((hoveredCat.total_amount / sumAmount) * 100)}% tổng chi`
              : `${activeCategories.length} nhóm chi`}
          </span>
        </div>
      </div>
    </div>
  );
}

function InteractiveTrendLineChart({ transactions = [], formatVND }) {
  const [rangeDays, setRangeDays] = useState(14); // 7 | 14 | 30
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);
  const [showNet, setShowNet] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

  // Parse transactions into daily data points
  const dailyPoints = React.useMemo(() => {
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

  const formatCompactVND = (v) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}tr`;
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    return '0đ';
  };

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

export default function App() {
  const [activeTab, setActiveTab] = useState('pending');
  const [stats, setStats] = useState({
    totalBalance: 0,
    totalExpense: 0,
    totalIncome: 0,
    pendingCount: 0,
    categories: []
  });
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [rules, setRules] = useState([]);
  const [livePrompt, setLivePrompt] = useState(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Theme & Time Filter States
  const [theme, setTheme] = useState(() => localStorage.getItem('smartspend_theme') || 'dark');
  const [timeFilter, setTimeFilter] = useState('ALL'); // 'ALL' | 'MONTH' | 'WEEK' | 'DAY'
  const [hoveredCatId, setHoveredCatId] = useState(null);

  // AI Assistant States (Google AI Studio)
  const [aiInputText, setAiInputText] = useState('');
  const [aiIsCash, setAiIsCash] = useState(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [aiMessage, setAiMessage] = useState(null);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [promptAiText, setPromptAiText] = useState('');
  const [isPromptAiAnalyzing, setIsPromptAiAnalyzing] = useState(false);

  // Settings & Reconcile Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [reconcileAccount, setReconcileAccount] = useState(null);
  const [reconcileAmount, setReconcileAmount] = useState('');
  const [reconcileReason, setReconcileReason] = useState('Kiểm kê số dư');
  const [isSubmittingReconcile, setIsSubmittingReconcile] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Simulator Form State
  const [simBank, setSimBank] = useState('VCB');
  const [simAmount, setSimAmount] = useState('85000');
  const [simDesc, setSimDesc] = useState('QR TT Phuc Long Coffee Landmark 81');
  const [simType, setSimType] = useState('EXPENSE');
  const [isSimulating, setIsSimulating] = useState(false);

  // Category & Rule Form States
  const [newKeyword, setNewKeyword] = useState('');
  const [newRuleCat, setNewRuleCat] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('EXPENSE');
  const [newCatColor, setNewCatColor] = useState('#10b981');
  const [isAddingCat, setIsAddingCat] = useState(false);

  // Reset Modal States
  const [showResetModal, setShowResetModal] = useState(false);
  const [cleanAccName, setCleanAccName] = useState('Agribank Plus');
  const [cleanBalance, setCleanBalance] = useState('0');
  const [isResetting, setIsResetting] = useState(false);

  // Theme effect
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('smartspend_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // 1. Load initial data
  useEffect(() => {
    fetchInitialData();

    // 2. Setup Server-Sent Events (SSE) để nhận realtime từ điện thoại
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('NEW_TRANSACTION_PROMPT', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setLivePrompt(payload);
        fetchStats();
        fetchTransactions();
      } catch (e) {
        console.error('SSE Error:', e);
      }
    });

    eventSource.addEventListener('TRANSACTION_UPDATED', () => {
      fetchStats();
      fetchTransactions();
    });

    eventSource.addEventListener('TRANSACTION_IGNORED', () => {
      fetchStats();
      fetchTransactions();
    });

    eventSource.addEventListener('DATA_RESET', () => {
      fetchInitialData();
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const fetchInitialData = async () => {
    await Promise.all([
      fetchStats(),
      fetchTransactions(),
      fetchCategories(),
      fetchAccounts(),
      fetchRules(),
      fetchSettings()
    ]);
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setHasGeminiKey(data.hasGeminiKey);
        setMaskedKey(data.maskedKey || '');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await fetch('/api/transactions');
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
        // Tự động bật Prompt nếu có giao dịch PENDING và chưa có prompt nào mở
        const pending = data.find((t) => t.status === 'PENDING');
        if (pending) {
          setLivePrompt((prev) => {
            if (prev) return prev;
            const matchedCats = categories.filter((c) => c.type === pending.type && c.is_quick_action).slice(0, 4);
            return {
              transaction: pending,
              quickActions: matchedCats.length > 0 ? matchedCats : DEFAULT_QUICK_ACTIONS
            };
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
        if (data.length > 0 && !newRuleCat) setNewRuleCat(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) setAccounts(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/rules');
      if (res.ok) setRules(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  // Phân loại 1-chạm (hoặc phân loại kèm mô tả mới)
  const handleCategorize = async (txId, categoryId, customDesc) => {
    try {
      const payload = { category_id: categoryId };
      if (customDesc) payload.description = customDesc;

      const res = await fetch(`/api/transactions/${txId}/categorize`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        // Hiệu ứng ăn mừng khi gán thành công
        confetti({
          particleCount: 45,
          spread: 60,
          origin: { y: 0.85 },
          colors: ['#10b981', '#06b6d4', '#f59e0b']
        });

        if (livePrompt && livePrompt.transaction.id === txId) {
          setLivePrompt(null);
        }

        fetchStats();
        fetchTransactions();
        fetchAccounts();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Phân loại bằng AI trực tiếp ngay trong Prompt nổi
  const handlePromptAiCategorize = async (txId) => {
    if (!promptAiText.trim()) return;
    if (!hasGeminiKey) {
      setShowApiKeyModal(true);
      return;
    }
    setIsPromptAiAnalyzing(true);
    try {
      const res = await fetch('/api/ai/parse-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${promptAiText} (khoản tiền: ${livePrompt?.transaction?.amount || ''}đ)`,
          autoSave: false
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi phân tích AI');

      await handleCategorize(txId, data.parsed.categoryId, data.parsed.description || promptAiText);
      setLivePrompt(null);
      setPromptAiText('');
    } catch (err) {
      alert(err.message);
    } finally {
      setIsPromptAiAnalyzing(false);
    }
  };

  // Bỏ qua giao dịch
  const handleIgnore = async (txId) => {
    try {
      await fetch(`/api/transactions/${txId}/ignore`, { method: 'PATCH' });
      if (livePrompt && livePrompt.transaction.id === txId) {
        setLivePrompt(null);
      }
      fetchStats();
      fetchTransactions();
    } catch (e) {
      console.error(e);
    }
  };

  // Kích hoạt mô phỏng thông báo
  const handleSimulate = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/simulate/notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank: simBank,
          type: simType,
          amount: parseFloat(simAmount) || 50000,
          desc: simDesc
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLivePrompt(data);
        fetchStats();
        fetchTransactions();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  };

  // Tạo quy tắc từ khóa mới
  const handleCreateRule = async (e) => {
    e.preventDefault();
    if (!newKeyword || !newRuleCat) return;
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: newKeyword,
          category_id: newRuleCat,
          is_auto_apply: 0
        })
      });
      if (res.ok) {
        setNewKeyword('');
        fetchRules();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Xóa sạch dữ liệu mẫu và tạo tài khoản thực tế
  const handleResetData = async (e) => {
    if (e) e.preventDefault();
    setIsResetting(true);
    try {
      const res = await fetch('/api/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: cleanAccName || 'Agribank Plus',
          bankCode: 'AGRI',
          initialBalance: parseFloat(cleanBalance) || 0
        })
      });
      if (res.ok) {
        setShowResetModal(false);
        await fetchInitialData();
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsResetting(false);
    }
  };

  // Tạo danh mục mới
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatName) return;
    setIsAddingCat(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCatName,
          type: newCatType,
          color: newCatColor,
          icon: 'Tag',
          is_quick_action: 1
        })
      });
      if (res.ok) {
        setNewCatName('');
        await fetchCategories();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAddingCat(false);
    }
  };

  // Lưu API Key Google AI Studio
  const handleSaveApiKey = async (e) => {
    if (e) e.preventDefault();
    setIsSavingKey(true);
    try {
      const res = await fetch('/api/settings/gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput })
      });
      if (res.ok) {
        setShowApiKeyModal(false);
        setApiKeyInput('');
        await fetchSettings();
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.6 }
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingKey(false);
    }
  };

  // Phân tích chi tiêu tự nhiên bằng Gemini AI
  const handleAnalyzeAi = async (e) => {
    if (e) e.preventDefault();
    if (!aiInputText.trim()) return;

    if (!hasGeminiKey) {
      setShowApiKeyModal(true);
      return;
    }

    setIsAnalyzingAi(true);
    setAiMessage(null);
    try {
      const res = await fetch('/api/ai/parse-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: aiInputText, 
          autoSave: true, 
          forceCash: aiIsCash 
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lỗi phân tích AI');
      }

      setAiMessage(`✨ Đã ghi nhận: ${data.transaction.category_name} - ${formatVND(data.transaction.amount)} (${data.parsed.reasoning})`);
      setAiInputText('');
      setAiIsCash(false);
      await fetchStats();
      await fetchTransactions();
      await fetchAccounts();

      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#8b5cf6', '#3b82f6', '#10b981']
      });

      setTimeout(() => setAiMessage(null), 8000);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  // Xử lý kiểm kê / điều chỉnh số dư ví & tài khoản
  const handleReconcileSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!reconcileAccount) return;
    const amountNum = parseFloat(reconcileAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      alert('Vui lòng nhập số tiền thực tế hợp lệ (từ 0 trở lên)');
      return;
    }

    setIsSubmittingReconcile(true);
    try {
      const res = await fetch(`/api/accounts/${reconcileAccount.id}/adjust-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualBalance: amountNum,
          reason: reconcileReason || 'Kiểm kê số dư ví'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi điều chỉnh số dư');

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#10b981', '#3b82f6']
      });

      setShowReconcileModal(false);
      setReconcileAccount(null);
      setReconcileAmount('');
      await fetchStats();
      await fetchAccounts();
      await fetchTransactions();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmittingReconcile(false);
    }
  };

  const formatVND = (num) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
  };

  const formatTxTime = (timeStr, createdAt) => {
    const raw = timeStr || createdAt || '';
    if (!raw) return '';
    return raw
      .replace(/\{day_of_month\}|\[day_of_month\]/gi, '10')
      .replace(/\{day\}|\[day\]/gi, '10')
      .replace(/tháng\s+/gi, '')
      .trim();
  };

  // Logic kiểm tra giao dịch khớp với bộ lọc thời gian
  const isMatchingTime = (timeStr, createdAtStr) => {
    if (timeFilter === 'ALL') return true;
    const now = new Date();
    let txDate;
    if (timeStr && timeStr.includes('-') && timeStr.length >= 10) {
      txDate = new Date(timeStr.replace(' ', 'T'));
    } else if (createdAtStr) {
      txDate = new Date(createdAtStr.replace(' ', 'T'));
    } else {
      txDate = new Date();
    }

    if (isNaN(txDate.getTime())) return true;

    if (timeFilter === 'DAY') {
      return (
        txDate.getDate() === now.getDate() &&
        txDate.getMonth() === now.getMonth() &&
        txDate.getFullYear() === now.getFullYear()
      );
    }
    if (timeFilter === 'WEEK') {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay() || 7;
      startOfWeek.setDate(startOfWeek.getDate() - day + 1);
      startOfWeek.setHours(0, 0, 0, 0);
      return txDate >= startOfWeek;
    }
    if (timeFilter === 'MONTH') {
      return (
        txDate.getMonth() === now.getMonth() &&
        txDate.getFullYear() === now.getFullYear()
      );
    }
    return true;
  };

  // Danh sách giao dịch theo bộ lọc thời gian
  const timeFilteredTransactions = transactions.filter((t) =>
    isMatchingTime(t.transaction_time, t.created_at)
  );

  const displayedExpense = timeFilteredTransactions
    .filter((t) => t.type === 'EXPENSE' && t.status !== 'IGNORED' && t.category_id !== 'cat_transfer_cash')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const displayedIncome = timeFilteredTransactions
    .filter((t) => t.type === 'INCOME' && t.status !== 'IGNORED')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const displayedPendingCount = timeFilteredTransactions.filter(
    (t) => t.status === 'PENDING'
  ).length;

  const netSavings = displayedIncome - displayedExpense;
  const spendRatio = displayedIncome > 0
    ? Math.round((displayedExpense / displayedIncome) * 100)
    : (displayedExpense > 0 ? 100 : 0);
  const savingsRate = displayedIncome > 0
    ? Math.max(0, Math.round(((displayedIncome - displayedExpense) / displayedIncome) * 100))
    : 0;

  // Cơ cấu danh mục chi tiêu theo bộ lọc thời gian
  const categoryBreakdown = React.useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c.id] = { ...c, total_amount: 0, tx_count: 0 };
    });
    timeFilteredTransactions.forEach((t) => {
      if (t.type === 'EXPENSE' && t.status !== 'IGNORED' && t.category_id && t.category_id !== 'cat_transfer_cash') {
        if (!map[t.category_id]) {
          map[t.category_id] = {
            id: t.category_id,
            name: t.category_name || 'Khác',
            color: t.category_color || '#94a3b8',
            total_amount: 0,
            tx_count: 0
          };
        }
        map[t.category_id].total_amount += (t.amount || 0);
        map[t.category_id].tx_count += 1;
      }
    });
    return Object.values(map)
      .filter((c) => c.total_amount > 0)
      .sort((a, b) => b.total_amount - a.total_amount);
  }, [categories, timeFilteredTransactions]);

  // Xu hướng chi tiêu 7 ngày qua
  const last7DaysData = React.useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dayStr = d.toISOString().split('T')[0];
      const label = i === 0 ? 'Hôm nay' : i === 1 ? 'Hôm qua' : `${d.getDate()}/${d.getMonth() + 1}`;

      const dayExpense = transactions
        .filter((t) => {
          if (t.type !== 'EXPENSE' || t.status === 'IGNORED' || t.category_id === 'cat_transfer_cash') return false;
          const txDate = new Date(t.transaction_time || t.created_at);
          txDate.setHours(0, 0, 0, 0);
          return txDate.toISOString().split('T')[0] === dayStr;
        })
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      days.push({ label, date: dayStr, amount: dayExpense, isToday: i === 0 });
    }
    return days;
  }, [transactions]);

  const maxDayAmount = Math.max(...last7DaysData.map((d) => d.amount), 1);

  const timeLabel =
    timeFilter === 'ALL'
      ? 'Toàn bộ thời gian'
      : timeFilter === 'MONTH'
      ? 'Tháng này'
      : timeFilter === 'WEEK'
      ? 'Tuần này'
      : 'Hôm nay';

  const pendingList = transactions.filter(
    (t) => t.status === 'PENDING' && isMatchingTime(t.transaction_time, t.created_at)
  );

  const filteredTransactions = transactions.filter((t) => {
    if (!isMatchingTime(t.transaction_time, t.created_at)) return false;
    if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
    if (filterType !== 'ALL' && t.type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchDesc = t.description?.toLowerCase().includes(q);
      const matchBank = t.bank_name?.toLowerCase().includes(q);
      const matchCat = t.category_name?.toLowerCase().includes(q);
      if (!matchDesc && !matchBank && !matchCat) return false;
    }
    return true;
  });

  const webhookUrl = `${window.location.origin}/api/webhook/bank-notification`;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header glass-panel">
        <div className="logo-group">
          <div className="logo-icon">
            <Wallet size={24} color="#ffffff" />
          </div>
          <div className="logo-text">
            <h1>SmartSpend</h1>
            <p>Hệ thống tự động hóa chi tiêu & Prompt tương tác di động</p>
          </div>
        </div>

        <div className="header-actions">
          {/* Bộ lọc thời gian: Tất cả / Tháng / Tuần / Ngày */}
          <div className="time-filter-bar">
            <button
              className={`time-filter-btn ${timeFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setTimeFilter('ALL')}
            >
              Tất cả
            </button>
            <button
              className={`time-filter-btn ${timeFilter === 'MONTH' ? 'active' : ''}`}
              onClick={() => setTimeFilter('MONTH')}
            >
              Tháng này
            </button>
            <button
              className={`time-filter-btn ${timeFilter === 'WEEK' ? 'active' : ''}`}
              onClick={() => setTimeFilter('WEEK')}
            >
              Tuần này
            </button>
            <button
              className={`time-filter-btn ${timeFilter === 'DAY' ? 'active' : ''}`}
              onClick={() => setTimeFilter('DAY')}
            >
              Hôm nay
            </button>
          </div>

          {/* Nút Cài đặt hệ thống & Webhook */}
          <button
            className="theme-toggle-btn"
            onClick={() => setShowSettingsModal(true)}
            title="Cài đặt kết nối MacroDroid & Google AI"
          >
            <Settings size={18} />
          </button>

          {/* Nút chuyển giao diện Sáng / Tối */}
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={`Chuyển sang giao diện ${theme === 'dark' ? 'Sáng' : 'Tối'}`}
          >
            {theme === 'dark' ? <Sun size={19} color="#f59e0b" /> : <Moon size={19} color="#3b82f6" />}
          </button>
        </div>
      </header>

      {/* AI Smart Input Card (Google AI Studio Gemini) */}
      <section className="glass-panel ai-smart-card">
        <div className="ai-header-row">
          <div className="ai-title">
            <Sparkles size={19} color="#8b5cf6" />
            Nhập dòng tiền thông minh bằng Google Gemini AI
          </div>

          <div
            className={`ai-key-badge ${hasGeminiKey ? 'ai-key-active' : 'ai-key-missing'}`}
            onClick={() => setShowApiKeyModal(true)}
            title="Bấm để cấu hình API Key Google AI Studio miễn phí"
          >
            <Key size={14} />
            {hasGeminiKey ? `Gemini Key: ${maskedKey}` : '⚡ Kết nối API Key (Miễn phí)'}
          </div>
        </div>

        <form onSubmit={handleAnalyzeAi} className="ai-input-row">
          <input
            type="text"
            className="ai-text-input"
            value={aiInputText}
            onChange={(e) => setAiInputText(e.target.value)}
            placeholder="Gõ tự nhiên (VD: bún bò 45k tiền mặt, rút tiền mặt 2tr, cho Nam vay 500k, đổ xăng 70k)..."
            disabled={isAnalyzingAi}
          />
          <button
            type="button"
            className={`ai-cash-toggle ${aiIsCash ? 'active' : ''}`}
            onClick={() => setAiIsCash(!aiIsCash)}
            title="Bật để trừ thẳng vào Ví Tiền Mặt"
          >
            💵 Tiền mặt {aiIsCash ? '✓' : ''}
          </button>
          <button type="submit" className="btn ai-submit-btn" disabled={isAnalyzingAi}>
            <Bot size={18} />
            {isAnalyzingAi ? 'Đang phân tích...' : '✨ Phân loại AI'}
          </button>
        </form>

        {/* Suggestion Chips */}
        <div className="ai-chips-row">
          <span className="ai-chip-label">Thử nhanh:</span>
          <button
            type="button"
            className="ai-chip"
            onClick={() => { setAiInputText('Gửi xe máy 5k tiền mặt'); setAiIsCash(true); }}
          >
            🅿️ Gửi xe 5k tiền mặt
          </button>
          <button
            type="button"
            className="ai-chip"
            onClick={() => { setAiInputText('Ăn bún bò Huế 45k tiền mặt'); setAiIsCash(true); }}
          >
            🍜 Bún bò 45k tiền mặt
          </button>
          <button
            type="button"
            className="ai-chip"
            onClick={() => { setAiInputText('Rút tiền mặt 2 triệu về ví'); setAiIsCash(false); }}
          >
            🏧 Rút tiền mặt 2tr
          </button>
          <button
            type="button"
            className="ai-chip"
            onClick={() => { setAiInputText('Chuyển 500k cho bạn Nam vay'); setAiIsCash(false); }}
          >
            🤝 Cho Nam vay 500k
          </button>
          <button
            type="button"
            className="ai-chip"
            onClick={() => { setAiInputText('Nam chuyển khoản trả nợ 500k'); setAiIsCash(false); }}
          >
            💰 Nam trả nợ 500k
          </button>
        </div>

        {aiMessage && (
          <div className="ai-result-alert">
            <CheckCircle2 size={16} />
            {aiMessage}
          </div>
        )}
      </section>

      {/* Navigation Tabs (4 Mục Cốt Lõi Tinh Gọn) */}
      <nav className="nav-tabs">
        <button
          className={`nav-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          <Bell size={18} />
          Cần bổ sung
          {displayedPendingCount > 0 && <span className="nav-badge">{displayedPendingCount}</span>}
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <PieChartIcon size={18} />
          Tổng quan & Phân tích
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          <Layers size={18} />
          Toàn bộ giao dịch
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          <Tag size={18} />
          Danh mục chi tiêu
        </button>
      </nav>

      {/* Stats Summary Top Row */}
      <div className="stats-grid">
        <div className="stat-card glass-panel">
          <div className="stat-card-header">
            <span className="stat-label">Tổng số dư khả dụng</span>
            <div className="stat-icon" style={{ color: '#38bdf8' }}>
              <Wallet size={20} />
            </div>
          </div>
          <div className="stat-value">{formatVND(stats.totalBalance)}</div>
          <div className="stat-sub">{accounts.length} ví & tài khoản ngân hàng</div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-card-header">
            <span className="stat-label">Tổng chi tiêu ({timeLabel})</span>
            <div className="stat-icon" style={{ color: '#fb7185' }}>
              <ArrowDownRight size={20} />
            </div>
          </div>
          <div className="stat-value expense">{formatVND(displayedExpense)}</div>
          <div className="stat-sub">Ghi nhận trong {timeLabel.toLowerCase()}</div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-card-header">
            <span className="stat-label">Tổng thu nhập ({timeLabel})</span>
            <div className="stat-icon" style={{ color: '#34d399' }}>
              <ArrowUpRight size={20} />
            </div>
          </div>
          <div className="stat-value income">{formatVND(displayedIncome)}</div>
          <div className="stat-sub">Dòng tiền vào trong {timeLabel.toLowerCase()}</div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-card-header">
            <span className="stat-label">Chờ bạn phân loại ({timeLabel})</span>
            <div className="stat-icon" style={{ color: '#fbbf24' }}>
              <Clock size={20} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>
            {displayedPendingCount}
          </div>
          <div className="stat-sub">Chưa gán thẻ danh mục</div>
        </div>
      </div>

      {/* TAB 1: PENDING TRANSACTIONS (CẦN BỔ SUNG) */}
      {activeTab === 'pending' && (
        <section>
          <div className="section-header">
            <h2 className="section-title">
              <Clock size={22} color="#f59e0b" />
              Giao dịch cần bổ sung danh mục ({pendingList.length})
            </h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              Những biến động số dư khi bạn vuốt bỏ hoặc chưa kịp chọn trên điện thoại
            </p>
          </div>

          {pendingList.length === 0 ? (
            <div className="glass-panel empty-state">
              <div className="empty-icon">
                <CheckCircle2 size={32} />
              </div>
              <h3 style={{ fontSize: '1.2rem', color: '#f8fafc' }}>Tuyệt vời! Không còn giao dịch tồn đọng</h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '420px', fontSize: '0.9rem' }}>
                Tất cả các khoản tiền ra/vào đã được phân loại đầy đủ. Khi có thông báo ngân hàng mới, hệ thống sẽ đẩy thẳng lên đây!
              </p>
              <button
                className="btn btn-secondary"
                style={{ marginTop: '10px' }}
                onClick={handleSimulate}
              >
                <Zap size={16} /> Bắn thử 1 thông báo để kiểm tra
              </button>
            </div>
          ) : (
            <div className="pending-list">
              {pendingList.map((tx) => (
                <div key={tx.id} className="pending-card glass-panel">
                  <div className="pending-card-top">
                    <div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className="pending-bank-badge">
                          🏦 {tx.bank_name || 'Ngân hàng'}
                        </span>
                        <span className="badge badge-pending">Chờ gắn thẻ</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                          {formatTxTime(tx.transaction_time, tx.created_at)}
                        </span>
                      </div>
                      <div className="pending-desc">{tx.description}</div>
                      {tx.raw_content && (
                        <div className="pending-raw">Nội dung gốc: {tx.raw_content}</div>
                      )}
                    </div>

                    <div className="pending-amount">
                      {tx.type === 'EXPENSE' ? '-' : '+'}
                      {formatVND(tx.amount)}
                    </div>
                  </div>

                  <div className="pending-categorize-row">
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      👉 Chọn nhanh danh mục:
                    </span>

                    <div className="category-pill-group">
                      {tx.type === 'EXPENSE' && (
                        <button
                          className="cat-pill-btn special-cash-pill"
                          onClick={() => handleCategorize(tx.id, 'cat_transfer_cash', 'Rút tiền vào Ví Tiền Mặt')}
                          title="Chuyển tiền từ ATM/ngân hàng vào Ví Tiền Mặt"
                        >
                          💵 Rút vào Ví Tiền Mặt
                        </button>
                      )}
                      {categories
                        .filter((c) => c.type === tx.type && c.id !== 'cat_transfer_cash')
                        .slice(0, 7)
                        .map((cat) => (
                          <button
                            key={cat.id}
                            className="cat-pill-btn"
                            onClick={() => handleCategorize(tx.id, cat.id)}
                          >
                            <span style={{ color: cat.color }}>●</span> {cat.name}
                          </button>
                        ))}
                    </div>

                    <button
                      className="btn btn-danger"
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                      onClick={() => handleIgnore(tx.id)}
                    >
                      Bỏ qua
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: DASHBOARD & ANALYTICS */}
      {activeTab === 'dashboard' && (
        <div className="dashboard-content-wrapper">
          {/* Top Analytics Banner: Sức khỏe dòng tiền & Xu hướng 7 ngày */}
          <div className="analytics-top-grid">
            {/* Card 1: Sức khỏe dòng tiền & Tỷ lệ tích lũy */}
            <div className="glass-panel analytics-health-card">
              <div className="card-header-clean">
                <div className="card-header-left">
                  <div className="card-badge-icon pulse">
                    <Activity size={18} color="#10b981" />
                  </div>
                  <div>
                    <h4>Dòng tiền & Tiết kiệm ({timeLabel})</h4>
                    <p className="card-sub-desc">Cân đối dòng tiền thực tế giữa Thu nhập & Chi tiêu</p>
                  </div>
                </div>
                <span className={`health-status-badge ${
                  spendRatio <= 50 ? 'safe' :
                  spendRatio <= 80 ? 'good' :
                  spendRatio <= 100 ? 'warning' : 'danger'
                }`}>
                  {spendRatio <= 50 ? '🌟 Dòng tiền rất tốt' :
                   spendRatio <= 80 ? '👍 Dòng tiền ổn định' :
                   spendRatio <= 100 ? '⚠️ Cận biên thu nhập' : '🚨 Chi vượt thu'}
                </span>
              </div>

              <div className="health-metrics-row">
                <div className="health-metric-item">
                  <span className="health-metric-label">Tổng thu nhập</span>
                  <span className="health-metric-val income-val">+{formatVND(displayedIncome)}</span>
                </div>
                <div className="health-metric-divider"></div>
                <div className="health-metric-item">
                  <span className="health-metric-label">Tổng chi tiêu</span>
                  <span className="health-metric-val expense-val">-{formatVND(displayedExpense)}</span>
                </div>
                <div className="health-metric-divider"></div>
                <div className="health-metric-item">
                  <span className="health-metric-label">Dòng tiền ròng</span>
                  <span className={`health-metric-val ${netSavings >= 0 ? 'savings-positive' : 'savings-negative'}`}>
                    {netSavings >= 0 ? '+' : ''}{formatVND(netSavings)}
                  </span>
                </div>
              </div>

              {/* Thanh tỷ trọng Thu - Chi Dual-tone */}
              <div className="dual-progress-wrapper">
                <div className="dual-progress-header">
                  <span>Tỷ lệ chi tiêu: <strong>{spendRatio}%</strong></span>
                  <span>Tích lũy ròng: <strong>{savingsRate}%</strong></span>
                </div>
                <div className="dual-progress-track">
                  <div
                    className="dual-progress-expense"
                    style={{ width: `${Math.min(spendRatio, 100)}%` }}
                    title={`Chi tiêu: ${spendRatio}%`}
                  ></div>
                  <div
                    className="dual-progress-savings"
                    style={{ width: `${Math.max(0, 100 - Math.min(spendRatio, 100))}%` }}
                    title={`Tích lũy: ${savingsRate}%`}
                  ></div>
                </div>
              </div>
            </div>

            {/* Card 2: Xu hướng chi tiêu 7 ngày gần nhất */}
            <div className="glass-panel spending-trend-card">
              <div className="card-header-clean">
                <div className="card-header-left">
                  <div className="card-badge-icon trend">
                    <TrendingUp size={18} color="#38bdf8" />
                  </div>
                  <div>
                    <h4>Xu hướng chi tiêu 7 ngày</h4>
                    <p className="card-sub-desc">Biểu đồ chi tiêu sinh hoạt theo từng ngày</p>
                  </div>
                </div>
                <div className="trend-total-pill">
                  7 ngày: <strong>{formatVND(last7DaysData.reduce((s, d) => s + d.amount, 0))}</strong>
                </div>
              </div>

              <div className="trend-chart-container">
                {last7DaysData.map((d, idx) => {
                  const barHeightPct = maxDayAmount > 0 ? Math.max(8, Math.round((d.amount / maxDayAmount) * 100)) : 8;
                  return (
                    <div key={idx} className={`trend-bar-column ${d.isToday ? 'is-today' : ''}`}>
                      <div className="trend-bar-tooltip">
                        <span className="tooltip-amount">{formatVND(d.amount)}</span>
                        <span className="tooltip-date">{d.label}</span>
                      </div>
                      <div className="trend-bar-track">
                        <div
                          className="trend-bar-fill"
                          style={{ height: `${barHeightPct}%` }}
                        ></div>
                      </div>
                      <span className="trend-bar-label">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Biểu đồ đường xu hướng Thu - Chi & Dòng tiền */}
          <InteractiveTrendLineChart
            transactions={transactions}
            formatVND={formatVND}
          />

          <div className="dashboard-columns">
            {/* Cột trái: Phân bổ danh mục chi tiêu với Interactive Donut */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <PieChartIcon size={20} color="#06b6d4" />
                  Cơ cấu chi tiêu theo nhóm ({timeLabel})
                </h3>
                <span className="cat-count-badge">
                  {categoryBreakdown.length} danh mục
                </span>
              </div>

              {/* Donut Chart tương tác trực quan */}
              <InteractiveDonutChart
                categories={categoryBreakdown}
                totalExpense={displayedExpense}
                formatVND={formatVND}
                activeCatId={hoveredCatId}
                onHoverCat={setHoveredCatId}
              />

              {/* Danh sách phân bổ chi tiết với Progress Bars */}
              {categoryBreakdown.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                  Chưa có dữ liệu chi tiêu trong kỳ ({timeLabel}).
                </p>
              ) : (
                <div className="cat-breakdown-list" style={{ marginTop: '20px' }}>
                  {categoryBreakdown.map((cat) => {
                    const percent = displayedExpense > 0
                      ? Math.round((cat.total_amount / displayedExpense) * 100)
                      : 0;
                    const isHovered = hoveredCatId === cat.id;

                    return (
                      <div
                        key={cat.id}
                        className={`cat-breakdown-row ${isHovered ? 'highlighted' : ''}`}
                        onMouseEnter={() => setHoveredCatId(cat.id)}
                        onMouseLeave={() => setHoveredCatId(null)}
                      >
                        <div className="cat-breakdown-meta">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600 }}>
                            <span
                              className="cat-dot-indicator"
                              style={{
                                backgroundColor: cat.color,
                                boxShadow: isHovered ? `0 0 12px ${cat.color}` : `0 0 6px ${cat.color}66`
                              }}
                            ></span>
                            <span className="cat-name-text">{cat.name}</span>
                            <span className="cat-tx-pill">
                              {cat.tx_count} GD
                            </span>
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                              {formatVND(cat.total_amount)}
                            </span>
                            <span
                              className="cat-percent-pill"
                              style={{ backgroundColor: `${cat.color}22`, color: cat.color }}
                            >
                              {percent}%
                            </span>
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
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Wallet size={20} color="#10b981" />
                  Tài khoản & Ví liên kết
                </h3>
                <div className="total-balance-pill">
                  Tổng: <strong>{formatVND(stats.totalBalance)}</strong>
                </div>
              </div>

              <div>
                {accounts.map((acc) => {
                  const accPercent = stats.totalBalance > 0
                    ? Math.round((acc.balance / stats.totalBalance) * 100)
                    : 0;

                  return (
                    <div key={acc.id} className="account-card">
                      <div className="account-left">
                        <div
                          className="account-icon-box"
                          style={{ background: `${acc.color || '#10b981'}22`, color: acc.color || '#10b981' }}
                        >
                          {acc.id === 'acc_cash' ? '💵' : '🏦'}
                        </div>
                        <div className="account-info">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <h4>{acc.name}</h4>
                            <span className={`acc-type-pill ${acc.id === 'acc_cash' ? 'cash' : 'bank'}`}>
                              {acc.id === 'acc_cash' ? 'Tiền mặt' : 'Ngân hàng'}
                            </span>
                          </div>
                          <p>{acc.account_number || (acc.id === 'acc_cash' ? 'Tiền mặt trong ví' : 'Tài khoản chính')}</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <div className="account-balance">{formatVND(acc.balance)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            {accPercent}% tài sản
                          </span>
                          <button
                            type="button"
                            className="btn-reconcile"
                            onClick={() => {
                              setReconcileAccount(acc);
                              setReconcileAmount(String(acc.balance || 0));
                              setReconcileReason(acc.id === 'acc_cash' ? 'Kiểm kê ví tiền mặt' : 'Điều chỉnh số dư tài khoản');
                              setShowReconcileModal(true);
                            }}
                            title="Kiểm kê và điều chỉnh số dư"
                          >
                            ⚡ Kiểm kê
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ALL TRANSACTIONS */}
      {activeTab === 'transactions' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div className="section-header" style={{ flexWrap: 'wrap', gap: '14px' }}>
            <h3 className="section-title">
              <Layers size={22} color="#38bdf8" />
              Lịch sử giao dịch ({filteredTransactions.length})
            </h3>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Tìm nội dung, ngân hàng..."
                className="form-input"
                style={{ width: '220px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <CustomSelect
                value={filterStatus}
                onChange={setFilterStatus}
                style={{ minWidth: '175px' }}
                options={[
                  { value: 'ALL', label: 'Tất cả trạng thái' },
                  { value: 'PENDING', label: 'Chờ phân loại' },
                  { value: 'CONFIRMED', label: 'Đã phân loại' },
                  { value: 'IGNORED', label: 'Đã bỏ qua' }
                ]}
              />

              <CustomSelect
                value={filterType}
                onChange={setFilterType}
                style={{ minWidth: '145px' }}
                options={[
                  { value: 'ALL', label: 'Tất cả loại' },
                  { value: 'EXPENSE', label: 'Chi tiêu (-)' },
                  { value: 'INCOME', label: 'Thu nhập (+)' }
                ]}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Ngân hàng</th>
                  <th>Nội dung</th>
                  <th>Số tiền</th>
                  <th>Danh mục</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {formatTxTime(tx.transaction_time, tx.created_at)}
                    </td>
                    <td>
                      <span className="pending-bank-badge">{tx.bank_name || 'Ngân hàng'}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{tx.description}</td>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <span className={tx.type === 'INCOME' ? 'stat-value income' : 'stat-value expense'} style={{ fontSize: '1rem' }}>
                        {tx.type === 'EXPENSE' ? '-' : '+'}
                        {formatVND(tx.amount)}
                      </span>
                    </td>
                    <td>
                      {tx.category_name ? (
                        <span
                          className="badge"
                          style={{
                            background: `${tx.category_color}22`,
                            color: tx.category_color,
                            border: `1px solid ${tx.category_color}55`
                          }}
                        >
                          ● {tx.category_name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '0.82rem' }}>
                          Chưa gắn thẻ
                        </span>
                      )}
                    </td>
                    <td>
                      {tx.status === 'PENDING' && (
                        <span className="badge badge-pending">Cần bổ sung</span>
                      )}
                      {tx.status === 'CONFIRMED' && (
                        <span className="badge badge-confirmed">Đã chọn</span>
                      )}
                      {tx.status === 'IGNORED' && (
                        <span className="badge badge-ignored">Bỏ qua</span>
                      )}
                    </td>
                    <td>
                      {tx.status === 'PENDING' ? (
                        <button
                          className="btn btn-primary"
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                          onClick={() => {
                            setActiveTab('pending');
                          }}
                        >
                          Phân loại ngay
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Đã xử lý</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CATEGORIES & AUTO RULES */}
      {activeTab === 'rules' && (
        <div className="dashboard-columns">
          {/* Cột 1: Danh sách danh mục & Tạo mới */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag size={20} color="#10b981" />
              Danh mục chi tiêu & thu nhập ({categories.length})
            </h3>

            {/* Form thêm danh mục */}
            <form onSubmit={handleCreateCategory} style={{ marginBottom: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Tên danh mục mới (ví dụ: Tiền trọ, Thể thao...)"
                className="form-input"
                style={{ flex: 1, minWidth: '180px' }}
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                required
              />
              <CustomSelect
                value={newCatType}
                onChange={setNewCatType}
                style={{ minWidth: '130px' }}
                options={[
                  { value: 'EXPENSE', label: 'Chi tiêu' },
                  { value: 'INCOME', label: 'Thu nhập' }
                ]}
              />
              <input
                type="color"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
                style={{ width: '40px', height: '40px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '8px' }}
                title="Chọn màu đại diện"
              />
              <button type="submit" className="btn btn-primary" disabled={isAddingCat}>
                <Plus size={16} /> Thêm
              </button>
            </form>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
              {categories.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <span style={{ color: c.color, fontSize: '1.2rem' }}>●</span>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      {c.type === 'EXPENSE' ? 'Chi tiêu' : 'Thu nhập'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cột 2: Quy tắc từ khóa tự động */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={20} color="#38bdf8" />
              Quy tắc nhận diện từ khóa (Auto Tagging)
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Khi thông báo chứa từ khóa này, hệ thống sẽ ưu tiên đề xuất danh mục tương ứng lên nút đầu tiên.
            </p>

            <form onSubmit={handleCreateRule} style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Từ khóa (ví dụ: HIGHLANDS, GRAB...)"
                  className="form-input"
                  style={{ flex: 1, minWidth: '160px' }}
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                />
                <CustomSelect
                  value={newRuleCat}
                  onChange={setNewRuleCat}
                  style={{ minWidth: '190px' }}
                  options={categories.map((cat) => ({
                    value: cat.id,
                    label: cat.name
                  }))}
                />
                <button type="submit" className="btn btn-primary">
                  <Plus size={16} /> Thêm luật
                </button>
              </div>
            </form>

            <div>
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    marginBottom: '8px'
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#38bdf8' }}>
                    "{rule.keyword}"
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: `${rule.category_color}22`,
                      color: rule.category_color
                    }}
                  >
                    ● {rule.category_name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE PROMPT STYLE ACTIONABLE NOTIFICATION (Floating Interactive Prompt) */}
      {livePrompt && livePrompt.transaction && (
        <div className="google-prompt-overlay">
          <div className="prompt-header">
            <div className="prompt-badge">
              <span className="live-dot"></span>
              Thông báo biến động số dư mới
            </div>
            <button
              className="prompt-close"
              title="Đóng thông báo (để bổ sung sau trên Web)"
              onClick={() => {
                setLivePrompt(null);
                setActiveTab('pending');
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div className="prompt-body">
            <div className="prompt-bank-row">
              <span className="prompt-bank-name">
                🏦 {livePrompt.transaction.bank_name || 'Ngân hàng'}
              </span>
              <span
                className={`prompt-amount ${
                  livePrompt.transaction.type === 'INCOME' ? 'income' : 'expense'
                }`}
              >
                {livePrompt.transaction.type === 'EXPENSE' ? '-' : '+'}
                {formatVND(livePrompt.transaction.amount)}
              </span>
            </div>

            <div className="prompt-desc">
              {livePrompt.transaction.description}
            </div>

            <div className="prompt-question">
              Chọn danh mục chi tiêu của bạn:
            </div>

            {(() => {
              const actions = (livePrompt.quickActions && livePrompt.quickActions.length > 0)
                ? livePrompt.quickActions
                : (categories && categories.length > 0)
                  ? categories.filter(c => c.type === (livePrompt.transaction.type || 'EXPENSE')).slice(0, 4)
                  : DEFAULT_QUICK_ACTIONS;

              return (
                <div className="prompt-actions-grid">
                  {actions.map((act) => (
                    <button
                      key={act.id}
                      className="prompt-cat-btn"
                      onClick={() => handleCategorize(livePrompt.transaction.id, act.id)}
                    >
                      <span style={{ color: act.color || '#38bdf8' }}>●</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {act.name}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}

            <div className="prompt-divider">
              <span>Hoặc gõ chi tiết để AI tự xếp</span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePromptAiCategorize(livePrompt.transaction.id);
              }}
              className="prompt-ai-form"
            >
              <div className="prompt-ai-input-wrap">
                <Sparkles size={15} color="#8b5cf6" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  className="prompt-ai-input"
                  placeholder="Gõ chi tiết (VD: bún bò huế 45k, cafe Highlands)..."
                  value={promptAiText}
                  onChange={(e) => setPromptAiText(e.target.value)}
                  disabled={isPromptAiAnalyzing}
                />
                <button
                  type="submit"
                  className="prompt-ai-btn"
                  disabled={isPromptAiAnalyzing || !promptAiText.trim()}
                >
                  {isPromptAiAnalyzing ? 'Đang lọc...' : '✨ AI Phân loại'}
                </button>
              </div>
            </form>

            <button
              className="prompt-skip-btn"
              onClick={() => {
                setLivePrompt(null);
                setActiveTab('pending');
              }}
            >
              Bỏ qua / Bổ sung sau trên trang Web ➔
            </button>
          </div>
        </div>
      )}

      {/* MODAL LÀM SẠCH DỮ LIỆU MẪU */}
      {showResetModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '460px',
              maxWidth: '100%',
              padding: '28px',
              background: '#0f172a',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(245, 158, 11, 0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc' }}>
                <Sparkles size={20} color="#f59e0b" />
                Làm sạch & Thiết lập ví của bạn
              </h3>
              <button
                className="prompt-close"
                onClick={() => setShowResetModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Hệ thống sẽ <strong>xóa toàn bộ các giao dịch mẫu</strong> (chỉ giữ lại danh mục thu/chi) và khởi tạo ví tài khoản thực tế cho bạn để bắt đầu ghi nhận dữ liệu thật.
            </p>

            <form onSubmit={handleResetData}>
              <div className="form-group">
                <label className="form-label">Tên tài khoản / Ngân hàng của bạn:</label>
                <input
                  type="text"
                  className="form-input"
                  value={cleanAccName}
                  onChange={(e) => setCleanAccName(e.target.value)}
                  placeholder="Ví dụ: Agribank Plus"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Số dư hiện tại (VNĐ):</label>
                <input
                  type="number"
                  className="form-input"
                  value={cleanBalance}
                  onChange={(e) => setCleanBalance(e.target.value)}
                  placeholder="Ví dụ: 5000000 (để trống nếu 0)"
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                  Bạn có thể nhập số dư thực tế trong tài khoản để bắt đầu theo dõi chính xác
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowResetModal(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
                  disabled={isResetting}
                >
                  {isResetting ? 'Đang xóa...' : 'Xác nhận làm sạch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CẤU HÌNH GOOGLE AI STUDIO API KEY */}
      {showApiKeyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '500px',
              maxWidth: '100%',
              padding: '28px',
              background: '#0f172a',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(139, 92, 246, 0.25)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc' }}>
                <Key size={20} color="#8b5cf6" />
                Cấu hình Google AI Studio API Key (Gemini)
              </h3>
              <button className="prompt-close" onClick={() => setShowApiKeyModal(false)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
              Google cung cấp gói <strong>Gemini 2.5 Flash hoàn toàn miễn phí</strong> (hàng ngàn lượt phân tích/ngày). Bạn chỉ cần lấy API Key 1 lần và dán vào đây:
            </p>

            <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '12px 14px', borderRadius: 'var(--radius-md)', marginBottom: '18px', border: '1px solid rgba(139, 92, 246, 0.25)', fontSize: '0.82rem', color: '#c4b5fd' }}>
              👉 Lấy API key miễn phí tại: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline', fontWeight: 600 }}>aistudio.google.com/app/apikey</a> (đăng nhập tài khoản Google $\rightarrow$ bấm "Create API key").
            </div>

            <form onSubmit={handleSaveApiKey}>
              <div className="form-group">
                <label className="form-label">Dán Gemini API Key của bạn vào đây:</label>
                <input
                  type="password"
                  className="form-input"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={hasGeminiKey ? `Đang dùng: ${maskedKey} (nhập mới để đổi)` : "AIzaSy..."}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowApiKeyModal(false)}
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' }}
                  disabled={isSavingKey}
                >
                  {isSavingKey ? 'Đang lưu...' : 'Lưu API Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KIỂM KÊ / ĐIỀU CHỈNH SỐ DƯ VÍ & TÀI KHOẢN */}
      {showReconcileModal && reconcileAccount && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '460px',
              maxWidth: '100%',
              padding: '28px',
              background: '#0f172a',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(245, 158, 11, 0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc' }}>
                <Banknote size={20} color="#f59e0b" />
                Kiểm kê số dư: {reconcileAccount.name}
              </h3>
              <button className="prompt-close" onClick={() => setShowReconcileModal(false)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
              Đếm số tiền thực tế bạn đang có trong túi hoặc tài khoản, hệ thống sẽ tự động cân đối và sinh bút toán điều chỉnh sổ sách.
            </p>

            <form onSubmit={handleReconcileSubmit}>
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.86rem', color: 'var(--text-dim)' }}>Số dư trên app hiện tại:</span>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>{formatVND(reconcileAccount.balance)}</span>
              </div>

              <div className="form-group">
                <label className="form-label">Số tiền thực tế đếm được (VNĐ):</label>
                <input
                  type="number"
                  className="form-input"
                  value={reconcileAmount}
                  onChange={(e) => setReconcileAmount(e.target.value)}
                  placeholder="Ví dụ: 350000"
                  autoFocus
                  required
                />
              </div>

              {/* Live difference calculation */}
              {(() => {
                const target = parseFloat(reconcileAmount);
                if (!isNaN(target)) {
                  const diff = target - (reconcileAccount.balance || 0);
                  const isPos = diff > 0;
                  const isNeg = diff < 0;
                  return (
                    <div className={`reconcile-diff-box ${isPos ? 'positive' : isNeg ? 'negative' : 'zero'}`}>
                      <span>Chênh lệch:</span>
                      <span>
                        {diff === 0
                          ? '0 ₫ (Khớp tuyệt đối)'
                          : `${isPos ? '+' : ''}${formatVND(diff)} (${isPos ? 'Dôi dư tiền' : 'Hụt tiền'})`}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="form-group" style={{ marginTop: '14px' }}>
                <label className="form-label">Lý do điều chỉnh / Ghi chú:</label>
                <input
                  type="text"
                  className="form-input"
                  value={reconcileReason}
                  onChange={(e) => setReconcileReason(e.target.value)}
                  placeholder="Ví dụ: Kiểm kê tiền mặt, tiền lẻ rơi, thối thừa..."
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowReconcileModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
                  disabled={isSubmittingReconcile}
                >
                  {isSubmittingReconcile ? 'Đang lưu...' : 'Xác nhận kiểm kê'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CÀI ĐẶT HỆ THỐNG & KẾT NỐI MACRODROID */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '560px',
              maxWidth: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              background: '#0f172a',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.15)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc' }}>
                <Settings size={20} color="#38bdf8" />
                Cài đặt kết nối & Webhook điện thoại
              </h3>
              <button className="prompt-close" onClick={() => setShowSettingsModal(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Webhook URL Box */}
            <div style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ fontWeight: 600 }}>Webhook URL của Server:</label>
              <div className="code-box" style={{ fontSize: '0.84rem', wordBreak: 'break-all' }}>
                {webhookUrl}
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    setCopiedWebhook(true);
                    setTimeout(() => setCopiedWebhook(false), 2000);
                  }}
                >
                  <Copy size={14} />
                  {copiedWebhook ? 'Đã sao chép!' : 'Sao chép Webhook URL'}
                </button>
              </div>
            </div>

            {/* Google AI Status & Quick Link */}
            <div style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: 'var(--radius-md)', padding: '14px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={16} /> Google Gemini AI
                </span>
                <span style={{ fontSize: '0.8rem', color: hasGeminiKey ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                  {hasGeminiKey ? '● Đã kết nối' : '○ Chưa có Key'}
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                {hasGeminiKey ? `API Key hiện tại: ${maskedKey}` : 'Cần API key của Google AI Studio để phân tích tự nhiên.'}
              </p>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '5px 12px' }}
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowApiKeyModal(true);
                }}
              >
                <Key size={14} /> Thiết lập / Đổi API Key
              </button>
            </div>

            {/* MacroDroid Quick Guide */}
            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' }}>
              <h4 style={{ color: '#fff', marginBottom: '8px' }}>Cấu hình MacroDroid trên điện thoại:</h4>
              <ol style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li>
                  <strong>Trigger:</strong> Chọn <em>Thông báo (Notification)</em> $\rightarrow$ Chọn Agribank Plus (hoặc app ngân hàng bạn dùng).
                </li>
                <li>
                  <strong>Action:</strong> Chọn <em>HTTP Request (POST)</em> $\rightarrow$ Dán Webhook URL ở trên.
                </li>
                <li>
                  <strong>Body (JSON):</strong>
                  <div className="code-box" style={{ margin: '6px 0', fontSize: '0.78rem' }}>
{`{
  "content": "[notification_text]",
  "title": "[notification_title]",
  "timestamp": "[hour]:[minute] [day]-[month]-[year]"
}`}
                  </div>
                </li>
              </ol>
            </div>

            <div style={{ marginTop: '22px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowSettingsModal(false)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
