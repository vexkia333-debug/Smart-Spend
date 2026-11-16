import React, { useState } from 'react';
import { ShieldCheck, Trophy, Pencil, Check, X, ThumbsUp, AlertTriangle } from 'lucide-react';

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
  daysRemaining = 1,
  currentMonthNumber = null,
  formatVND,
  onUpdateBudgetGoal
}) {
  const safeGoal = monthlyBudgetGoal > 0 ? Number(monthlyBudgetGoal) : 500000;
  const [isEditing, setIsEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState(String(safeGoal));
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const hasActivity = currentMonthIncome > 0 || currentMonthExpense > 0;
  const lockedSavings = hasActivity ? Math.max(0, Math.min(currentMonthSavings, safeGoal)) : 0;
  const ringPercent = Math.min(100, Math.max(0, Math.round((lockedSavings / safeGoal) * 100)));
  const safeToSpend = currentMonthSavings - safeGoal;
  const isProtected = hasActivity && safeToSpend >= 0;
  const isDipping = hasActivity && safeToSpend < 0 && lockedSavings > 0;
  const shortfall = Math.max(0, -safeToSpend);
  const safeDays = Math.max(1, Number(daysRemaining) || 1);
  const dailyAllowance = safeToSpend > 0 ? Math.floor(safeToSpend / safeDays) : 0;

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - ringPercent / 100);

  let ringColor = '#fb7185';
  let ringSubLabel = 'Chưa đạt';
  let statusTone = 'over';
  let statusText = `Tháng này chưa tạo được thặng dư cho quỹ ${formatVND(safeGoal)} (cần thêm ${formatVND(shortfall)}).`;

  if (isProtected) {
    ringColor = '#10b981';
    ringSubLabel = 'An toàn';
    statusTone = 'good';
    statusText = `Quỹ ${formatVND(safeGoal)} đang nguyên vẹn 100%! Trong ${safeDays} ngày cuối tháng, bạn chỉ cần tiêu trung bình không quá ${formatVND(dailyAllowance)}/ngày là cầm chắc ${formatVND(safeGoal)} để dành.`;
  } else if (isDipping) {
    ringColor = '#f59e0b';
    ringSubLabel = 'Còn giữ';
    statusTone = 'warn';
    statusText = `Chú ý: Chi tiêu đã lẹm mất ${formatVND(shortfall)} của mục tiêu ${formatVND(safeGoal)} (hiện chỉ còn giữ được ${formatVND(lockedSavings)}). Hãy hạn chế chi thêm!`;
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
      setFeedback('Vui lòng nhập mức để dành hợp lệ.');
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
            <ShieldCheck size={18} />
          </span>
          <div>
            <h4>Kế hoạch để dành tháng {currentMonthNumber || ''}</h4>
            <p>Cất riêng {formatVND(safeGoal)} đầu tiên — chỉ tiêu trong phần dư còn lại</p>
          </div>
        </div>

        {!isEditing && (
          <button type="button" className="budget-goal-edit-btn" onClick={openEditor}>
            <Pencil size={14} />
            <span>Đặt mức</span>
          </button>
        )}
      </div>

      <div className="budget-goal-body">
        <div className="budget-ring-wrap">
          <svg viewBox="0 0 112 112" className="budget-ring-svg">
            <defs>
              <linearGradient id="budgetRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={isProtected ? '#34d399' : isDipping ? '#fbbf24' : '#fb7185'} />
                <stop offset="100%" stopColor={isProtected ? '#10b981' : isDipping ? '#f59e0b' : '#e11d48'} />
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
            <strong className="tabular-nums">{ringPercent}%</strong>
            <span>{ringSubLabel}</span>
          </div>
        </div>

        <div className="budget-goal-metrics">
          <div className="budget-metric-row">
            <span className="budget-metric-label">Quỹ để dành hiện giữ được</span>
            <strong
              className={`budget-metric-value tabular-nums ${
                isProtected ? 'remain' : isDipping ? 'spent' : 'over'
              }`}
            >
              {formatVND(lockedSavings)} / {formatVND(safeGoal)}
            </strong>
          </div>

          <div className="budget-metric-row">
            <span className="budget-metric-label">
              {safeToSpend >= 0 ? 'Còn được phép tiêu tháng này' : 'Đã lẹm vào quỹ tiết kiệm'}
            </span>
            <strong className={`budget-metric-value tabular-nums ${safeToSpend >= 0 ? 'spent' : 'over'}`}>
              {formatVND(safeToSpend >= 0 ? safeToSpend : shortfall)}
            </strong>
          </div>

          <div className="budget-metric-row">
            <span className="budget-metric-label">Định mức tiêu ({safeDays} ngày cuối)</span>
            <strong className={`budget-metric-value tabular-nums ${safeToSpend > 0 ? 'remain' : 'over'}`}>
              {safeToSpend > 0 ? `${formatVND(dailyAllowance)}/ngày` : '0 ₫/ngày'}
            </strong>
          </div>
        </div>
      </div>

      <div className={`budget-goal-status-banner ${statusTone}`}>
        {isProtected ? <ThumbsUp size={16} /> : <AlertTriangle size={16} />}
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
              placeholder="Nhập mức để dành tháng (VNĐ)"
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
              aria-label="Hủy chỉnh sửa mức để dành"
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
