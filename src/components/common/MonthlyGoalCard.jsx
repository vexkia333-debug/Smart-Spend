import React, { useState, useEffect } from 'react';
import { PiggyBank, Plus, Check, X, Clock, Pencil } from 'lucide-react';
import { formatTxTime } from '../../utils/formatters.js';
import CustomSelect from './CustomSelect.jsx';

const SAVINGS_PRESETS = [
  { label: '300k', value: 300000 },
  { label: '500k', value: 500000 },
  { label: '1 triệu', value: 1000000 },
  { label: '2 triệu', value: 2000000 }
];

export default function MonthlyGoalCard({
  savingsTransactions = [],
  savingsStats = { totalSaved: 0, thisMonthSaved: 0, count: 0 },
  accounts = [],
  formatVND,
  onQuickSaveSavings,
  onEditTransaction,
  openSavingsQuickAdd = false,
  onClearOpenSavingsQuickAdd
}) {
  const defaultAccountId =
    accounts.find((a) => a.id === 'acc_primary')?.id || accounts[0]?.id || 'acc_primary';

  const [isAdding, setIsAdding] = useState(false);
  const [amountInput, setAmountInput] = useState('500000');
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (openSavingsQuickAdd) {
      setIsAdding(true);
      setAmountInput('500000');
      setAccountId(defaultAccountId);
      setFeedback(null);
      if (onClearOpenSavingsQuickAdd) onClearOpenSavingsQuickAdd();
    }
  }, [openSavingsQuickAdd, defaultAccountId, onClearOpenSavingsQuickAdd]);

  const handleOpenAdd = () => {
    setAmountInput('500000');
    setAccountId(defaultAccountId);
    setDescription('');
    setFeedback(null);
    setIsAdding(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numeric = Number(String(amountInput).replace(/[^\d]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setFeedback('Vui lòng nhập số tiền tiết kiệm hợp lệ.');
      return;
    }
    if (!onQuickSaveSavings) return;

    setIsSaving(true);
    setFeedback(null);
    try {
      const ok = await onQuickSaveSavings({
        amount: numeric,
        account_id: accountId || defaultAccountId,
        description: description.trim()
      });
      if (ok) {
        setIsAdding(false);
        setDescription('');
      } else {
        setFeedback('Không thể lưu khoản tiết kiệm, thử lại sau.');
      }
    } finally {
      setIsSaving(false);
    }
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
            <p>Theo dõi các khoản trích tiết kiệm định kỳ (Agribank Plus)</p>
          </div>
        </div>

        {!isAdding && (
          <button type="button" className="budget-goal-edit-btn is-active" onClick={handleOpenAdd}>
            <Plus size={14} />
            <span>Ghi nhận 500k</span>
          </button>
        )}
      </div>

      <div className="savings-history-summary">
        <div className="savings-summary-pill is-total">
          <span className="savings-summary-label">Tổng đã tiết kiệm</span>
          <strong className="savings-summary-val tabular-nums">
            +{formatVND(savingsStats.totalSaved)}
          </strong>
        </div>
        <div className="savings-summary-pill">
          <span className="savings-summary-label">Tháng này</span>
          <strong className="savings-summary-val tabular-nums">
            +{formatVND(savingsStats.thisMonthSaved)}
          </strong>
        </div>
        <div className="savings-summary-pill">
          <span className="savings-summary-label">Số lần trích</span>
          <strong className="savings-summary-val tabular-nums">{savingsStats.count} lần</strong>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="budget-goal-edit-panel">
          <div className="budget-preset-chips">
            {SAVINGS_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`budget-preset-chip ${Number(amountInput) === preset.value ? 'active' : ''}`}
                onClick={() => setAmountInput(String(preset.value))}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="savings-quick-form-grid">
            <input
              type="number"
              min="10000"
              step="50000"
              className="budget-edit-input tabular-nums"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="Số tiền tiết kiệm (VNĐ)"
              disabled={isSaving}
            />
            <CustomSelect
              fullWidth
              value={accountId}
              onChange={(val) => setAccountId(val)}
              disabled={isSaving}
              options={accounts.map((acc) => ({
                value: acc.id,
                label: acc.name,
                color: acc.color || (acc.id === 'acc_cash' ? '#f59e0b' : '#10b981'),
                badge: acc.bank_code
              }))}
            />
          </div>

          <div className="budget-edit-controls">
            <input
              type="text"
              className="budget-edit-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú (VD: Trích lương tháng 11 vào Agribank Plus)"
              disabled={isSaving}
            />
            <button type="submit" className="budget-save-btn" disabled={isSaving}>
              <Check size={15} />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu'}</span>
            </button>
            <button
              type="button"
              className="budget-cancel-btn"
              onClick={() => setIsAdding(false)}
              disabled={isSaving}
              aria-label="Hủy"
            >
              <X size={15} />
            </button>
          </div>

          {feedback && <p className="budget-edit-error">{feedback}</p>}
        </form>
      )}

      {savingsTransactions.length === 0 ? (
        <div className="savings-empty-note">
          Chưa có giao dịch nào trong danh mục <strong>Tiền tiết kiệm</strong>. Khi nhận lương ngày 15, hệ thống sẽ gửi thông báo đề xuất để bạn trích 500k vào đây!
        </div>
      ) : (
        <div className="savings-tx-list">
          {savingsTransactions.map((tx) => (
            <div key={tx.id} className="savings-tx-row">
              <div className="savings-tx-left">
                <div className="savings-tx-desc">{tx.description || 'Tiền tiết kiệm'}</div>
                <div className="savings-tx-meta">
                  <span className="savings-tx-time">
                    <Clock size={12} />
                    <span>{formatTxTime(tx.transaction_time, tx.created_at) || 'Vừa ghi'}</span>
                  </span>
                  <span className="savings-tx-acc">{tx.account_name || tx.bank_name || 'Ví'}</span>
                </div>
              </div>

              <div className="savings-tx-right">
                <strong className="savings-tx-amount tabular-nums">+{formatVND(tx.amount)}</strong>
                {onEditTransaction && (
                  <button
                    type="button"
                    className="category-tx-edit-btn"
                    onClick={() => onEditTransaction(tx)}
                    title="Chỉnh sửa khoản tiết kiệm"
                    aria-label="Chỉnh sửa khoản tiết kiệm"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
