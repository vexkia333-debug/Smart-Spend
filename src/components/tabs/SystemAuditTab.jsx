import React, { useState, useEffect } from 'react';
import { 
  History, ArrowLeftRight, CheckCircle2, ShieldAlert, Sparkles, 
  RefreshCw, Search, Layers, Clock, AlertTriangle, ArrowUpRight, 
  ArrowDownLeft, Tag, FileText, Smartphone, Building2, ChevronDown, 
  ChevronUp, Edit2, SlidersHorizontal
} from 'lucide-react';
import RulesTab from './RulesTab.jsx';
import { formatVND, formatTxTime } from '../../utils/formatters.js';

export default function SystemAuditTab({
  authFetch,
  onEditTransaction,
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
  const [subTab, setSubTab] = useState('audit'); // 'audit' | 'rules'
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    internalTransfers: 0,
    debtLoans: 0,
    ignored: 0,
    autoClassified: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'TRANSFER' | 'DEBT' | 'IGNORED' | 'AUTO'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogIds, setExpandedLogIds] = useState(new Set());

  const fetchAuditLogs = async () => {
    setIsLoading(true);
    try {
      const res = await (authFetch ? authFetch('/api/system/audit-logs') : fetch('/api/system/audit-logs'));
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('Lỗi nạp nhật ký kiểm toán:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const toggleExpandLog = (id) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Lọc logs theo filterType và searchQuery
  const filteredLogs = logs.filter((log) => {
    if (filterType === 'TRANSFER' && log.action_type !== 'INTERNAL_TRANSFER') return false;
    if (filterType === 'DEBT' && log.action_type !== 'DEBT_COLLECT' && log.action_type !== 'LOAN_RECORD') return false;
    if (filterType === 'IGNORED' && log.action_type !== 'IGNORED' && log.action_type !== 'DUPLICATE') return false;
    if (filterType === 'AUTO' && log.action_type !== 'AUTO_CLASSIFIED' && log.action_type !== 'AI_BRIEFING') return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = log.title?.toLowerCase().includes(q);
      const matchRaw = log.raw_content?.toLowerCase().includes(q);
      const matchDetail = log.action_detail?.toLowerCase().includes(q);
      const matchAccount = log.account_name?.toLowerCase().includes(q);
      const matchCat = log.category_name?.toLowerCase().includes(q);
      if (!matchTitle && !matchRaw && !matchDetail && !matchAccount && !matchCat) return false;
    }

    return true;
  });

  return (
    <div className="system-audit-wrapper">
      {/* Thanh chuyển chế độ: Nhật ký xử lý hệ thống vs Danh mục & Quy tắc */}
      <div
        className="glass-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 18px',
          marginBottom: '20px',
          borderRadius: '16px'
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '10px',
              border: subTab === 'audit' ? '1px solid var(--accent-purple)' : '1px solid transparent',
              background: subTab === 'audit' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              color: subTab === 'audit' ? 'var(--accent-purple, #c084fc)' : 'var(--text-muted)',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <History size={16} />
            <span>Lịch sử hệ thống xử lý ({stats.total})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('rules')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '10px',
              border: subTab === 'rules' ? '1px solid var(--accent-cyan, #06b6d4)' : '1px solid transparent',
              background: subTab === 'rules' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
              color: subTab === 'rules' ? 'var(--accent-cyan, #22d3ee)' : 'var(--text-muted)',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <Tag size={16} />
            <span>Cấu hình Danh mục & Quy tắc ({categories.length})</span>
          </button>
        </div>

        {subTab === 'audit' && (
          <button
            type="button"
            onClick={fetchAuditLogs}
            disabled={isLoading}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              fontSize: '0.82rem',
              borderRadius: '10px'
            }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin-icon' : ''} />
            <span>{isLoading ? 'Đang tải...' : 'Làm mới nhật ký'}</span>
          </button>
        )}
      </div>

      {subTab === 'rules' ? (
        /* Nhúng giao diện Quản lý Danh mục & Quy tắc khi cần */
        <RulesTab
          categories={categories}
          newCatName={newCatName}
          setNewCatName={setNewCatName}
          newCatType={newCatType}
          setNewCatType={setNewCatType}
          newCatColor={newCatColor}
          setNewCatColor={setNewCatColor}
          isAddingCat={isAddingCat}
          handleCreateCategory={handleCreateCategory}
          onDeleteCategory={onDeleteCategory}
          rules={rules}
          newKeyword={newKeyword}
          setNewKeyword={setNewKeyword}
          newRuleCat={newRuleCat}
          setNewRuleCat={setNewRuleCat}
          handleCreateRule={handleCreateRule}
          onToggleRule={onToggleRule}
          onDeleteRule={onDeleteRule}
        />
      ) : (
        /* Giao diện chính: Lịch sử hệ thống xử lý */
        <div>
          {/* 4 Thẻ KPI tóm tắt */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px',
              marginBottom: '20px'
            }}
          >
            <div
              className="glass-panel"
              style={{
                padding: '16px',
                borderRadius: '16px',
                borderLeft: '4px solid #38bdf8'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>TỔNG SỰ KIỆN XỬ LÝ</span>
                <History size={16} color="#38bdf8" />
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {stats.total} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-muted)' }}>thông báo/GD</span>
              </div>
            </div>

            <div
              className="glass-panel"
              style={{
                padding: '16px',
                borderRadius: '16px',
                borderLeft: '4px solid #06b6d4'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>CHUYỂN TIỀN NỘI BỘ</span>
                <ArrowLeftRight size={16} color="#06b6d4" />
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#06b6d4' }}>
                {stats.internalTransfers} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-muted)' }}>khớp tự động</span>
              </div>
            </div>

            <div
              className="glass-panel"
              style={{
                padding: '16px',
                borderRadius: '16px',
                borderLeft: '4px solid #10b981'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>CÔNG NỢ & HOÀN TRẢ</span>
                <CheckCircle2 size={16} color="#10b981" />
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981' }}>
                {stats.debtLoans} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-muted)' }}>khoản vay/nợ</span>
              </div>
            </div>

            <div
              className="glass-panel"
              style={{
                padding: '16px',
                borderRadius: '16px',
                borderLeft: '4px solid #f59e0b'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>HỆ THỐNG LƯỢC BỎ</span>
                <ShieldAlert size={16} color="#f59e0b" />
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f59e0b' }}>
                {stats.ignored} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-muted)' }}>tin rác/trùng</span>
              </div>
            </div>
          </div>

          {/* Thanh công cụ: Bộ lọc loại & Ô tìm kiếm */}
          <div
            className="glass-panel"
            style={{
              padding: '16px 20px',
              borderRadius: '18px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setFilterType('ALL')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filterType === 'ALL' ? '1px solid var(--accent-purple)' : '1px solid var(--border-subtle)',
                  background: filterType === 'ALL' ? 'rgba(139, 92, 246, 0.2)' : 'var(--bg-input)',
                  color: filterType === 'ALL' ? '#c084fc' : 'var(--text-main)',
                  transition: 'all 0.15s'
                }}
              >
                Tất cả ({logs.length})
              </button>

              <button
                type="button"
                onClick={() => setFilterType('TRANSFER')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filterType === 'TRANSFER' ? '1px solid #06b6d4' : '1px solid var(--border-subtle)',
                  background: filterType === 'TRANSFER' ? 'rgba(6, 182, 212, 0.2)' : 'var(--bg-input)',
                  color: filterType === 'TRANSFER' ? '#22d3ee' : 'var(--text-main)',
                  transition: 'all 0.15s'
                }}
              >
                <ArrowLeftRight size={13} />
                <span>Chuyển tiền nội bộ ({stats.internalTransfers})</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterType('DEBT')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filterType === 'DEBT' ? '1px solid #10b981' : '1px solid var(--border-subtle)',
                  background: filterType === 'DEBT' ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-input)',
                  color: filterType === 'DEBT' ? '#34d399' : 'var(--text-main)',
                  transition: 'all 0.15s'
                }}
              >
                <CheckCircle2 size={13} />
                <span>Hoàn tất & Vay nợ ({stats.debtLoans})</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterType('IGNORED')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filterType === 'IGNORED' ? '1px solid #f59e0b' : '1px solid var(--border-subtle)',
                  background: filterType === 'IGNORED' ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-input)',
                  color: filterType === 'IGNORED' ? '#fbbf24' : 'var(--text-main)',
                  transition: 'all 0.15s'
                }}
              >
                <ShieldAlert size={13} />
                <span>Đã lược bỏ ({stats.ignored})</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterType('AUTO')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: filterType === 'AUTO' ? '1px solid #8b5cf6' : '1px solid var(--border-subtle)',
                  background: filterType === 'AUTO' ? 'rgba(139, 92, 246, 0.2)' : 'var(--bg-input)',
                  color: filterType === 'AUTO' ? '#a78bfa' : 'var(--text-main)',
                  transition: 'all 0.15s'
                }}
              >
                <Sparkles size={13} />
                <span>AI & Quy tắc ({stats.autoClassified})</span>
              </button>
            </div>

            {/* Ô tìm kiếm */}
            <div style={{ position: 'relative', width: '240px' }}>
              <input
                type="text"
                placeholder="Tìm nội dung thông báo..."
                className="form-input"
                style={{ width: '100%', paddingLeft: '34px', fontSize: '0.84rem' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search
                size={15}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>
          </div>

          {/* Danh sách các sự kiện xử lý (Audit Timeline Cards) */}
          {filteredLogs.length === 0 ? (
            <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center' }}>
              <History size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto' }} />
              <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: 'var(--text-main)' }}>
                Chưa có dữ liệu xử lý phù hợp
              </h4>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Các thông báo ngân hàng và giao dịch tự động sẽ được ghi nhận và hiển thị chi tiết tại đây.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredLogs.map((log) => {
                const isExpanded = expandedLogIds.has(log.id);

                // Cấu hình nhãn & biểu tượng theo action_type
                let badgeStyle = {
                  bg: 'rgba(56, 189, 248, 0.15)',
                  border: 'rgba(56, 189, 248, 0.35)',
                  color: '#38bdf8',
                  label: 'Thông báo',
                  icon: Layers
                };

                if (log.action_type === 'INTERNAL_TRANSFER') {
                  badgeStyle = {
                    bg: 'rgba(6, 182, 212, 0.16)',
                    border: 'rgba(6, 182, 212, 0.4)',
                    color: '#06b6d4',
                    label: 'CHUYỂN TIỀN NỘI BỘ',
                    icon: ArrowLeftRight
                  };
                } else if (log.action_type === 'DEBT_COLLECT') {
                  badgeStyle = {
                    bg: 'rgba(16, 185, 129, 0.16)',
                    border: 'rgba(16, 185, 129, 0.4)',
                    color: '#10b981',
                    label: 'TRIỆT TIÊU KHOẢN VAY',
                    icon: CheckCircle2
                  };
                } else if (log.action_type === 'LOAN_RECORD') {
                  badgeStyle = {
                    bg: 'rgba(244, 63, 94, 0.16)',
                    border: 'rgba(244, 63, 94, 0.4)',
                    color: '#f43f5e',
                    label: 'GHI NHẬN CHO VAY',
                    icon: ArrowUpRight
                  };
                } else if (log.action_type === 'IGNORED' || log.action_type === 'DUPLICATE') {
                  badgeStyle = {
                    bg: 'rgba(245, 158, 11, 0.16)',
                    border: 'rgba(245, 158, 11, 0.4)',
                    color: '#f59e0b',
                    label: 'HỆ THỐNG LƯỢC BỎ',
                    icon: ShieldAlert
                  };
                } else if (log.action_type === 'AUTO_CLASSIFIED') {
                  badgeStyle = {
                    bg: 'rgba(139, 92, 246, 0.16)',
                    border: 'rgba(139, 92, 246, 0.4)',
                    color: '#c084fc',
                    label: 'TỰ ĐỘNG PHÂN LOẠI',
                    icon: Sparkles
                  };
                } else if (log.action_type === 'AI_BRIEFING') {
                  badgeStyle = {
                    bg: 'rgba(59, 130, 246, 0.16)',
                    border: 'rgba(59, 130, 246, 0.4)',
                    color: '#60a5fa',
                    label: 'BÁO CÁO AI GEMINI',
                    icon: Sparkles
                  };
                }

                const BadgeIcon = badgeStyle.icon;

                return (
                  <div
                    key={log.id}
                    className="glass-panel"
                    style={{
                      padding: '18px 20px',
                      borderRadius: '16px',
                      borderLeft: `4px solid ${badgeStyle.color}`,
                      transition: 'all 0.2s'
                    }}
                  >
                    {/* Hàng Header thẻ Log */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                        marginBottom: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            padding: '3px 10px',
                            borderRadius: '8px',
                            background: badgeStyle.bg,
                            border: `1px solid ${badgeStyle.border}`,
                            color: badgeStyle.color,
                            letterSpacing: '0.3px'
                          }}
                        >
                          <BadgeIcon size={12} />
                          <span>{badgeStyle.label}</span>
                        </span>

                        <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          {log.title}
                        </h4>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} />
                          <span>{formatTxTime(log.created_at)}</span>
                        </span>

                        {log.amount && (
                          <span
                            className="tabular-nums"
                            style={{
                              fontSize: '0.95rem',
                              fontWeight: 800,
                              color: log.type === 'INCOME' ? '#10b981' : '#f43f5e'
                            }}
                          >
                            {log.type === 'INCOME' ? '+' : '-'}{formatVND(log.amount)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hộp giải thích Quyết định của hệ thống */}
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border-subtle)',
                        marginBottom: '10px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px'
                      }}
                    >
                      <div style={{ marginTop: '2px' }}>
                        <BadgeIcon size={15} color={badgeStyle.color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: '1.45' }}>
                          {log.action_detail || 'Đã tiếp nhận và lưu trữ thông tin giao dịch'}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                          {log.account_name && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Building2 size={12} />
                              <span>{log.account_name}</span>
                            </span>
                          )}
                          {log.category_name && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: log.category_color || 'inherit'
                              }}
                            >
                              <Tag size={12} />
                              <span>{log.category_name}</span>
                            </span>
                          )}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            Trạng thái: <strong style={{ color: log.status === 'CONFIRMED' ? '#10b981' : log.status === 'IGNORED' ? '#f59e0b' : 'var(--text-dim)' }}>
                              {log.status === 'CONFIRMED' ? 'Đã phân loại' : log.status === 'IGNORED' ? 'Đã lược bỏ' : 'Chờ bổ sung'}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Hộp trích dẫn Thông báo gốc (Raw message) */}
                    {log.raw_content && (
                      <div style={{ marginTop: '8px' }}>
                        <button
                          type="button"
                          onClick={() => toggleExpandLog(log.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-cyan, #38bdf8)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 0'
                          }}
                        >
                          <FileText size={12} />
                          <span>{isExpanded ? 'Thu gọn nội dung gốc' : 'Xem nội dung thông báo gốc'}</span>
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>

                        {isExpanded && (
                          <div
                            style={{
                              marginTop: '6px',
                              padding: '10px 14px',
                              borderRadius: '10px',
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border-glass)',
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                              fontSize: '0.77rem',
                              color: 'var(--text-dim)',
                              lineHeight: '1.5',
                              wordBreak: 'break-word',
                              whiteSpace: 'pre-wrap'
                            }}
                          >
                            {log.raw_content}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
