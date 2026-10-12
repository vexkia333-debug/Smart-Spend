import React from 'react';
import {
  Wallet,
  Settings,
  Sun,
  Moon,
  Sparkles,
  Key,
  Bot,
  CheckCircle2
} from 'lucide-react';

export default function Header({
  theme,
  toggleTheme,
  timeFilter,
  setTimeFilter,
  onOpenSettings,
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
  return (
    <>
      <header className="app-header glass-panel">
        <div className="logo-group">
          <div className="logo-icon">
            <Wallet size={24} color="#ffffff" />
          </div>
          <div className="logo-text">
            <h1>SmartSpend</h1>
            <p>Hệ thống tự động hóa chi tiêu & Prompt tương tác di động</p>
          </div>
        </div>

        <div className="header-actions">
          {/* Bộ lọc thời gian: Tất cả / Tháng / Tuần / Ngày */}
          <div className="time-filter-bar">
            <button
              className={`time-filter-btn ${timeFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setTimeFilter('ALL')}
            >
              Tất cả
            </button>
            <button
              className={`time-filter-btn ${timeFilter === 'MONTH' ? 'active' : ''}`}
              onClick={() => setTimeFilter('MONTH')}
            >
              Tháng này
            </button>
            <button
              className={`time-filter-btn ${timeFilter === 'WEEK' ? 'active' : ''}`}
              onClick={() => setTimeFilter('WEEK')}
            >
              Tuần này
            </button>
            <button
              className={`time-filter-btn ${timeFilter === 'DAY' ? 'active' : ''}`}
              onClick={() => setTimeFilter('DAY')}
            >
              Hôm nay
            </button>
          </div>

          <div className="header-utility-btns">
            {/* Nút Cài đặt hệ thống & Webhook */}
            <button
              className="theme-toggle-btn"
              onClick={onOpenSettings}
              title="Cài đặt kết nối MacroDroid & Google AI"
            >
              <Settings size={18} />
            </button>

            {/* Nút chuyển giao diện Sáng / Tối */}
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={`Chuyển sang giao diện ${theme === 'dark' ? 'Sáng' : 'Tối'}`}
            >
              {theme === 'dark' ? <Sun size={19} color="#f59e0b" /> : <Moon size={19} color="#3b82f6" />}
            </button>
          </div>
        </div>
      </header>

      {/* AI Smart Input Card (Google AI Studio Gemini) */}
      <section className="glass-panel ai-smart-card">
        <div className="ai-header-row">
          <div className="ai-title">
            <Sparkles size={19} color="#8b5cf6" />
            Nhập dòng tiền thông minh bằng Google Gemini AI
          </div>

          <div
            className={`ai-key-badge ${hasGeminiKey ? 'ai-key-active' : 'ai-key-missing'}`}
            onClick={onOpenApiKeyModal}
            title="Bấm để cấu hình API Key Google AI Studio miễn phí"
          >
            <Key size={14} />
            {hasGeminiKey ? `Gemini Key: ${maskedKey}` : '⚡ Kết nối API Key (Miễn phí)'}
          </div>
        </div>

        <form onSubmit={handleAnalyzeAi} className="ai-input-row">
          <input
            type="text"
            className="ai-text-input"
            value={aiInputText}
            onChange={(e) => setAiInputText(e.target.value)}
            placeholder="Gõ chi tiết chi tiêu (VD: bún bò 45k, cafe Highlands, đổ xăng 50k)..."
            disabled={isAnalyzingAi}
          />
          <button
            type="button"
            className={`ai-cash-toggle ${aiIsCash ? 'active' : ''}`}
            onClick={() => setAiIsCash(!aiIsCash)}
            title="Mặc định: Ghi vào Ví Tiền Mặt (nhấn để đổi)"
          >
            💵 Tiền mặt {aiIsCash ? '✓' : ''}
          </button>
          <button type="submit" className="btn ai-submit-btn" disabled={isAnalyzingAi}>
            <Bot size={18} />
            {isAnalyzingAi ? 'Đang phân tích...' : '✨ Phân loại AI'}
          </button>
        </form>

        {aiMessage && (
          <div className="ai-result-alert">
            <CheckCircle2 size={16} />
            {aiMessage}
          </div>
        )}
      </section>
    </>
  );
}
