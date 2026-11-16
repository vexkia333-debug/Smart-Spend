import React from 'react';
import { Home, Bell, Plus, Layers, Target } from 'lucide-react';

export default function NavTabs({ activeTab, setActiveTab, pendingCount = 0, onOpenQuickAdd }) {
  const leftTabs = [
    {
      id: 'dashboard',
      label: 'Trang chủ',
      shortLabel: 'Trang chủ',
      icon: Home
    },
    {
      id: 'pending',
      label: 'Cần xử lý',
      shortLabel: 'Cần xử lý',
      icon: Bell,
      badge: pendingCount > 0 ? pendingCount : null
    }
  ];

  const rightTabs = [
    {
      id: 'transactions',
      label: 'Giao dịch',
      shortLabel: 'Giao dịch',
      icon: Layers
    },
    {
      id: 'audit',
      label: 'Mục tiêu & Cài đặt',
      shortLabel: 'Mục tiêu',
      icon: Target,
      matchIds: ['audit', 'rules']
    }
  ];

  const renderTabButton = (tab) => {
    const Icon = tab.icon;
    const isActive = tab.matchIds ? tab.matchIds.includes(activeTab) : activeTab === tab.id;
    return (
      <button
        key={tab.id}
        type="button"
        className={`nav-tab-btn ${isActive ? 'active' : ''}`}
        onClick={() => setActiveTab(tab.id)}
      >
        <div className="nav-tab-icon-wrapper">
          <Icon size={18} />
          {tab.badge && <span className="nav-badge-mobile">{tab.badge}</span>}
        </div>
        <span className="nav-tab-text-full">{tab.label}</span>
        <span className="nav-tab-text-short">{tab.shortLabel}</span>
        {tab.badge && <span className="nav-badge nav-badge-desktop">{tab.badge}</span>}
      </button>
    );
  };

  return (
    <nav className="nav-tabs bottom-nav-bar" aria-label="Điều hướng chính">
      {leftTabs.map(renderTabButton)}

      <button
        type="button"
        className="nav-fab-slot"
        onClick={onOpenQuickAdd}
        aria-label="Thêm giao dịch bằng Gemini AI"
      >
        <span className="nav-fab-plus">
          <Plus size={24} strokeWidth={2.5} />
        </span>
        <span className="nav-fab-desktop-label">Thêm AI</span>
      </button>

      {rightTabs.map(renderTabButton)}
    </nav>
  );
}
