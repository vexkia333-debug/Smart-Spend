import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Check,
  RotateCcw,
  X,
  ArrowRight
} from 'lucide-react';
import { formatDateInput, formatDateVN } from '../../utils/formatters.js';

export default function CustomDatePopover({
  isOpen,
  onClose,
  // Chế độ dải ngày (range)
  startDate,
  endDate,
  onApply,
  onReset,
  // Chế độ 1 ngày (single)
  mode = 'range', // 'range' | 'single'
  selectedDate,
  onSelectDate,
  title,
  align = 'right' // 'right' | 'left'
}) {
  const [tempStart, setTempStart] = useState('');
  const [tempEnd, setTempEnd] = useState('');
  const [tempDate, setTempDate] = useState('');

  // Hàm chuyển đổi an toàn chuỗi ngày YYYY-MM-DD sang Date không bị lệch múi giờ
  const parseSafeDate = (dStr) => {
    if (!dStr) return null;
    if (typeof dStr === 'string' && dStr.includes('-')) {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const date = new Date(y, m, d);
        return isNaN(date.getTime()) ? null : date;
      }
    }
    const d = new Date(dStr);
    return isNaN(d.getTime()) ? null : d;
  };

  // Tháng và năm đang hiển thị trên lịch
  const [viewDate, setViewDate] = useState(() => {
    const targetStr = mode === 'single' ? selectedDate : startDate;
    const d = parseSafeDate(targetStr);
    if (d) return new Date(d.getFullYear(), d.getMonth(), 1);
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const popoverRef = useRef(null);

  // Đồng bộ ngày khi mở popover
  useEffect(() => {
    if (isOpen) {
      if (mode === 'single') {
        const cur = selectedDate || formatDateInput(new Date());
        setTempDate(cur);
        const d = parseSafeDate(cur);
        if (d) {
          setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
        }
      } else {
        setTempStart(startDate || '');
        setTempEnd(endDate || '');
        if (startDate) {
          const d = parseSafeDate(startDate);
          if (d) {
            setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
          }
        }
      }
    }
  }, [isOpen, startDate, endDate, selectedDate, mode]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        // Kiểm tra xem click có trúng nút kích hoạt không để tránh toggle 2 lần
        const triggerBtn = e.target.closest('.time-filter-btn') || e.target.closest('.daily-report-date-trigger-btn');
        if (!triggerBtn) {
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth(); // 0-11

  // Chuyển tháng
  const handlePrevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Tính toán các ngày trong lưới lịch
  const getDaysGrid = () => {
    const days = [];
    const firstDayIndex = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7; // T2 = 0, CN = 6
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

    // Các ngày của tháng trước
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevDate = new Date(currentYear, currentMonth - 1, dayNum);
      days.push({
        dayNum,
        dateStr: formatDateInput(prevDate),
        isCurrentMonth: false
      });
    }

    // Các ngày của tháng hiện tại
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const currDate = new Date(currentYear, currentMonth, i);
      days.push({
        dayNum: i,
        dateStr: formatDateInput(currDate),
        isCurrentMonth: true
      });
    }

    // Các ngày của tháng sau để lấp đầy 35 hoặc 42 ô
    const totalCells = days.length <= 35 ? 35 : 42;
    const remaining = totalCells - days.length;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(currentYear, currentMonth + 1, i);
      days.push({
        dayNum: i,
        dateStr: formatDateInput(nextDate),
        isCurrentMonth: false
      });
    }

    return days;
  };

  // Chọn ngày trên lịch
  const handleDayClick = (dateStr) => {
    if (mode === 'single') {
      setTempDate(dateStr);
      if (onSelectDate) onSelectDate(dateStr);
      onClose();
      return;
    }

    if (!tempStart || (tempStart && tempEnd)) {
      // Bắt đầu chọn mốc mới
      setTempStart(dateStr);
      setTempEnd('');
    } else if (tempStart && !tempEnd) {
      // Đang có ngày bắt đầu, chọn ngày kết thúc
      if (dateStr < tempStart) {
        setTempStart(dateStr);
      } else {
        setTempEnd(dateStr);
      }
    }
  };

  // Áp dụng mốc chọn nhanh ở chế độ range
  const applyPreset = (preset) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start = '';
    let end = '';

    if (preset === 'TODAY') {
      const d = formatDateInput(today);
      start = d;
      end = d;
    } else if (preset === 'YESTERDAY') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const d = formatDateInput(y);
      start = d;
      end = d;
    } else if (preset === 'LAST_7_DAYS') {
      const past = new Date(today);
      past.setDate(past.getDate() - 6);
      start = formatDateInput(past);
      end = formatDateInput(today);
    } else if (preset === 'LAST_30_DAYS') {
      const past = new Date(today);
      past.setDate(past.getDate() - 29);
      start = formatDateInput(past);
      end = formatDateInput(today);
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      start = formatDateInput(firstDay);
      end = formatDateInput(lastDay);
    } else if (preset === 'LAST_MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      start = formatDateInput(firstDay);
      end = formatDateInput(lastDay);
    }

    setTempStart(start);
    setTempEnd(end);

    if (start) {
      const d = parseSafeDate(start);
      if (d) setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  };

  // Áp dụng mốc chọn nhanh ở chế độ single
  const applySinglePreset = (preset) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let chosen = '';

    if (preset === 'TODAY') {
      chosen = formatDateInput(today);
    } else if (preset === 'YESTERDAY') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      chosen = formatDateInput(y);
    } else if (preset === 'TWO_DAYS_AGO') {
      const past = new Date(today);
      past.setDate(past.getDate() - 2);
      chosen = formatDateInput(past);
    } else if (preset === 'MONTH_START') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      chosen = formatDateInput(firstDay);
    }

    setTempDate(chosen);
    if (chosen) {
      const d = parseSafeDate(chosen);
      if (d) setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
      if (onSelectDate) onSelectDate(chosen);
      onClose();
    }
  };

  const handleApply = (e) => {
    if (e) e.preventDefault();
    if (mode === 'single') {
      if (onSelectDate && tempDate) onSelectDate(tempDate);
      onClose();
      return;
    }
    if (tempStart && !tempEnd) {
      onApply(tempStart, tempStart);
    } else {
      onApply(tempStart, tempEnd);
    }
    onClose();
  };

  const handleReset = () => {
    if (mode === 'single') {
      const today = formatDateInput(new Date());
      setTempDate(today);
      if (onSelectDate) onSelectDate(today);
      onClose();
      return;
    }
    setTempStart('');
    setTempEnd('');
    if (onReset) onReset();
    onClose();
  };

  const todayStr = formatDateInput(new Date());
  const daysGrid = getDaysGrid();

  return (
    <div
      className={`custom-date-popover glass-panel ${align === 'left' ? 'align-left' : ''}`}
      ref={popoverRef}
    >
      {/* Header Popover */}
      <div className="popover-header">
        <div className="popover-title">
          <CalendarIcon size={16} color="#38bdf8" />
          <span>{title || (mode === 'single' ? 'Chọn ngày xem báo cáo' : 'Khoảng thời gian tùy chọn')}</span>
        </div>
        <button
          type="button"
          className="popover-close-btn"
          onClick={onClose}
          title="Đóng"
        >
          <X size={15} />
        </button>
      </div>

      {/* Chọn nhanh (Presets) */}
      <div className="popover-presets">
        {mode === 'single' ? (
          <>
            <button
              type="button"
              className="preset-pill"
              onClick={() => applySinglePreset('TODAY')}
            >
              Hôm nay
            </button>
            <button
              type="button"
              className="preset-pill"
              onClick={() => applySinglePreset('YESTERDAY')}
            >
              Hôm qua
            </button>
            <button
              type="button"
              className="preset-pill"
              onClick={() => applySinglePreset('TWO_DAYS_AGO')}
            >
              Hôm kia
            </button>
            <button
              type="button"
              className="preset-pill"
              onClick={() => applySinglePreset('MONTH_START')}
            >
              Đầu tháng
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="preset-pill"
              onClick={() => applyPreset('TODAY')}
            >
              Hôm nay
            </button>
            <button
              type="button"
              className="preset-pill"
              onClick={() => applyPreset('YESTERDAY')}
            >
              Hôm qua
            </button>
            <button
              type="button"
              className="preset-pill"
              onClick={() => applyPreset('LAST_7_DAYS')}
            >
              7 ngày qua
            </button>
            <button
              type="button"
              className="preset-pill"
              onClick={() => applyPreset('LAST_30_DAYS')}
            >
              30 ngày qua
            </button>
            <button
              type="button"
              className="preset-pill"
              onClick={() => applyPreset('THIS_MONTH')}
            >
              Tháng này
            </button>
            <button
              type="button"
              className="preset-pill"
              onClick={() => applyPreset('LAST_MONTH')}
            >
              Tháng trước
            </button>
          </>
        )}
      </div>

      {/* Thanh hiển thị ngày đã chọn */}
      {mode === 'single' ? (
        <div className="selected-range-display">
          <div className="range-box active">
            <span className="range-box-label">Ngày đang chọn</span>
            <span className="range-box-val">
              {tempDate ? formatDateVN(tempDate) : 'Chưa chọn'}
            </span>
          </div>
        </div>
      ) : (
        <div className="selected-range-display">
          <div className={`range-box ${tempStart ? 'active' : ''}`}>
            <span className="range-box-label">Từ ngày</span>
            <span className="range-box-val">
              {tempStart ? formatDateVN(tempStart) : 'Chọn ngày'}
            </span>
          </div>
          <ArrowRight size={14} className="range-arrow-icon" />
          <div className={`range-box ${tempEnd ? 'active' : ''}`}>
            <span className="range-box-label">Đến ngày</span>
            <span className="range-box-val">
              {tempEnd ? formatDateVN(tempEnd) : tempStart ? 'Chọn ngày kết thúc' : 'Chọn ngày'}
            </span>
          </div>
        </div>
      )}

      {/* Bộ Lịch Tự Thiết Kế (Custom Calendar UI) */}
      <div className="custom-calendar-container">
        {/* Điều hướng Tháng/Năm */}
        <div className="calendar-month-nav">
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={handlePrevMonth}
            title="Tháng trước"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="calendar-month-label">
            Tháng {currentMonth + 1}, {currentYear}
          </div>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={handleNextMonth}
            title="Tháng sau"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Tiêu đề 7 thứ trong tuần */}
        <div className="calendar-weekdays-row">
          <span>T2</span>
          <span>T3</span>
          <span>T4</span>
          <span>T5</span>
          <span>T6</span>
          <span>T7</span>
          <span style={{ color: '#fb7185' }}>CN</span>
        </div>

        {/* Lưới các ô ngày */}
        <div className="calendar-days-grid">
          {daysGrid.map((day, idx) => {
            const isStart =
              mode === 'single'
                ? day.dateStr === (tempDate || selectedDate)
                : tempStart && day.dateStr === tempStart;
            const isEnd =
              mode === 'single'
                ? day.dateStr === (tempDate || selectedDate)
                : tempEnd && day.dateStr === tempEnd;
            const isInRange =
              mode === 'range' &&
              tempStart &&
              tempEnd &&
              day.dateStr > tempStart &&
              day.dateStr < tempEnd;
            const isToday = day.dateStr === todayStr;

            let cellClass = 'calendar-day-cell';
            if (!day.isCurrentMonth) cellClass += ' out-month';
            if (isToday) cellClass += ' is-today';
            if (isStart) cellClass += ' is-start';
            if (isEnd) cellClass += ' is-end';
            if (isInRange) cellClass += ' in-range';

            return (
              <button
                key={`${day.dateStr}-${idx}`}
                type="button"
                className={cellClass}
                onClick={() => handleDayClick(day.dateStr)}
              >
                <span>{day.dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Nút hành động */}
      <div className="popover-footer">
        {mode === 'single' ? (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-popover-reset"
              onClick={handleReset}
              title="Về ngày hôm nay"
            >
              <RotateCcw size={13} />
              <span>Hôm nay</span>
            </button>
            <div className="popover-footer-right">
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                onClick={onClose}
              >
                Đóng
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                onClick={handleApply}
                disabled={!tempDate}
              >
                <Check size={14} />
                <span>Chọn</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-popover-reset"
              onClick={handleReset}
            >
              <RotateCcw size={13} />
              <span>Xóa lọc</span>
            </button>
            <div className="popover-footer-right">
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                onClick={onClose}
              >
                Đóng
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                onClick={handleApply}
                disabled={!tempStart}
              >
                <Check size={14} />
                <span>Áp dụng</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
