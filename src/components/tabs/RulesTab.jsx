import React from 'react';
import { Tag, Plus, Sparkles, Trash2, Zap } from 'lucide-react';
import CustomSelect from '../common/CustomSelect.jsx';

const CORE_CATEGORY_IDS = new Set([
  'cat_food', 'cat_shopping', 'cat_drink', 'cat_transport', 'cat_bills',
  'cat_entertainment', 'cat_health', 'cat_education', 'cat_housing',
  'cat_other_expense', 'cat_salary', 'cat_freelance', 'cat_investment',
  'cat_other_income', 'cat_loan', 'cat_debt_collect', 'cat_transfer_cash',
  'cat_transfer_internal', 'cat_transfer_in'
]);

export default function RulesTab({
  categories = [],
  newCatName,
  setNewCatName,
  newCatType,
  setNewCatType,
  newCatColor,
  setNewCatColor,
  isAddingCat,
  handleCreateCategory,
  onDeleteCategory,
  rules = [],
  newKeyword,
  setNewKeyword,
  newRuleCat,
  setNewRuleCat,
  handleCreateRule,
  onToggleRule,
  onDeleteRule
}) {
  return (
    <div className="dashboard-columns">
      {/* Cột 1: Danh sách danh mục & Tạo mới */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Tag size={20} color="#10b981" />
          Danh mục chi tiêu & thu nhập ({categories.length})
        </h3>

        {/* Form thêm danh mục */}
        <form
          onSubmit={handleCreateCategory}
          style={{ marginBottom: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}
        >
          <input
            type="text"
            placeholder="Tên danh mục mới (ví dụ: Tiền trọ, Thể thao...)"
            className="form-input"
            style={{ flex: 1, minWidth: '180px' }}
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            required
          />
          <CustomSelect
            value={newCatType}
            onChange={setNewCatType}
            style={{ minWidth: '130px' }}
            options={[
              { value: 'EXPENSE', label: 'Chi tiêu' },
              { value: 'INCOME', label: 'Thu nhập' }
            ]}
          />
          <input
            type="color"
            value={newCatColor}
            onChange={(e) => setNewCatColor(e.target.value)}
            style={{
              width: '40px',
              height: '40px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '8px'
            }}
            title="Chọn màu đại diện"
          />
          <button type="submit" className="btn btn-primary" disabled={isAddingCat}>
            <Plus size={16} /> Thêm
          </button>
        </form>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '10px'
          }}
        >
          {categories.map((c) => {
            const isCustom = !CORE_CATEGORY_IDS.has(c.id);
            return (
              <div
                key={c.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span style={{ color: c.color, fontSize: '1.2rem', flexShrink: 0 }}>●</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      {c.type === 'EXPENSE' ? 'Chi tiêu' : 'Thu nhập'}
                    </div>
                  </div>
                </div>
                {isCustom && onDeleteCategory && (
                  <button
                    type="button"
                    onClick={() => onDeleteCategory(c.id)}
                    title="Xóa danh mục tùy chỉnh này"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '4px',
                      flexShrink: 0
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cột 2: Quy tắc từ khóa tự động */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={20} color="#38bdf8" />
          Quy tắc nhận diện từ khóa (Auto Tagging)
        </h3>
        <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Khi thông báo chứa từ khóa này, hệ thống sẽ ưu tiên đề xuất danh mục tương ứng hoặc tự động gán thẻ ngay nếu bật <strong>Tự động</strong>.
        </p>

        <form onSubmit={handleCreateRule} style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Từ khóa (ví dụ: HIGHLANDS, GRAB...)"
              className="form-input"
              style={{ flex: 1, minWidth: '160px' }}
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
            />
            <CustomSelect
              value={newRuleCat}
              onChange={setNewRuleCat}
              style={{ minWidth: '190px' }}
              options={categories.map((cat) => ({
                value: cat.id,
                label: cat.name
              }))}
            />
            <button type="submit" className="btn btn-primary">
              <Plus size={16} /> Thêm luật
            </button>
          </div>
        </form>

        <div>
          {rules.map((rule) => (
            <div
              key={rule.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.03)',
                marginBottom: '8px',
                flexWrap: 'wrap'
              }}
            >
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#38bdf8' }}>
                "{rule.keyword}"
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  className="badge"
                  style={{
                    background: `${rule.category_color}22`,
                    color: rule.category_color
                  }}
                >
                  ● {rule.category_name}
                </span>
                {onToggleRule && (
                  <button
                    type="button"
                    onClick={() => onToggleRule(rule.id)}
                    title={rule.is_auto_apply ? 'Đang tự động xác nhận ngay khi khớp từ khóa (Bấm để chuyển sang Gợi ý)' : 'Đang ở chế độ Gợi ý (Bấm để bật Tự động xác nhận)'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: rule.is_auto_apply ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border-subtle)',
                      background: rule.is_auto_apply ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                      color: rule.is_auto_apply ? '#10b981' : 'var(--text-dim)'
                    }}
                  >
                    <Zap size={11} />
                    {rule.is_auto_apply ? 'Tự động' : 'Gợi ý'}
                  </button>
                )}
                {onDeleteRule && (
                  <button
                    type="button"
                    onClick={() => onDeleteRule(rule.id)}
                    title="Xóa quy tắc này"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
