import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';
import { DEFAULT_QUICK_ACTIONS } from '../../constants/index.js';

export default function LivePromptOverlay({
  livePrompt,
  categories = [],
  handleCategorize,
  promptAiText,
  setPromptAiText,
  isPromptAiAnalyzing,
  handlePromptAiCategorize,
  onClose
}) {
  if (!livePrompt || !livePrompt.transaction) return null;

  const actions =
    livePrompt.quickActions && livePrompt.quickActions.length > 0
      ? livePrompt.quickActions
      : categories && categories.length > 0
      ? categories
          .filter((c) => c.type === (livePrompt.transaction.type || 'EXPENSE'))
          .slice(0, 4)
      : DEFAULT_QUICK_ACTIONS;

  return (
    <div className="prompt-modal-backdrop" onClick={onClose}>
      <div className="google-prompt-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-header">
          <div className="prompt-badge">
            <span className="live-dot"></span>
            Thông báo biến động số dư mới
          </div>
          <button
            className="prompt-close"
            title="Đóng thông báo (để bổ sung sau trên Web)"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="prompt-body">
          <div className="prompt-bank-row">
            <span className="prompt-bank-name">
              🏦 {livePrompt.transaction.bank_name || 'Ngân hàng'}
            </span>
            <span
              className={`prompt-amount ${
                livePrompt.transaction.type === 'INCOME' ? 'income' : 'expense'
              }`}
            >
              {livePrompt.transaction.type === 'EXPENSE' ? '-' : '+'}
              {formatVND(livePrompt.transaction.amount)}
            </span>
          </div>

          <div className="prompt-desc">{livePrompt.transaction.description}</div>

          <div className="prompt-question">Chọn danh mục chi tiêu của bạn:</div>

          <div className="prompt-actions-grid">
            {actions.map((act) => (
              <button
                key={act.id}
                className="prompt-cat-btn"
                onClick={() => handleCategorize(livePrompt.transaction.id, act.id)}
              >
                <span style={{ color: act.color || '#38bdf8' }}>●</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {act.name}
                </span>
              </button>
            ))}
          </div>

          <div className="prompt-divider">
            <span>Hoặc gõ chi tiết để AI tự xếp</span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handlePromptAiCategorize(livePrompt.transaction.id);
            }}
            className="prompt-ai-form"
          >
            <div className="prompt-ai-input-wrap">
              <Sparkles size={15} color="#8b5cf6" style={{ flexShrink: 0 }} />
              <input
                type="text"
                className="prompt-ai-input"
                placeholder="Gõ chi tiết (VD: bún bò huế 45k, cafe Highlands)..."
                value={promptAiText}
                onChange={(e) => setPromptAiText(e.target.value)}
                disabled={isPromptAiAnalyzing}
              />
              <button
                type="submit"
                className="prompt-ai-btn"
                disabled={isPromptAiAnalyzing || !promptAiText.trim()}
              >
                {isPromptAiAnalyzing ? 'Đang lọc...' : '✨ AI Phân loại'}
              </button>
            </div>
          </form>

          <button className="prompt-skip-btn" onClick={onClose}>
            Bỏ qua / Bổ sung sau trên trang Web ➔
          </button>
        </div>
      </div>
    </div>
  );
}
