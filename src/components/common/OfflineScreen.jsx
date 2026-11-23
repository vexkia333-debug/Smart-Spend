import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

/**
 * Màn hình thông báo lỗi khi thiết bị không có kết nối Internet.
 */
export default function OfflineScreen({ onRetry, isChecking = false }) {
  return (
    <div className="offline-screen-overlay" role="alert" aria-live="assertive">
      <div className="offline-screen-card glass-panel">
        <div className="offline-icon-ring" aria-hidden="true">
          <WifiOff size={32} />
        </div>

        <h2 className="offline-title">Không có kết nối Internet</h2>
        <p className="offline-desc">
          SmartSpend cần kết nối mạng để đồng bộ số dư ví, giao dịch và báo cáo AI. Vui lòng kiểm tra Wi-Fi hoặc 4G/5G rồi thử lại.
        </p>

        <div className="offline-status-pill">
          <span className="offline-status-dot" />
          <span>{isChecking ? 'Đang kiểm tra kết nối…' : 'Đang mất kết nối · Tự động khôi phục khi có mạng'}</span>
        </div>

        <button
          type="button"
          className="btn btn-primary offline-retry-btn"
          onClick={onRetry}
          disabled={isChecking}
        >
          <RefreshCw size={16} className={isChecking ? 'spin' : ''} />
          <span>{isChecking ? 'Đang thử kết nối…' : 'Thử kết nối lại'}</span>
        </button>
      </div>
    </div>
  );
}
