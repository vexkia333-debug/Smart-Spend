import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Edit3, Calendar, Tag, CreditCard, DollarSign } from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';

export default function EditTransactionModal({
  isOpen,
  tx,
  categories = [],
  accounts = [],
  onClose,
  onSave,
  onDelete
}) {
  if (!isOpen || !tx) return null;

  const [description, setDescription] = useState(tx.description || '');
  const [amount, setAmount] = useState(tx.amount || 0);
  const [type, setType] = useState(tx.type || 'EXPENSE');
  const [categoryId, setCategoryId] = useState(tx.category_id || '');
  const [accountId, setAccountId] = useState(tx.account_id || '');
  const [txTime, setTxTime] = useState(tx.transaction_time || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setDescription(tx.description || '');
    setAmount(tx.amount || 0);
    setType(tx.type || 'EXPENSE');
    setCategoryId(tx.category_id || '');
    setAccountId(tx.account_id || '');
    setTxTime(tx.transaction_time || '');
  }, [tx]);

  const availableCategories = categories.filter((c) => c.type === type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      alert('Vui lòng nhập nội dung giao dịch');
      return;
    }
    if (!amount || amount <= 0) {
      alert('Số tiền phải lớn hơn 0');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(tx.id, {
        description: description.trim(),
        amount: Number(amount),
        type,
        category_id: categoryId || null,
        account_id: accountId || tx.account_id,
        transaction_time: txTime || tx.transaction_time
      });
      onClose();
    } catch (err) {
      alert(err.message || 'Lỗi khi lưu giao dịch');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa giao dịch "${tx.description}" (${formatVND(tx.amount)}) không?\nSố dư tài khoản sẽ được hoàn lại tương ứng.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(tx.id);
      onClose();
    } catch (err) {
      alert(err.message || 'Lỗi khi xóa giao dịch');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="prompt-modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'rgba(15, 23, 42, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(20px)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Edit3 size={18} color="#38bdf8" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Chỉnh sửa giao dịch</h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Cập nhật chi tiết số tiền, danh mục hoặc tài khoản
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
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Loại giao dịch (Thu / Chi) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
              Loại giao dịch
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setType('EXPENSE')}
                style={{
                  padding: '9px',
                  borderRadius: '10px',
                  border: type === 'EXPENSE' ? '1px solid #f43f5e' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: type === 'EXPENSE' ? 'rgba(244, 63, 94, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                  color: type === 'EXPENSE' ? '#fb7185' : 'var(--text-dim)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                - Chi tiêu (EXPENSE)
              </button>
              <button
                type="button"
                onClick={() => setType('INCOME')}
                style={{
                  padding: '9px',
                  borderRadius: '10px',
                  border: type === 'INCOME' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: type === 'INCOME' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                  color: type === 'INCOME' ? '#34d399' : 'var(--text-dim)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                + Thu nhập (INCOME)
              </button>
            </div>
          </div>

          {/* Số tiền & Tài khoản */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                <DollarSign size={14} color="#38bdf8" />
                Số tiền (VNĐ)
              </label>
              <input
                type="number"
                step="1000"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#fff',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                <CreditCard size={14} color="#a855f7" />
                Nguồn tiền
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#1e293b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#fff',
                  fontSize: '0.88rem',
                  boxSizing: 'border-box'
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.bank_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Nội dung giao dịch */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
              Nội dung mô tả
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="VD: Tiền đi nhậu, Ăn trưa..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#fff',
                fontSize: '0.9rem',
                boxSizing: 'border-box'
              }}
              required
            />
          </div>

          {/* Danh mục & Thời gian */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                <Tag size={14} color="#ec4899" />
                Danh mục
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#1e293b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#fff',
                  fontSize: '0.88rem',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">-- Chưa phân loại --</option>
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                <Calendar size={14} color="#f59e0b" />
                Thời gian hiển thị
              </label>
              <input
                type="text"
                value={txTime}
                onChange={(e) => setTxTime(e.target.value)}
                placeholder="11:18 16/10/2026"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#fff',
                  fontSize: '0.88rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Nút hành động */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                color: '#fb7185',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Trash2 size={15} />
              {isDeleting ? 'Đang xóa...' : 'Xóa GD'}
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: 'var(--text-dim)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSaving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)'
                }}
              >
                <Save size={15} />
                {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
