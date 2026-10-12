import React, { useState } from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';

export default function InteractiveDonutChart({ categories = [], totalExpense = 0, formatVND, activeCatId, onHoverCat }) {
  const [internalHoveredCat, setInternalHoveredCat] = useState(null);

  const activeCategories = categories.filter((c) => c.total_amount > 0 && c.id !== 'cat_transfer_cash');
  const sumAmount = activeCategories.reduce((s, c) => s + c.total_amount, 0) || totalExpense || 1;

  const hoveredCat = activeCatId !== undefined
    ? (activeCategories.find((c) => c.id === activeCatId) || null)
    : internalHoveredCat;

  const handleHover = (cat) => {
    if (onHoverCat) {
      onHoverCat(cat ? cat.id : null);
    } else {
      setInternalHoveredCat(cat);
    }
  };

  const radius = 68;
  const circumference = 2 * Math.PI * radius; // ~427.26

  let accumulatedPercent = 0;

  if (activeCategories.length === 0) {
    return (
      <div className="donut-chart-wrapper empty">
        <div className="donut-empty-state">
          <PieChartIcon size={40} color="var(--text-dim)" />
          <p style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Chưa có dữ liệu chi tiêu trong kỳ
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="donut-chart-wrapper">
      <div className="donut-chart-svg-container">
        <svg viewBox="0 0 200 200" className="donut-svg">
          <circle
            cx="100"
            cy="100"
            r={radius}
            className="donut-bg-track"
          />
          {activeCategories.map((cat) => {
            const pct = cat.total_amount / sumAmount;
            const strokeDasharray = `${pct * circumference} ${circumference * (1 - pct)}`;
            const strokeDashoffset = -accumulatedPercent * circumference;
            accumulatedPercent += pct;

            const isHovered = hoveredCat?.id === cat.id;

            return (
              <circle
                key={cat.id}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={cat.color}
                strokeWidth={isHovered ? 26 : 20}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="donut-slice"
                style={{
                  opacity: hoveredCat ? (isHovered ? 1 : 0.35) : 1,
                  filter: isHovered ? `drop-shadow(0 0 8px ${cat.color})` : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.25s ease'
                }}
                onMouseEnter={() => handleHover(cat)}
                onMouseLeave={() => handleHover(null)}
              />
            );
          })}
        </svg>

        <div className="donut-center-content">
          <span className="donut-center-label">
            {hoveredCat ? hoveredCat.name : 'Tổng chi tiêu'}
          </span>
          <span className="donut-center-val">
            {formatVND(hoveredCat ? hoveredCat.total_amount : totalExpense)}
          </span>
          <span className="donut-center-sub">
            {hoveredCat
              ? `${Math.round((hoveredCat.total_amount / sumAmount) * 100)}% tổng chi`
              : `${activeCategories.length} nhóm chi`}
          </span>
        </div>
      </div>
    </div>
  );
}
