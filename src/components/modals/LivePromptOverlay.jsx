import React, { useEffect, useRef } from 'react';
import { X, Sparkles, Send } from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';

export default function LivePromptOverlay({
  livePrompt,
  promptAiText,
  setPromptAiText,
  isPromptAiAnalyzing,
  handlePromptAiCategorize,
  handleCategorize,
  onClose
}) {
  if (!livePrompt || !livePrompt.transaction) return null;

  const tx = livePrompt.transaction;
  const isIncome = tx.type === 'INCOME';
  const inputRef = useRef(null);
  const quickActions = livePrompt.quickActions || [];

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, [livePrompt]);

  return (
    <div className="prompt-modal-backdrop" onClick={onClose}>
      <div className="google-prompt-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-header">
          <div
            className="prompt-badge"
            style={{
              borderColor: isIncome ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
              background: isIncome ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)',
              color: isIncome ? '#10b981' : '#f43f5e'
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
            title="Đóng (bổ sung sau trên Web)"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="prompt-body">
          <div className="prompt-bank-row">
            <span className="prompt-bank-name">
              🏦 {tx.account_name || tx.bank_name || 'Ngân hàng'}
            </span>
            <span
              className={`prompt-amount ${isIncome ? 'income' : 'expense'}`}
              style={{
                color: isIncome ? '#10b981' : '#f43f5e',
                fontWeight: 800
              }}
            >
              {isIncome ? '+' : '-'}
              {formatVND(tx.amount)}
            </span>
          </div>

          <div className="prompt-desc">{tx.description || tx.raw_content}</div>

          {/* Chọn nhanh danh mục (nếu có) */}
          {quickActions.length > 0 && typeof handleCategorize === 'function' && (
            <div style={{ marginTop: '12px', marginBottom: '6px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Chọn nhanh danh mục:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '6px' }}>
                {quickActions.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      handleCategorize(tx.id, cat.id);
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 10px',
                      borderRadius: '10px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-main)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = cat.color || '#38bdf8';
                      e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      e.currentTarget.style.background = 'var(--bg-input)';
                    }}
                  >
                    <span>{cat.icon || '🏷️'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Khu vực AI Phân tích & Ghi chú */}
          <div className="prompt-ai-card-inner">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '10px',
                color: '#a855f7',
                fontWeight: 700,
                fontSize: '0.86rem'
              }}
            >
              <Sparkles size={16} />
              <span>Ghi chú hoặc phân loại bằng AI:</span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (promptAiText.trim()) {
                  handlePromptAiCategorize(tx.id);
                }
              }}
            >
              <div className="prompt-ai-input-wrap">
                <input
                  ref={inputRef}
                  type="text"
                  className="prompt-ai-input"
                  placeholder={isIncome ? 'Nhập ghi chú hoặc lý do nhận tiền...' : 'Nhập ghi chú chi tiêu...'}
                  value={promptAiText}
                  onChange={(e) => setPromptAiText(e.target.value)}
                  disabled={isPromptAiAnalyzing}
                />
                <button
                  type="submit"
                  disabled={isPromptAiAnalyzing || !promptAiText.trim()}
                  className="prompt-ai-btn"
                >
                  {isPromptAiAnalyzing ? (
                    'Đang xử lý...'
                  ) : (
                    <>
                      <span>Phân tích</span>
                      <Send size={13} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          <button
            className="prompt-skip-btn"
            onClick={onClose}
          >
            Bỏ qua / Bổ sung sau trên trang Web ➔
          </button>
        </div>
      </div>
    </div>
  );
}
