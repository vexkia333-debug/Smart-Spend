import React, { useState } from 'react';
import { Target, Trophy, Pencil, Check, X, ThumbsUp, AlertTriangle } from 'lucide-react';

const GOAL_PRESETS = [
  { label: '3 triệu', value: 3000000 },
  { label: '5 triệu', value: 5000000 },
  { label: '8 triệu', value: 8000000 },
  { label: '10 triệu', value: 10000000 }
];

export default function MonthlyGoalCard({
  monthlyBudgetGoal = 5000000,
  currentMonthExpense = 0,
  formatVND,
  onUpdateBudgetGoal
}) {
  const safeGoal = monthlyBudgetGoal > 0 ? Number(monthlyBudgetGoal) : 5000000;
  const [isEditing, setIsEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState(String(safeGoal));
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const rawPercent = Math.round((currentMonthExpense / safeGoal) * 100);
  const ringPercent = Math.min(100, Math.max(0, rawPercent));
  const remaining = safeGoal - currentMonthExpense;
  const isOverBudget = remaining < 0;
  const isNearLimit = rawPercent >= 80 && rawPercent <= 100;

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - ringPercent / 100);

  let ringColor = '#38bdf8';
  let statusText = 'Bạn đang chi tiêu tốt hơn so với hạn mức tháng!';
  let statusTone = 'good';
  if (isOverBudget) {
    ringColor = '#f43f5e';
    statusText = 'Chi tiêu tháng này đã vượt hạn mức đặt ra.';
    statusTone = 'over';
  } else if (isNearLimit) {
    ringColor = '#f59e0b';
    statusText = 'Chi tiêu đã gần chạm hạn mức mục tiêu tháng.';
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
      setFeedback('Vui lòng nhập số tiền mục tiêu hợp lệ.');
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
            <h4>Mục tiêu chi tiêu tháng</h4>
            <p>Theo dõi tiến độ hạn mức chi thực tế trong tháng</p>
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
                <stop offset="0%" stopColor={isOverBudget ? '#fb7185' : isNearLimit ? '#fbbf24' : '#38bdf8'} />
                <stop offset="100%" stopColor={isOverBudget ? '#e11d48' : isNearLimit ? '#f59e0b' : '#818cf8'} />
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
            <span>Đã chi</span>
          </div>
        </div>

        <div className="budget-goal-metrics">
          <div className="budget-metric-row">
            <span className="budget-metric-label">Mục tiêu tháng này</span>
            <strong className="budget-metric-value tabular-nums">{formatVND(safeGoal)}</strong>
          </div>
          <div className="budget-metric-row">
            <span className="budget-metric-label">Đã chi trong tháng</span>
            <strong className="budget-metric-value spent tabular-nums">{formatVND(currentMonthExpense)}</strong>
          </div>
          <div className="budget-metric-row">
            <span className="budget-metric-label">{isOverBudget ? 'Vượt hạn mức' : 'Còn lại'}</span>
            <strong className={`budget-metric-value tabular-nums ${isOverBudget ? 'over' : 'remain'}`}>
              {formatVND(Math.abs(remaining))}
            </strong>
          </div>
        </div>
      </div>

      <div className={`budget-goal-status-banner ${statusTone}`}>
        {isOverBudget ? <AlertTriangle size={16} /> : <ThumbsUp size={16} />}
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
              min="100000"
              step="100000"
              className="budget-edit-input tabular-nums"
              value={draftGoal}
              onChange={(e) => setDraftGoal(e.target.value)}
              placeholder="Nhập hạn mức tháng (VNĐ)"
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
