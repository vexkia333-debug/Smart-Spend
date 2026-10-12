import React from 'react';
import { Banknote, X } from 'lucide-react';
import { formatVND, formatNumberWithCommas, parseNumberFromCommas } from '../../utils/formatters.js';

export default function ReconcileModal({
  isOpen,
  account,
  onClose,
  reconcileAmount,
  setReconcileAmount,
  reconcileReason,
  setReconcileReason,
  isSubmitting,
  handleSubmit
}) {
  if (!isOpen || !account) return null;

  const handleAmountChange = (e) => {
    const raw = e.target.value;
    if (!raw) {
      setReconcileAmount('');
      return;
    }
    const formatted = formatNumberWithCommas(raw);
    setReconcileAmount(formatted);
  };

  return (
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc' }}>
            <Banknote size={20} color="#f59e0b" />
            Kiểm kê số dư: {account.name}
          </h3>
          <button className="prompt-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p
          style={{
            fontSize: '0.88rem',
            color: 'var(--text-muted)',
            marginBottom: '16px',
            lineHeight: '1.5'
          }}
        >
          Đếm số tiền thực tế bạn đang có trong túi hoặc tài khoản, hệ thống sẽ tự động cân đối và sinh bút toán điều chỉnh sổ sách.
        </p>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span style={{ fontSize: '0.86rem', color: 'var(--text-dim)' }}>
              Số dư trên app hiện tại:
            </span>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {formatVND(account.balance)}
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Số tiền thực tế đếm được (VNĐ):</label>
            <input
              type="text"
              inputMode="numeric"
              className="form-input"
              value={reconcileAmount}
              onChange={handleAmountChange}
              placeholder="Ví dụ: 350,000"
              autoFocus
              required
            />
          </div>

          {/* Live difference calculation */}
          {(() => {
            if (reconcileAmount === '' || reconcileAmount === undefined || reconcileAmount === null) return null;
            const target = parseNumberFromCommas(reconcileAmount);
            const diff = target - (account.balance || 0);
            const isPos = diff > 0;
            const isNeg = diff < 0;
            return (
              <div
                className={`reconcile-diff-box ${
                  isPos ? 'positive' : isNeg ? 'negative' : 'zero'
                }`}
              >
                <span>Chênh lệch:</span>
                <span>
                  {diff === 0
                    ? '0 ₫ (Khớp tuyệt đối)'
                    : `${isPos ? '+' : ''}${formatVND(diff)} (${
                        isPos ? 'Dôi dư tiền' : 'Hụt tiền'
                      })`}
                </span>
              </div>
            );
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
              onClick={onClose}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                flex: 1,
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Đang lưu...' : 'Xác nhận kiểm kê'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
