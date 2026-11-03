import React from 'react';
import { 
  Sparkles, AlertTriangle, AlertCircle, CheckCircle2, TrendingUp, TrendingDown, RefreshCw, 
  Calendar, Edit3, BarChart3, Sun, Trophy, Wallet, ArrowRight
} from 'lucide-react';
import { formatVND, formatDateVN } from '../../../utils/formatters.js';
import CustomDatePopover from '../../common/CustomDatePopover.jsx';

export default function ReportTab({
  period,
  handlePeriodChange,
  selectedDate,
  setSelectedDate,
  showDatePicker,
  setShowDatePicker,
  isLoading,
  error,
  reportData,
  fetchReport,
  onEditTransaction,
  onClose,
  getTodayStr
}) {
  const ai = reportData?.aiEvaluation || reportData?.aiAnalysis;

  return (
    <div>
      {/* Bộ chọn chu kỳ định kỳ (Segmented Period Switcher) */}
      <div className="report-period-switcher">
        <button
          type="button"
          className={`report-period-pill ${period === 'DAY' ? 'active' : ''}`}
          onClick={() => handlePeriodChange('DAY')}
        >
          <Sun size={15} />
          <span>Báo cáo ngày</span>
        </button>
        <button
          type="button"
          className={`report-period-pill ${period === 'WEEK' ? 'active' : ''}`}
          onClick={() => handlePeriodChange('WEEK')}
        >
          <TrendingUp size={15} />
          <span>Sau 1 tuần (7 ngày)</span>
        </button>
        <button
          type="button"
          className={`report-period-pill ${period === 'MONTH' ? 'active' : ''}`}
          onClick={() => handlePeriodChange('MONTH')}
        >
          <Trophy size={15} />
          <span>Sau 1 tháng</span>
        </button>
      </div>

      {/* Date / Period Selector Bar */}
      <div className="daily-report-filter-bar">
        <div className="daily-report-date-container">
          <Calendar size={16} color="var(--accent-cyan, #38bdf8)" style={{ flexShrink: 0 }} />
          <span className="daily-report-date-label">
            {period === 'DAY' ? 'Ngày xem:' : period === 'WEEK' ? 'Mốc tuần:' : 'Mốc tháng:'}
          </span>
          <button
            type="button"
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="daily-report-date-trigger-btn"
            title="Bấm để mở lịch chọn mốc thời gian"
          >
            <Calendar size={14} color="var(--accent-cyan, #38bdf8)" />
            <span>{reportData?.dateLabel || formatDateVN(selectedDate)}</span>
          </button>

          <CustomDatePopover
            isOpen={showDatePicker}
            onClose={() => setShowDatePicker(false)}
            mode="single"
            selectedDate={selectedDate}
            onSelectDate={(newDate) => {
              setSelectedDate(newDate);
              setShowDatePicker(false);
            }}
            align="left"
            title={period === 'DAY' ? 'Chọn ngày xem báo cáo' : period === 'WEEK' ? 'Chọn ngày trong tuần cần tổng kết' : 'Chọn ngày trong tháng cần tổng hợp'}
          />
        </div>

        <div className="daily-report-quick-actions">
          {period === 'DAY' && (
            <button
              type="button"
              onClick={() => setSelectedDate(getTodayStr())}
              className={`period-quick-btn ${selectedDate === getTodayStr() ? 'active' : ''}`}
            >
              Hôm nay
            </button>
          )}

          {period === 'WEEK' && (
            <>
              <button
                type="button"
                onClick={() => setSelectedDate(getTodayStr())}
                className="period-quick-btn"
              >
                Tuần này
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 7);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  setSelectedDate(`${y}-${m}-${day}`);
                }}
                className="period-quick-btn"
              >
                Tuần trước
              </button>
            </>
          )}

          {period === 'MONTH' && (
            <>
              <button
                type="button"
                onClick={() => setSelectedDate(getTodayStr())}
                className="period-quick-btn"
              >
                Tháng này
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setMonth(d.getMonth() - 1);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  setSelectedDate(`${y}-${m}-${day}`);
                }}
                className="period-quick-btn"
              >
                Tháng trước
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => fetchReport(selectedDate, true, period)}
            disabled={isLoading}
            className="period-refresh-btn"
            title="Kích hoạt Gemini AI phân tích lại toàn diện"
          >
            <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
            <span>Phân tích lại</span>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--accent-purple, #c084fc)' }}>
          <RefreshCw size={32} className="spin" style={{ margin: '0 auto 12px auto' }} />
          <div style={{ fontWeight: 600 }}>Gemini AI đang tổng hợp và phân tích dữ liệu {period === 'WEEK' ? 'tuần' : period === 'MONTH' ? 'tháng' : 'ngày'}...</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Kiểm tra dòng tiền, cơ cấu chi tiêu và phát hiện các khoản bất thường
          </div>
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: 'var(--accent-rose, #fb7185)',
            fontSize: '0.9rem',
            marginBottom: '16px'
          }}
        >
          {error}
        </div>
      )}

      {/* Report Content */}
      {!isLoading && reportData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Top Cards Row: Thu - Chi - Tích lũy - Đánh giá */}
          <div className="daily-report-stats-grid">
            <div className="daily-report-stat-card stat-income">
              <div className="daily-report-stat-header">
                <span className="daily-report-stat-label">
                  {period === 'DAY' ? 'Tổng thu hôm nay' : period === 'WEEK' ? 'Tổng thu 7 ngày' : 'Tổng thu cả tháng'}
                </span>
                <TrendingUp size={15} className="stat-card-icon income" />
              </div>
              <div className="daily-report-stat-value income tabular-nums">
                +{formatVND(reportData.totalIncome)}
              </div>
            </div>

            <div className="daily-report-stat-card stat-expense">
              <div className="daily-report-stat-header">
                <span className="daily-report-stat-label">
                  {period === 'DAY' ? 'Tổng chi hôm nay' : period === 'WEEK' ? 'Tổng chi 7 ngày' : 'Tổng chi cả tháng'}
                </span>
                <TrendingDown size={15} className="stat-card-icon expense" />
              </div>
              <div className="daily-report-stat-value expense tabular-nums">
                -{formatVND(reportData.totalExpense)}
              </div>
            </div>

            <div className="daily-report-stat-card stat-net">
              <div className="daily-report-stat-header">
                <span className="daily-report-stat-label">
                  {period === 'MONTH' ? 'Tích lũy / Tiết kiệm' : 'Dòng tiền ròng'}
                </span>
                <Wallet size={15} className="stat-card-icon net" />
              </div>
              <div
                className={`daily-report-stat-value tabular-nums ${
                  reportData.netFlow >= 0 ? 'net-pos' : 'net-neg'
                }`}
              >
                {reportData.netFlow >= 0 ? '+' : ''}{formatVND(reportData.netFlow)}
              </div>
            </div>

            <div className="daily-report-stat-card ai-rating">
              <div className="daily-report-stat-header">
                <span className="daily-report-stat-label ai">
                  {period === 'MONTH' ? 'Sức khỏe tài chính' : period === 'WEEK' ? 'Kỷ luật tuần' : 'Xếp loại AI'}
                </span>
                <Sparkles size={15} className="stat-card-icon ai" />
              </div>
              <div className="daily-report-stat-value rating">
                {ai?.rating ? ai.rating.replace(/👍|🔥|⚠️|❌/g, '').trim() : 'Cân đối'}
              </div>
            </div>
          </div>

          {/* AI Overview Box */}
          <div className="daily-report-ai-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Sparkles size={16} color="var(--accent-purple, #c084fc)" />
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-purple, #c084fc)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                AI Nhận xét & Đánh giá tổng quan ({reportData.dateRange || reportData.dateLabel})
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: '1.55', color: 'var(--text-main)' }}>
              {ai?.overview || 'Không có dữ liệu đánh giá.'}
            </p>
          </div>

          {/* Phân tích chuyên sâu / Điểm nổi bật (Highlights) */}
          {ai?.highlights && ai.highlights.length > 0 && (
            <div className="daily-report-highlights-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <BarChart3 size={16} color="var(--accent-cyan, #38bdf8)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-cyan, #38bdf8)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Điểm nổi bật & Phân tích cơ cấu chi tiêu
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {ai.highlights.map((h, idx) => (
                  <div key={idx} style={{ fontSize: '0.86rem', color: 'var(--text-main)', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.5' }}>
                    <span style={{ color: 'var(--accent-cyan, #38bdf8)', fontWeight: 800 }}>•</span>
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Khoản bất thường & Nghi vấn xếp sai */}
          <div className="daily-report-anomalies-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <AlertTriangle size={18} color="var(--accent-amber, #f59e0b)" />
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Phát hiện nghi vấn & Khoản bất thường {period === 'WEEK' ? 'trong tuần' : period === 'MONTH' ? 'trong tháng' : 'trong ngày'}
              </span>
            </div>

            {ai?.anomalies && ai.anomalies.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ai.anomalies.map((item, idx) => (
                  <div
                    key={idx}
                    className="daily-report-anomaly-item"
                  >
                    <AlertCircle size={16} color="var(--accent-amber, #f59e0b)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{typeof item === 'string' ? item.replace(/^⚠️\s*/, '') : item}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="daily-report-anomaly-empty">
                <CheckCircle2 size={16} color="var(--accent-emerald, #10b981)" style={{ flexShrink: 0 }} />
                <span>Không phát hiện khoản chi tiêu nào bất thường. Toàn bộ giao dịch đều đúng chuẩn!</span>
              </div>
            )}

            {/* Đề xuất sửa chữa nhanh giao dịch có vấn đề */}
            {ai?.suggestedEdits && ai.suggestedEdits.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '8px' }}>
                  Gợi ý chỉnh sửa ngay:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {ai.suggestedEdits.map((s, idx) => {
                    const targetTx = reportData.transactions?.find((t) => t.id === s.txId);
                    return (
                      <div
                        key={idx}
                        className="daily-report-suggested-edit-card"
                      >
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            {s.txDescription}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span>Đang phân loại:</span>
                            <span style={{ color: 'var(--accent-rose, #f43f5e)', fontWeight: 600 }}>{s.currentCategory}</span>
                            <ArrowRight size={12} color="var(--text-dim)" />
                            <span>Đề xuất:</span>
                            <span style={{ color: 'var(--accent-emerald, #10b981)', fontWeight: 700 }}>{s.suggestedCategory}</span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--accent-purple, #c084fc)', marginTop: '2px' }}>
                            Lý do: {s.reason}
                          </div>
                        </div>

                        {targetTx && onEditTransaction && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onEditTransaction(targetTx);
                            }}
                            className="btn btn-primary"
                            style={{
                              fontSize: '0.76rem',
                              padding: '5px 12px',
                              borderRadius: '8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Edit3 size={13} />
                            Sửa ngay
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Lời khuyên định hướng & Kế hoạch ngân sách */}
          {ai?.advice && (
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '16px',
                padding: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <TrendingUp size={16} color="var(--accent-cyan, #38bdf8)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-cyan, #38bdf8)', textTransform: 'uppercase' }}>
                  {period === 'WEEK' ? 'Chiến lược ngân sách cho tuần tới' : period === 'MONTH' ? 'Kế hoạch tài chính cho tháng mới' : 'Lời khuyên tài chính cho ngày mai'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: '1.5', color: 'var(--text-main)' }}>
                {ai.advice}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

