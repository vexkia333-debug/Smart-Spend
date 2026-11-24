import React from 'react';
import { PiggyBank, Clock, Pencil } from 'lucide-react';
import { formatTxTime } from '../../utils/formatters.js';

export default function MonthlyGoalCard({
  savingsTransactions = [],
  savingsStats = { totalSaved: 0, thisMonthSaved: 0, count: 0 },
  accounts = [],
  formatVND,
  onEditTransaction
}) {
  const accMap = {};
  for (const a of accounts) accMap[a.id] = a.name;

  const formatSignedVND = (val) => {
    const num = Number(val || 0);
    const absText = formatVND(Math.abs(num));
    return num < 0 ? `-${absText}` : `+${absText}`;
  };

  return (
    <section className="glass-panel budget-goal-card">
      <div className="budget-goal-top">
        <div className="budget-goal-heading">
          <span className="budget-goal-icon">
            <PiggyBank size={18} />
          </span>
          <div>
            <h4>Lịch sử tiết kiệm</h4>
            <p>Tự động ghi nhận từ thông báo gửi &amp; rút quỹ tiết kiệm</p>
          </div>
        </div>
      </div>

      <div className="savings-history-summary">
        <div className="savings-summary-pill is-total">
          <span className="savings-summary-label">Quỹ tiết kiệm hiện có</span>
          <strong
            className={`savings-summary-val tabular-nums ${savingsStats.totalSaved < 0 ? 'is-negative' : ''}`}
          >
            {formatVND(savingsStats.totalSaved)}
          </strong>
        </div>
        <div className="savings-summary-pill">
          <span className="savings-summary-label">Tháng này</span>
          <strong
            className={`savings-summary-val tabular-nums ${savingsStats.thisMonthSaved < 0 ? 'is-negative' : ''}`}
          >
            {formatSignedVND(savingsStats.thisMonthSaved)}
          </strong>
        </div>
        <div className="savings-summary-pill">
          <span className="savings-summary-label">Giao dịch quỹ</span>
          <strong className="savings-summary-val tabular-nums">{savingsStats.count} lần</strong>
        </div>
      </div>

      {savingsTransactions.length === 0 ? (
        <div className="savings-empty-note">
          Chưa có giao dịch nào trong quỹ tiết kiệm. Khi nhận thông báo ngân hàng và nhập nội dung{' '}
          <strong>&ldquo;tiết kiệm cho tháng ...&rdquo;</strong> hoặc{' '}
          <strong>&ldquo;rút tiền từ quỹ tiết kiệm&rdquo;</strong>, hệ thống sẽ tự động cập nhật vào
          đây.
        </div>
      ) : (
        <div className="savings-tx-list">
          {savingsTransactions.map((tx) => {
            const isWithdraw = tx.category_id === 'cat_savings_withdraw';
            const accLabel =
              tx.account_name || (tx.account_id && accMap[tx.account_id]) || tx.bank_name || 'Ví';

            return (
              <div key={tx.id} className="savings-tx-row">
                <div className="savings-tx-left">
                  <div className="savings-tx-desc">
                    {tx.description || (isWithdraw ? 'Rút từ quỹ tiết kiệm' : 'Gửi tiết kiệm')}
                  </div>
                  <div className="savings-tx-meta">
                    <span
                      className={`savings-type-badge ${isWithdraw ? 'is-withdraw' : 'is-deposit'}`}
                    >
                      {isWithdraw ? 'Rút từ quỹ' : 'Gửi tiết kiệm'}
                    </span>
                    <span className="savings-tx-time">
                      <Clock size={12} />
                      <span>{formatTxTime(tx.transaction_time, tx.created_at) || 'Vừa ghi'}</span>
                    </span>
                    <span className="savings-tx-acc">{accLabel}</span>
                  </div>
                </div>

                <div className="savings-tx-right">
                  <strong
                    className={`savings-tx-amount tabular-nums ${isWithdraw ? 'is-withdraw' : ''}`}
                  >
                    {isWithdraw ? '-' : '+'}
                    {formatVND(tx.amount)}
                  </strong>
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
            );
          })}
        </div>
      )}
    </section>
  );
}
