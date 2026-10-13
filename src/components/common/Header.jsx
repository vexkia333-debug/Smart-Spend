import React from 'react';
import {
  Wallet,
  Settings,
  Sun,
  Moon,
  Sparkles,
  Key,
  Bot,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import CustomDatePopover from './CustomDatePopover.jsx';

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
  aiMessage,
  customStartDate,
  customEndDate,
  onApplyCustomDate,
  onResetTimeFilter,
  showCustomDatePopover,
  setShowCustomDatePopover
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
          {/* Bộ lọc thời gian: Tất cả / Tháng / Tuần / Ngày / Tùy chọn */}
          <div className="time-filter-wrapper">
            <div className="time-filter-bar">
              <button
                className={`time-filter-btn ${timeFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setTimeFilter('ALL');
                  if (setShowCustomDatePopover) setShowCustomDatePopover(false);
                }}
              >
                Tất cả
              </button>
              <button
                className={`time-filter-btn ${timeFilter === 'MONTH' ? 'active' : ''}`}
                onClick={() => {
                  setTimeFilter('MONTH');
                  if (setShowCustomDatePopover) setShowCustomDatePopover(false);
                }}
              >
                Tháng này
              </button>
              <button
                className={`time-filter-btn ${timeFilter === 'WEEK' ? 'active' : ''}`}
                onClick={() => {
                  setTimeFilter('WEEK');
                  if (setShowCustomDatePopover) setShowCustomDatePopover(false);
                }}
              >
                Tuần này
              </button>
              <button
                className={`time-filter-btn ${timeFilter === 'DAY' ? 'active' : ''}`}
                onClick={() => {
                  setTimeFilter('DAY');
                  if (setShowCustomDatePopover) setShowCustomDatePopover(false);
                }}
              >
                Hôm nay
              </button>
              <button
                className={`time-filter-btn ${timeFilter === 'CUSTOM' ? 'active' : ''}`}
                onClick={() => {
                  if (setShowCustomDatePopover) {
                    setShowCustomDatePopover(!showCustomDatePopover);
                  }
                }}
                title="Lọc theo khoảng thời gian tùy chọn"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
              >
                <Calendar size={13} />
                <span>Tùy chọn</span>
              </button>
            </div>

            {/* Custom Date Range Popover hiển thị ngay bên dưới bộ lọc */}
            <CustomDatePopover
              isOpen={showCustomDatePopover}
              onClose={() => setShowCustomDatePopover && setShowCustomDatePopover(false)}
              startDate={customStartDate}
              endDate={customEndDate}
              onApply={onApplyCustomDate}
              onReset={onResetTimeFilter}
            />
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
