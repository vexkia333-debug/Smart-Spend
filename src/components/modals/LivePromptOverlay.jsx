import React from 'react';
import { X, Sparkles, ArrowLeftRight } from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';
import { DEFAULT_QUICK_ACTIONS } from '../../constants/index.js';

export default function LivePromptOverlay({
  livePrompt,
  categories = [],
  accounts = [],
  handleCategorize,
  promptAiText,
  setPromptAiText,
  isPromptAiAnalyzing,
  handlePromptAiCategorize,
  onClose
}) {
  if (!livePrompt || !livePrompt.transaction) return null;

  const tx = livePrompt.transaction;
  const isIncome = tx.type === 'INCOME';
  const descUpper = (tx.description || tx.raw_content || '').toUpperCase();
  const isTransferRelated =
    descUpper.includes('VU HA KIEN') ||
    descUpper.includes('KIEN VU') ||
    descUpper.includes('CHUYEN') ||
    tx.category_id?.includes('transfer') ||
    livePrompt.suggestedCategoryId?.includes('transfer');

  // Các tài khoản khác trong hệ thống để người dùng chọn chuyển tiền nội bộ
  const otherAccounts = (accounts || []).filter((a) => a.id !== tx.account_id);

  const actions =
    livePrompt.quickActions && livePrompt.quickActions.length > 0
      ? livePrompt.quickActions
      : categories && categories.length > 0
      ? categories
          .filter((c) => c.type === (tx.type || 'EXPENSE'))
          .slice(0, 4)
      : DEFAULT_QUICK_ACTIONS;

  return (
    <div className="prompt-modal-backdrop" onClick={onClose}>
      <div className="google-prompt-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-header">
          <div
            className="prompt-badge"
            style={{
              borderColor: isIncome ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
              background: isIncome ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)',
              color: isIncome ? '#34d399' : '#fb7185'
            }}
          >
            <span
              className="live-dot"
              style={{
                background: isIncome ? '#10b981' : '#f43f5e',
                boxShadow: isIncome ? '0 0 8px #10b981' : '0 0 8px #f43f5e'
              }}
            ></span>
            {isIncome ? 'Biến động số dư: Tiền vào (+)' : 'Thông báo biến động số dư mới (-)'}
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
              🏦 {tx.bank_name || 'Ngân hàng'}
            </span>
            <span
              className={`prompt-amount ${isIncome ? 'income' : 'expense'}`}
              style={{
                color: isIncome ? '#34d399' : '#fb7185',
                fontWeight: 800
              }}
            >
              {isIncome ? '+' : '-'}
              {formatVND(tx.amount)}
            </span>
          </div>

          <div className="prompt-desc">{tx.description}</div>

          {/* Hộp chọn nhanh chuyển tiền nội bộ giữa các tài khoản của bạn */}
          {otherAccounts.length > 0 && (
            <div
              style={{
                marginBottom: '14px',
                padding: '10px 12px',
                borderRadius: '12px',
                background: isIncome ? 'rgba(16, 185, 129, 0.08)' : 'rgba(99, 102, 241, 0.08)',
                border: `1px dashed ${isIncome ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
              }}
            >
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: isIncome ? '#34d399' : '#818cf8',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ArrowLeftRight size={13} />
                {isIncome
                  ? '⚡ Chuyển từ tài khoản nào của bạn?'
                  : '⚡ Chuyển sang tài khoản nào của bạn?'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {otherAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    className="prompt-cat-btn"
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      borderColor: acc.color || 'rgba(255, 255, 255, 0.15)',
                      padding: '8px 10px',
                      fontSize: '0.8rem'
                    }}
                    onClick={() => {
                      const catId = isIncome ? 'cat_transfer_in' : 'cat_transfer_internal';
                      const desc = isIncome
                        ? `Nhận tiền từ ${acc.name}`
                        : `Chuyển tiền sang ${acc.name}`;
                      handleCategorize(tx.id, catId, desc, acc.id);
                    }}
                  >
                    <span style={{ color: acc.color || '#38bdf8' }}>●</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isIncome ? `Từ ${acc.name}` : `Sang ${acc.name}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="prompt-question">
            {isIncome ? 'Hoặc chọn danh mục thu nhập:' : 'Hoặc chọn danh mục chi tiêu:'}
          </div>

          <div className="prompt-actions-grid">
            {actions.map((act) => (
              <button
                key={act.id}
                className="prompt-cat-btn"
                onClick={() => handleCategorize(tx.id, act.id)}
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
              handlePromptAiCategorize(tx.id);
            }}
            className="prompt-ai-form"
          >
            <div className="prompt-ai-input-wrap">
              <Sparkles size={15} color="#8b5cf6" style={{ flexShrink: 0 }} />
              <input
                type="text"
                className="prompt-ai-input"
                placeholder={
                  isIncome
                    ? 'Gõ chi tiết (VD: tiền thưởng dự án, bạn trả nợ)...'
                    : 'Gõ chi tiết (VD: bún bò huế 45k, cafe Highlands)...'
                }
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
