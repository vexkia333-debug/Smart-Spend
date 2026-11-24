import { useMemo, useCallback } from 'react';
import { parseTxDate, formatDateVN } from '../utils/formatters.js';
import { computeMonthlySavingsSummary } from '../utils/savingsMetrics.js';

/**
 * Tính toán các chỉ số thống kê, bộ lọc thời gian, cơ cấu danh mục và danh sách giao dịch đã lọc.
 */
export function useFinanceMetrics({
  transactions = [],
  categories = [],
  timeFilter = 'MONTH',
  customStartDate = '',
  customEndDate = '',
  filterAccount = 'ALL',
  filterType = 'ALL',
  filterCategory = 'ALL',
  searchQuery = '',
  txSortOrder = 'DESC'
}) {
  const isMatchingTime = useCallback(
    (timeStr, createdAtStr) => {
      if (timeFilter === 'ALL') return true;
      const txDate = parseTxDate(timeStr, createdAtStr);
      if (isNaN(txDate.getTime())) return true;
      const now = new Date();

      if (timeFilter === 'DAY') {
        return (
          txDate.getDate() === now.getDate() &&
          txDate.getMonth() === now.getMonth() &&
          txDate.getFullYear() === now.getFullYear()
        );
      }
      if (timeFilter === 'WEEK') {
        const startOfWeek = new Date(now);
        const day = startOfWeek.getDay() || 7;
        startOfWeek.setDate(startOfWeek.getDate() - day + 1);
        startOfWeek.setHours(0, 0, 0, 0);
        return txDate >= startOfWeek;
      }
      if (timeFilter === 'MONTH') {
        return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
      }
      if (timeFilter === 'CUSTOM') {
        if (customStartDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          if (txDate < start) return false;
        }
        if (customEndDate) {
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          if (txDate > end) return false;
        }
        return true;
      }
      return true;
    },
    [timeFilter, customStartDate, customEndDate]
  );

  const timeFilteredTransactions = useMemo(
    () => transactions.filter((t) => isMatchingTime(t.transaction_time, t.created_at)),
    [transactions, isMatchingTime]
  );

  const displayedExpense = useMemo(
    () =>
      timeFilteredTransactions
        .filter(
          (t) =>
            t.type === 'EXPENSE' &&
            t.status !== 'IGNORED' &&
            !t.category_id?.startsWith('cat_transfer_') &&
            t.category_id !== 'cat_loan' &&
            t.category_id !== 'cat_debt_repay'
        )
        .reduce((sum, t) => sum + (t.amount || 0), 0),
    [timeFilteredTransactions]
  );

  const displayedIncome = useMemo(
    () =>
      timeFilteredTransactions
        .filter(
          (t) =>
            t.type === 'INCOME' &&
            t.status !== 'IGNORED' &&
            !t.category_id?.startsWith('cat_transfer_') &&
            t.category_id !== 'cat_debt_collect'
        )
        .reduce((sum, t) => sum + (t.amount || 0), 0),
    [timeFilteredTransactions]
  );

  const displayedPendingCount = useMemo(
    () => timeFilteredTransactions.filter((t) => t.status === 'PENDING').length,
    [timeFilteredTransactions]
  );

  const netSavings = displayedIncome - displayedExpense;
  const spendRatio =
    displayedIncome > 0
      ? Math.round((displayedExpense / displayedIncome) * 100)
      : displayedExpense > 0
        ? 100
        : 0;
  const savingsRate =
    displayedIncome > 0
      ? Math.max(0, Math.round(((displayedIncome - displayedExpense) / displayedIncome) * 100))
      : 0;

  const categoryBreakdown = useMemo(() => {
    const map = {};
    categories
      .filter(
        (c) =>
          c.id !== 'cat_loan' &&
          c.id !== 'cat_debt_collect' &&
          c.id !== 'cat_debt_repay' &&
          !c.id.startsWith('cat_transfer_')
      )
      .forEach((c) => {
        map[c.id] = { ...c, total_amount: 0, tx_count: 0, items: [] };
      });
    timeFilteredTransactions.forEach((t) => {
      if (
        t.type === 'EXPENSE' &&
        t.status !== 'IGNORED' &&
        t.category_id &&
        !t.category_id?.startsWith('cat_transfer_') &&
        t.category_id !== 'cat_loan' &&
        t.category_id !== 'cat_debt_repay'
      ) {
        if (!map[t.category_id]) {
          map[t.category_id] = {
            id: t.category_id,
            name: t.category_name || 'Khác',
            color: t.category_color || '#94a3b8',
            total_amount: 0,
            tx_count: 0,
            items: []
          };
        }
        map[t.category_id].total_amount += t.amount || 0;
        map[t.category_id].tx_count += 1;
        map[t.category_id].items.push(t);
      }
    });
    return Object.values(map)
      .filter((c) => c.total_amount > 0)
      .map((c) => ({
        ...c,
        items: [...c.items].sort(
          (a, b) =>
            parseTxDate(b.transaction_time, b.created_at).getTime() -
            parseTxDate(a.transaction_time, a.created_at).getTime()
        )
      }))
      .sort((a, b) => b.total_amount - a.total_amount);
  }, [categories, timeFilteredTransactions]);

  const last7DaysData = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = i === 0 ? 'Hôm nay' : i === 1 ? 'Hôm qua' : `${d.getDate()}/${d.getMonth() + 1}`;

      const dayExpense = transactions
        .filter((t) => {
          if (
            t.type !== 'EXPENSE' ||
            t.status !== 'CONFIRMED' ||
            t.category_id?.startsWith('cat_transfer_') ||
            t.category_id === 'cat_loan' ||
            t.category_id === 'cat_debt_repay'
          ) {
            return false;
          }
          const txDate = parseTxDate(t.transaction_time, t.created_at);
          if (!txDate || isNaN(txDate.getTime())) return false;
          const txDayStr = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
          return txDayStr === dayStr;
        })
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      days.push({ label, date: dayStr, amount: dayExpense, isToday: i === 0 });
    }
    return days;
  }, [transactions]);

  const { currentMonthStats, monthlySavingsHistory } = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    const curKey = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;

    const byMonth = {};
    for (const t of transactions) {
      if (t.status === 'IGNORED' || t.category_id?.startsWith('cat_transfer_')) continue;
      const txDate = parseTxDate(t.transaction_time, t.created_at);
      if (!txDate || isNaN(txDate.getTime())) continue;
      const m = txDate.getMonth() + 1;
      const y = txDate.getFullYear();
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { year: y, month: m, txs: [] };
      byMonth[key].txs.push(t);
    }

    const curSummary = computeMonthlySavingsSummary(byMonth[curKey]?.txs || []);
    const totalDays = new Date(curYear, curMonth + 1, 0).getDate();
    const daysRemaining = Math.max(1, totalDays - now.getDate() + 1);

    const history = Object.entries(byMonth)
      .filter(([key]) => key < curKey)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, bucket]) => {
        const summary = computeMonthlySavingsSummary(bucket.txs);
        return {
          key,
          month: bucket.month,
          year: bucket.year,
          label: `Tháng ${bucket.month}/${bucket.year}`,
          ...summary
        };
      });

    return {
      currentMonthStats: {
        income: curSummary.income,
        expense: curSummary.expense,
        savings: curSummary.savings,
        reimbursement: curSummary.reimbursement,
        daysRemaining,
        monthNumber: curMonth + 1
      },
      monthlySavingsHistory: history
    };
  }, [transactions]);

  const timeLabel = useMemo(() => {
    if (timeFilter === 'ALL') return 'Toàn bộ thời gian';
    if (timeFilter === 'MONTH') return 'Tháng này';
    if (timeFilter === 'WEEK') return 'Tuần này';
    if (timeFilter === 'DAY') return 'Hôm nay';
    if (timeFilter === 'CUSTOM') {
      if (customStartDate && customEndDate) {
        return `${formatDateVN(customStartDate)} - ${formatDateVN(customEndDate)}`;
      }
      if (customStartDate) return `Từ ${formatDateVN(customStartDate)}`;
      if (customEndDate) return `Đến ${formatDateVN(customEndDate)}`;
      return 'Khoảng thời gian tùy chọn';
    }
    return 'Toàn bộ thời gian';
  }, [timeFilter, customStartDate, customEndDate]);

  const pendingList = useMemo(
    () => transactions.filter((t) => t.status === 'PENDING'),
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    const q = searchQuery ? searchQuery.toLowerCase() : '';
    return transactions
      .filter((t) => {
        if (!isMatchingTime(t.transaction_time, t.created_at)) return false;
        if (filterAccount !== 'ALL' && t.account_id !== filterAccount) return false;
        if (filterType !== 'ALL' && t.type !== filterType) return false;
        if (filterCategory !== 'ALL') {
          if (filterCategory === 'UNCATEGORIZED') {
            if (t.category_id) return false;
          } else if (t.category_id !== filterCategory) {
            return false;
          }
        }
        if (
          q &&
          !t.description?.toLowerCase().includes(q) &&
          !t.bank_name?.toLowerCase().includes(q) &&
          !t.account_name?.toLowerCase().includes(q) &&
          !t.category_name?.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const timeA = parseTxDate(a.transaction_time, a.created_at).getTime();
        const timeB = parseTxDate(b.transaction_time, b.created_at).getTime();
        return txSortOrder === 'DESC' ? timeB - timeA : timeA - timeB;
      });
  }, [
    transactions,
    isMatchingTime,
    filterAccount,
    filterType,
    filterCategory,
    searchQuery,
    txSortOrder
  ]);

  return {
    timeFilteredTransactions,
    displayedExpense,
    displayedIncome,
    displayedPendingCount,
    netSavings,
    spendRatio,
    savingsRate,
    categoryBreakdown,
    last7DaysData,
    currentMonthStats,
    monthlySavingsHistory,
    timeLabel,
    pendingList,
    filteredTransactions
  };
}
