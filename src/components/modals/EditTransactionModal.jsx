import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Edit3, Calendar, Tag, CreditCard, DollarSign } from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';
import CustomSelect from '../common/CustomSelect.jsx';

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

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.name} (${a.bank_code})`,
    color: a.color || (a.id === 'acc_cash' ? '#f59e0b' : '#38bdf8'),
    badge: a.bank_code
  }));

  const categoryOptions = [
    { value: '', label: '-- Chưa phân loại --', color: '#94a3b8' },
    ...availableCategories.map((c) => ({
      value: c.id,
      label: c.name,
      color: c.color || '#ec4899'
    }))
  ];

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
        className="glass-panel edit-tx-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--bg-card-solid)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px',
          padding: 'clamp(16px, 4vw, 24px)',
          boxShadow: 'var(--shadow-card)',
          backdropFilter: 'blur(20px)',
          color: 'var(--text-main)',
          overflow: 'visible'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Edit3 size={19} color="var(--accent-cyan)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>Chỉnh sửa giao dịch</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Cập nhật chi tiết số tiền, phân loại hoặc tài khoản
              </p>
            </div>
          </div>
          <button
            type="button"
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Loại giao dịch (Thu / Chi) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px' }}>
              Loại giao dịch
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setType('EXPENSE')}
                style={{
                  padding: '10px',
                  borderRadius: '12px',
                  border: type === 'EXPENSE' ? '1px solid var(--accent-rose)' : '1px solid var(--border-subtle)',
                  background: type === 'EXPENSE' ? 'var(--accent-rose-glow)' : 'var(--bg-input)',
                  color: type === 'EXPENSE' ? 'var(--accent-rose)' : 'var(--text-dim)',
                  fontWeight: 700,
                  fontSize: '0.86rem',
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
                  padding: '10px',
                  borderRadius: '12px',
                  border: type === 'INCOME' ? '1px solid var(--accent-emerald)' : '1px solid var(--border-subtle)',
                  background: type === 'INCOME' ? 'var(--accent-emerald-glow)' : 'var(--bg-input)',
                  color: type === 'INCOME' ? 'var(--accent-emerald)' : 'var(--text-dim)',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                + Thu nhập (INCOME)
              </button>
            </div>
          </div>

          {/* Số tiền & Tài khoản */}
          <div className="edit-tx-grid-row">
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px' }}>
                <DollarSign size={14} color="var(--accent-cyan)" />
                Số tiền (VNĐ)
              </label>
              <input
                type="number"
                step="1000"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="form-input"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px' }}>
                <CreditCard size={14} color="var(--accent-purple)" />
                Nguồn tiền
              </label>
              <CustomSelect
                value={accountId}
                onChange={setAccountId}
                options={accountOptions}
                fullWidth
                placeholder="Chọn nguồn tiền..."
              />
            </div>
          </div>

          {/* Nội dung giao dịch */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px' }}>
              Nội dung mô tả
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="VD: Tiền đi nhậu, Ăn trưa..."
              className="form-input"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                fontSize: '0.9rem',
                boxSizing: 'border-box'
              }}
              required
            />
          </div>

          {/* Danh mục & Thời gian */}
          <div className="edit-tx-grid-row">
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px' }}>
                <Tag size={14} color="var(--accent-rose)" />
                Danh mục
              </label>
              <CustomSelect
                value={categoryId}
                onChange={setCategoryId}
                options={categoryOptions}
                fullWidth
                placeholder="Chọn danh mục..."
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '6px' }}>
                <Calendar size={14} color="var(--accent-amber)" />
                Thời gian hiển thị
              </label>
              <input
                type="text"
                value={txTime}
                onChange={(e) => setTxTime(e.target.value)}
                placeholder="11:18 16/10/2026"
                className="form-input"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Nút hành động */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
              className="btn btn-danger-soft"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 14px',
                borderRadius: '10px',
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
                className="btn btn-secondary"
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
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
                className="btn btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
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
