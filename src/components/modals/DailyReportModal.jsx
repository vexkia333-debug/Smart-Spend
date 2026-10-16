import React, { useState, useEffect } from 'react';
import { X, Sparkles, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, RefreshCw, Calendar, Edit3, ArrowRight } from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';

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

  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState(null);

  const fetchReport = async (dateToFetch) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/ai/daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateToFetch })
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

  useEffect(() => {
    if (isOpen) {
      fetchReport(selectedDate);
    }
  }, [isOpen, selectedDate]);

  const ai = reportData?.aiEvaluation;

  return (
    <div className="prompt-modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(15, 23, 42, 0.97)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '24px',
          padding: '28px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(24px)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(59, 130, 246, 0.25))',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Sparkles size={22} color="#c084fc" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                Báo cáo tài chính cuối ngày
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                AI Gemini rà soát dòng tiền, phát hiện bất thường & tư vấn tối ưu
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
            marginBottom: '20px',
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
              onClick={() => fetchReport(selectedDate)}
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
            >
              <RefreshCw size={12} className={isLoading ? 'spin' : ''} />
              Làm mới
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
                    color: reportData.netFlow >= 0 ? '#38bdf8' : '#f59e0b',
                    marginTop: '4px'
                  }}
                >
                  {reportData.netFlow >= 0 ? '+' : ''}
                  {formatVND(reportData.netFlow)}
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
                <div style={{ fontSize: '0.74rem', color: '#c084fc' }}>Kỷ luật tài chính</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
                  {ai?.rating || 'Cân đối 👍'}
                </div>
              </div>
            </div>

            {/* AI Nhận xét tổng quan */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(16, 185, 129, 0.05))',
                border: '1px solid rgba(139, 92, 246, 0.25)',
                borderRadius: '16px',
                padding: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc', fontWeight: 700, fontSize: '0.88rem', marginBottom: '6px' }}>
                <Sparkles size={16} />
                <span>Nhận xét tổng quan của AI</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                {ai?.overview || 'Hôm nay bạn duy trì được dòng tiền chi tiêu tương đối hợp lý.'}
              </p>
            </div>

            {/* Phát hiện bất thường / Nghi vấn (Anomalies) */}
            <div
              style={{
                background: ai?.anomalies?.some((a) => a.includes('bất thường') || a.includes('lớn') || a.includes('nhầm') || a.includes('phạt'))
                  ? 'rgba(245, 158, 11, 0.09)'
                  : 'rgba(16, 185, 129, 0.08)',
                border: `1px solid ${
                  ai?.anomalies?.some((a) => a.includes('bất thường') || a.includes('lớn') || a.includes('nhầm') || a.includes('phạt'))
                    ? 'rgba(245, 158, 11, 0.35)'
                    : 'rgba(16, 185, 129, 0.25)'
                }`,
                borderRadius: '16px',
                padding: '16px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  color: ai?.anomalies?.some((a) => a.includes('bất thường') || a.includes('lớn') || a.includes('nhầm') || a.includes('phạt'))
                    ? '#fbbf24'
                    : '#34d399',
                  marginBottom: '10px'
                }}
              >
                <AlertTriangle size={16} />
                <span>Rà soát chi tiêu bất thường & Gán nhầm danh mục</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {ai?.anomalies && ai.anomalies.length > 0 ? (
                  ai.anomalies.map((anom, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        fontSize: '0.84rem',
                        color: '#f1f5f9',
                        lineHeight: 1.45
                      }}
                    >
                      <span style={{ color: '#fbbf24', marginTop: '2px' }}>•</span>
                      <span>{anom}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '0.84rem', color: '#94a3b8' }}>
                    Không phát hiện giao dịch bất thường nào.
                  </div>
                )}
              </div>
            </div>

            {/* Các khoản gợi ý chỉnh sửa cụ thể (Suggested Edits) */}
            {ai?.suggestedEdits && ai.suggestedEdits.length > 0 && (
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: '16px',
                  padding: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.88rem', color: '#38bdf8', marginBottom: '10px' }}>
                  <Edit3 size={15} />
                  <span>Các khoản AI kiến nghị bạn nên kiểm tra & chỉnh sửa:</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {ai.suggestedEdits.map((item, idx) => {
                    const matchedTx = reportData.transactions?.find((t) => t.id === item.txId);
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'rgba(15, 23, 42, 0.6)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '10px',
                          padding: '10px 12px',
                          gap: '10px'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#fff' }}>
                            {item.txDescription}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Đang xếp: <strong style={{ color: '#fb7185' }}>{item.currentCategory}</strong> ➔ Nên sửa sang:{' '}
                            <strong style={{ color: '#38bdf8' }}>{item.suggestedCategory}</strong> ({item.reason})
                          </div>
                        </div>

                        {matchedTx && onEditTransaction && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onEditTransaction(matchedTx);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid rgba(56, 189, 248, 0.35)',
                              color: '#38bdf8',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              flexShrink: 0
                            }}
                          >
                            <span>Sửa ngay</span>
                            <ArrowRight size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Lời khuyên cho ngày mai (Advice) */}
            {ai?.advice && (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '14px 16px',
                  fontSize: '0.86rem',
                  color: 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>💡</span>
                <span><strong>Lời khuyên ngày mai:</strong> {ai.advice}</span>
              </div>
            )}

            {/* Phân bổ theo từng nguồn tiền trong ngày */}
            {reportData.accountBreakdown && Object.keys(reportData.accountBreakdown).length > 0 && (
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '8px' }}>
                  Biến động theo từng nguồn tiền trong ngày ({selectedDate}):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                  {Object.entries(reportData.accountBreakdown).map(([accName, vals]) => (
                    <div
                      key={accName}
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#fff' }}>{accName}</span>
                      <div style={{ textAlign: 'right' }}>
                        {vals.in > 0 && (
                          <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 700 }}>
                            +{formatVND(vals.in)}
                          </div>
                        )}
                        {vals.out > 0 && (
                          <div style={{ fontSize: '0.78rem', color: '#fb7185', fontWeight: 700 }}>
                            -{formatVND(vals.out)}
                          </div>
                        )}
                        {vals.in === 0 && vals.out === 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>0 ₫</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Close */}
        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary"
            style={{ padding: '8px 22px', fontSize: '0.88rem' }}
          >
            Đóng báo cáo
          </button>
        </div>
      </div>
    </div>
  );
}
