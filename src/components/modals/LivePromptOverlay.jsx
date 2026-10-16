import React, { useEffect, useRef } from 'react';
import { X, Sparkles, Send } from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';

export default function LivePromptOverlay({
  livePrompt,
  promptAiText,
  setPromptAiText,
  isPromptAiAnalyzing,
  handlePromptAiCategorize,
  onClose
}) {
  if (!livePrompt || !livePrompt.transaction) return null;

  const tx = livePrompt.transaction;
  const isIncome = tx.type === 'INCOME';
  const inputRef = useRef(null);

  useEffect(() => {
    // Tự động focus vào ô nhập AI khi popup xuất hiện
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, [livePrompt]);

  const suggestions = isIncome
    ? ['Bạn trả nợ tiền ăn', 'Bạn chuyển tiền trả', 'Thu hồi nợ', 'Tiền thưởng dự án']
    : ['Tôi ăn 101k còn lại trả hộ bạn', 'Tiền đi nhậu', 'Đền mất vé xe', 'Cơm trưa văn phòng', 'Cà phê sáng'];

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

          <div className="prompt-desc">{tx.description || tx.raw_content}</div>

          {/* Khu vực AI Phân tích & Tách danh mục chính */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(59, 130, 246, 0.08))',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '16px',
              padding: '16px',
              marginTop: '12px',
              marginBottom: '14px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
                color: '#c084fc',
                fontWeight: 700,
                fontSize: '0.88rem'
              }}
            >
              <Sparkles size={16} />
              <span>Gõ nội dung để AI phân loại & tự động tách khoản:</span>
            </div>

            <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {isIncome
                ? 'Gõ người trả hoặc mục đích nhận tiền (VD: "Thảo trả tiền ăn trưa").'
                : 'Bạn có thể gõ tự nhiên, ví dụ: "tôi ăn hết 101k còn lại trả hộ", "tiền đi nhậu", "đền mất vé xe"... AI sẽ tự động phân loại và tách tiền cho bạn!'}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePromptAiCategorize(tx.id);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                  borderRadius: '12px',
                  padding: '4px 6px 4px 12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  className="prompt-ai-input"
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#fff',
                    fontSize: '0.92rem',
                    padding: '8px 0'
                  }}
                  placeholder={
                    isIncome
                      ? 'Nhập lý do nhận tiền (VD: Linh trả nợ cơm trưa)...'
                      : 'Nhập nội dung (VD: tôi ăn 101k còn lại trả hộ bạn)...'
                  }
                  value={promptAiText}
                  onChange={(e) => setPromptAiText(e.target.value)}
                  disabled={isPromptAiAnalyzing}
                />
                <button
                  type="submit"
                  disabled={isPromptAiAnalyzing || !promptAiText.trim()}
                  style={{
                    background: promptAiText.trim()
                      ? 'linear-gradient(135deg, #8b5cf6, #3b82f6)'
                      : 'rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: promptAiText.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s ease',
                    boxShadow: promptAiText.trim() ? '0 4px 12px rgba(139, 92, 246, 0.35)' : 'none'
                  }}
                >
                  {isPromptAiAnalyzing ? (
                    'Đang phân tích...'
                  ) : (
                    <>
                      <span>Phân tích</span>
                      <Send size={13} />
                    </>
                  )}
                </button>
              </div>

              {/* Gợi ý nhanh dạng tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPromptAiText(s);
                      inputRef.current?.focus();
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '16px',
                      padding: '3px 9px',
                      fontSize: '0.74rem',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#8b5cf6';
                      e.currentTarget.style.color = '#c084fc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                      e.currentTarget.style.color = 'var(--text-dim)';
                    }}
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </form>
          </div>

          <button
            className="prompt-skip-btn"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '10px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
              cursor: 'pointer',
              textAlign: 'center'
            }}
          >
            Bỏ qua / Bổ sung sau trên trang Web ➔
          </button>
        </div>
      </div>
    </div>
  );
}
