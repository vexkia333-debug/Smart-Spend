import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { WifiOff, RefreshCw, X, CloudUpload } from 'lucide-react';

// Common Components
import Header from './components/common/Header.jsx';
import NavTabs from './components/common/NavTabs.jsx';
import StatsSummary from './components/common/StatsSummary.jsx';
import OfflineScreen from './components/common/OfflineScreen.jsx';

// Tab Components
import PendingTab from './components/tabs/PendingTab.jsx';
import DashboardTab from './components/tabs/DashboardTab.jsx';
import TransactionsTab from './components/tabs/TransactionsTab.jsx';
import SystemAuditTab from './components/tabs/SystemAuditTab.jsx';

// Modal Components
import LivePromptOverlay from './components/modals/LivePromptOverlay.jsx';
import ResetTransactionsModal from './components/modals/ResetTransactionsModal.jsx';
import ReconcileModal from './components/modals/ReconcileModal.jsx';
import ApiKeyModal from './components/modals/ApiKeyModal.jsx';
import SettingsModal from './components/modals/SettingsModal.jsx';
import QuickAddModal from './components/modals/QuickAddModal.jsx';
import PinLockScreen from './components/modals/PinLockScreen.jsx';
import EditTransactionModal from './components/modals/EditTransactionModal.jsx';
import DailyReportModal from './components/modals/DailyReportModal.jsx';
import DebtLoanModal from './components/modals/DebtLoanModal.jsx';

// Custom Hooks & Utilities
import { useOfflineSync } from './hooks/useOfflineSync.js';
import { useFinanceMetrics } from './hooks/useFinanceMetrics.js';
import { useRealtimeEvents } from './hooks/useRealtimeEvents.js';
import {
  readOfflineCache,
  writeOfflineCachePatch
} from './utils/offlineStorage.js';
import {
  formatVND,
  formatNumberWithCommas
} from './utils/formatters.js';
import { DEFAULT_QUICK_ACTIONS } from './constants/index.js';
import './App.css';

