import React, { useState } from 'react';
import { PiggyBank, Edit3, ChevronDown, ChevronUp } from 'lucide-react';

export function MonthlyGoalCard({
  savingsTransactions = [],
  savingsStats = { totalSaved: 0, thisMonthSaved: 0, count: 0 },
  accounts = [],
  formatVND,
  onEditTransaction
}) {
  const [showAll, setShowAll] = useState(false);

  const visibleList = showAll ? savingsTransactions : savingsTransactions.slice(0, 5);
  const accMap = {};
  for (const a of accounts) accMap[a.id] = a.name;

  const formatDate = (tx) => {
    const raw = tx.transaction_time || tx.created_at;
    if (!raw) return '';
    const d = new Date(raw.replace(' ', 'T'));
    if (isNaN(d.getTime())) return raw.slice(0, 10);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatSignedVND = (val) => {
    const num = Number(val || 0);
    const absText = formatVND(Math.abs(num));
    return num < 0 ? `-${absText}` : `+${absText}`;
  };

  return (
    <div className="monthly-goal-card">
      <div className="goal-card-header">
        <div className="goal-title-group">
          <div className="goal-icon-badge">
            <PiggyBank size={18} />
          </div>
          <div>
            <div className="goal-title">Lịch sử tiết kiệm</div>
            <div className="goal-subtitle">
              Tự động ghi nhận từ thông báo gửi &amp; rút quỹ tiết kiệm
            </div>
          </div>
        </div>
      </div>

      {/* Summary strip */}
      <div className="savings-history-summary">
        <div className="savings-summary-pill">
          <span className="savings-summary-label">Quỹ tiết kiệm hiện có</span>
          <strong
            className={`savings-summary-val ${savingsStats.totalSaved < 0 ? 'is-negative' : ''}`}
          >
            {formatVND(savingsStats.totalSaved)}
          </strong>
        </div>
        <div className="savings-summary-pill">
          <span className="savings-summary-label">Tháng này</span>
          <strong
            className={`savings-summary-val ${savingsStats.thisMonthSaved < 0 ? 'is-negative' : ''}`}
          >
            {formatSignedVND(savingsStats.thisMonthSaved)}
          </strong>
        </div>
        <div className="savings-summary-pill">
          <span className="savings-summary-label">Giao dịch quỹ</span>
          <strong className="savings-summary-val">{savingsStats.count} lần</strong>
        </div>
      </div>

      {/* History list */}
      {savingsTransactions.length === 0 ? (
        <div className="savings-empty-state">
          Chưa có giao dịch nào trong quỹ tiết kiệm. Khi nhận thông báo ngân hàng và nhập nội dung{' '}
          <strong>&ldquo;tiết kiệm cho tháng ...&rdquo;</strong> hoặc{' '}
          <strong>&ldquo;rút tiền từ quỹ tiết kiệm&rdquo;</strong>, hệ thống sẽ tự động cập nhật vào
          đây.
        </div>
      ) : (
        <div className="savings-tx-list">
          {visibleList.map((tx) => {
            const isWithdraw = tx.category_id === 'cat_savings_withdraw';
            return (
              <div key={tx.id} className="savings-tx-row">
                <div className="savings-tx-info">
                  <div className="savings-tx-desc">
                    {tx.description || (isWithdraw ? 'Rút từ quỹ tiết kiệm' : 'Gửi tiết kiệm')}
                  </div>
                  <div className="savings-tx-meta">
                    <span
                      className={`savings-type-badge ${isWithdraw ? 'is-withdraw' : 'is-deposit'}`}
                    >
                      {isWithdraw ? 'Rút từ quỹ' : 'Gửi tiết kiệm'}
                    </span>
                    <span>•</span>
                    <span>{formatDate(tx)}</span>
                    {tx.account_id && accMap[tx.account_id] && (
                      <>
                        <span>•</span>
                        <span>{accMap[tx.account_id]}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="savings-tx-right">
                  <span className={`savings-tx-amount ${isWithdraw ? 'is-withdraw' : ''}`}>
                    {isWithdraw ? '-' : '+'}
                    {formatVND(tx.amount)}
                  </span>
                  {onEditTransaction && (
                    <button
                      type="button"
                      className="savings-tx-edit-btn"
                      onClick={() => onEditTransaction(tx)}
                      title="Chỉnh sửa giao dịch"
                    >
                      <Edit3 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {savingsTransactions.length > 5 && (
            <button
              type="button"
              className="savings-show-more-btn"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? (
                <>
                  Thu gọn <ChevronUp size={14} />
                </>
              ) : (
                <>
                  Xem tất cả ({savingsTransactions.length}) <ChevronDown size={14} />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default MonthlyGoalCard;
