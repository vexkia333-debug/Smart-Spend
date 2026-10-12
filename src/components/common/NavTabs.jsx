import React from 'react';
import { Bell, PieChart as PieChartIcon, Layers, Tag } from 'lucide-react';

export default function NavTabs({ activeTab, setActiveTab, pendingCount = 0 }) {
  return (
    <nav className="nav-tabs">
      <button
        className={`nav-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
        onClick={() => setActiveTab('pending')}
      >
        <Bell size={18} />
        Cần bổ sung
        {pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
        onClick={() => setActiveTab('dashboard')}
      >
        <PieChartIcon size={18} />
        Tổng quan & Phân tích
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
        onClick={() => setActiveTab('transactions')}
      >
        <Layers size={18} />
        Toàn bộ giao dịch
      </button>

      <button
        className={`nav-tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
        onClick={() => setActiveTab('rules')}
      >
        <Tag size={18} />
        Danh mục & Quy tắc
      </button>
    </nav>
  );
}
