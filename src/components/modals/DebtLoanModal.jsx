import React, { useState, useEffect } from 'react';
import { X, HandCoins, Handshake, ArrowDownRight, ArrowUpRight, Check, AlertCircle, Calendar } from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';

export default function DebtLoanModal({
  isOpen,
  onClose,
  authFetch,
  accounts = [],
  initialData = null,
  onSuccess
}) {
  const [type, setType] = useState('LOAN'); // 'LOAN' (Cho vay) hoặc 'COLLECT' (Thu hồi nợ)
  const [borrower, setBorrower] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [transactionTime, setTransactionTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Gợi ý đối tác thường gặp
  const commonBorrowers = ['Đăng', 'anh Tùng', 'Hưng', 'Kiên', 'Lâm', 'Huyền', 'Nghĩa', 'Lộc'];

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setType(initialData.type || 'LOAN');
      setBorrower(initialData.borrower || '');
      setAmount(initialData.amount ? String(initialData.amount) : '');
      setAccountId(initialData.account_id || (accounts[0]?.id || ''));
      setDescription(initialData.description || '');
      setTransactionTime(initialData.transaction_time || '');
    } else {
      setType('LOAN');
      setBorrower('');
      setAmount('');
      setAccountId(accounts[0]?.id || '');
      setDescription('');
      
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      setTransactionTime(timeStr);
    }
    setErrorMsg('');
  }, [isOpen, initialData, accounts]);

  // Lắng nghe phím ESC để đóng modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAmountChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    setAmount(raw);
  };

  const handleAddAmount = (addValue) => {
    const cur = parseInt(amount || '0', 10);
    setAmount(String(cur + addValue));
  };

  const handleSelectBorrower = (name) => {
    setBorrower(name);
    if (!description || description.startsWith('Cho ') || description.includes('trả nợ')) {
      if (type === 'LOAN') {
        setDescription(`Cho ${name} vay`);
      } else {
        setDescription(`${name} trả nợ`);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = parseInt(amount, 10);
    if (!numAmount || numAmount <= 0) {
      setErrorMsg('Vui lòng nhập số tiền hợp lệ (> 0 đ)');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const payload = {
        type,
        borrower: borrower.trim(),
        amount: numAmount,
        account_id: accountId || accounts[0]?.id,
        description: description.trim(),
        transaction_time: transactionTime
      };

      const res = await authFetch('/api/debt-loan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tạo giao dịch nợ');
      }

      if (onSuccess) onSuccess(data);
      onClose();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop active" onClick={onClose}>
      <div
        className="modal-card glass-panel debt-loan-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '540px',
          width: '94%',
          borderRadius: '24px',
          padding: '24px',
          border: '1px solid var(--border-glass-bright)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)'
        }}
      >
        {/* Modal Header */}
        <div className="modal-header-styled" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: type === 'LOAN'
                  ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.25), rgba(244, 63, 94, 0.35))'
                  : 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 182, 212, 0.35))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: type === 'LOAN' ? '#f43f5e' : '#10b981',
                border: `1px solid ${type === 'LOAN' ? 'rgba(244, 63, 94, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`
              }}
            >
              {type === 'LOAN' ? <HandCoins size={22} /> : <Handshake size={22} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {type === 'LOAN' ? 'Ghi nhận Khoản Cho vay / Trả hộ' : 'Ghi nhận Thu hồi nợ / Nhận trả'}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Sổ theo dõi công nợ cá nhân • Tách biệt khỏi chi tiêu sinh hoạt
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Đóng"
            title="Đóng (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Type Switcher Segmented Pills */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            padding: '4px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '14px',
            marginBottom: '20px'
          }}
        >
          <button
            type="button"
            onClick={() => {
              setType('LOAN');
              if (borrower && (!description || description.includes('trả nợ'))) {
                setDescription(`Cho ${borrower} vay`);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              border: type === 'LOAN' ? '1px solid rgba(244, 63, 94, 0.5)' : 'none',
              background: type === 'LOAN'
                ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.35), rgba(244, 63, 94, 0.25))'
                : 'transparent',
              color: type === 'LOAN' ? '#ff6b8b' : 'var(--text-muted)',
              transition: 'all 0.2s'
            }}
          >
            <ArrowDownRight size={16} />
            <span>Cho vay / Trả hộ</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setType('COLLECT');
              if (borrower && (!description || description.includes('Cho '))) {
                setDescription(`${borrower} trả nợ`);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              border: type === 'COLLECT' ? '1px solid rgba(16, 185, 129, 0.5)' : 'none',
              background: type === 'COLLECT'
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.35), rgba(6, 182, 212, 0.25))'
                : 'transparent',
              color: type === 'COLLECT' ? '#10b981' : 'var(--text-muted)',
              transition: 'all 0.2s'
            }}
          >
            <ArrowUpRight size={16} />
            <span>Thu hồi nợ / Nhận trả</span>
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '0.85rem',
              marginBottom: '16px'
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Người vay / Đối tác */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '6px'
              }}
            >
              {type === 'LOAN' ? 'Người mượn / Người nhờ trả hộ:' : 'Người trả tiền / Con nợ:'}
            </label>
            <input
              type="text"
              placeholder="Ví dụ: Đăng, anh Tùng, Kiên, Hưng..."
              value={borrower}
              onChange={(e) => setBorrower(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-main)',
                fontSize: '0.92rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {/* Quick chips gợi ý đối tác */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', alignSelf: 'center' }}>Gợi ý:</span>
              {commonBorrowers.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSelectBorrower(name)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '8px',
                    background: borrower === name ? 'rgba(139, 92, 246, 0.35)' : 'rgba(255, 255, 255, 0.06)',
                    border: borrower === name ? '1px solid rgba(139, 92, 246, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: borrower === name ? '#c084fc' : 'var(--text-muted)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Số tiền */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Số tiền giao dịch:
              </label>
              {amount && (
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: type === 'LOAN' ? '#ff6b8b' : '#10b981' }} className="tabular-nums">
                  {formatVND(parseInt(amount, 10))}
                </span>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="0"
                value={amount ? parseInt(amount, 10).toLocaleString('vi-VN') : ''}
                onChange={handleAmountChange}
                style={{
                  width: '100%',
                  padding: '12px 40px 12px 14px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-main)',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                className="tabular-nums"
              />
              <span
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontWeight: 700,
                  color: 'var(--text-dim)',
                  fontSize: '0.95rem'
                }}
              >
                đ
              </span>
            </div>

            {/* Quick add amount buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {[50000, 100000, 200000, 500000, 1000000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleAddAmount(val)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-main)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  +{val >= 1000000 ? `${val / 1000000}Tr` : `${val / 1000}k`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmount('')}
                style={{
                  padding: '3px 8px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#f87171',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Xóa
              </button>
            </div>
          </div>

          {/* Chọn tài khoản nguồn / nhận */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '6px'
              }}
            >
              {type === 'LOAN' ? 'Trừ tiền từ tài khoản / ví:' : 'Nhận tiền vào tài khoản / ví:'}
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'rgba(30, 41, 59, 0.95)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({formatVND(acc.balance)})
                </option>
              ))}
            </select>
          </div>

          {/* Ghi chú / Nội dung chi tiết */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '6px'
              }}
            >
              Nội dung chi tiết / Ghi chú:
            </label>
            <input
              type="text"
              placeholder={type === 'LOAN' ? 'Ví dụ: Cho vay tiền đóng học phí, Trả hộ tiền ăn...' : 'Ví dụ: Trả nợ tiền ăn, Chuyển khoản lại...'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-main)',
                fontSize: '0.92rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Thời gian giao dịch */}
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '6px'
              }}
            >
              <Calendar size={14} />
              <span>Thời gian giao dịch:</span>
            </label>
            <input
              type="text"
              placeholder="HH:mm DD/MM/YYYY"
              value={transactionTime}
              onChange={(e) => setTransactionTime(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Nút hành động */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                borderRadius: '12px',
                fontSize: '0.9rem',
                fontWeight: 700,
                background: type === 'LOAN'
                  ? 'linear-gradient(135deg, #ec4899, #f43f5e)'
                  : 'linear-gradient(135deg, #10b981, #06b6d4)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                boxShadow: type === 'LOAN'
                  ? '0 4px 14px rgba(244, 63, 94, 0.4)'
                  : '0 4px 14px rgba(16, 185, 129, 0.4)',
                opacity: isSubmitting ? 0.7 : 1
              }}
            >
              {isSubmitting ? (
                <span>Đang lưu...</span>
              ) : (
                <>
                  <Check size={16} />
                  <span>{type === 'LOAN' ? 'Lưu khoản Cho vay' : 'Lưu khoản Thu nợ'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
