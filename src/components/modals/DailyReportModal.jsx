import React, { useState, useEffect } from 'react';
import { 
  X, Sparkles, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, 
  RefreshCw, Calendar, Edit3, ArrowRight, Bell, Smartphone, Send, 
  Check, Clock, ShieldCheck, CheckCircle, Award, BarChart3, PieChart
} from 'lucide-react';
import { formatVND, formatDateVN } from '../../utils/formatters.js';
import { checkPushSubscriptionStatus, subscribeUserToPush, testPushNotification } from '../../utils/pushNotifications.js';
import CustomDatePopover from '../common/CustomDatePopover.jsx';

export default function DailyReportModal({
  isOpen,
  onClose,
  authFetch,
  onEditTransaction
}) {
  if (!isOpen) return null;

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [activeTab, setActiveTab] = useState('report'); // 'report' | 'automation'
  const [period, setPeriod] = useState('DAY'); // 'DAY' | 'WEEK' | 'MONTH'
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState(null);

  // Trạng thái thông báo ứng dụng Web Push
  const [pushStatus, setPushStatus] = useState({ supported: true, isSubscribed: false, permission: 'default' });
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);

  // Cấu hình thông báo tự động (Ngày, Tuần, Tháng)
  const [autoSettings, setAutoSettings] = useState({
    time: '22:00',
    enabled: true,
    weeklyTime: '21:00',
    weeklyEnabled: true,
    weeklyDay: '0', // 0 = CN, 1 = T2
    monthlyTime: '21:30',
    monthlyEnabled: true
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const fetchReport = async (dateToFetch, forceRefresh = false, targetPeriod = period) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/ai/daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateToFetch, refresh: forceRefresh, period: targetPeriod })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi tải báo cáo');
      setReportData(data);
    } catch (err) {
      setError(err.message || 'Không thể tạo báo cáo');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAutoSettings = async () => {
    try {
      const res = await authFetch('/api/settings/daily-report');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setAutoSettings({
            time: data.settings.time || '22:00',
            enabled: data.settings.enabled !== false,
            weeklyTime: data.settings.weeklyTime || '21:00',
            weeklyEnabled: data.settings.weeklyEnabled !== false,
            weeklyDay: data.settings.weeklyDay || '0',
            monthlyTime: data.settings.monthlyTime || '21:30',
            monthlyEnabled: data.settings.monthlyEnabled !== false
          });
        }
      }
    } catch (e) {
      console.warn('Lỗi tải cấu hình báo cáo:', e);
    }
  };

  const loadPushStatus = async () => {
    try {
      const status = await checkPushSubscriptionStatus();
      setPushStatus(status);
    } catch (e) {
      console.warn('Lỗi kiểm tra push status:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReport(selectedDate, false, period);
      fetchAutoSettings();
      loadPushStatus();
    }
  }, [isOpen, selectedDate, period]);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    fetchReport(selectedDate, false, newPeriod);
  };

  const handleEnablePush = async () => {
    setIsSubscribingPush(true);
    setTestResult(null);
    try {
      const res = await subscribeUserToPush(authFetch);
      await loadPushStatus();
      if (res?.isPushServiceIssue) {
        setTestResult({
          success: true,
          isWarning: true,
          message: res.message
        });
      } else {
        setTestResult({
          success: true,
          message: res?.message || '🎉 Đã bật thông báo ứng dụng thành công! Điện thoại của bạn sẽ tự động nhận báo cáo định kỳ.'
        });
      }
    } catch (err) {
      if (err.message?.toLowerCase().includes('push service error') || err.name === 'AbortError') {
        localStorage.setItem('smartspend_push_mode', 'BROWSER_LOCAL');
        await loadPushStatus();
        setTestResult({
          success: true,
          isWarning: true,
          message: 'Đã cấp quyền thông báo hệ thống! (Máy Xiaomi/MIUI đang chặn ngầm Google FCM; app đã kích hoạt chế độ thông báo trực tiếp & hỗ trợ MacroDroid dự phòng)'
        });
      } else {
        setTestResult({ success: false, message: '❌ ' + err.message });
      }
    } finally {
      setIsSubscribingPush(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const res = await authFetch('/api/settings/daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(autoSettings)
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ success: true, message: 'Đã lưu cấu hình thông báo tự động thành công!' });
        setTimeout(() => setTestResult(null), 4000);
      } else {
        throw new Error(data.error || 'Lỗi lưu cấu hình');
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTestPeriodPush = async (periodType) => {
    setIsTestingPush(true);
    setTestResult(null);
    try {
      await testPushNotification(authFetch);

      const res = await authFetch('/api/ai/daily-report/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, period: periodType })
      });
      const data = await res.json();

      if (res.ok) {
        const periodName = periodType === 'WEEK' ? 'Tổng kết tuần' : periodType === 'MONTH' ? 'Tổng hợp tháng' : 'Báo cáo ngày';
        setTestResult({
          success: true,
          message: `🔔 Đã bắn thông báo [${periodName}] trực tiếp tới thiết bị của bạn thành công!`
        });
        fetchReport(selectedDate, false, period);
      } else {
        throw new Error(data.error || 'Lỗi gửi thông báo');
      }
    } catch (err) {
      setTestResult({ success: false, message: '❌ Lỗi: ' + err.message });
    } finally {
      setIsTestingPush(false);
    }
  };

  const ai = reportData?.aiEvaluation;

  return (
    <div className="prompt-modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="glass-panel daily-report-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '840px',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'var(--bg-card-solid)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'clamp(18px, 4vw, 24px)',
          padding: 'clamp(14px, 3.5vw, 24px)',
          boxShadow: 'var(--shadow-card, 0 25px 60px -15px rgba(0, 0, 0, 0.4))',
          backdropFilter: 'blur(24px)',
          color: 'var(--text-main)'
        }}
      >
        {/* Header */}
        <div className="daily-report-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              className="daily-report-icon-box"
              style={{
                width: '40px',
                height: '40px',
                flexShrink: 0,
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(56, 189, 248, 0.25))',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Sparkles size={20} color="var(--accent-purple, #c084fc)" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="daily-report-title-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 'clamp(1.05rem, 4vw, 1.25rem)', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.2 }}>
                  Báo cáo tài chính AI & Đánh giá định kỳ
                </h3>
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '9999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Clock size={11} /> Tự động Ngày • Tuần • Tháng
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                AI Gemini phân tích dòng tiền cuối ngày, tổng kết sau 1 tuần & 1 tháng kèm tự động đẩy thông báo ứng dụng
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              flexShrink: 0
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          className="daily-report-tabs-bar"
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap'
          }}
        >
          <button
            type="button"
            className="daily-report-tab-btn"
            onClick={() => setActiveTab('report')}
            style={{
              flex: '1 1 140px',
              justifyContent: 'center',
              background: activeTab === 'report' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              borderColor: activeTab === 'report' ? 'var(--accent-purple, #c084fc)' : 'transparent',
              borderWidth: '1px',
              borderStyle: 'solid',
              color: activeTab === 'report' ? 'var(--accent-purple, #a855f7)' : 'var(--text-dim)',
              padding: '7px 12px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Sparkles size={15} />
            Báo cáo AI & Bất thường
          </button>

          <button
            type="button"
            className="daily-report-tab-btn"
            onClick={() => setActiveTab('automation')}
            style={{
              flex: '1 1 140px',
              justifyContent: 'center',
              background: activeTab === 'automation' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderColor: activeTab === 'automation' ? 'var(--accent-cyan, #38bdf8)' : 'transparent',
              borderWidth: '1px',
              borderStyle: 'solid',
              color: activeTab === 'automation' ? 'var(--accent-cyan, #0284c7)' : 'var(--text-dim)',
              padding: '7px 12px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Bell size={15} />
            Thông báo app & Lịch tự động
          </button>
        </div>

        {/* TAB 1: NỘI DUNG BÁO CÁO */}
        {activeTab === 'report' && (
          <div>
            {/* Bộ chọn chu kỳ định kỳ (Segmented Period Switcher) */}
            <div className="report-period-switcher">
              <button
                type="button"
                className={`report-period-pill ${period === 'DAY' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('DAY')}
              >
                ☀️ Báo cáo ngày
              </button>
              <button
                type="button"
                className={`report-period-pill ${period === 'WEEK' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('WEEK')}
              >
                📈 Sau 1 tuần (7 ngày)
              </button>
              <button
                type="button"
                className={`report-period-pill ${period === 'MONTH' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('MONTH')}
              >
                🏆 Sau 1 tháng
              </button>
            </div>

            {/* Date / Period Selector Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '8px 12px',
                marginBottom: '18px',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <Calendar size={16} color="var(--accent-cyan, #38bdf8)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dim)', whiteSpace: 'nowrap', flexShrink: 0 }}>
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

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                {period === 'DAY' && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(getTodayStr())}
                    className="period-quick-btn"
                    style={{
                      background: selectedDate === getTodayStr() ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-input)',
                      borderColor: selectedDate === getTodayStr() ? 'var(--accent-cyan, #38bdf8)' : 'var(--border-subtle)',
                      color: selectedDate === getTodayStr() ? 'var(--accent-cyan, #38bdf8)' : 'var(--text-muted)'
                    }}
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
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(139, 92, 246, 0.15)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    color: 'var(--accent-purple, #c084fc)',
                    padding: '5px 11px',
                    borderRadius: '7px',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                  title="Kích hoạt Gemini AI phân tích lại toàn diện"
                >
                  <RefreshCw size={12} className={isLoading ? 'spin' : ''} />
                  Phân tích lại
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
                  <div className="daily-report-stat-card">
                    <div className="daily-report-stat-label">
                      {period === 'DAY' ? 'Tổng thu hôm nay' : period === 'WEEK' ? 'Tổng thu 7 ngày' : 'Tổng thu cả tháng'}
                    </div>
                    <div className="daily-report-stat-value income">
                      +{formatVND(reportData.totalIncome)}
                    </div>
                  </div>

                  <div className="daily-report-stat-card">
                    <div className="daily-report-stat-label">
                      {period === 'DAY' ? 'Tổng chi hôm nay' : period === 'WEEK' ? 'Tổng chi 7 ngày' : 'Tổng chi cả tháng'}
                    </div>
                    <div className="daily-report-stat-value expense">
                      -{formatVND(reportData.totalExpense)}
                    </div>
                  </div>

                  <div className="daily-report-stat-card">
                    <div className="daily-report-stat-label">
                      {period === 'MONTH' ? 'Tích lũy / Tiết kiệm' : 'Dòng tiền ròng'}
                    </div>
                    <div
                      className={`daily-report-stat-value ${
                        reportData.netFlow >= 0 ? 'net-pos' : 'net-neg'
                      }`}
                    >
                      {reportData.netFlow >= 0 ? '+' : ''}{formatVND(reportData.netFlow)}
                    </div>
                  </div>

                  <div className="daily-report-stat-card ai-rating">
                    <div className="daily-report-stat-label ai">
                      {period === 'MONTH' ? 'Sức khỏe tài chính' : period === 'WEEK' ? 'Kỷ luật tuần' : 'Xếp loại AI'}
                    </div>
                    <div className="daily-report-stat-value rating">
                      {ai?.rating || 'Cân đối 👍'}
                    </div>
                  </div>
                </div>

                {/* AI Overview Box */}
                <div
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '16px',
                    padding: '16px',
                    position: 'relative'
                  }}
                >
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
                  <div
                    style={{
                      background: 'rgba(56, 189, 248, 0.06)',
                      border: '1px solid rgba(56, 189, 248, 0.22)',
                      borderRadius: '16px',
                      padding: '16px'
                    }}
                  >
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
                <div
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '16px',
                    padding: '16px'
                  }}
                >
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
                          style={{
                            background: 'rgba(245, 158, 11, 0.12)',
                            border: '1px solid rgba(245, 158, 11, 0.28)',
                            borderRadius: '10px',
                            padding: '10px 14px',
                            fontSize: '0.85rem',
                            color: 'var(--text-main)',
                            lineHeight: '1.5'
                          }}
                        >
                          ⚠️ {item}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#10b981',
                        fontSize: '0.85rem',
                        padding: '8px 12px',
                        background: 'rgba(16, 185, 129, 0.08)',
                        borderRadius: '8px'
                      }}
                    >
                      <CheckCircle2 size={16} />
                      Không phát hiện khoản chi tiêu nào bất thường. Toàn bộ giao dịch đều đúng chuẩn!
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
                              style={{
                                background: 'var(--bg-card-solid)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '10px',
                                padding: '10px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '10px'
                              }}
                            >
                              <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                  {s.txDescription}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  Đang phân loại: <span style={{ color: '#f43f5e' }}>{s.currentCategory}</span> ➔ Đề xuất: <span style={{ color: '#10b981', fontWeight: 600 }}>{s.suggestedCategory}</span>
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
        )}

        {/* TAB 2: THÔNG BÁO ỨNG DỤNG TRỰC TIẾP & LỊCH TỰ ĐỘNG */}
        {activeTab === 'automation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Card Trạng thái Thông báo Ứng dụng */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(56, 189, 248, 0.12))',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '18px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '14px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Smartphone size={22} color="#10b981" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Thông báo ứng dụng trực tiếp (Web Push)
                      {pushStatus.isSubscribed ? (
                        <span style={{ background: '#10b981', color: '#fff', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '9999px' }}>
                          ĐÃ BẬT
                        </span>
                      ) : (
                        <span style={{ background: '#f59e0b', color: '#fff', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '9999px' }}>
                          CHƯA BẬT
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      App tự động đẩy thông báo thẳng về điện thoại của bạn: Báo cáo ngày, Tổng kết tuần & Tổng hợp tháng!
                    </div>
                  </div>
                </div>

                <div className="daily-report-push-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {!pushStatus.isSubscribed ? (
                    <button
                      type="button"
                      onClick={handleEnablePush}
                      disabled={isSubscribingPush}
                      className="btn btn-primary"
                      style={{ padding: '9px 18px', fontSize: '0.84rem' }}
                    >
                      {isSubscribingPush ? <RefreshCw size={14} className="spin" /> : <Bell size={14} />}
                      Bật thông báo trên máy này (1-chạm)
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleTestPeriodPush('DAY')}
                        disabled={isTestingPush}
                        className="btn btn-secondary"
                        style={{ padding: '7px 12px', fontSize: '0.8rem' }}
                        title="Bắn thử thông báo ngày"
                      >
                        Bắn thử Ngày
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTestPeriodPush('WEEK')}
                        disabled={isTestingPush}
                        className="btn btn-secondary"
                        style={{ padding: '7px 12px', fontSize: '0.8rem' }}
                        title="Bắn thử thông báo tuần"
                      >
                        Bắn thử Tuần
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTestPeriodPush('MONTH')}
                        disabled={isTestingPush}
                        className="btn btn-secondary"
                        style={{ padding: '7px 12px', fontSize: '0.8rem' }}
                        title="Bắn thử thông báo tháng"
                      >
                        Bắn thử Tháng
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {pushStatus.isSubscribed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '8px 12px', borderRadius: '8px' }}>
                  <CheckCircle size={16} />
                  Thiết bị này đã sẵn sàng nhận thông báo tài chính tự động (Ngày lúc {autoSettings.time}, Tuần lúc {autoSettings.weeklyTime}, Tháng lúc {autoSettings.monthlyTime}).
                </div>
              )}
            </div>

            {/* Test Result Message */}
            {testResult && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: testResult.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                  border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                  color: testResult.success ? '#10b981' : '#f43f5e',
                  fontSize: '0.85rem'
                }}
              >
                {testResult.message}
              </div>
            )}

            {/* Mục Cấu hình 3 Lịch Tự Động: Ngày - Tuần - Tháng */}
            <div
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '16px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={17} color="var(--accent-cyan, #38bdf8)" />
                Cài đặt lịch tự động gửi thông báo AI (3 chu kỳ)
              </div>

              {/* 1. LỊCH HÀNG NGÀY */}
              <div
                style={{
                  background: 'var(--bg-card-solid)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ☀️ 1. Thông báo Báo cáo Cuối ngày
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Tự động rà soát giao dịch trong ngày và gửi thông báo lúc {autoSettings.time}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="time"
                    value={autoSettings.time}
                    onChange={(e) => setAutoSettings({ ...autoSettings, time: e.target.value })}
                    className="form-input"
                    style={{ width: '110px', padding: '6px 10px', fontSize: '0.85rem' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={autoSettings.enabled}
                      onChange={(e) => setAutoSettings({ ...autoSettings, enabled: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                    />
                    Bật
                  </label>
                </div>
              </div>

              {/* 2. LỊCH SAU 1 TUẦN */}
              <div
                style={{
                  background: 'var(--bg-card-solid)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📈 2. Thông báo Tổng kết sau 1 tuần
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Tổng kết thói quen 7 ngày, cơ cấu chi tiêu & định hướng tuần mới (Tối Chủ Nhật)
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="time"
                    value={autoSettings.weeklyTime}
                    onChange={(e) => setAutoSettings({ ...autoSettings, weeklyTime: e.target.value })}
                    className="form-input"
                    style={{ width: '110px', padding: '6px 10px', fontSize: '0.85rem' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={autoSettings.weeklyEnabled}
                      onChange={(e) => setAutoSettings({ ...autoSettings, weeklyEnabled: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                    />
                    Bật
                  </label>
                </div>
              </div>

              {/* 3. LỊCH SAU 1 THÁNG */}
              <div
                style={{
                  background: 'var(--bg-card-solid)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🏆 3. Thông báo Tổng hợp sau 1 tháng
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Đánh giá sức khỏe tài chính toàn diện, tỷ lệ tiết kiệm & chiến lược tháng mới (Tối ngày cuối tháng)
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="time"
                    value={autoSettings.monthlyTime}
                    onChange={(e) => setAutoSettings({ ...autoSettings, monthlyTime: e.target.value })}
                    className="form-input"
                    style={{ width: '110px', padding: '6px 10px', fontSize: '0.85rem' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={autoSettings.monthlyEnabled}
                      onChange={(e) => setAutoSettings({ ...autoSettings, monthlyEnabled: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                    />
                    Bật
                  </label>
                </div>
              </div>

              <div style={{ textAlign: 'right', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                  className="btn btn-primary"
                  style={{ padding: '8px 20px', fontSize: '0.84rem' }}
                >
                  {isSavingSettings ? 'Đang lưu...' : 'Lưu cấu hình tự động'}
                </button>
              </div>
            </div>

            {/* Hướng dẫn nhận thông báo mượt mà trên Xiaomi / MIUI */}
            <div
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '16px',
                padding: '16px',
                fontSize: '0.82rem',
                color: 'var(--text-muted)',
                lineHeight: '1.6'
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                💡 Hướng dẫn nhận thông báo trên điện thoại Android & Tích hợp MacroDroid:
              </div>
              <ul style={{ paddingLeft: '18px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>Nhấn <strong>"Bật thông báo trên máy này"</strong> và chọn <strong>"Cho phép (Allow)"</strong> khi trình duyệt hỏi.</li>
                <li>
                  <span style={{ color: 'var(--accent-amber, #f59e0b)', fontWeight: 600 }}>Khắc phục lỗi Push Service trên Xiaomi:</span> Vào <strong>Cài đặt máy ➔ Ứng dụng ➔ Chrome ➔ Tiết kiệm pin ➔ Chọn "Không hạn chế"</strong>.
                </li>
                <li>
                  <strong>Tự động kéo thông báo qua MacroDroid (Phương án dự phòng 100%):</strong> Tạo Trigger hẹn giờ gửi HTTP GET đến:
                  <div style={{ margin: '4px 0', padding: '6px 10px', background: 'var(--bg-card-solid)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontFamily: 'monospace', color: 'var(--accent-cyan, #0284c7)', fontSize: '0.74rem', wordBreak: 'break-all' }}>
                    Ngày: {typeof window !== 'undefined' ? `${window.location.origin}/api/ai/daily-report/notification?period=DAY&format=text` : ''}<br />
                    Tuần: {typeof window !== 'undefined' ? `${window.location.origin}/api/ai/daily-report/notification?period=WEEK&format=text` : ''}<br />
                    Tháng: {typeof window !== 'undefined' ? `${window.location.origin}/api/ai/daily-report/notification?period=MONTH&format=text` : ''}
                  </div>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer Close */}
        <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)', textAlign: 'right' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: '8px 18px', fontSize: '0.85rem' }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
