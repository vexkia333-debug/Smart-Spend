import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';

// Common Components
import Header from './components/common/Header.jsx';
import NavTabs from './components/common/NavTabs.jsx';
import StatsSummary from './components/common/StatsSummary.jsx';

// Tab Components
import PendingTab from './components/tabs/PendingTab.jsx';
import DashboardTab from './components/tabs/DashboardTab.jsx';
import TransactionsTab from './components/tabs/TransactionsTab.jsx';
import RulesTab from './components/tabs/RulesTab.jsx';

// Modal Components
import LivePromptOverlay from './components/modals/LivePromptOverlay.jsx';
import ResetTransactionsModal from './components/modals/ResetTransactionsModal.jsx';
import ReconcileModal from './components/modals/ReconcileModal.jsx';
import ApiKeyModal from './components/modals/ApiKeyModal.jsx';
import SettingsModal from './components/modals/SettingsModal.jsx';
import PinLockScreen from './components/modals/PinLockScreen.jsx';

// Utilities & Constants
import {
  formatVND,
  formatTxTime,
  formatNumberWithCommas,
  parseTxDate,
  formatDateVN
} from './utils/formatters.js';
import { DEFAULT_QUICK_ACTIONS } from './constants/index.js';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('pending');
  const [stats, setStats] = useState({
    totalBalance: 0,
    totalExpense: 0,
    totalIncome: 0,
    pendingCount: 0,
    categories: []
  });
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [rules, setRules] = useState([]);
  const [livePrompt, setLivePrompt] = useState(null);

  // Theme & Time Filter States
  const [theme, setTheme] = useState(() => localStorage.getItem('smartspend_theme') || 'dark');
  const [timeFilter, setTimeFilter] = useState('ALL'); // 'ALL' | 'MONTH' | 'WEEK' | 'DAY' | 'CUSTOM'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomDatePopover, setShowCustomDatePopover] = useState(false);
  const [hoveredCatId, setHoveredCatId] = useState(null);

  // AI Assistant States (Google AI Studio)
  const [aiInputText, setAiInputText] = useState('');
  const [aiIsCash, setAiIsCash] = useState(true);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [aiMessage, setAiMessage] = useState(null);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [promptAiText, setPromptAiText] = useState('');
  const [isPromptAiAnalyzing, setIsPromptAiAnalyzing] = useState(false);

  // Settings & Reconcile Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [reconcileAccount, setReconcileAccount] = useState(null);
  const [reconcileAmount, setReconcileAmount] = useState('');
  const [reconcileReason, setReconcileReason] = useState('Kiểm kê số dư');
  const [isSubmittingReconcile, setIsSubmittingReconcile] = useState(false);

  // Filters & Sorting for Transactions Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [txSortOrder, setTxSortOrder] = useState('DESC'); // 'DESC' = Gần nhất lên đầu

  // Category & Rule Form States
  const [newKeyword, setNewKeyword] = useState('');
  const [newRuleCat, setNewRuleCat] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('EXPENSE');
  const [newCatColor, setNewCatColor] = useState('#10b981');
  const [isAddingCat, setIsAddingCat] = useState(false);

  // Reset History Modal States
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetBalancesCheckbox, setResetBalancesCheckbox] = useState(false);
  const [isResettingTx, setIsResettingTx] = useState(false);

  // PIN Lock Security
  const [authToken, setAuthToken] = useState(() => {
    return localStorage.getItem('smartspend_pin_token') || sessionStorage.getItem('smartspend_pin_token') || '';
  });
  const [isLocked, setIsLocked] = useState(() => {
    const saved = localStorage.getItem('smartspend_pin_token') || sessionStorage.getItem('smartspend_pin_token');
    return !saved;
  });

  const authFetch = async (url, options = {}) => {
    const currentToken = authToken || localStorage.getItem('smartspend_pin_token') || sessionStorage.getItem('smartspend_pin_token') || '';
    const headers = {
      ...(options.headers || {}),
      'x-pin-token': currentToken
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem('smartspend_pin_token');
      sessionStorage.removeItem('smartspend_pin_token');
      setAuthToken('');
      setIsLocked(true);
    }
    return res;
  };

  const handleUnlock = (token, remember) => {
    if (remember) {
      localStorage.setItem('smartspend_pin_token', token);
    } else {
      sessionStorage.setItem('smartspend_pin_token', token);
    }
    setAuthToken(token);
    setIsLocked(false);
  };

  const handleLockApp = () => {
    localStorage.removeItem('smartspend_pin_token');
    sessionStorage.removeItem('smartspend_pin_token');
    setAuthToken('');
    setIsLocked(true);
  };

  // Webhook URL
  const webhookUrl = `${window.location.origin}/api/webhook/bank-notification`;

  // Theme effect
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('smartspend_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // 1. Load initial data & SSE setup
  useEffect(() => {
    if (isLocked) return;

    fetchInitialData();

    const currentToken = authToken || localStorage.getItem('smartspend_pin_token') || sessionStorage.getItem('smartspend_pin_token') || '';
    const eventSource = new EventSource(`/api/events?token=${encodeURIComponent(currentToken)}`);

    eventSource.addEventListener('NEW_TRANSACTION_PROMPT', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setLivePrompt(payload);
        fetchStats();
        fetchTransactions();
      } catch (e) {
        console.error('SSE Error:', e);
      }
    });

    eventSource.addEventListener('TRANSACTION_UPDATED', () => {
      fetchStats();
      fetchTransactions();
    });

    eventSource.addEventListener('TRANSACTION_IGNORED', () => {
      fetchStats();
      fetchTransactions();
    });

    eventSource.addEventListener('CATEGORY_CREATED', () => {
      fetchCategories();
      fetchStats();
    });

    eventSource.addEventListener('TRANSACTIONS_CLEARED', () => {
      fetchInitialData();
    });

    eventSource.addEventListener('DATA_RESET', () => {
      fetchInitialData();
    });

    return () => {
      eventSource.close();
    };
  }, [isLocked, authToken]);

  const fetchInitialData = async () => {
    await Promise.all([
      fetchStats(),
      fetchTransactions(),
      fetchCategories(),
      fetchAccounts(),
      fetchRules(),
      fetchSettings()
    ]);
  };

  const fetchSettings = async () => {
    try {
      const res = await authFetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setHasGeminiKey(data.hasGeminiKey);
        setMaskedKey(data.maskedKey || '');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await authFetch('/api/stats');
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await authFetch('/api/transactions');
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
        const pending = data.find((t) => t.status === 'PENDING');
        if (pending) {
          setLivePrompt((prev) => {
            if (prev) return prev;
            const matchedCats = categories
              .filter((c) => c.type === pending.type && c.is_quick_action)
              .slice(0, 4);
            return {
              transaction: pending,
              quickActions: matchedCats.length > 0 ? matchedCats : DEFAULT_QUICK_ACTIONS
            };
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await authFetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
        if (data.length > 0 && !newRuleCat) setNewRuleCat(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await authFetch('/api/accounts');
      if (res.ok) setAccounts(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await authFetch('/api/rules');
      if (res.ok) setRules(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  // Phân loại giao dịch
  const handleCategorize = async (txId, categoryId, customDesc, partnerAccountId) => {
    try {
      const payload = { category_id: categoryId };
      if (customDesc) payload.description = customDesc;
      if (partnerAccountId) payload.partner_account_id = partnerAccountId;

      const res = await authFetch(`/api/transactions/${txId}/categorize`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        confetti({
          particleCount: 45,
          spread: 60,
          origin: { y: 0.85 },
          colors: ['#10b981', '#06b6d4', '#f59e0b']
        });

        if (livePrompt && livePrompt.transaction.id === txId) {
          setLivePrompt(null);
        }

        fetchStats();
        fetchTransactions();
        fetchAccounts();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Phân loại bằng AI cho bất kỳ giao dịch nào (dùng chung cho Popup và Tab Cần bổ sung)
  const handleAiCategorizeTx = async (txId, text, amount) => {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      alert('Vui lòng nhập nội dung dòng tiền để AI phân loại');
      return false;
    }
    if (!hasGeminiKey) {
      setShowApiKeyModal(true);
      return false;
    }
    try {
      const promptText = amount
        ? `${trimmed} (khoản tiền: ${amount}đ)`
        : trimmed;

      const targetTx = transactions.find(t => t.id === txId) || livePrompt?.transaction;

      const res = await authFetch('/api/ai/parse-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: promptText,
          autoSave: false,
          expectedType: targetTx?.type,
          originalAmount: amount
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi phân tích AI');

      if (data.createdCategory) {
        await fetchCategories();
      }

      // Xử lý tách giao dịch nhiều phần (Split transaction)
      if (data.isSplit && data.splits && data.splits.length > 1) {
        const splitRes = await authFetch(`/api/transactions/${txId}/split`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ splits: data.splits })
        });
        if (!splitRes.ok) {
          const splitErr = await splitRes.json();
          throw new Error(splitErr.error || 'Lỗi tách giao dịch');
        }
        await Promise.all([fetchTransactions(), fetchStats(), fetchAccounts()]);
        return true;
      }

      await handleCategorize(
        txId,
        data.parsed.categoryId,
        data.parsed.description || trimmed
      );
      return true;
    } catch (err) {
      alert(err.message || 'Lỗi phân loại AI');
      return false;
    }
  };

  // Phân loại bằng AI trực tiếp trong Prompt nổi
  const handlePromptAiCategorize = async (txId) => {
    if (!promptAiText.trim()) return;
    setIsPromptAiAnalyzing(true);
    try {
      const success = await handleAiCategorizeTx(
        txId,
        promptAiText,
        livePrompt?.transaction?.amount
      );
      if (success) {
        setLivePrompt(null);
        setPromptAiText('');
      }
    } finally {
      setIsPromptAiAnalyzing(false);
    }
  };

  // Bỏ qua giao dịch
  const handleIgnore = async (txId) => {
    try {
      await authFetch(`/api/transactions/${txId}/ignore`, { method: 'PATCH' });
      if (livePrompt && livePrompt.transaction.id === txId) {
        setLivePrompt(null);
      }
      fetchStats();
      fetchTransactions();
    } catch (e) {
      console.error(e);
    }
  };

  // Mô phỏng bắn thông báo
  const handleSimulate = async () => {
    try {
      const res = await authFetch('/api/simulate/notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank: 'VCB',
          type: 'EXPENSE',
          amount: 85000,
          desc: 'QR TT Phuc Long Coffee Landmark 81'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLivePrompt(data);
        fetchStats();
        fetchTransactions();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Tạo quy tắc từ khóa
  const handleCreateRule = async (e) => {
    e.preventDefault();
    if (!newKeyword || !newRuleCat) return;
    try {
      const res = await authFetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: newKeyword,
          category_id: newRuleCat,
          is_auto_apply: 0
        })
      });
      if (res.ok) {
        setNewKeyword('');
        fetchRules();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Tạo danh mục mới
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatName) return;
    setIsAddingCat(true);
    try {
      const res = await authFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCatName,
          type: newCatType,
          color: newCatColor,
          icon: newCatType === 'INCOME' ? 'PlusCircle' : 'Tag',
          is_quick_action: 1
        })
      });
      if (res.ok) {
        setNewCatName('');
        await fetchCategories();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAddingCat(false);
    }
  };

  // Lưu API Key Gemini
  const handleSaveApiKey = async (e) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setIsSavingKey(true);
    try {
      const res = await authFetch('/api/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput })
      });
      if (res.ok) {
        setShowApiKeyModal(false);
        setApiKeyInput('');
        await fetchSettings();
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.6 }
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingKey(false);
    }
  };

  // Phân tích chi tiêu bằng Gemini AI
  const handleAnalyzeAi = async (e) => {
    if (e) e.preventDefault();
    if (!aiInputText.trim()) return;

    if (!hasGeminiKey) {
      setShowApiKeyModal(true);
      return;
    }

    setIsAnalyzingAi(true);
    setAiMessage(null);
    try {
      const res = await authFetch('/api/ai/parse-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiInputText,
          autoSave: true,
          forceCash: aiIsCash
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi phân tích AI');

      if (data.createdCategory) {
        await fetchCategories();
      }

      setAiMessage(
        data.createdCategory
          ? `✨ Đã tự động tạo danh mục mới "${data.createdCategory.name}" & ghi nhận: ${formatVND(
              data.transaction.amount
            )}!`
          : `✨ Đã ghi nhận: ${data.transaction.category_name} - ${formatVND(
              data.transaction.amount
            )} (${data.parsed.reasoning})`
      );
      setAiInputText('');
      setAiIsCash(true);
      await Promise.all([fetchStats(), fetchTransactions(), fetchAccounts(), fetchCategories()]);

      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#8b5cf6', '#3b82f6', '#10b981']
      });

      setTimeout(() => setAiMessage(null), 8000);
    } catch (err) {
      setAiMessage(`⚠️ ${err.message || 'Máy chủ AI đang bận, vui lòng thử lại sau giây lát'}`);
      setTimeout(() => setAiMessage(null), 8000);
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  // Kiểm kê số dư tài khoản
  const handleReconcileSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!reconcileAccount) return;
    const amountNum = parseFloat(String(reconcileAmount).replace(/,/g, ''));
    if (isNaN(amountNum) || amountNum < 0) {
      alert('Vui lòng nhập số tiền thực tế hợp lệ (từ 0 trở lên)');
      return;
    }

    setIsSubmittingReconcile(true);
    try {
      const res = await authFetch(`/api/accounts/${reconcileAccount.id}/adjust-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualBalance: amountNum,
          reason: reconcileReason || 'Kiểm kê số dư ví'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi điều chỉnh số dư');

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#10b981', '#3b82f6']
      });

      setShowReconcileModal(false);
      setReconcileAccount(null);
      setReconcileAmount('');
      await Promise.all([fetchStats(), fetchAccounts(), fetchTransactions()]);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmittingReconcile(false);
    }
  };

  // Reset / Xóa dữ liệu lịch sử giao dịch
  const handleResetTransactions = async () => {
    setIsResettingTx(true);
    try {
      const res = await authFetch('/api/transactions/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resetBalances: resetBalancesCheckbox,
          restoreDemo: false
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi khi reset giao dịch');

      setShowResetModal(false);
      await fetchInitialData();
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.7 },
        colors: ['#38bdf8', '#10b981', '#f59e0b']
      });
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setIsResettingTx(false);
    }
  };

  // Logic kiểm tra giao dịch khớp với bộ lọc thời gian
  const isMatchingTime = (timeStr, createdAtStr) => {
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
      return (
        txDate.getMonth() === now.getMonth() &&
        txDate.getFullYear() === now.getFullYear()
      );
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
  };

  // Danh sách giao dịch theo bộ lọc thời gian
  const timeFilteredTransactions = useMemo(
    () => transactions.filter((t) => isMatchingTime(t.transaction_time, t.created_at)),
    [transactions, timeFilter, customStartDate, customEndDate]
  );

  const displayedExpense = useMemo(
    () =>
      timeFilteredTransactions
        .filter(
          (t) =>
            t.type === 'EXPENSE' &&
            t.status !== 'IGNORED' &&
            !t.category_id?.startsWith('cat_transfer_')
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
            !t.category_id?.startsWith('cat_transfer_')
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

  // Cơ cấu danh mục chi tiêu theo bộ lọc thời gian
  const categoryBreakdown = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c.id] = { ...c, total_amount: 0, tx_count: 0 };
    });
    timeFilteredTransactions.forEach((t) => {
      if (
        t.type === 'EXPENSE' &&
        t.status !== 'IGNORED' &&
        t.category_id &&
        !t.category_id?.startsWith('cat_transfer_')
      ) {
        if (!map[t.category_id]) {
          map[t.category_id] = {
            id: t.category_id,
            name: t.category_name || 'Khác',
            color: t.category_color || '#94a3b8',
            total_amount: 0,
            tx_count: 0
          };
        }
        map[t.category_id].total_amount += t.amount || 0;
        map[t.category_id].tx_count += 1;
      }
    });
    return Object.values(map)
      .filter((c) => c.total_amount > 0)
      .sort((a, b) => b.total_amount - a.total_amount);
  }, [categories, timeFilteredTransactions]);

  // Xu hướng chi tiêu 7 ngày qua
  const last7DaysData = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label =
        i === 0 ? 'Hôm nay' : i === 1 ? 'Hôm qua' : `${d.getDate()}/${d.getMonth() + 1}`;

      const dayExpense = transactions
        .filter((t) => {
          if (
            t.type !== 'EXPENSE' ||
            t.status !== 'CONFIRMED' ||
            t.category_id?.startsWith('cat_transfer_')
          )
            return false;
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

  const maxDayAmount = Math.max(...last7DaysData.map((d) => d.amount), 1);

  const handleApplyCustomDate = (start, end) => {
    setCustomStartDate(start);
    setCustomEndDate(end);
    setTimeFilter('CUSTOM');
  };

  const handleResetTimeFilter = () => {
    setCustomStartDate('');
    setCustomEndDate('');
    setTimeFilter('ALL');
  };

  const timeLabel = useMemo(() => {
    if (timeFilter === 'ALL') return 'Toàn bộ thời gian';
    if (timeFilter === 'MONTH') return 'Tháng này';
    if (timeFilter === 'WEEK') return 'Tuần này';
    if (timeFilter === 'DAY') return 'Hôm nay';
    if (timeFilter === 'CUSTOM') {
      if (customStartDate && customEndDate) {
        return `${formatDateVN(customStartDate)} - ${formatDateVN(customEndDate)}`;
      }
      if (customStartDate) {
        return `Từ ${formatDateVN(customStartDate)}`;
      }
      if (customEndDate) {
        return `Đến ${formatDateVN(customEndDate)}`;
      }
      return 'Khoảng thời gian tùy chọn';
    }
    return 'Toàn bộ thời gian';
  }, [timeFilter, customStartDate, customEndDate]);

  const pendingList = useMemo(
    () => transactions.filter((t) => t.status === 'PENDING'),
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((t) => {
        if (!isMatchingTime(t.transaction_time, t.created_at)) return false;
        if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
        if (filterType !== 'ALL' && t.type !== filterType) return false;
        if (
          searchQuery &&
          !t.description?.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !t.bank_name?.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !t.category_name?.toLowerCase().includes(searchQuery.toLowerCase())
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
  }, [transactions, timeFilter, customStartDate, customEndDate, filterStatus, filterType, searchQuery, txSortOrder]);

  if (isLocked) {
    return <PinLockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="app-container">
      {/* Header & Quick AI Input */}
      <Header
        theme={theme}
        toggleTheme={toggleTheme}
        timeFilter={timeFilter}
        setTimeFilter={setTimeFilter}
        onLockApp={handleLockApp}
        hasGeminiKey={hasGeminiKey}
        maskedKey={maskedKey}
        onOpenApiKeyModal={() => setShowApiKeyModal(true)}
        aiInputText={aiInputText}
        setAiInputText={setAiInputText}
        aiIsCash={aiIsCash}
        setAiIsCash={setAiIsCash}
        isAnalyzingAi={isAnalyzingAi}
        handleAnalyzeAi={handleAnalyzeAi}
        aiMessage={aiMessage}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onApplyCustomDate={handleApplyCustomDate}
        onResetTimeFilter={handleResetTimeFilter}
        showCustomDatePopover={showCustomDatePopover}
        setShowCustomDatePopover={setShowCustomDatePopover}
      />

      {/* Navigation Tabs */}
      <NavTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingCount={displayedPendingCount}
      />

      {/* Stats Summary Top Row */}
      <StatsSummary
        totalBalance={stats.totalBalance}
        accountsCount={accounts.length}
        displayedExpense={displayedExpense}
        displayedIncome={displayedIncome}
        displayedPendingCount={displayedPendingCount}
        timeLabel={timeLabel}
      />

      {/* Main Tab Views */}
      {activeTab === 'pending' && (
        <PendingTab
          pendingList={pendingList}
          categories={categories}
          handleCategorize={handleCategorize}
          handleIgnore={handleIgnore}
          handleSimulate={handleSimulate}
          onAiCategorize={handleAiCategorizeTx}
          hasGeminiKey={hasGeminiKey}
          onOpenApiKeyModal={() => setShowApiKeyModal(true)}
        />
      )}

      {activeTab === 'dashboard' && (
        <DashboardTab
          timeLabel={timeLabel}
          spendRatio={spendRatio}
          savingsRate={savingsRate}
          netSavings={netSavings}
          displayedIncome={displayedIncome}
          displayedExpense={displayedExpense}
          last7DaysData={last7DaysData}
          maxDayAmount={maxDayAmount}
          transactions={transactions}
          categoryBreakdown={categoryBreakdown}
          hoveredCatId={hoveredCatId}
          setHoveredCatId={setHoveredCatId}
          accounts={accounts}
          totalBalance={stats.totalBalance}
          onReconcile={(acc) => {
            setReconcileAccount(acc);
            setReconcileAmount(formatNumberWithCommas(acc.balance || 0));
            setReconcileReason(
              acc.id === 'acc_cash' ? 'Kiểm kê ví tiền mặt' : 'Điều chỉnh số dư tài khoản'
            );
            setShowReconcileModal(true);
          }}
        />
      )}

      {activeTab === 'transactions' && (
        <TransactionsTab
          filteredTransactions={filteredTransactions}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterType={filterType}
          setFilterType={setFilterType}
          txSortOrder={txSortOrder}
          setTxSortOrder={setTxSortOrder}
          onOpenResetModal={() => setShowResetModal(true)}
          onNavigateToPending={() => setActiveTab('pending')}
          timeFilter={timeFilter}
          timeLabel={timeLabel}
          onOpenCustomDateModal={() => {
            setShowCustomDatePopover(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onResetTimeFilter={handleResetTimeFilter}
        />
      )}

      {activeTab === 'rules' && (
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
          rules={rules}
          newKeyword={newKeyword}
          setNewKeyword={setNewKeyword}
          newRuleCat={newRuleCat}
          setNewRuleCat={setNewRuleCat}
          handleCreateRule={handleCreateRule}
        />
      )}

      {/* Modals & Overlays */}
      <LivePromptOverlay
        livePrompt={livePrompt}
        categories={categories}
        accounts={accounts}
        handleCategorize={handleCategorize}
        promptAiText={promptAiText}
        setPromptAiText={setPromptAiText}
        isPromptAiAnalyzing={isPromptAiAnalyzing}
        handlePromptAiCategorize={handlePromptAiCategorize}
        onClose={() => {
          setLivePrompt(null);
          setActiveTab('pending');
        }}
      />

      <ResetTransactionsModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        resetBalancesCheckbox={resetBalancesCheckbox}
        setResetBalancesCheckbox={setResetBalancesCheckbox}
        isResettingTx={isResettingTx}
        onConfirm={handleResetTransactions}
      />

      <ReconcileModal
        isOpen={showReconcileModal}
        account={reconcileAccount}
        onClose={() => setShowReconcileModal(false)}
        reconcileAmount={reconcileAmount}
        setReconcileAmount={setReconcileAmount}
        reconcileReason={reconcileReason}
        setReconcileReason={setReconcileReason}
        isSubmitting={isSubmittingReconcile}
        handleSubmit={handleReconcileSubmit}
      />

      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        apiKeyInput={apiKeyInput}
        setApiKeyInput={setApiKeyInput}
        hasGeminiKey={hasGeminiKey}
        maskedKey={maskedKey}
        isSavingKey={isSavingKey}
        handleSaveApiKey={handleSaveApiKey}
      />

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        webhookUrl={webhookUrl}
        hasGeminiKey={hasGeminiKey}
        maskedKey={maskedKey}
        onOpenApiKeyModal={() => setShowApiKeyModal(true)}
      />
    </div>
  );
}
