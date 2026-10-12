import React from 'react';
import { Trash2, X, RefreshCw } from 'lucide-react';

export default function ResetTransactionsModal({
  isOpen,
  onClose,
  resetBalancesCheckbox,
  setResetBalancesCheckbox,
  isResettingTx,
  onConfirm
}) {
  if (!isOpen) return null;

  return (
    <div className="reset-modal-overlay" onClick={() => !isResettingTx && onClose()}>
      <div className="reset-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="reset-modal-header">
          <div className="reset-modal-title">
            <Trash2 size={20} color="#fb7185" />
            <span>Xóa Lịch Sử Giao Dịch</span>
          </div>
          <button
            className="prompt-close"
            onClick={() => !isResettingTx && onClose()}
            disabled={isResettingTx}
          >
            <X size={18} />
          </button>
        </div>

        <div className="reset-modal-body">
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            Bạn có chắc chắn muốn xóa toàn bộ lịch sử giao dịch để làm mới dữ liệu ghi chép chi tiêu?
          </p>

          <div className="reset-option-card selected" style={{ cursor: 'default' }}>
            <Trash2 size={20} color="#fb7185" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div className="reset-option-title">Xóa sạch toàn bộ lịch sử giao dịch</div>
              <div className="reset-option-desc">
                Xóa tất cả các bản ghi thu / chi và thông báo cũ. Danh mục chi tiêu và các tài khoản/ví liên kết vẫn được giữ nguyên.
              </div>
            </div>
          </div>

          <label className="reset-checkbox-label">
            <input
              type="checkbox"
              checked={resetBalancesCheckbox}
              onChange={(e) => setResetBalancesCheckbox(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span>Đồng thời đặt lại số dư tất cả tài khoản/ví về 0 VNĐ</span>
          </label>
        </div>

        <div className="reset-modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isResettingTx}
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={isResettingTx}
            style={{ minWidth: '135px' }}
          >
            {isResettingTx ? (
              <>
                <RefreshCw size={15} className="spin" /> Đang xóa...
              </>
            ) : (
              <>
                <Trash2 size={15} /> Xác nhận xóa
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
