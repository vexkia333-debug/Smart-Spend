import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Edit3, Calendar, Tag, CreditCard, DollarSign, AlertTriangle, Plus, Sparkles } from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';
import CustomSelect from '../common/CustomSelect.jsx';
import { matchOrFindCategory, ensureCategoryExists } from '../../utils/categoryMatcher.js';

export default function EditTransactionModal({
  isOpen,
  tx,
  categories = [],
  accounts = [],
  authFetch,
  onCategoriesChange,
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Danh mục đề xuất và tạo nhanh danh mục
  const [suggestedNewCatName, setSuggestedNewCatName] = useState('');
  const [isCreatingCat, setIsCreatingCat] = useState(false);
  const [showQuickCreateCat, setShowQuickCreateCat] = useState(false);
  const [customCatInput, setCustomCatInput] = useState('');

  useEffect(() => {
    if (!tx) return;
    setDescription(tx.description || '');
    setAmount(tx.amount || 0);
    const targetType = tx.type || 'EXPENSE';
    setType(targetType);
    setAccountId(tx.account_id || '');
    setTxTime(tx.transaction_time || '');
    setShowDeleteConfirm(false);
    setShowQuickCreateCat(false);
    setCustomCatInput('');

    // Xử lý danh mục thông minh: nếu có gợi ý từ AI
    if (tx.suggestedCategory) {
      const matched = matchOrFindCategory(categories, tx.suggestedCategory, targetType);
      if (matched) {
        setCategoryId(matched.id);
        setSuggestedNewCatName('');
      } else {
        setCategoryId('');
        setSuggestedNewCatName(tx.suggestedCategory);
      }
    } else {
      setCategoryId(tx.category_id || '');
      setSuggestedNewCatName('');
    }
  }, [tx, categories]);

  const handleCreateAndSelectCategory = async (catName) => {
    const targetName = (catName || customCatInput || suggestedNewCatName).trim();
    if (!targetName || !authFetch) return;
    setIsCreatingCat(true);
    try {
      const { category, wasCreated, error } = await ensureCategoryExists(
        authFetch,
        categories,
        targetName,
        type
      );
      if (error || !category?.id) {
        throw new Error(error || 'Không thể tạo danh mục mới');
      }

      if (wasCreated && onCategoriesChange) {
        await onCategoriesChange();
      }

      setCategoryId(category.id);
      setSuggestedNewCatName('');
      setShowQuickCreateCat(false);
      setCustomCatInput('');
    } catch (err) {
      alert('Lỗi tạo danh mục: ' + err.message);
    } finally {
      setIsCreatingCat(false);
    }
  };

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

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(tx.id);
      setShowDeleteConfirm(false);
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
          position: 'relative',
          width: '100%',
          maxWidth: '520px',
          background: 'var(--bg-card-solid)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px',
          padding: 'clamp(16px, 4vw, 24px)',
          boxShadow: 'var(--shadow-modal)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          color: 'var(--text-main)',
          overflow: 'hidden'
        }}
      >
        {/* Custom Confirmation Dialog khi bấm Xóa GD */}
        {showDeleteConfirm && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              zIndex: 30
            }}
          >
            <div
              style={{
                background: 'var(--bg-card-solid)',
                border: '1px solid var(--accent-rose)',
                borderRadius: '16px',
                padding: '24px',
                maxWidth: '400px',
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(244, 63, 94, 0.15)',
                  color: 'var(--accent-rose)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px auto'
                }}
              >
                <AlertTriangle size={24} />
              </div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Xác nhận xóa giao dịch?
              </h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Bạn có chắc muốn xóa giao dịch <strong>"{tx.description}"</strong> ({formatVND(tx.amount)})? Số dư tài khoản sẽ được hoàn lại tương ứng.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="btn btn-secondary"
                  style={{ padding: '9px 14px', borderRadius: '10px', fontSize: '0.84rem', fontWeight: 600 }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="btn btn-danger"
                  style={{ padding: '9px 14px', borderRadius: '10px', fontSize: '0.84rem', fontWeight: 700 }}
                >
                  {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
                </button>
              </div>
            </div>
          </div>
        )}
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
            className="modal-close-btn"
            title="Đóng (Esc)"
          >
            <X size={18} />
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', margin: 0 }}>
                  <Tag size={14} color="var(--accent-rose)" />
                  Danh mục
                </label>
                <button
                  type="button"
                  onClick={() => setShowQuickCreateCat(!showQuickCreateCat)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-cyan, #38bdf8)',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  <Plus size={12} />
                  <span>Thêm mới</span>
                </button>
              </div>

              {showQuickCreateCat && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={customCatInput}
                    onChange={(e) => setCustomCatInput(e.target.value)}
                    placeholder="Nhập tên danh mục mới..."
                    className="form-input"
                    style={{ flex: 1, padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateAndSelectCategory(customCatInput);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleCreateAndSelectCategory(customCatInput)}
                    disabled={isCreatingCat || !customCatInput.trim()}
                    className="btn btn-primary"
                    style={{ fontSize: '0.76rem', padding: '6px 12px', borderRadius: '8px', flexShrink: 0 }}
                  >
                    {isCreatingCat ? '...' : 'Tạo'}
                  </button>
                </div>
              )}

              <CustomSelect
                value={categoryId}
                onChange={setCategoryId}
                options={categoryOptions}
                fullWidth
                placeholder="Chọn danh mục..."
              />

              {suggestedNewCatName && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(56, 189, 248, 0.1))',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} color="#10b981" />
                    <span>AI đề xuất: <strong>{suggestedNewCatName}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCreateAndSelectCategory(suggestedNewCatName)}
                    disabled={isCreatingCat}
                    className="btn btn-primary"
                    style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '7px' }}
                  >
                    {isCreatingCat ? 'Đang tạo...' : '+ Tạo & Chọn luôn'}
                  </button>
                </div>
              )}
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
