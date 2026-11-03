import React, { useState, useEffect } from 'react';
import { X, Sparkles, Bell, Clock } from 'lucide-react';
import { checkPushSubscriptionStatus, subscribeUserToPush } from '../../utils/pushNotifications.js';
import ReportTab from './dailyReport/ReportTab.jsx';
import AutomationTab from './dailyReport/AutomationTab.jsx';

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
      if (!res.ok) throw new Error(data.error || 'Lỗi lưu cấu hình');
      setTestResult({ success: true, message: '✅ ' + data.message });
      setTimeout(() => setTestResult(null), 4000);
    } catch (err) {
      setTestResult({ success: false, message: '❌ ' + err.message });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTestPeriodPush = async (targetPeriod = 'DAY') => {
    setIsTestingPush(true);
    setTestResult(null);
    try {
      const res = await authFetch('/api/ai/daily-report/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: targetPeriod })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi bắn thử');
      setTestResult({ success: true, message: `🔔 ${data.message}` });
    } catch (err) {
      setTestResult({ success: false, message: '❌ ' + err.message });
    } finally {
      setIsTestingPush(false);
    }
  };

  return (
    <div
      className="modal-overlay prompt-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(12px, 3vw, 24px)',
        overflowY: 'auto'
      }}
    >
      <div
        className="modal-container glass-panel daily-report-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: '750px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-card-solid)',
          borderRadius: '24px',
          padding: '24px',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-card)',
          color: 'var(--text-main)',
          zIndex: 10001,
          margin: 'auto'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(56, 189, 248, 0.2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Sparkles size={20} color="var(--accent-purple, #c084fc)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {period === 'DAY' ? 'Báo cáo tài chính cuối ngày' : period === 'WEEK' ? 'Tổng kết tài chính 1 tuần' : 'Tổng hợp tài chính 1 tháng'}
                </h3>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Clock size={12} />
                  <span>{period === 'DAY' ? autoSettings.time : period === 'WEEK' ? `${autoSettings.weeklyTime} (CN)` : `${autoSettings.monthlyTime} (Cuối tháng)`} Tự động</span>
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                AI Gemini rà soát dòng tiền, phát hiện bất thường & tự động bắn thông báo ứng dụng
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-icon"
            style={{ borderRadius: '50%', padding: '6px', color: 'var(--text-dim)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher: Báo cáo AI vs Thông báo & Tự động hóa */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            background: 'var(--bg-input)',
            padding: '4px',
            borderRadius: '12px',
            marginBottom: '16px'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('report')}
            style={{
              flex: 1,
              padding: '8px 14px',
              borderRadius: '9px',
              border: '1px solid',
              background: activeTab === 'report' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              borderColor: activeTab === 'report' ? 'var(--accent-purple, #c084fc)' : 'transparent',
              fontWeight: 700,
              fontSize: '0.84rem',
              color: activeTab === 'report' ? 'var(--accent-purple, #a855f7)' : 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Sparkles size={15} />
            Báo cáo AI & Bất thường
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('automation')}
            style={{
              flex: 1,
              padding: '8px 14px',
              borderRadius: '9px',
              border: '1px solid',
              background: activeTab === 'automation' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderColor: activeTab === 'automation' ? 'var(--accent-cyan, #38bdf8)' : 'transparent',
              fontWeight: 700,
              fontSize: '0.84rem',
              color: activeTab === 'automation' ? 'var(--accent-cyan, #0284c7)' : 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Bell size={15} />
            Thông báo app & Lịch tự động
          </button>
        </div>

        {/* Render Tab Contents */}
        {activeTab === 'report' ? (
          <ReportTab
            period={period}
            handlePeriodChange={handlePeriodChange}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            showDatePicker={showDatePicker}
            setShowDatePicker={setShowDatePicker}
            isLoading={isLoading}
            error={error}
            reportData={reportData}
            fetchReport={fetchReport}
            onEditTransaction={onEditTransaction}
            onClose={onClose}
            getTodayStr={getTodayStr}
          />
        ) : (
          <AutomationTab
            pushStatus={pushStatus}
            handleEnablePush={handleEnablePush}
            isSubscribingPush={isSubscribingPush}
            handleTestPeriodPush={handleTestPeriodPush}
            isTestingPush={isTestingPush}
            testResult={testResult}
            autoSettings={autoSettings}
            setAutoSettings={setAutoSettings}
            handleSaveSettings={handleSaveSettings}
            isSavingSettings={isSavingSettings}
          />
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