export default function App() {
  const getInitialTab = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['pending', 'dashboard', 'transactions', 'audit'].includes(tabParam)) {
        return tabParam;
      }
      const hash = window.location.hash.replace('#', '');
      if (hash && ['pending', 'dashboard', 'transactions', 'audit'].includes(hash)) {
        return hash;
      }
    } catch {}
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const initialCache = useMemo(() => readOfflineCache(), []);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => initialCache?.lastSyncedAt || null);

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tabId);
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };
  const [stats, setStats] = useState(
    () =>
      initialCache?.stats || {
        totalBalance: 0,
        totalExpense: 0,
        totalIncome: 0,
        pendingCount: 0,
        categories: []
      }
  );
  const [transactions, setTransactions] = useState(() => initialCache?.transactions || []);
  const [categories, setCategories] = useState(() => initialCache?.categories || []);
  const [accounts, setAccounts] = useState(() => initialCache?.accounts || []);
  const [rules, setRules] = useState(() => initialCache?.rules || []);
  const [livePrompt, setLivePrompt] = useState(null);

  // Theme & Time Filter States (Mặc định mở app ở bộ lọc Theo tháng)
  const [theme, setTheme] = useState(() => localStorage.getItem('smartspend_theme') || 'dark');
  const [timeFilter, setTimeFilter] = useState('MONTH'); // 'ALL' | 'MONTH' | 'WEEK' | 'DAY' | 'CUSTOM'
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
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [monthlyBudgetGoal, setMonthlyBudgetGoal] = useState(
    () => initialCache?.monthlyBudgetGoal || 500000
  );
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [reconcileAccount, setReconcileAccount] = useState(null);
  const [reconcileAmount, setReconcileAmount] = useState('');
  const [reconcileReason, setReconcileReason] = useState('Kiểm kê số dư');
  const [isSubmittingReconcile, setIsSubmittingReconcile] = useState(false);

  // Filters & Sorting for Transactions Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterAccount, setFilterAccount] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [txSortOrder, setTxSortOrder] = useState('DESC'); // 'DESC' = Gần nhất lên đầu

  // Transaction Editing & Daily Report States
  const [editingTx, setEditingTx] = useState(null);
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [reportModalConfig, setReportModalConfig] = useState({ period: 'DAY', date: null });

  // Hỗ trợ deep-link mở thẳng Báo cáo tài chính hoặc Tab Tổng quan khi chạm thông báo điện thoại
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const reportParam = params.get('report')?.toUpperCase();
      const dateParam = params.get('date') || null;
      const actionParam = params.get('action');
      let shouldCleanUrl = false;

      if (reportParam && ['DAY', 'WEEK', 'MONTH'].includes(reportParam)) {
        setReportModalConfig({ period: reportParam, date: dateParam });
        setShowDailyReportModal(true);
        params.delete('report');
        params.delete('date');
        shouldCleanUrl = true;
      }
      if (actionParam === 'save-savings') {
        setActiveTab('dashboard');
        params.delete('action');
        shouldCleanUrl = true;
      }
      if (shouldCleanUrl) {
        const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
      }
    } catch {}

    if (!('serviceWorker' in navigator)) return undefined;
    const handleSwMessage = (event) => {
      const msg = event.data;
      if (msg?.type === 'OPEN_PERIODIC_REPORT') {
        const targetPeriod = ['DAY', 'WEEK', 'MONTH'].includes(String(msg.period || '').toUpperCase())
          ? String(msg.period).toUpperCase()
          : 'DAY';
        setReportModalConfig({ period: targetPeriod, date: msg.date || null });
        setShowDailyReportModal(true);
      } else if (msg?.type === 'OPEN_SAVINGS_PROMPT') {
        setActiveTab('dashboard');
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, []);

  // Debt & Loan Ledger Modal States
  const [showDebtLoanModal, setShowDebtLoanModal] = useState(false);
  const [debtLoanInitialData, setDebtLoanInitialData] = useState(null);

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

  const fetchInitialData = async () => {
    await Promise.all([
      fetchStats(),
      fetchTransactions(),
      fetchCategories(),
      fetchAccounts(),
      fetchRules(),
      fetchSettings()
    ]);
    // Kiểm tra bù lại sau 1.2s đề phòng app mở song song lúc webhook vừa gửi
    setTimeout(() => {
      fetchTransactions();
    }, 1200);
  };

  const fetchSettings = async () => {
    try {
      const res = await authFetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setHasGeminiKey(data.hasGeminiKey);
        setMaskedKey(data.maskedKey || '');
        if (data.monthlyBudgetGoal) {
          const goalVal = Number(data.monthlyBudgetGoal);
          setMonthlyBudgetGoal(goalVal);
          writeOfflineCachePatch({ monthlyBudgetGoal: goalVal });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await authFetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        writeOfflineCachePatch({ stats: data });
        setLastSyncedAt(new Date().toISOString());
      }
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
        writeOfflineCachePatch({ transactions: data });
        setLastSyncedAt(new Date().toISOString());
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
        writeOfflineCachePatch({ categories: data });
        if (data.length > 0 && !newRuleCat) setNewRuleCat(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await authFetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        writeOfflineCachePatch({ accounts: data });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await authFetch('/api/rules');
      if (res.ok) {
        const data = await res.json();
        setRules(data);
        writeOfflineCachePatch({ rules: data });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const {
    isOffline,
    setIsOffline,
    isCheckingOnline,
    formattedLastSync,
    pendingSyncQueue,
    isSyncingQueue,
    enqueueOfflineEntry,
    removePendingSyncItem,
    syncPendingQueue,
    handleRetryConnection
  } = useOfflineSync({
    isLocked,
    authFetch,
    onRefreshAll: fetchInitialData,
    onRefreshAfterSync: () =>
      Promise.all([fetchStats(), fetchTransactions(), fetchAccounts(), fetchCategories()]),
    setAiMessage,
    lastSyncedAt
  });

  useRealtimeEvents({
    isLocked,
    authToken,
    onInitialLoad: fetchInitialData,
    onPromptEvent: (payload) => {
      setLivePrompt(payload);
      fetchStats();
      fetchTransactions();
      fetchAccounts();
      fetchRules();
    },
    onTxChange: () => {
      fetchStats();
      fetchTransactions();
      fetchAccounts();
    },
    onAccountChange: () => {
      fetchAccounts();
      fetchStats();
    },
    onCategoryChange: () => {
      fetchCategories();
      fetchStats();
    },
    onForegroundRefresh: () => {
      fetchTransactions();
      fetchStats();
      fetchAccounts();
      setTimeout(() => {
        fetchTransactions();
        fetchAccounts();
        fetchStats();
      }, 1200);
    }
  });

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
        fetchRules();
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
          originalAmount: amount,
          clientTime: new Date().toISOString()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi phân tích AI');

      if (data.createdCategory) {
        fetchCategories();
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
        Promise.all([fetchTransactions(), fetchStats(), fetchAccounts()]);
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
        setLivePrompt((prev) => (prev?.transaction?.id === txId ? null : prev));
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

  // Lưu thay đổi sau khi chỉnh sửa giao dịch
  const handleSaveEditTx = async (txId, updatePayload) => {
    const res = await authFetch(`/api/transactions/${txId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi khi cập nhật giao dịch');
    await Promise.all([fetchTransactions(), fetchAccounts(), fetchStats(), fetchRules()]);
  };

  // Xóa giao dịch
  const handleDeleteTx = async (txId) => {
    const res = await authFetch(`/api/transactions/${txId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi khi xóa giao dịch');
    await Promise.all([fetchTransactions(), fetchAccounts(), fetchStats()]);
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

  const handleToggleRule = async (ruleId) => {
    try {
      const res = await authFetch(`/api/rules/${ruleId}/toggle`, {
        method: 'PATCH'
      });
      if (res.ok) fetchRules();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      const res = await authFetch(`/api/rules/${ruleId}`, {
        method: 'DELETE'
      });
      if (res.ok) fetchRules();
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

  const handleDeleteCategory = async (catId) => {
    try {
      const res = await authFetch(`/api/categories/${catId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await Promise.all([fetchCategories(), fetchTransactions(), fetchStats()]);
      }
    } catch (err) {
      console.error(err);
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
    const trimmedInput = aiInputText.trim();
    if (!trimmedInput) return;

    if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      enqueueOfflineEntry({ text: trimmedInput, forceCash: aiIsCash });
      setAiMessage(
        `📴 Đang mất mạng — đã lưu tạm "${trimmedInput}" vào hàng đợi. Sẽ tự đồng bộ khi có Internet!`
      );
      setAiInputText('');
      setAiIsCash(true);
      setShowQuickAddModal(false);
      setTimeout(() => setAiMessage(null), 8000);
      return;
    }

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
          text: trimmedInput,
          autoSave: true,
          forceCash: aiIsCash,
          clientTime: new Date().toISOString()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi phân tích AI');

      if (data.createdCategory) {
        fetchCategories();
      }

      if (data.isSplit && Array.isArray(data.splits)) {
        setAiMessage(
          data.message ||
            `✨ Đã tự động tách ${data.splits.length} khoản: ${data.splits
              .map((s) => `${s.description} (${formatVND(s.amount)})`)
              .join(' + ')}`
        );
      } else if (data.createdCategory && data.transaction) {
        setAiMessage(
          `✨ Đã tự động tạo danh mục mới "${data.createdCategory.name}" & ghi nhận: ${formatVND(
            data.transaction.amount
          )}!`
        );
      } else if (data.transaction) {
        setAiMessage(
          `✨ Đã ghi nhận: ${data.transaction.description} (${data.transaction.category_name}) - ${formatVND(
            data.transaction.amount
          )}`
        );
      } else if (data.message) {
        setAiMessage(data.message);
      }
      setAiInputText('');
      setAiIsCash(true);

      // Cập nhật lạc quan (Optimistic UI) & đồng bộ nền không chặn nút bấm
      if (data.isSplit && Array.isArray(data.splits)) {
        setTransactions((prev) => [...data.splits, ...prev]);
      } else if (data.transaction) {
        setTransactions((prev) => [data.transaction, ...prev.filter((t) => t.id !== data.transaction.id)]);
      }
      Promise.all([fetchStats(), fetchTransactions(), fetchAccounts()]);

      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#8b5cf6', '#3b82f6', '#10b981']
      });

      setTimeout(() => setAiMessage(null), 8000);
    } catch (err) {
      const isNetworkErr =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        /failed to fetch|networkerror|load failed/i.test(String(err?.message || ''));
      if (isNetworkErr) {
        setIsOffline(true);
        enqueueOfflineEntry({ text: trimmedInput, forceCash: aiIsCash });
        setAiMessage(
          `📴 Đang mất mạng — đã lưu tạm "${trimmedInput}" vào hàng đợi. Sẽ tự đồng bộ khi có Internet!`
        );
        setAiInputText('');
        setAiIsCash(true);
        setShowQuickAddModal(false);
      } else {
        setAiMessage(`⚠️ ${err.message || 'Máy chủ AI đang bận, vui lòng thử lại sau giây lát'}`);
      }
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

  const {
    displayedExpense,
    displayedIncome,
    displayedPendingCount,
    netSavings,
    spendRatio,
    savingsRate,
    categoryBreakdown,
    last7DaysData,
    savingsTransactions,
    savingsStats,
    timeLabel,
    pendingList,
    filteredTransactions
  } = useFinanceMetrics({
    transactions,
    categories,
    timeFilter,
    customStartDate,
    customEndDate,
    filterAccount,
    filterType,
    filterCategory,
    searchQuery,
    txSortOrder
  });

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

  const hasOfflineData =
    transactions.length > 0 || accounts.length > 0 || Boolean(lastSyncedAt);

  if (isOffline && !hasOfflineData) {
    return (
      <>
        <div className="fintech-wave-backdrop" aria-hidden="true" />
        <OfflineScreen onRetry={handleRetryConnection} isChecking={isCheckingOnline} />
      </>
    );
  }

  if (isLocked) {
    return <PinLockScreen onUnlock={handleUnlock} />;
  }

  return (
    <>
      {/* Hình nền 2 chế độ Sáng / Tối theo thiết kế */}
      <div className="fintech-wave-backdrop" aria-hidden="true" />

      <div className="app-container">
      {(isOffline || pendingSyncQueue.length > 0) && (
        <div
          className={`offline-banner ${!isOffline ? 'is-syncing' : ''}`}
          role="status"
          aria-live="polite"
        >
          <div className="offline-banner-main">
            <div className="offline-banner-left">
              {isOffline ? <WifiOff size={16} /> : <CloudUpload size={16} />}
              <span>
                {isOffline ? (
                  <>
                    Đang mất kết nối · Xem dữ liệu lưu tạm
                    {formattedLastSync ? ` (cập nhật lúc ${formattedLastSync})` : ''}
                  </>
                ) : (
                  <>Đang có {pendingSyncQueue.length} khoản lưu tạm chờ đồng bộ lên máy chủ</>
                )}
              </span>
            </div>
            <button
              type="button"
              className="offline-banner-retry"
              onClick={isOffline ? handleRetryConnection : syncPendingQueue}
              disabled={isOffline ? isCheckingOnline : isSyncingQueue}
            >
              <RefreshCw
                size={13}
                className={(isOffline ? isCheckingOnline : isSyncingQueue) ? 'spin' : ''}
              />
              <span>
                {isOffline
                  ? isCheckingOnline
                    ? 'Đang thử…'
                    : 'Thử kết nối lại'
                  : isSyncingQueue
                    ? 'Đang đồng bộ…'
                    : 'Đồng bộ ngay'}
              </span>
            </button>
          </div>

          {pendingSyncQueue.length > 0 && (
            <div className="pending-sync-list">
              {pendingSyncQueue.map((item) => (
                <span key={item.id} className="pending-sync-chip">
                  <span>
                    {item.text} ({item.forceCash ? 'Tiền mặt' : 'Tự nhận diện'})
                  </span>
                  <button
                    type="button"
                    className="pending-sync-remove"
                    onClick={() => removePendingSyncItem(item.id)}
                    title="Xóa khỏi hàng đợi"
                    aria-label={`Xóa ${item.text}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Header & Quick AI Input */}
      <Header
        theme={theme}
        toggleTheme={toggleTheme}
        timeFilter={timeFilter}
        setTimeFilter={setTimeFilter}
        onOpenSettings={() => setShowSettingsModal(true)}
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
        onOpenDailyReport={() => setShowDailyReportModal(true)}
      />

      {/* Navigation Tabs */}
      <NavTabs
        activeTab={activeTab}
        setActiveTab={handleSelectTab}
        pendingCount={displayedPendingCount}
        onOpenQuickAdd={() => setShowQuickAddModal(true)}
      />

      {/* 4 khối Thống kê tổng số dư khả dụng, tổng chi tiêu, tổng thu nhập, chờ phân loại - CHỈ hiển thị ở menu Cần bổ sung */}
      {activeTab === 'pending' && (
        <StatsSummary
          totalBalance={stats.totalBalance}
          accountsCount={accounts.length}
          displayedExpense={displayedExpense}
          displayedIncome={displayedIncome}
          displayedPendingCount={displayedPendingCount}
          timeLabel={timeLabel}
        />
      )}

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
          timeFilter={timeFilter}
          timeLabel={timeLabel}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          spendRatio={spendRatio}
          savingsRate={savingsRate}
          netSavings={netSavings}
          displayedIncome={displayedIncome}
          displayedExpense={displayedExpense}
          transactions={transactions}
          categoryBreakdown={categoryBreakdown}
          hoveredCatId={hoveredCatId}
          setHoveredCatId={setHoveredCatId}
          last7DaysData={last7DaysData}
          savingsTransactions={savingsTransactions}
          savingsStats={savingsStats}
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
          onOpenDailyReport={() => setShowDailyReportModal(true)}
          onEditTransaction={(tx, suggestedCategory) => {
            setEditingTx(suggestedCategory ? { ...tx, suggestedCategory } : tx);
          }}
        />
      )}

      {activeTab === 'transactions' && (
        <TransactionsTab
          filteredTransactions={filteredTransactions}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterAccount={filterAccount}
          setFilterAccount={setFilterAccount}
          accounts={accounts}
          filterType={filterType}
          setFilterType={setFilterType}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          categories={categories}
          txSortOrder={txSortOrder}
          setTxSortOrder={setTxSortOrder}
          onOpenResetModal={() => setShowResetModal(true)}
          onNavigateToPending={() => setActiveTab('pending')}
          onEditTransaction={(tx, suggestedCategory) => {
            setEditingTx(suggestedCategory ? { ...tx, suggestedCategory } : tx);
          }}
          timeFilter={timeFilter}
          timeLabel={timeLabel}
          onOpenCustomDateModal={() => {
            setShowCustomDatePopover(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onResetTimeFilter={handleResetTimeFilter}
        />
      )}

      {(activeTab === 'audit' || activeTab === 'rules') && (
        <SystemAuditTab
          authFetch={authFetch}
          onEditTransaction={(tx, suggestedCategory) => {
            setEditingTx(suggestedCategory ? { ...tx, suggestedCategory } : tx);
          }}
          categories={categories}
          newCatName={newCatName}
          setNewCatName={setNewCatName}
          newCatType={newCatType}
          setNewCatType={setNewCatType}
          newCatColor={newCatColor}
          setNewCatColor={setNewCatColor}
          isAddingCat={isAddingCat}
          handleCreateCategory={handleCreateCategory}
          onDeleteCategory={handleDeleteCategory}
          rules={rules}
          newKeyword={newKeyword}
          setNewKeyword={setNewKeyword}
          newRuleCat={newRuleCat}
          setNewRuleCat={setNewRuleCat}
          handleCreateRule={handleCreateRule}
          onToggleRule={handleToggleRule}
          onDeleteRule={handleDeleteRule}
          theme={theme}
          toggleTheme={toggleTheme}
          onOpenDailyReport={() => setShowDailyReportModal(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
          onOpenApiKeyModal={() => setShowApiKeyModal(true)}
          onOpenResetModal={() => setShowResetModal(true)}
        />
      )}

      {/* Modals & Overlays */}
      <LivePromptOverlay
        livePrompt={livePrompt}
        promptAiText={promptAiText}
        setPromptAiText={setPromptAiText}
        isPromptAiAnalyzing={isPromptAiAnalyzing}
        handlePromptAiCategorize={handlePromptAiCategorize}
        onClose={() => {
          setLivePrompt(null);
          setActiveTab('pending');
        }}
      />

      <EditTransactionModal
        isOpen={Boolean(editingTx)}
        tx={editingTx}
        categories={categories}
        accounts={accounts}
        authFetch={authFetch}
        onCategoriesChange={fetchCategories}
        onClose={() => setEditingTx(null)}
        onSave={handleSaveEditTx}
        onDelete={handleDeleteTx}
      />

      <DailyReportModal
        isOpen={showDailyReportModal}
        onClose={() => setShowDailyReportModal(false)}
        initialPeriod={reportModalConfig.period}
        initialDate={reportModalConfig.date}
        authFetch={authFetch}
        categories={categories}
        onCategoriesChange={fetchCategories}
        onTransactionsChange={fetchTransactions}
        onEditTransaction={(tx, suggestedCategory) => {
          setEditingTx({ ...tx, suggestedCategory });
        }}
      />

      <DebtLoanModal
        isOpen={showDebtLoanModal}
        onClose={() => setShowDebtLoanModal(false)}
        authFetch={authFetch}
        accounts={accounts}
        initialData={debtLoanInitialData}
        onSuccess={() => {
          fetchTransactions();
          fetchAccounts();
          fetchStats();
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

      <QuickAddModal
        isOpen={showQuickAddModal}
        onClose={() => setShowQuickAddModal(false)}
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
      />
      </div>
    </>
  );
}
