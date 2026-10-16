import React from 'react';
import { Bell, PieChart as PieChartIcon, Layers, Tag } from 'lucide-react';

export default function NavTabs({ activeTab, setActiveTab, pendingCount = 0 }) {
  const tabs = [
    {
      id: 'pending',
      label: 'Cần bổ sung',
      shortLabel: 'Cần xử lý',
      icon: Bell,
      badge: pendingCount
    },
    {
      id: 'dashboard',
      label: 'Tổng quan & Phân tích',
      shortLabel: 'Tổng quan',
      icon: PieChartIcon
    },
    {
      id: 'transactions',
      label: 'Toàn bộ giao dịch',
      shortLabel: 'Giao dịch',
      icon: Layers
    },
    {
      id: 'rules',
      label: 'Danh mục & Quy tắc',
      shortLabel: 'Quy tắc',
      icon: Tag
    }
  ];

  return (
    <nav className="nav-tabs" aria-label="Menu điều hướng ứng dụng">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`nav-tab-btn ${isActive ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <div className="nav-tab-icon-wrapper">
              <Icon size={18} />
              {tab.badge > 0 && (
                <span className="nav-badge-mobile">{tab.badge > 99 ? '99+' : tab.badge}</span>
              )}
            </div>
            <span className="nav-tab-text-full">{tab.label}</span>
            <span className="nav-tab-text-short">{tab.shortLabel}</span>
            {tab.badge > 0 && (
              <span className="nav-badge nav-badge-desktop">{tab.badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
