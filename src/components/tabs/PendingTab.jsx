import React from 'react';
import { Clock, CheckCircle2, Zap } from 'lucide-react';
import { formatVND, formatTxTime } from '../../utils/formatters.js';

export default function PendingTab({
  pendingList = [],
  categories = [],
  handleCategorize,
  handleIgnore,
  handleSimulate
}) {
  return (
    <section>
      <div className="section-header">
        <h2 className="section-title">
          <Clock size={22} color="#f59e0b" />
          Giao dịch cần bổ sung danh mục ({pendingList.length})
        </h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          Những biến động số dư khi bạn vuốt bỏ hoặc chưa kịp chọn trên điện thoại
        </p>
      </div>

      {pendingList.length === 0 ? (
        <div className="glass-panel empty-state">
          <div className="empty-icon">
            <CheckCircle2 size={32} />
          </div>
          <h3 style={{ fontSize: '1.2rem', color: '#f8fafc' }}>Tuyệt vời! Không còn giao dịch tồn đọng</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '420px', fontSize: '0.9rem' }}>
            Tất cả các khoản tiền ra/vào đã được phân loại đầy đủ. Khi có thông báo ngân hàng mới, hệ thống sẽ đẩy thẳng lên đây!
          </p>
          <button
            className="btn btn-secondary"
            style={{ marginTop: '10px' }}
            onClick={handleSimulate}
          >
            <Zap size={16} /> Bắn thử 1 thông báo để kiểm tra
          </button>
        </div>
      ) : (
        <div className="pending-list">
          {pendingList.map((tx) => (
            <div key={tx.id} className="pending-card glass-panel">
              <div className="pending-card-top">
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="pending-bank-badge">
                      🏦 {tx.bank_name || 'Ngân hàng'}
                    </span>
                    <span className="badge badge-pending">Chờ gắn thẻ</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      {formatTxTime(tx.transaction_time, tx.created_at)}
                    </span>
                  </div>
                  <div className="pending-desc">{tx.description}</div>
                  {tx.raw_content && (
                    <div className="pending-raw">Nội dung gốc: {tx.raw_content}</div>
                  )}
                </div>

                <div className="pending-amount">
                  {tx.type === 'EXPENSE' ? '-' : '+'}
                  {formatVND(tx.amount)}
                </div>
              </div>

              <div className="pending-categorize-row">
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  👉 Chọn nhanh danh mục:
                </span>

                <div className="category-pill-group">
                  {tx.type === 'EXPENSE' && (
                    <button
                      className="cat-pill-btn special-cash-pill"
                      onClick={() => handleCategorize(tx.id, 'cat_transfer_cash', 'Rút tiền vào Ví Tiền Mặt')}
                      title="Chuyển tiền từ ATM/ngân hàng vào Ví Tiền Mặt"
                    >
                      💵 Rút vào Ví Tiền Mặt
                    </button>
                  )}
                  {categories
                    .filter((c) => c.type === tx.type && c.id !== 'cat_transfer_cash')
                    .slice(0, 8)
                    .map((cat) => (
                      <button
                        key={cat.id}
                        className="cat-pill-btn"
                        onClick={() => handleCategorize(tx.id, cat.id)}
                      >
                        <span style={{ color: cat.color }}>●</span> {cat.name}
                      </button>
                    ))}
                </div>

                <button
                  className="btn btn-danger"
                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                  onClick={() => handleIgnore(tx.id)}
                >
                  Bỏ qua
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
