import React from 'react';
import { Trash2, X, RefreshCw } from 'lucide-react';

export default function ResetTransactionsModal({
  isOpen,
  onClose,
  resetOption,
  setResetOption,
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
            <span>Reset Lịch Sử Giao Dịch</span>
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
            Hành động này cho phép bạn làm sạch lịch sử để bắt đầu ghi chép chi tiêu mới, hoặc khôi phục dữ liệu mẫu để trải nghiệm.
          </p>

          <div
            className={`reset-option-card ${resetOption === 'clear_only' ? 'selected' : ''}`}
            onClick={() => setResetOption('clear_only')}
          >
            <input
              type="radio"
              name="resetOption"
              checked={resetOption === 'clear_only'}
              onChange={() => setResetOption('clear_only')}
              style={{ marginTop: '3px', cursor: 'pointer' }}
            />
            <div>
              <div className="reset-option-title">🗑️ Xóa sạch toàn bộ lịch sử giao dịch</div>
              <div className="reset-option-desc">
                Xóa sạch các bản ghi thu / chi và thông báo cũ. Danh mục và tài khoản liên kết vẫn được giữ nguyên.
              </div>
            </div>
          </div>

          <div
            className={`reset-option-card ${resetOption === 'restore_demo' ? 'selected' : ''}`}
            onClick={() => setResetOption('restore_demo')}
          >
            <input
              type="radio"
              name="resetOption"
              checked={resetOption === 'restore_demo'}
              onChange={() => setResetOption('restore_demo')}
              style={{ marginTop: '3px', cursor: 'pointer' }}
            />
            <div>
              <div className="reset-option-title">🔄 Khôi phục dữ liệu demo mẫu ban đầu</div>
              <div className="reset-option-desc">
                Tái lập bộ dữ liệu mẫu (các giao dịch cơm, bún bò, cà phê Highlands, lương, tiền điện...) đã phân loại sẵn.
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
                <RefreshCw size={15} className="spin" /> Đang xử lý...
              </>
            ) : (
              <>
                <Trash2 size={15} /> Xác nhận Reset
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
