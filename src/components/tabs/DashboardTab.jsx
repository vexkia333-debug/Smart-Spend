import React from 'react';
import { Activity, TrendingUp, PieChart as PieChartIcon, Wallet, Sparkles } from 'lucide-react';
import InteractiveDonutChart from '../charts/InteractiveDonutChart.jsx';
import InteractiveTrendLineChart from '../charts/InteractiveTrendLineChart.jsx';
import { formatVND } from '../../utils/formatters.js';

export default function DashboardTab({
  timeLabel,
  spendRatio,
  savingsRate,
  netSavings,
  displayedIncome,
  displayedExpense,
  last7DaysData = [],
  maxDayAmount = 1,
  transactions = [],
  categoryBreakdown = [],
  hoveredCatId,
  setHoveredCatId,
  accounts = [],
  totalBalance = 0,
  onReconcile,
  onOpenDailyReport
}) {
  return (
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
                ? '🌟 Dòng tiền rất tốt'
                : spendRatio <= 80
                ? '👍 Dòng tiền ổn định'
                : spendRatio <= 100
                ? '⚠️ Cận biên thu nhập'
                : '🚨 Chi vượt thu'}
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
              <span
                className={`health-metric-val ${
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
              const barHeightPct =
                maxDayAmount > 0 ? Math.max(8, Math.round((d.amount / maxDayAmount) * 100)) : 8;
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

      {/* Banner Báo cáo tài chính cuối ngày AI */}
      <div
        className="glass-panel"
        style={{
          marginBottom: '20px',
          padding: '16px 20px',
          borderRadius: '18px',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.16), rgba(59, 130, 246, 0.12))',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 8px 24px rgba(139, 92, 246, 0.15)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(139, 92, 246, 0.45)',
              flexShrink: 0
            }}
          >
            <Sparkles size={22} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                Báo cáo tài chính cuối ngày (AI Briefing)
              </h4>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'rgba(139, 92, 246, 0.25)',
                  color: '#c084fc',
                  border: '1px solid rgba(139, 92, 246, 0.4)'
                }}
              >
                Trợ lý Gemini
              </span>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Rà soát mức chi tiêu hôm nay, phát hiện các khoản bất thường và tư vấn chỉnh sửa danh mục kịp thời
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenDailyReport}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '12px',
            fontSize: '0.86rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            border: 'none',
            color: '#fff',
            boxShadow: '0 4px 16px rgba(139, 92, 246, 0.4)',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <Sparkles size={16} />
          <span>Xem báo cáo hôm nay</span>
        </button>
      </div>

      {/* Biểu đồ đường xu hướng Nguồn tiền & Thu - Chi */}
      <InteractiveTrendLineChart transactions={transactions} accounts={accounts} formatVND={formatVND} />

      <div className="dashboard-columns">
        {/* Cột trái: Phân bổ danh mục chi tiêu với Interactive Donut */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '18px'
            }}
          >
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <PieChartIcon size={20} color="#06b6d4" />
              Cơ cấu chi tiêu theo nhóm ({timeLabel})
            </h3>
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
              Chưa có dữ liệu chi tiêu trong kỳ ({timeLabel}).
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
                      <span
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600 }}
                      >
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '18px'
            }}
          >
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Wallet size={20} color="#10b981" />
              Tài khoản & Ví liên kết
            </h3>
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
                      {acc.id === 'acc_cash' ? '💵' : acc.bank_code === 'VTM' ? '📱' : '🏦'}
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
                    <div className="account-balance">{formatVND(acc.balance)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {accPercent}% tài sản
                      </span>
                      <button
                        type="button"
                        className="btn-reconcile"
                        onClick={() => onReconcile(acc)}
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
  );
}
