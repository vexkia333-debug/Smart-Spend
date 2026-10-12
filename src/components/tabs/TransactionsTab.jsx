import React from 'react';
import { Layers, Trash2 } from 'lucide-react';
import CustomSelect from '../common/CustomSelect.jsx';
import { formatVND, formatTxTime } from '../../utils/formatters.js';

export default function TransactionsTab({
  filteredTransactions = [],
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
  filterType,
  setFilterType,
  txSortOrder,
  setTxSortOrder,
  onOpenResetModal,
  onNavigateToPending
}) {
  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div
        className="section-header"
        style={{
          flexWrap: 'wrap',
          gap: '14px',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h3 className="section-title" style={{ margin: 0 }}>
            <Layers size={22} color="#38bdf8" />
            Lịch sử giao dịch ({filteredTransactions.length})
          </h3>
          <button
            type="button"
            className="btn btn-reset-tx"
            onClick={onOpenResetModal}
            title="Xóa / Đặt lại lịch sử giao dịch"
          >
            <Trash2 size={15} />
            <span>Reset lịch sử</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Tìm nội dung, ngân hàng..."
            className="form-input"
            style={{ width: '220px' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <CustomSelect
            value={filterStatus}
            onChange={setFilterStatus}
            style={{ minWidth: '175px' }}
            options={[
              { value: 'ALL', label: 'Tất cả trạng thái' },
              { value: 'PENDING', label: 'Chờ phân loại' },
              { value: 'CONFIRMED', label: 'Đã phân loại' },
              { value: 'IGNORED', label: 'Đã bỏ qua' }
            ]}
          />

          <CustomSelect
            value={filterType}
            onChange={setFilterType}
            style={{ minWidth: '145px' }}
            options={[
              { value: 'ALL', label: 'Tất cả loại' },
              { value: 'EXPENSE', label: 'Chi tiêu (-)' },
              { value: 'INCOME', label: 'Thu nhập (+)' }
            ]}
          />
        </div>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Layers size={28} />
          </div>
          <h4>Không có giao dịch nào phù hợp</h4>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            Hãy thử thay đổi bộ lọc hoặc thêm giao dịch mới.
          </p>
        </div>
      ) : (
        <>
          {/* DESKTOP TABLE VIEW (HIỂN THỊ KHI MÀN HÌNH >= 768px) */}
          <div className="desktop-tx-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setTxSortOrder((prev) => (prev === 'DESC' ? 'ASC' : 'DESC'))}
                    title="Nhấn để đổi thứ tự sắp xếp thời gian"
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      Thời gian
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: '#38bdf8',
                          background: 'rgba(56, 189, 248, 0.14)',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 600
                        }}
                      >
                        {txSortOrder === 'DESC' ? '↓ Gần nhất' : '↑ Cũ nhất'}
                      </span>
                    </span>
                  </th>
                  <th>Ngân hàng</th>
                  <th>Nội dung</th>
                  <th>Số tiền</th>
                  <th>Danh mục</th>
                  <th>Trạng thái</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {formatTxTime(tx.transaction_time, tx.created_at)}
                    </td>
                    <td>
                      <span className="pending-bank-badge">{tx.bank_name || 'Ngân hàng'}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{tx.description}</td>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <span
                        className={tx.type === 'INCOME' ? 'stat-value income' : 'stat-value expense'}
                        style={{ fontSize: '1rem' }}
                      >
                        {tx.type === 'EXPENSE' ? '-' : '+'}
                        {formatVND(tx.amount)}
                      </span>
                    </td>
                    <td>
                      {tx.category_name ? (
                        <span
                          className="badge"
                          style={{
                            background: `${tx.category_color}22`,
                            color: tx.category_color,
                            border: `1px solid ${tx.category_color}55`
                          }}
                        >
                          ● {tx.category_name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '0.82rem' }}>
                          Chưa gắn thẻ
                        </span>
                      )}
                    </td>
                    <td>
                      {tx.status === 'PENDING' && (
                        <span className="badge badge-pending">Cần bổ sung</span>
                      )}
                      {tx.status === 'CONFIRMED' && (
                        <span className="badge badge-confirmed">Đã chọn</span>
                      )}
                      {tx.status === 'IGNORED' && (
                        <span className="badge badge-ignored">Bỏ qua</span>
                      )}
                    </td>
                    <td>
                      {tx.status === 'PENDING' ? (
                        <button
                          className="btn btn-primary"
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                          onClick={onNavigateToPending}
                        >
                          Phân loại ngay
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Đã xử lý</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARDS VIEW (DỮ LIỆU CHUYỂN THÀNH KHỐI TRÊN MOBILE ĐỂ DỄ THEO DÕI) */}
          <div className="mobile-tx-cards">
            {filteredTransactions.map((tx) => (
              <div key={tx.id} className="mobile-tx-card">
                <div className="mobile-tx-card-header">
                  <div className="mobile-tx-card-meta">
                    <span className="pending-bank-badge">{tx.bank_name || 'Ngân hàng'}</span>
                    <span className="mobile-tx-time">
                      {formatTxTime(tx.transaction_time, tx.created_at)}
                    </span>
                  </div>
                  <div className="mobile-tx-status">
                    {tx.status === 'PENDING' && (
                      <span className="badge badge-pending">Cần bổ sung</span>
                    )}
                    {tx.status === 'CONFIRMED' && (
                      <span className="badge badge-confirmed">Đã chọn</span>
                    )}
                    {tx.status === 'IGNORED' && (
                      <span className="badge badge-ignored">Bỏ qua</span>
                    )}
                  </div>
                </div>

                <div className="mobile-tx-card-body">
                  <div className="mobile-tx-desc">{tx.description}</div>
                  <div className="mobile-tx-amount-row">
                    <span
                      className={`mobile-tx-amount ${tx.type === 'INCOME' ? 'income' : 'expense'}`}
                    >
                      {tx.type === 'EXPENSE' ? '-' : '+'}
                      {formatVND(tx.amount)}
                    </span>
                  </div>
                </div>

                <div className="mobile-tx-card-footer">
                  <div className="mobile-tx-category">
                    {tx.category_name ? (
                      <span
                        className="badge"
                        style={{
                          background: `${tx.category_color}22`,
                          color: tx.category_color,
                          border: `1px solid ${tx.category_color}55`
                        }}
                      >
                        ● {tx.category_name}
                      </span>
                    ) : (
                      <span className="mobile-tx-uncat">Chưa gắn thẻ</span>
                    )}
                  </div>

                  {tx.status === 'PENDING' ? (
                    <button
                      className="btn btn-primary"
                      style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                      onClick={onNavigateToPending}
                    >
                      Phân loại ngay
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Đã xử lý</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
