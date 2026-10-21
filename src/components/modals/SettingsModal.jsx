import React, { useState } from 'react';
import { Settings, X, Copy, Sparkles, Key } from 'lucide-react';

export default function SettingsModal({
  isOpen,
  onClose,
  webhookUrl,
  hasGeminiKey,
  maskedKey,
  onOpenApiKeyModal
}) {
  const [copiedWebhook, setCopiedWebhook] = useState(false);

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
          width: '560px',
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
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
            marginBottom: '18px'
          }}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
            <Settings size={20} color="var(--accent-cyan)" />
            Cài đặt kết nối & Webhook điện thoại
          </h3>
          <button className="prompt-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Webhook URL Box */}
        <div style={{ marginBottom: '20px' }}>
          <label className="form-label" style={{ fontWeight: 600 }}>
            Webhook URL của Server:
          </label>
          <div className="code-box" style={{ fontSize: '0.84rem', wordBreak: 'break-all' }}>
            {webhookUrl}
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '0.82rem', padding: '6px 14px' }}
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                setCopiedWebhook(true);
                setTimeout(() => setCopiedWebhook(false), 2000);
              }}
            >
              <Copy size={14} />
              {copiedWebhook ? 'Đã sao chép!' : 'Sao chép Webhook URL'}
            </button>
          </div>
        </div>

        {/* Google AI Status & Quick Link */}
        <div
          style={{
            background: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            marginBottom: '20px'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px'
            }}
          >
            <span
              style={{
                fontWeight: 600,
                color: '#c4b5fd',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Sparkles size={16} /> Google Gemini AI
            </span>
            <span
              style={{
                fontSize: '0.8rem',
                color: hasGeminiKey ? '#10b981' : '#f59e0b',
                fontWeight: 600
              }}
            >
              {hasGeminiKey ? '● Đã kết nối' : '○ Chưa có Key'}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
            {hasGeminiKey
              ? `API Key hiện tại: ${maskedKey}`
              : 'Cần API key của Google AI Studio để phân tích tự nhiên.'}
          </p>
          <button
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '5px 12px' }}
            onClick={() => {
              onClose();
              onOpenApiKeyModal();
            }}
          >
            <Key size={14} /> Thiết lập / Đổi API Key
          </button>
        </div>

        {/* MacroDroid Quick Guide */}
        <div style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' }}>
          <h4 style={{ color: '#fff', marginBottom: '8px' }}>
            Cấu hình MacroDroid trên điện thoại:
          </h4>
          <ol style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>
              <strong>Trigger:</strong> Chọn <em>Thông báo (Notification)</em> $\rightarrow$ Chọn các ứng dụng bạn muốn theo dõi (Agribank Plus, Techcombank, Viettel Money...).
            </li>
            <li>
              <strong>Action:</strong> Chọn <em>HTTP Request (POST)</em> $\rightarrow$ Dán Webhook URL ở trên.
            </li>
            <li>
              <strong>Body (JSON):</strong>
              <div className="code-box" style={{ margin: '6px 0', fontSize: '0.78rem' }}>
{`{
  "content": "[notification_text]",
  "title": "[notification_title]",
  "appName": "[notification_app_name]",
  "timestamp": "[hour]:[minute] [day]-[month]-[year]"
}`}
              </div>
            </li>
          </ol>
          <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '6px', fontSize: '0.8rem', color: '#7dd3fc' }}>
            💡 <strong>Đa tài khoản:</strong> Bạn có thể chọn cùng lúc cả 3 app trong 1 Trigger MacroDroid hoặc tạo từng Macro riêng. Hệ thống tự động phân loại giao dịch vào đúng từng tài khoản & ví tương ứng!
          </div>
        </div>

        <div style={{ marginTop: '22px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
