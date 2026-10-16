import React, { useState, useEffect } from 'react';
import { 
  X, Sparkles, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, 
  RefreshCw, Calendar, Edit3, ArrowRight, Bell, Smartphone, Send, 
  Check, Clock, ShieldCheck, CheckCircle
} from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';
import { checkPushSubscriptionStatus, subscribeUserToPush, testPushNotification } from '../../utils/pushNotifications.js';

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
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState(null);

  // Trạng thái thông báo ứng dụng Web Push
  const [pushStatus, setPushStatus] = useState({ supported: true, isSubscribed: false, permission: 'default' });
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);

  // Cấu hình thông báo 10h (22:00)
  const [autoSettings, setAutoSettings] = useState({
    time: '22:00',
    enabled: true
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const fetchReport = async (dateToFetch, forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/ai/daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateToFetch, refresh: forceRefresh })
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
            enabled: data.settings.enabled !== false
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
      fetchReport(selectedDate);
      fetchAutoSettings();
      loadPushStatus();
    }
  }, [isOpen, selectedDate]);

  const handleEnablePush = async () => {
    setIsSubscribingPush(true);
    setTestResult(null);
    try {
      await subscribeUserToPush(authFetch);
      await loadPushStatus();
      setTestResult({
        success: true,
        message: '🎉 Đã bật thông báo ứng dụng thành công! Điện thoại của bạn sẽ tự động nhận thông báo báo cáo lúc ' + autoSettings.time + ' mỗi ngày.'
      });
    } catch (err) {
      setTestResult({ success: false, message: '❌ ' + err.message });
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
        setTestResult({ success: true, message: 'Đã lưu cấu hình tự động lúc ' + autoSettings.time + ' thành công!' });
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

  const handleTestAppPush = async () => {
    setIsTestingPush(true);
    setTestResult(null);
    try {
      // 1. Thử gửi Web Push qua server
      await testPushNotification(authFetch);

      // 2. Kích hoạt logic thông báo báo cáo
      const res = await authFetch('/api/ai/daily-report/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate })
      });
      const data = await res.json();

      if (res.ok) {
        setTestResult({
          success: true,
          message: '🔔 Đã bắn thông báo ứng dụng trực tiếp tới thiết bị của bạn thành công!'
        });
        fetchReport(selectedDate);
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
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(15, 23, 42, 0.98)',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          borderRadius: '24px',
          padding: '24px 28px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(24px)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Sparkles size={22} color="#c084fc" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                  Báo cáo tài chính cuối ngày
                </h3>
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Clock size={11} /> {autoSettings.time} Tự động
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                AI Gemini rà soát dòng tiền, phát hiện bất thường & tự động bắn thông báo ứng dụng
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
              padding: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '12px',
            marginBottom: '18px'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('report')}
            style={{
              background: activeTab === 'report' ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
              borderColor: activeTab === 'report' ? '#c084fc' : 'transparent',
              borderWidth: '1px',
              borderStyle: 'solid',
              color: activeTab === 'report' ? '#c084fc' : 'var(--text-dim)',
              padding: '7px 14px',
              borderRadius: '10px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={15} />
            Báo cáo AI & Bất thường
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('automation')}
            style={{
              background: activeTab === 'automation' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              borderColor: activeTab === 'automation' ? '#38bdf8' : 'transparent',
              borderWidth: '1px',
              borderStyle: 'solid',
              color: activeTab === 'automation' ? '#38bdf8' : 'var(--text-dim)',
              padding: '7px 14px',
              borderRadius: '10px',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Bell size={15} />
            Thông báo ứng dụng 10h ({autoSettings.time})
          </button>
        </div>

        {/* TAB 1: NỘI DUNG BÁO CÁO */}
        {activeTab === 'report' && (
          <div>
            {/* Date Selector Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '8px 12px',
                marginBottom: '18px',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={16} color="#38bdf8" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dim)' }}>Ngày xem:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    background: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '0.85rem'
                  }}
                />
                {reportData?.fromCache && (
                  <span
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#34d399',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '9999px'
                    }}
                  >
                    ⚡ Có sẵn (0ms)
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedDate(getTodayStr())}
                  style={{
                    background: selectedDate === getTodayStr() ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    borderColor: selectedDate === getTodayStr() ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    color: selectedDate === getTodayStr() ? '#38bdf8' : 'var(--text-dim)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  Hôm nay
                </button>
                <button
                  type="button"
                  onClick={() => fetchReport(selectedDate, true)}
                  disabled={isLoading}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(139, 92, 246, 0.15)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    color: '#c084fc',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    cursor: 'pointer'
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
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#c084fc' }}>
                <RefreshCw size={32} className="spin" style={{ margin: '0 auto 12px auto' }} />
                <div style={{ fontWeight: 600 }}>Gemini AI đang rà soát các giao dịch trong ngày...</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Kiểm tra số dư, mức chi tiêu và phát hiện khoản bất thường
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
                  color: '#fb7185',
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '12px'
                    }}
                  >
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Tổng thu hôm nay</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>
                      +{formatVND(reportData.totalIncome)}
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '12px'
                    }}
                  >
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Tổng chi hôm nay</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fb7185', marginTop: '4px' }}>
                      -{formatVND(reportData.totalExpense)}
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '12px'
                    }}
                  >
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Dòng tiền ròng</div>
                    <div
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 800,
                        color: reportData.netFlow >= 0 ? '#38bdf8' : '#fb923c',
                        marginTop: '4px'
                      }}
                    >
                      {reportData.netFlow >= 0 ? '+' : ''}{formatVND(reportData.netFlow)}
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.15))',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '14px',
                      padding: '12px'
                    }}
                  >
                    <div style={{ fontSize: '0.74rem', color: '#c084fc' }}>Xếp loại AI</div>
                    <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
                      {ai?.rating || 'Cân đối 👍'}
                    </div>
                  </div>
                </div>

                {/* AI Overview Box */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                    borderRadius: '16px',
                    padding: '16px',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Sparkles size={16} color="#c084fc" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      AI Nhận xét & Đánh giá tổng quan
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: '1.55', color: '#e2e8f0' }}>
                    {ai?.overview || 'Không có dữ liệu đánh giá.'}
                  </p>
                </div>

                {/* Khoản bất thường & Nghi vấn xếp sai */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    padding: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <AlertTriangle size={18} color="#f59e0b" />
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                      Phát hiện nghi vấn & Khoản bất thường trong ngày
                    </span>
                  </div>

                  {ai?.anomalies && ai.anomalies.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {ai.anomalies.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'rgba(245, 158, 11, 0.08)',
                            border: '1px solid rgba(245, 158, 11, 0.2)',
                            borderRadius: '10px',
                            padding: '10px 14px',
                            fontSize: '0.85rem',
                            color: '#fef3c7',
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
                        color: '#34d399',
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
                                background: 'rgba(139, 92, 246, 0.08)',
                                border: '1px solid rgba(139, 92, 246, 0.25)',
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
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                                  {s.txDescription}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  Đang phân loại: <span style={{ color: '#fb7185' }}>{s.currentCategory}</span> ➔ Đề xuất: <span style={{ color: '#34d399', fontWeight: 600 }}>{s.suggestedCategory}</span>
                                </div>
                                <div style={{ fontSize: '0.74rem', color: '#c084fc', marginTop: '2px' }}>
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

                {/* Lời khuyên cho ngày mai */}
                {ai?.advice && (
                  <div
                    style={{
                      background: 'rgba(56, 189, 248, 0.06)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      borderRadius: '16px',
                      padding: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <TrendingUp size={16} color="#38bdf8" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                        Lời khuyên tài chính cho ngày mai
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: '1.5', color: '#f0f9ff' }}>
                      {ai.advice}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: THÔNG BÁO ỨNG DỤNG TRỰC TIẾP (WEB PUSH) */}
        {activeTab === 'automation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Card Trạng thái Thông báo Ứng dụng */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(56, 189, 248, 0.18))',
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
                      background: 'rgba(16, 185, 129, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Smartphone size={22} color="#34d399" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Thông báo ứng dụng trực tiếp
                      {pushStatus.isSubscribed ? (
                        <span style={{ background: '#10b981', color: '#000', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '9999px' }}>
                          ĐÃ BẬT
                        </span>
                      ) : (
                        <span style={{ background: '#f59e0b', color: '#000', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '9999px' }}>
                          CHƯA BẬT
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                      App tự động đẩy thông báo thẳng về điện thoại của bạn, không cần cài đặt MacroDroid hay công cụ ngoài!
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                    <button
                      type="button"
                      onClick={handleTestAppPush}
                      disabled={isTestingPush}
                      className="btn btn-primary"
                      style={{ padding: '9px 18px', fontSize: '0.84rem' }}
                    >
                      {isTestingPush ? <RefreshCw size={14} className="spin" /> : <Send size={14} />}
                      Bắn thử thông báo ngay
                    </button>
                  )}
                </div>
              </div>

              {pushStatus.isSubscribed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', padding: '8px 12px', borderRadius: '8px' }}>
                  <CheckCircle size={16} />
                  Thiết bị này đã sẵn sàng nhận thông báo tài chính cuối ngày lúc {autoSettings.time}.
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
                  color: testResult.success ? '#34d399' : '#fb7185',
                  fontSize: '0.85rem'
                }}
              >
                {testResult.message}
              </div>
            )}

            {/* Mục Cấu hình giờ kích hoạt */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: '18px'
              }}
            >
              <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color="#38bdf8" />
                Cài đặt giờ tự động kích hoạt
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Giờ phân tích và bắn thông báo:
                  </label>
                  <input
                    type="time"
                    value={autoSettings.time}
                    onChange={(e) => setAutoSettings({ ...autoSettings, time: e.target.value })}
                    style={{
                      width: '100%',
                      background: '#1e293b',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Mặc định 22:00 (10h đêm theo giờ Việt Nam)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '10px' }}>
                  <input
                    type="checkbox"
                    id="enable_daily_report"
                    checked={autoSettings.enabled}
                    onChange={(e) => setAutoSettings({ ...autoSettings, enabled: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                  />
                  <label htmlFor="enable_daily_report" style={{ fontSize: '0.85rem', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                    Tự động phân tích & gửi báo cáo mỗi ngày
                  </label>
                </div>
              </div>

              <div style={{ marginTop: '16px', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                  className="btn btn-primary"
                  style={{ padding: '8px 20px', fontSize: '0.84rem' }}
                >
                  {isSavingSettings ? 'Đang lưu...' : 'Lưu cài đặt'}
                </button>
              </div>
            </div>

            {/* Hướng dẫn ngắn gọn */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '16px',
                padding: '16px',
                fontSize: '0.82rem',
                color: 'var(--text-dim)',
                lineHeight: '1.6'
              }}
            >
              <div style={{ fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
                💡 Cách thông báo hoạt động trên điện thoại của bạn:
              </div>
              <ul style={{ paddingLeft: '18px', margin: 0 }}>
                <li>Nhấn <strong>"Bật thông báo trên máy này"</strong> và chọn <strong>"Cho phép (Allow)"</strong> khi trình duyệt hỏi.</li>
                <li>Đúng <strong>{autoSettings.time}</strong> mỗi tối, hệ thống sẽ tự động gửi thông báo tóm tắt chi tiêu thẳng lên thanh thông báo của máy.</li>
                <li>Bạn có thể thêm trang web vào màn hình chính (PWA - <i>Add to Home Screen</i>) để dùng như một ứng dụng cài đặt thực thụ.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer Close */}
        <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary"
            style={{ padding: '8px 22px', fontSize: '0.88rem' }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
