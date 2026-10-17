import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export default function CustomSelect({
  value,
  onChange,
  options = [],
  style,
  className = '',
  placeholder = 'Chọn...',
  fullWidth = false,
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const containerStyle = {
    ...(fullWidth ? { width: '100%' } : {}),
    ...style
  };

  return (
    <div
      className={`custom-select-container ${fullWidth ? 'custom-select-full' : ''} ${className}`}
      ref={containerRef}
      style={containerStyle}
    >
      <button
        type="button"
        disabled={disabled}
        className={`custom-select-trigger ${isOpen ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{ width: '100%' }}
      >
        <span className="custom-select-value" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
          {selectedOption?.color && (
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: selectedOption.color,
                display: 'inline-block',
                flexShrink: 0
              }}
            />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown size={15} className={`custom-select-arrow ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="custom-select-menu" style={{ width: '100%', boxSizing: 'border-box', zIndex: 1200 }}>
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                {opt.color && (
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: opt.color,
                      display: 'inline-block',
                      flexShrink: 0
                    }}
                  />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.label}
                </span>
                {opt.badge && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: 'var(--text-muted)'
                    }}
                  >
                    {opt.badge}
                  </span>
                )}
              </div>
              {opt.value === value && <Check size={14} className="custom-select-check" style={{ flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
