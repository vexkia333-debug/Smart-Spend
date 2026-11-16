import React, { useState } from 'react';
import { Target, Trophy, Pencil, Check, X, ThumbsUp, AlertTriangle } from 'lucide-react';

const GOAL_PRESETS = [
  { label: '300k', value: 300000 },
  { label: '500k', value: 500000 },
  { label: '1 triệu', value: 1000000 },
  { label: '2 triệu', value: 2000000 },
  { label: '5 triệu', value: 5000000 }
];

export default function MonthlyGoalCard({
  monthlyBudgetGoal = 500000,
  currentMonthSavings = 0,
  currentMonthIncome = 0,
  currentMonthExpense = 0,
  prevMonthSavings = 0,
  currentMonthNumber = null,
  formatVND,
  onUpdateBudgetGoal
}) {
  const safeGoal = monthlyBudgetGoal > 0 ? Number(monthlyBudgetGoal) : 500000;
  const [isEditing, setIsEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState(String(safeGoal));
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const rawPercent = Math.max(0, Math.round((currentMonthSavings / safeGoal) * 100));
  const ringPercent = Math.min(100, Math.max(0, rawPercent));
  const isGoalReached = currentMonthSavings >= safeGoal;
  const isPositiveSavings = currentMonthSavings > 0;
  const remainingToSave = Math.max(0, safeGoal - Math.max(0, currentMonthSavings));
  const surplusSaved = Math.max(0, currentMonthSavings - safeGoal);
  const deltaVsPrevMonth = currentMonthSavings - prevMonthSavings;

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - ringPercent / 100);

  let ringColor = '#38bdf8';
  let statusText = `Đã tích lũy được ${rawPercent}% mục tiêu tháng này (còn thiếu ${formatVND(remainingToSave)}).`;
  let statusTone = 'good';
  if (isGoalReached) {
    ringColor = '#10b981';
    statusText = 'Xuất sắc! Bạn đã hoàn thành mục tiêu tiết kiệm tháng này (tính độc lập với tháng trước).';
    statusTone = 'good';
  } else if (!isPositiveSavings) {
    ringColor = '#f59e0b';
    statusText = `Tháng này chi đang vượt thu ${formatVND(Math.abs(currentMonthSavings))} — cần tăng thu hoặc giảm chi để đạt mốc ${formatVND(safeGoal)}.`;
    statusTone = 'warn';
  }

  const openEditor = () => {
    setDraftGoal(String(safeGoal));
    setFeedback(null);
    setIsEditing(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const numeric = Number(String(draftGoal).replace(/[^\d]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setFeedback('Vui lòng nhập số tiền mục tiêu tiết kiệm hợp lệ.');
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      const ok = await onUpdateBudgetGoal(numeric);
      if (ok) {
        setIsEditing(false);
      } else {
        setFeedback('Không thể lưu mục tiêu, thử lại sau.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="glass-panel budget-goal-card">
      <div className="budget-goal-top">
        <div className="budget-goal-heading">
          <span className="budget-goal-icon">
            <Target size={18} />
          </span>
          <div>
            <h4>Mục tiêu tiết kiệm tháng {currentMonthNumber || ''}</h4>
            <p>Tính riêng (Thu − Chi) trong tháng này, tách biệt tháng trước</p>
          </div>
        </div>

        {!isEditing && (
          <button type="button" className="budget-goal-edit-btn" onClick={openEditor}>
            <Pencil size={14} />
            <span>Đặt mục tiêu</span>
          </button>
        )}
      </div>

      <div className="budget-goal-body">
        <div className="budget-ring-wrap">
          <svg viewBox="0 0 112 112" className="budget-ring-svg">
            <defs>
              <linearGradient id="budgetRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={isGoalReached ? '#34d399' : !isPositiveSavings ? '#fbbf24' : '#38bdf8'} />
                <stop offset="100%" stopColor={isGoalReached ? '#10b981' : !isPositiveSavings ? '#f59e0b' : '#818cf8'} />
              </linearGradient>
            </defs>
            <circle cx="56" cy="56" r={radius} className="budget-ring-track" />
            <circle
              cx="56"
              cy="56"
              r={radius}
              className="budget-ring-progress"
              stroke="url(#budgetRingGrad)"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <div className="budget-ring-center">
            <Trophy size={16} color={ringColor} />
            <strong className="tabular-nums">{rawPercent}%</strong>
            <span>Đạt được</span>
          </div>
        </div>

        <div className="budget-goal-metrics">
          <div className="budget-metric-row">
            <span className="budget-metric-label">Mục tiêu tiết kiệm</span>
            <strong className="budget-metric-value tabular-nums">{formatVND(safeGoal)}</strong>
          </div>
          <div className="budget-metric-row">
            <span className="budget-metric-label">Tiết kiệm tháng này</span>
            <strong className={`budget-metric-value tabular-nums ${currentMonthSavings >= 0 ? 'remain' : 'over'}`}>
              {currentMonthSavings < 0 ? '-' : '+'}{formatVND(Math.abs(currentMonthSavings))}
            </strong>
          </div>
          <div className="budget-metric-row">
            <span className="budget-metric-label">Thu / Chi tháng này</span>
            <strong className="budget-metric-value spent tabular-nums">
              +{formatVND(currentMonthIncome)} / -{formatVND(currentMonthExpense)}
            </strong>
          </div>
          <div className="budget-metric-row">
            <span className="budget-metric-label">{isGoalReached ? 'Vượt mục tiêu' : 'Cần tích lũy thêm'}</span>
            <strong className={`budget-metric-value tabular-nums ${isGoalReached ? 'remain' : ''}`}>
              {formatVND(isGoalReached ? surplusSaved : remainingToSave)}
            </strong>
          </div>
          <div className="budget-metric-row">
            <span className="budget-metric-label">So với tháng trước</span>
            <strong className={`budget-metric-value tabular-nums ${deltaVsPrevMonth >= 0 ? 'remain' : 'over'}`}>
              {deltaVsPrevMonth >= 0 ? '+' : '-'}{formatVND(Math.abs(deltaVsPrevMonth))}
            </strong>
          </div>
        </div>
      </div>

      <div className={`budget-goal-status-banner ${statusTone}`}>
        {!isPositiveSavings ? <AlertTriangle size={16} /> : <ThumbsUp size={16} />}
        <span>{statusText}</span>
      </div>

      {isEditing && (
        <form onSubmit={handleSave} className="budget-goal-edit-panel">
          <div className="budget-preset-chips">
            {GOAL_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`budget-preset-chip ${Number(draftGoal) === preset.value ? 'active' : ''}`}
                onClick={() => setDraftGoal(String(preset.value))}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="budget-edit-controls">
            <input
              type="number"
              min="50000"
              step="50000"
              className="budget-edit-input tabular-nums"
              value={draftGoal}
              onChange={(e) => setDraftGoal(e.target.value)}
              placeholder="Nhập mục tiêu tiết kiệm tháng (VNĐ)"
              disabled={isSaving}
            />
            <button type="submit" className="budget-save-btn" disabled={isSaving}>
              <Check size={15} />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu'}</span>
            </button>
            <button
              type="button"
              className="budget-cancel-btn"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              aria-label="Hủy chỉnh sửa mục tiêu"
            >
              <X size={15} />
            </button>
          </div>

          {feedback && <p className="budget-edit-error">{feedback}</p>}
        </form>
      )}
    </section>
  );
}
