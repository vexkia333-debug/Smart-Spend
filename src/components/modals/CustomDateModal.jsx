import React, { useState, useEffect } from 'react';
import { Calendar, X, Check, RotateCcw } from 'lucide-react';
import { formatDateInput } from '../../utils/formatters.js';

export default function CustomDateModal({
  isOpen,
  onClose,
  startDate,
  endDate,
  onApply,
  onReset
}) {
  const [tempStart, setTempStart] = useState('');
  const [tempEnd, setTempEnd] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTempStart(startDate || '');
      setTempEnd(endDate || '');
    }
  }, [isOpen, startDate, endDate]);

  if (!isOpen) return null;

  // Xử lý các mốc gợi ý nhanh
  const applyPreset = (preset) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (preset === 'TODAY') {
      const d = formatDateInput(today);
      setTempStart(d);
      setTempEnd(d);
    } else if (preset === 'YESTERDAY') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const d = formatDateInput(y);
      setTempStart(d);
      setTempEnd(d);
    } else if (preset === 'LAST_7_DAYS') {
      const past = new Date(today);
      past.setDate(past.getDate() - 6);
      setTempStart(formatDateInput(past));
      setTempEnd(formatDateInput(today));
    } else if (preset === 'LAST_30_DAYS') {
      const past = new Date(today);
      past.setDate(past.getDate() - 29);
      setTempStart(formatDateInput(past));
      setTempEnd(formatDateInput(today));
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setTempStart(formatDateInput(firstDay));
      setTempEnd(formatDateInput(lastDay));
    } else if (preset === 'LAST_MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      setTempStart(formatDateInput(firstDay));
      setTempEnd(formatDateInput(lastDay));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (tempStart && tempEnd && tempStart > tempEnd) {
      alert('Ngày bắt đầu không được lớn hơn ngày kết thúc!');
      return;
    }
    onApply(tempStart, tempEnd);
    onClose();
  };

  const handleReset = () => {
    setTempStart('');
    setTempEnd('');
    if (onReset) onReset();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card glass-panel"
        style={{ maxWidth: '440px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}
            >
              <Calendar size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Lọc khoảng thời gian</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                Chọn khoảng ngày bạn muốn thống kê và theo dõi
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
          {/* Gợi ý chọn nhanh */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                marginBottom: '8px',
                display: 'block'
              }}
            >
              Chọn nhanh:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                onClick={() => applyPreset('TODAY')}
              >
                Hôm nay
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                onClick={() => applyPreset('YESTERDAY')}
              >
                Hôm qua
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                onClick={() => applyPreset('LAST_7_DAYS')}
              >
                7 ngày qua
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                onClick={() => applyPreset('LAST_30_DAYS')}
              >
                30 ngày qua
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                onClick={() => applyPreset('THIS_MONTH')}
              >
                Tháng này
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                onClick={() => applyPreset('LAST_MONTH')}
              >
                Tháng trước
              </button>
            </div>
          </div>

          {/* Hai ô chọn ngày Từ -> Đến */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
            <div>
              <label
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  display: 'block'
                }}
              >
                Từ ngày:
              </label>
              <input
                type="date"
                className="form-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                value={tempStart}
                onChange={(e) => setTempStart(e.target.value)}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  display: 'block'
                }}
              >
                Đến ngày:
              </label>
              <input
                type="date"
                className="form-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                value={tempEnd}
                onChange={(e) => setTempEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Nút hành động */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
              onClick={handleReset}
            >
              <RotateCcw size={14} />
              <span>Xóa bộ lọc</span>
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
              >
                Đóng
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Check size={16} />
                <span>Áp dụng</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
