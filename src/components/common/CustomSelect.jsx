import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const [menuPos, setMenuPos] = useState(null);
  const containerRef = useRef(null);
  const menuRef = useRef(null);

  const selectedOption = options.find((o) => o.value === value);

  const updateMenuPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const margin = 10;
    const gap = 6;
    const desiredMaxH = 260;

    const spaceBelow = viewportH - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      140,
      Math.min(desiredMaxH, (openUpward ? spaceAbove : spaceBelow) - gap)
    );

    const width = Math.min(Math.max(rect.width, 180), viewportW - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, viewportW - width - margin));

    if (openUpward) {
      setMenuPos({
        position: 'fixed',
        bottom: `${viewportH - rect.top + gap}px`,
        top: 'auto',
        left: `${left}px`,
        minWidth: `${rect.width}px`,
        maxWidth: `${viewportW - margin * 2}px`,
        maxHeight: `${maxHeight}px`,
        boxSizing: 'border-box',
        zIndex: 99999
      });
    } else {
      setMenuPos({
        position: 'fixed',
        top: `${rect.bottom + gap}px`,
        bottom: 'auto',
        left: `${left}px`,
        minWidth: `${rect.width}px`,
        maxWidth: `${viewportW - margin * 2}px`,
        maxHeight: `${maxHeight}px`,
        boxSizing: 'border-box',
        zIndex: 99999
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updateMenuPosition();
    }
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        (!menuRef.current || !menuRef.current.contains(e.target))
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handleScrollOrResize = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) {
        return;
      }
      updateMenuPosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updateMenuPosition]);

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

      {isOpen &&
        menuPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="custom-select-menu"
            style={menuPos}
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((opt) => (
              <div
                key={opt.value}
                className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
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
          </div>,
          document.body
        )}
    </div>
  );
}
