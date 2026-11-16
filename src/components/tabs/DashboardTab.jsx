import React, { useState, useEffect } from 'react';
import { 
  Activity, PieChart as PieChartIcon, Wallet, Sparkles, 
  Coins, Smartphone, Building2, SlidersHorizontal,
  Eye, EyeOff, ArrowUpRight, ArrowDownLeft,
  X, Clock, ChevronRight, Pencil
} from 'lucide-react';
import InteractiveDonutChart from '../charts/InteractiveDonutChart.jsx';
import InteractiveTrendLineChart from '../charts/InteractiveTrendLineChart.jsx';
import DebtLoanTracker from '../debt/DebtLoanTracker.jsx';
import MonthlyGoalCard from '../common/MonthlyGoalCard.jsx';
import { formatVND, formatTxTime } from '../../utils/formatters.js';

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
  last7DaysData = [],
  monthlyBudgetGoal = 500000,
  currentMonthSavings = 0,
  currentMonthIncome = 0,
  currentMonthExpense = 0,
  prevMonthSavings = 0,
  currentMonthNumber = null,
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
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

  const selectedCategory = categoryBreakdown.find((c) => c.id === selectedCategoryId) || null;

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

  const sparkValues =
    last7DaysData.length > 0
      ? last7DaysData.map((d) => Number(d.amount || 0))
      : [0, 0, 0, 0, 0, 0, 0];
  const sparkMax = Math.max(...sparkValues, 1);
  const sparkMin = Math.min(...sparkValues, 0);
  const sparkSpan = Math.max(sparkMax - sparkMin, 1);
  const sparkCoords = sparkValues.map((val, idx) => {
    const x = sparkValues.length > 1 ? (idx / (sparkValues.length - 1)) * 114 + 3 : 60;
    const y = 40 - ((val - sparkMin) / sparkSpan) * 28;
    return { x, y };
  });
  const sparkPoints = sparkCoords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const sparkLastPoint = sparkCoords[sparkCoords.length - 1] || { x: 117, y: 40 };

  return (
    <div className="dashboard-content-wrapper">
      {/* 1. Hero Tổng số dư khả dụng + Sparkline 7 ngày + Báo cáo AI */}
      <section className="fintech-hero-card">
        <div className="hero-top-row">
          <div className="hero-balance-block">
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
              {hideBalance ? '•••••••• ₫' : formatVND(totalBalance)}
            </div>
          </div>

          <div className="hero-sparkline-box" aria-hidden="true">
            <svg viewBox="0 0 120 48" width="100%" height="100%">
              <defs>
                <linearGradient id="heroSparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
              </defs>
              <polygon
                fill="url(#heroSparkFill)"
                points={`3,44 ${sparkPoints} ${sparkLastPoint.x.toFixed(1)},44`}
              />
              <polyline
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparkPoints}
              />
              <circle
                cx={sparkLastPoint.x}
                cy={sparkLastPoint.y}
                r="3.5"
                fill="#38bdf8"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </svg>
          </div>
        </div>

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

      {/* 3. Mục tiêu tiết kiệm tháng (tách biệt tháng trước) */}
      <MonthlyGoalCard
        monthlyBudgetGoal={monthlyBudgetGoal}
        currentMonthSavings={currentMonthSavings}
        currentMonthIncome={currentMonthIncome}
        currentMonthExpense={currentMonthExpense}
        prevMonthSavings={prevMonthSavings}
        currentMonthNumber={currentMonthNumber}
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
                <PieChartIcon size={20} color="#06b6d4" style={{ flexShrink: 0 }} />
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

            <div className="category-tx-list">
              {(selectedCategory.items || []).length === 0 ? (
                <p className="category-tx-empty">Chưa có khoản chi nào trong danh mục này.</p>
              ) : (
                (selectedCategory.items || []).map((tx) => (
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
