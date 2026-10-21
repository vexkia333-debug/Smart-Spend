import React from 'react';
import { Key, X } from 'lucide-react';

export default function ApiKeyModal({
  isOpen,
  onClose,
  apiKeyInput,
  setApiKeyInput,
  hasGeminiKey,
  maskedKey,
  isSavingKey,
  handleSaveApiKey
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '500px',
          maxWidth: '100%',
          padding: '28px',
          background: 'var(--bg-card-solid)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px',
          boxShadow: 'var(--shadow-card)',
          backdropFilter: 'blur(20px)',
          color: 'var(--text-main)'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
            <Key size={20} color="var(--accent-purple)" />
            Cấu hình Google AI Studio API Key (Gemini)
          </h3>
          <button className="prompt-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p
          style={{
            fontSize: '0.88rem',
            color: 'var(--text-muted)',
            marginBottom: '16px',
            lineHeight: '1.5'
          }}
        >
          Google cung cấp gói <strong>Gemini 2.5 Flash hoàn toàn miễn phí</strong> (hàng ngàn lượt phân tích/ngày). Bạn chỉ cần lấy API Key 1 lần và dán vào đây:
        </p>

        <div
          style={{
            background: 'rgba(139, 92, 246, 0.1)',
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '18px',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            fontSize: '0.82rem',
            color: '#c4b5fd'
          }}
        >
          👉 Lấy API key miễn phí tại:{' '}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#38bdf8', textDecoration: 'underline', fontWeight: 600 }}
          >
            aistudio.google.com/app/apikey
          </a>{' '}
          (đăng nhập tài khoản Google $\rightarrow$ bấm "Create API key").
        </div>

        <form onSubmit={handleSaveApiKey}>
          <div className="form-group">
            <label className="form-label">Dán Gemini API Key của bạn vào đây:</label>
            <input
              type="password"
              className="form-input"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={hasGeminiKey ? `Đang dùng: ${maskedKey} (nhập mới để đổi)` : 'AIzaSy...'}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={onClose}
            >
              Đóng
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1, background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' }}
              disabled={isSavingKey}
            >
              {isSavingKey ? 'Đang lưu...' : 'Lưu API Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
