import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import CustomSelect from './CustomSelect.jsx';

/**
 * Thanh phân trang dùng chung cho các danh sách dài (Giao dịch, Nhật ký hệ thống, Theo dõi vay/nợ).
 */
export default function PaginationBar({
  totalItems = 0,
  currentPage = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  itemLabel = 'mục'
}) {
  if (totalItems === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const minOption = pageSizeOptions.length > 0 ? Math.min(...pageSizeOptions) : pageSize;

  // Ẩn thanh phân trang nếu toàn bộ danh sách ít hơn ngưỡng tối thiểu và chỉ có 1 trang
  if (totalPages <= 1 && totalItems <= minOption) {
    return null;
  }

  const startItem = (safePage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, safePage * pageSize);

  const getVisiblePages = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = [1];
    if (safePage > 3) pages.push('ellipsis-left');
    const rangeStart = Math.max(2, safePage - 1);
    const rangeEnd = Math.min(totalPages - 1, safePage + 1);
    for (let p = rangeStart; p <= rangeEnd; p++) {
      pages.push(p);
    }
    if (safePage < totalPages - 2) pages.push('ellipsis-right');
    pages.push(totalPages);
    return pages;
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="pagination-bar" role="navigation" aria-label="Phân trang">
      <div className="pagination-summary tabular-nums">
        Hiển thị <strong>{startItem}–{endItem}</strong> / {totalItems} {itemLabel}
      </div>

      <div className="pagination-controls-group">
        {totalPages > 1 && (
          <div className="pagination-pages">
            <button
              type="button"
              className="pagination-btn"
              onClick={() => onPageChange(safePage - 1)}
              disabled={safePage <= 1}
              aria-label="Trang trước"
              title="Trang trước"
            >
              <ChevronLeft size={15} />
            </button>

            {visiblePages.map((item) => {
              if (typeof item === 'string') {
                return (
                  <span key={item} className="pagination-ellipsis">
                    …
                  </span>
                );
              }
              return (
                <button
                  key={item}
                  type="button"
                  className={`pagination-btn tabular-nums ${item === safePage ? 'is-active' : ''}`}
                  onClick={() => onPageChange(item)}
                  aria-current={item === safePage ? 'page' : undefined}
                >
                  {item}
                </button>
              );
            })}

            <button
              type="button"
              className="pagination-btn"
              onClick={() => onPageChange(safePage + 1)}
              disabled={safePage >= totalPages}
              aria-label="Trang sau"
              title="Trang sau"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}

        {onPageSizeChange && pageSizeOptions.length > 0 && (
          <CustomSelect
            className="pagination-size-custom"
            value={pageSize}
            onChange={(val) => onPageSizeChange(Number(val))}
            options={pageSizeOptions.map((size) => ({
              value: size,
              label: `${size} / trang`
            }))}
          />
        )}
      </div>
    </div>
  );
}
