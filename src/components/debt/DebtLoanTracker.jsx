import React, { useState, useMemo } from 'react';
import {
  HandCoins,
  Handshake,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Plus,
  Users,
  Search,
  Check,
  Edit2
} from 'lucide-react';
import { formatVND } from '../../utils/formatters.js';

// Hàm trích xuất tên người liên quan từ nội dung giao dịch
function extractBorrowerName(desc) {
  if (!desc) return 'Khác';
  const d = desc.trim();
  let m = d.match(/Cho\s+([A-Za-zÀ-ỹ\s]+?)\s+(?:vay|mượn)/i);
  if (m) return m[1].trim();
  m = d.match(/Trả\s+hộ\s+tiền\s+ăn\s+cho\s+([A-Za-zÀ-ỹ\s,]+)/i);
  if (m) return m[1].trim();
  m = d.match(/Trả\s+hộ\s+([A-Za-zÀ-ỹ\s,]+)/i);
  if (m) return m[1].trim();
  m = d.match(/^([A-Za-zÀ-ỹ\s]+?)\s+(?:trả nợ|chuyển tiền|trả trước|trả|bắn tiền)/i);
  if (m) return m[1].trim();
  m = d.match(/Trả\s+nợ\s+(?:cho\s+)?([A-Za-zÀ-ỹ\s]+)/i);
  if (m) return m[1].trim();
  m = d.match(/(?:từ|của)\s+([A-Za-zÀ-ỹ\s]+)/i);
  if (m) return m[1].trim();
  return d;
}

