import React from 'react';
import { Smartphone, Bell, RefreshCw, CheckCircle, Clock } from 'lucide-react';

export default function AutomationTab({
  pushStatus,
  handleEnablePush,
  isSubscribingPush,
  handleTestPeriodPush,
  isTestingPush,
  testResult,
  autoSettings,
  setAutoSettings,
  handleSaveSettings,
  isSavingSettings
}) {
  return (
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
  );
}

