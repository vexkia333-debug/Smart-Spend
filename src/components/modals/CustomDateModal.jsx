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
    <div
      className="custom-date-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel custom-date-modal-card"
        style={{
          width: '460px',
          maxWidth: '100%',
          padding: '24px',
          background: 'var(--bg-card-solid)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6), 0 0 30px rgba(56, 189, 248, 0.15)',
          color: 'var(--text-main)',
          boxSizing: 'border-box'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
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
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Lọc khoảng thời gian</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                Chọn khoảng ngày bạn muốn thống kê và theo dõi
              </p>
            </div>
          </div>
          <button
            type="button"
            className="theme-toggle-btn"
            style={{ width: '32px', height: '32px', padding: 0 }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: '14px' }}>
          {/* Gợi ý chọn nhanh */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                marginBottom: '8px',
                display: 'block',
                fontWeight: 600
              }}
            >
              Chọn nhanh:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => applyPreset('TODAY')}
              >
                Hôm nay
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => applyPreset('YESTERDAY')}
              >
                Hôm qua
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => applyPreset('LAST_7_DAYS')}
              >
                7 ngày qua
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => applyPreset('LAST_30_DAYS')}
              >
                30 ngày qua
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => applyPreset('THIS_MONTH')}
              >
                Tháng này
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => applyPreset('LAST_MONTH')}
              >
                Tháng trước
              </button>
            </div>
          </div>

          {/* Hai ô chọn ngày Từ -> Đến */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '22px' }}>
            <div>
              <label
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  display: 'block',
                  fontWeight: 600
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
                  display: 'block',
                  fontWeight: 600
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
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
