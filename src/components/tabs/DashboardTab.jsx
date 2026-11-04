import React from 'react';
import { 
  Activity, PieChart as PieChartIcon, Wallet, Sparkles, 
  Coins, Smartphone, Building2, SlidersHorizontal 
} from 'lucide-react';
import InteractiveDonutChart from '../charts/InteractiveDonutChart.jsx';
import InteractiveTrendLineChart from '../charts/InteractiveTrendLineChart.jsx';
import DebtLoanTracker from '../debt/DebtLoanTracker.jsx';
import { formatVND } from '../../utils/formatters.js';

export default function DashboardTab({
  timeFilter = 'ALL',
  timeLabel = 'Toàn bộ thời gian',
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
  onReconcile,
  onOpenDailyReport,
  onEditTransaction
}) {
  return (
    <div className="dashboard-content-wrapper">
      {/* 1. Banner Báo cáo tài chính cuối ngày AI Briefing (Đẩy lên đầu trang) */}
      <div className="glass-panel ai-briefing-banner">
        <div className="ai-briefing-left">
          <div className="ai-briefing-icon-box">
            <Sparkles size={20} color="#fff" />
          </div>
          <div className="ai-briefing-text-wrap">
            <div className="ai-briefing-title-row">
              <h4 className="ai-briefing-heading">
                Báo cáo tài chính cuối ngày
              </h4>
              <span className="ai-briefing-gemini-pill">
                Trợ lý Gemini
              </span>
            </div>
            <p className="ai-briefing-desc">
              Rà soát chi tiêu & cảnh báo biến động
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenDailyReport}
          className="ai-briefing-action-btn"
        >
          <Sparkles size={15} />
          <span>Xem báo cáo</span>
        </button>
      </div>

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
                Loại trừ các khoản cho vay & chuyển tiền nội bộ
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                  <div
                    style={{
                      textAlign: 'right',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '4px'
                    }}
                  >
                    <div className="account-balance tabular-nums">{formatVND(acc.balance)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
                      <span style={{ fontSize: '0.73rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {accPercent}% tài sản
                      </span>
                      <button
                        type="button"
                        className="btn-reconcile"
                        onClick={() => onReconcile(acc)}
                        title="Kiểm kê và điều chỉnh số dư"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        <SlidersHorizontal size={11} style={{ display: 'inline', marginRight: '4px', flexShrink: 0 }} />
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
    </div>
  );
}
