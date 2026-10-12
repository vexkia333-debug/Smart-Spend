import React from 'react';
import { Tag, Plus, Sparkles } from 'lucide-react';
import CustomSelect from '../common/CustomSelect.jsx';

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
  rules = [],
  newKeyword,
  setNewKeyword,
  newRuleCat,
  setNewRuleCat,
  handleCreateRule
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
          {categories.map((c) => (
            <div
              key={c.id}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <span style={{ color: c.color, fontSize: '1.2rem' }}>●</span>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  {c.type === 'EXPENSE' ? 'Chi tiêu' : 'Thu nhập'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cột 2: Quy tắc từ khóa tự động */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={20} color="#38bdf8" />
          Quy tắc nhận diện từ khóa (Auto Tagging)
        </h3>
        <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Khi thông báo chứa từ khóa này, hệ thống sẽ ưu tiên đề xuất danh mục tương ứng lên nút đầu tiên.
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
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.03)',
                marginBottom: '8px'
              }}
            >
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#38bdf8' }}>
                "{rule.keyword}"
              </span>
              <span
                className="badge"
                style={{
                  background: `${rule.category_color}22`,
                  color: rule.category_color
                }}
              >
                ● {rule.category_name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
