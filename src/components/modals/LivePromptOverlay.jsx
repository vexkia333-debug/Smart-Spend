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