export default function DebtLoanTracker({
  transactions = [],
  accounts = [],
  onOpenModal,
  onEditTransaction
}) {
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'LOAN' | 'COLLECT' | 'PEOPLE'
  const [searchQuery, setSearchQuery] = useState('');

  // Lọc tất cả giao dịch nợ (Cho vay & Thu hồi nợ)
  const debtTransactions = useMemo(() => {
    return transactions
      .filter(
        (t) =>
          (t.category_id === 'cat_loan' || t.category_id === 'cat_debt_collect') &&
          t.status !== 'IGNORED'
      )
      .sort((a, b) => {
        const timeA = new Date(a.transaction_time || a.created_at).getTime() || 0;
        const timeB = new Date(b.transaction_time || b.created_at).getTime() || 0;
        return timeB - timeA;
      });
  }, [transactions]);

  // Thống kê tổng hợp
  const stats = useMemo(() => {
    const loanTxs = debtTransactions.filter((t) => t.category_id === 'cat_loan');
    const collectTxs = debtTransactions.filter((t) => t.category_id === 'cat_debt_collect');

    const totalLoans = loanTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalCollected = collectTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const remaining = Math.max(0, totalLoans - totalCollected);
    const recoveryRate = totalLoans > 0 ? Math.min(100, Math.round((totalCollected / totalLoans) * 100)) : 100;

    return {
      totalLoans,
      loanCount: loanTxs.length,
      totalCollected,
      collectCount: collectTxs.length,
      remaining,
      recoveryRate
    };
  }, [debtTransactions]);

  // Nhóm theo người liên quan (Smart Contact Grouping)
  const peopleSummary = useMemo(() => {
    const map = {};
    debtTransactions.forEach((t) => {
      const person = extractBorrowerName(t.description);
      if (!map[person]) {
        map[person] = {
          name: person,
          lent: 0,
          collected: 0,
          txCount: 0,
          lastTime: t.transaction_time || t.created_at,
          txs: []
        };
      }
      if (t.category_id === 'cat_loan') {
        map[person].lent += t.amount || 0;
      } else {
        map[person].collected += t.amount || 0;
      }
      map[person].txCount += 1;
      map[person].txs.push(t);
    });

    return Object.values(map).map((p) => {
      const balance = Math.max(0, p.lent - p.collected);
      const isSettled = p.lent > 0 && p.collected >= p.lent;
      return { ...p, balance, isSettled };
    }).sort((a, b) => b.balance - a.balance || b.lent - a.lent);
  }, [debtTransactions]);

  // Danh sách giao dịch hiển thị theo bộ lọc và tìm kiếm
  const filteredTxs = useMemo(() => {
    return debtTransactions.filter((t) => {
      if (activeFilter === 'LOAN' && t.category_id !== 'cat_loan') return false;
      if (activeFilter === 'COLLECT' && t.category_id !== 'cat_debt_collect') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const bank = (t.bank_name || '').toLowerCase();
        return desc.includes(q) || bank.includes(q);
      }
      return true;
    });
  }, [debtTransactions, activeFilter, searchQuery]);

  return (
    <div className="glass-panel debt-tracker-card" style={{ marginTop: '24px', padding: '24px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(16, 185, 129, 0.2))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ec4899',
              border: '1px solid rgba(236, 72, 153, 0.35)',
              boxShadow: '0 4px 16px rgba(236, 72, 153, 0.15)'
            }}
          >
            <HandCoins size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Sổ theo dõi Cho vay & Thu hồi nợ
              </h3>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}
              >
                Công nợ độc lập
              </span>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Tách biệt hoàn toàn khỏi cơ cấu chi tiêu sinh hoạt • Theo dõi thu nợ và người vay minh bạch
            </p>
          </div>
        </div>

        {/* Nút thao tác nhanh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => onOpenModal && onOpenModal('LOAN')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '12px',
              fontSize: '0.85rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(244, 63, 94, 0.3))',
              border: '1px solid rgba(244, 63, 94, 0.45)',
              color: '#ff6b8b',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 10px rgba(244, 63, 94, 0.15)'
            }}
          >
            <Plus size={15} />
            <span>+ Cho vay / Trả hộ</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal && onOpenModal('COLLECT')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '12px',
              fontSize: '0.85rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.3))',
              border: '1px solid rgba(16, 185, 129, 0.45)',
              color: '#10b981',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.15)'
            }}
          >
            <Plus size={15} />
            <span>+ Thu hồi nợ</span>
          </button>
        </div>
      </div>

      {/* 3 KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '14px',
          marginBottom: '22px'
        }}
      >
        {/* KPI 1: Đã cho vay / trả hộ */}
        <div
          style={{
            padding: '16px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1), rgba(244, 63, 94, 0.05))',
            border: '1px solid rgba(236, 72, 153, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Tổng đã Cho vay / Trả hộ
            </span>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(236, 72, 153, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ec4899'
              }}
            >
              <ArrowDownRight size={16} />
            </span>
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f43f5e' }} className="tabular-nums">
            {formatVND(stats.totalLoans)}
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
            {stats.loanCount} khoản đã chi tiền ra
          </span>
        </div>

        {/* KPI 2: Đã thu hồi */}
        <div
          style={{
            padding: '16px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 182, 212, 0.05))',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Đã thu hồi được
            </span>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981'
              }}
            >
              <ArrowUpRight size={16} />
            </span>
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }} className="tabular-nums">
            {formatVND(stats.totalCollected)}
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
            {stats.collectCount} lần nhận lại tiền
          </span>
        </div>

        {/* KPI 3: Còn phải thu */}
        <div
          style={{
            padding: '16px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05))',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Còn cần thu hồi (Phải thu)
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '8px',
                background: stats.remaining === 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: stats.remaining === 0 ? '#10b981' : '#f59e0b'
              }}
            >
              {stats.recoveryRate}% hoàn trả
            </span>
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: stats.remaining === 0 ? '#10b981' : '#f59e0b' }} className="tabular-nums">
            {formatVND(stats.remaining)}
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
            {stats.remaining === 0 ? 'Toàn bộ công nợ đã được tất toán!' : 'Số tiền đang chờ người vay hoàn trả'}
          </span>
        </div>
      </div>

      {/* Toolbar: Segmented Tab Filters & Search */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px'
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            padding: '4px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            gap: '4px'
          }}
        >
          {[
            { id: 'ALL', label: 'Tất cả', count: debtTransactions.length },
            { id: 'LOAN', label: 'Cho vay', count: stats.loanCount },
            { id: 'COLLECT', label: 'Thu hồi', count: stats.collectCount },
            { id: 'PEOPLE', label: 'Theo người', count: peopleSummary.length }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: activeFilter === tab.id ? 'var(--bg-glass-card)' : 'transparent',
                color: activeFilter === tab.id ? 'var(--text-main)' : 'var(--text-muted)',
                boxShadow: activeFilter === tab.id ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  marginLeft: '6px',
                  fontSize: '0.72rem',
                  opacity: 0.75,
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.08)'
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {activeFilter !== 'PEOPLE' && (
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              width: '220px'
            }}
          >
            <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-dim)' }} />
            <input
              type="text"
              placeholder="Tìm theo tên, ghi chú..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 12px 6px 30px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-main)',
                fontSize: '0.82rem',
                outline: 'none'
              }}
            />
          </div>
        )}
      </div>

      {/* Main Content: Views */}
      {activeFilter === 'PEOPLE' ? (
        /* View 1: Nhóm theo người liên quan */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px'
          }}
        >
          {peopleSummary.map((p) => {
            const firstLetter = p.name ? p.name.charAt(0).toUpperCase() : '?';
            return (
              <div
                key={p.name}
                style={{
                  padding: '14px',
                  borderRadius: '14px',
                  background: 'rgba(255, 255, 255, 0.035)',
                  border: '1px solid var(--border-glass)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.9rem'
                      }}
                    >
                      {firstLetter}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        {p.name}
                      </h4>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        {p.txCount} giao dịch
                      </span>
                    </div>
                  </div>

                  {p.isSettled ? (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '10px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        border: '1px solid rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      Đã tất toán ✓
                    </span>
                  ) : p.balance > 0 ? (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '10px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#f59e0b',
                        border: '1px solid rgba(245, 158, 11, 0.3)'
                      }}
                    >
                      Đang nợ
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '10px',
                        background: 'rgba(56, 189, 248, 0.15)',
                        color: '#38bdf8'
                      }}
                    >
                      Đã thanh toán
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.2)'
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', display: 'block' }}>Đã cho vay:</span>
                    <strong style={{ color: '#f43f5e' }} className="tabular-nums">{formatVND(p.lent)}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', display: 'block' }}>Đã thu hồi:</span>
                    <strong style={{ color: '#10b981' }} className="tabular-nums">{formatVND(p.collected)}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', display: 'block' }}>Còn nợ:</span>
                    <strong style={{ color: p.balance > 0 ? '#f59e0b' : '#10b981' }} className="tabular-nums">
                      {formatVND(p.balance)}
                    </strong>
                  </div>
                </div>

                {p.balance > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenModal) {
                        onOpenModal('COLLECT', {
                          borrower: p.name,
                          amount: p.balance,
                          description: `${p.name} trả nợ`
                        });
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '7px 12px',
                      borderRadius: '8px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: '#10b981',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s'
                    }}
                  >
                    <Check size={14} />
                    <span>Ghi nhận {p.name} trả nợ ({formatVND(p.balance)})</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* View 2: Danh sách giao dịch nợ chi tiết */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredTxs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              Không có giao dịch nào phù hợp với bộ lọc.
            </div>
          ) : (
            filteredTxs.map((t) => {
              const isLoan = t.category_id === 'cat_loan';
              const borrowerName = extractBorrowerName(t.description);

              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.035)',
                    border: '1px solid var(--border-glass)',
                    transition: 'all 0.2s',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                  className="cat-breakdown-row"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px', flex: 1 }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: isLoan ? 'rgba(244, 63, 94, 0.18)' : 'rgba(16, 185, 129, 0.18)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isLoan ? '#f43f5e' : '#10b981',
                        border: `1px solid ${isLoan ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                        flexShrink: 0
                      }}
                    >
                      {isLoan ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                          {t.description || (isLoan ? 'Khoản cho vay' : 'Thu hồi nợ')}
                        </span>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '6px',
                            background: isLoan ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: isLoan ? '#ff6b8b' : '#10b981'
                          }}
                        >
                          {isLoan ? 'Cho vay / Trả hộ' : 'Thu nợ'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} />
                          <span>{t.transaction_time || 'Gần đây'}</span>
                        </span>
                        {t.bank_name && (
                          <span>• {t.bank_name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cột số tiền & Action */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '1rem',
                          color: isLoan ? '#f43f5e' : '#10b981'
                        }}
                        className="tabular-nums"
                      >
                        {isLoan ? '-' : '+'}{formatVND(t.amount)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isLoan && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenModal) {
                              onOpenModal('COLLECT', {
                                borrower: borrowerName,
                                amount: t.amount,
                                description: `${borrowerName} trả tiền`
                              });
                            }
                          }}
                          title="Ghi nhận người này trả nợ"
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.35)',
                            color: '#10b981',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Check size={12} />
                          <span>Đã trả</span>
                        </button>
                      )}

                      {onEditTransaction && (
                        <button
                          type="button"
                          onClick={() => onEditTransaction(t)}
                          title="Chỉnh sửa giao dịch"
                          style={{
                            padding: '6px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-glass)',
                            color: 'var(--text-muted)',
                            cursor: 'pointer'
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
