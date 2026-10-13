import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, Delete, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function PinLockScreen({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const pinLength = 6;

  // Xử lý khi đủ 6 ký tự
  const handleVerify = async (pinToTest) => {
    if (isVerifying) return;
    setIsVerifying(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinToTest })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onUnlock(data.token, rememberDevice);
      } else {
        triggerError(data.error || 'Mã PIN không chính xác');
      }
    } catch {
      triggerError('Không thể kết nối đến máy chủ xác thực');
    } finally {
      setIsVerifying(false);
    }
  };

  const triggerError = (msg) => {
    setErrorMsg(msg);
    setIsShaking(true);
    setTimeout(() => {
      setIsShaking(false);
      setPin('');
    }, 600);
  };

  const handleKeyPress = (num) => {
    if (pin.length < pinLength && !isVerifying) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === pinLength) {
        handleVerify(newPin);
      }
    }
  };

  const handleDelete = () => {
    if (!isVerifying && pin.length > 0) {
      setPin((prev) => prev.slice(0, -1));
      setErrorMsg('');
    }
  };

  const handleClear = () => {
    if (!isVerifying) {
      setPin('');
      setErrorMsg('');
    }
  };

  // Hỗ trợ gõ phím vật lý trên máy tính
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isVerifying) return;
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, isVerifying]);

  return (
    <div className="pin-lock-overlay">
      <div className="pin-lock-container">
        {/* Biểu tượng bảo mật */}
        <div className="pin-shield-wrap">
          <div className="pin-shield-glow"></div>
          <div className="pin-shield-icon">
            <Lock size={32} />
          </div>
        </div>

        {/* Tiêu đề */}
        <h2 className="pin-lock-title">SmartSpend Vault</h2>
        <p className="pin-lock-subtitle">
          Nhập mã PIN 6 số để mở khóa két sắt tài chính của bạn
        </p>

        {/* 6 Chấm hiển thị mã PIN */}
        <div className={`pin-dots-row ${isShaking ? 'shake-anim' : ''}`}>
          {Array.from({ length: pinLength }).map((_, idx) => (
            <div
              key={idx}
              className={`pin-dot-circle ${idx < pin.length ? 'filled' : ''} ${
                errorMsg ? 'error' : ''
              }`}
            />
          ))}
        </div>

        {/* Thông báo lỗi nếu sai */}
        {errorMsg ? (
          <div className="pin-error-text">
            <AlertCircle size={15} />
            <span>{errorMsg}</span>
          </div>
        ) : (
          <div className="pin-hint-text">
            {isVerifying ? 'Đang kiểm tra bảo mật...' : 'Đã bảo vệ bằng mã hóa'}
          </div>
        )}

        {/* Bàn phím số cảm ứng */}
        <div className="pin-keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button
              key={digit}
              type="button"
              className="pin-key-btn"
              onClick={() => handleKeyPress(String(digit))}
              disabled={isVerifying}
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            className="pin-key-btn func-key"
            onClick={handleClear}
            disabled={isVerifying || pin.length === 0}
            title="Xóa hết"
          >
            C
          </button>
          <button
            type="button"
            className="pin-key-btn"
            onClick={() => handleKeyPress('0')}
            disabled={isVerifying}
          >
            0
          </button>
          <button
            type="button"
            className="pin-key-btn func-key"
            onClick={handleDelete}
            disabled={isVerifying || pin.length === 0}
            title="Xóa lùi"
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Tùy chọn ghi nhớ thiết bị */}
        <label className="pin-remember-label">
          <input
            type="checkbox"
            checked={rememberDevice}
            onChange={(e) => setRememberDevice(e.target.checked)}
          />
          <span>Ghi nhớ thiết bị này (không hỏi lại khi mở lại)</span>
        </label>
      </div>
    </div>
  );
}
