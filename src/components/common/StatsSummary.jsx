import React from 'react';
import { Wallet, ArrowDownRight, ArrowUpRight, Clock } from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';

export default function StatsSummary({
  totalBalance,
  accountsCount,
  displayedExpense,
  displayedIncome,
  displayedPendingCount,
  timeLabel
}) {
  return (
    <div className="stats-grid">
      <div className="stat-card glass-panel">
        <div className="stat-card-header">
          <span className="stat-label">Tổng số dư khả dụng</span>
          <div className="stat-icon" style={{ color: '#38bdf8' }}>
            <Wallet size={20} />
          </div>
        </div>
        <div className="stat-value">{formatVND(totalBalance)}</div>
        <div className="stat-sub">{accountsCount} ví & tài khoản ngân hàng</div>
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
  );
}
