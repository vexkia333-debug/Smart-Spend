import React, { useEffect, useRef } from 'react';
import { Sparkles, X, Key, Building2, Wallet, Send, Loader2 } from 'lucide-react';

const QUICK_PROMPT_EXAMPLES = [
  'Cà phê sáng 25k',
  'Ăn trưa 45k + gửi xe 5k',
  'Đổ xăng 60k',
  'Siêu thị 185k',
  'Nhận lương 10tr'
];

export default function QuickAddModal({
  isOpen,
  onClose,
  hasGeminiKey,
  maskedKey,
  onOpenApiKeyModal,
  aiInputText,
  setAiInputText,
  aiIsCash,
  setAiIsCash,
  isAnalyzingAi,
  handleAnalyzeAi,
  aiMessage
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectExample = (text) => {
    setAiInputText(text);
    inputRef.current?.focus();
  };

  return (
    <div
      className="quick-add-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Thêm giao dịch thông minh với Gemini AI"
    >
      <div className="quick-add-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="quick-add-grabber" aria-hidden="true" />

        <div className="quick-add-header">
          <div className="quick-add-title-group">
            <span className="quick-add-icon-badge">
              <Sparkles size={18} />
            </span>
            <div>
              <h3>Thêm giao dịch AI</h3>
              <p>Nhập tự nhiên 1 hoặc nhiều khoản cùng lúc</p>
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="quick-add-meta-row">
          <div className="quick-add-source-row" role="group" aria-label="Nguồn tiền">
            <button
              type="button"
              className={`quick-add-source-btn ${!aiIsCash ? 'active' : ''}`}
              onClick={() => setAiIsCash(false)}
            >
              <Building2 size={15} />
              <span>Ngân hàng</span>
            </button>
            <button
              type="button"
              className={`quick-add-source-btn ${aiIsCash ? 'active cash' : ''}`}
              onClick={() => setAiIsCash(true)}
            >
              <Wallet size={15} />
              <span>Tiền mặt</span>
            </button>
          </div>

          <button
            type="button"
            className={`ai-key-badge ${hasGeminiKey ? 'ai-key-active' : 'ai-key-missing'}`}
            onClick={() => {
              onClose();
              onOpenApiKeyModal();
            }}
          >
            <Key size={13} />
            <span>{hasGeminiKey ? `Gemini (${maskedKey})` : 'Kết nối API Key'}</span>
          </button>
        </div>

        <div className="quick-add-chips">
          {QUICK_PROMPT_EXAMPLES.map((sample) => (
            <button
              key={sample}
              type="button"
              className="quick-add-chip"
              onClick={() => handleSelectExample(sample)}
            >
              {sample}
            </button>
          ))}
        </div>

        <form onSubmit={handleAnalyzeAi} className="quick-add-form">
          <textarea
            ref={inputRef}
            className="quick-add-textarea"
            rows={3}
            placeholder="Ví dụ: Sáng ăn phở 45k, cà phê 25k, chiều đổ xăng 70k..."
            value={aiInputText}
            onChange={(e) => setAiInputText(e.target.value)}
            disabled={isAnalyzingAi}
          />

          <button
            type="submit"
            className="quick-add-submit-btn"
            disabled={isAnalyzingAi || !aiInputText.trim()}
          >
            {isAnalyzingAi ? (
              <>
                <Loader2 size={18} className="spin" />
                <span>Gemini AI đang phân tách...</span>
              </>
            ) : (
              <>
                <Send size={17} />
                <span>Phân tích &amp; Lưu giao dịch</span>
              </>
            )}
          </button>
        </form>

        {aiMessage && (
          <div
            className={`quick-add-feedback ${
              aiMessage.includes('❌') || aiMessage.toLowerCase().includes('lỗi') ? 'error' : 'success'
            }`}
          >
            {aiMessage}
          </div>
        )}
      </div>
    </div>
  );
}
