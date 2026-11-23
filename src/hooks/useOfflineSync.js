import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { readPendingSyncQueue, writePendingSyncQueue } from '../utils/offlineStorage.js';

/**
 * Quản lý trạng thái kết nối mạng, hàng đợi ghi ngoại tuyến và tự đồng bộ khi trực tuyến trở lại.
 */
export function useOfflineSync({
  isLocked,
  authFetch,
  onRefreshAll,
  onRefreshAfterSync,
  setAiMessage,
  lastSyncedAt = null
}) {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [isCheckingOnline, setIsCheckingOnline] = useState(false);
  const [pendingSyncQueue, setPendingSyncQueue] = useState(() => readPendingSyncQueue());
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const isSyncingRef = useRef(false);

  const callbacksRef = useRef({
    authFetch,
    onRefreshAll,
    onRefreshAfterSync,
    setAiMessage
  });
  callbacksRef.current = { authFetch, onRefreshAll, onRefreshAfterSync, setAiMessage };

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const enqueueOfflineEntry = useCallback(({ text, forceCash }) => {
    const item = {
      id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: String(text || '').trim(),
      forceCash: Boolean(forceCash),
      clientTime: new Date().toISOString()
    };
    const next = [...readPendingSyncQueue(), item];
    writePendingSyncQueue(next);
    setPendingSyncQueue(next);
    return item;
  }, []);

  const removePendingSyncItem = useCallback((itemId) => {
    const next = readPendingSyncQueue().filter((item) => item.id !== itemId);
    writePendingSyncQueue(next);
    setPendingSyncQueue(next);
  }, []);

  const syncPendingQueue = useCallback(async () => {
    if (isSyncingRef.current || isLocked) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const queue = readPendingSyncQueue();
    if (queue.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncingQueue(true);
    let syncedCount = 0;
    const remaining = [];

    try {
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
          const res = await callbacksRef.current.authFetch('/api/ai/parse-transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: item.text,
              autoSave: true,
              forceCash: item.forceCash,
              clientTime: item.clientTime
            })
          });
          if (res.ok) {
            syncedCount += 1;
          } else {
            remaining.push(item);
          }
        } catch (err) {
          const isNetErr =
            (typeof navigator !== 'undefined' && !navigator.onLine) ||
            /failed to fetch|networkerror|load failed/i.test(String(err?.message || ''));
          remaining.push(...queue.slice(i));
          if (isNetErr) {
            setIsOffline(true);
          }
          break;
        }
      }

      writePendingSyncQueue(remaining);
      setPendingSyncQueue(remaining);

      if (syncedCount > 0) {
        callbacksRef.current.setAiMessage(
          `✅ Đã tự động đồng bộ ${syncedCount} khoản chi lưu tạm khi mất mạng!`
        );
        setTimeout(() => callbacksRef.current.setAiMessage(null), 8000);
        await callbacksRef.current.onRefreshAfterSync();
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncingQueue(false);
    }
  }, [isLocked]);

  const handleRetryConnection = useCallback(async () => {
    setIsCheckingOnline(true);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOffline(true);
        return;
      }
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (res.ok) {
        setIsOffline(false);
        callbacksRef.current.onRefreshAll();
        syncPendingQueue();
      } else {
        setIsOffline(true);
      }
    } catch {
      setIsOffline(true);
    } finally {
      setIsCheckingOnline(false);
    }
  }, [syncPendingQueue]);

  useEffect(() => {
    if (!isOffline && !isLocked && readPendingSyncQueue().length > 0) {
      callbacksRef.current.onRefreshAll();
      syncPendingQueue();
    }
  }, [isOffline, isLocked, syncPendingQueue]);

  const formattedLastSync = useMemo(() => {
    if (!lastSyncedAt) return '';
    try {
      const d = new Date(lastSyncedAt);
      if (isNaN(d.getTime())) return '';
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      return `${hh}:${mm} ${dd}/${mo}`;
    } catch {
      return '';
    }
  }, [lastSyncedAt]);

  return {
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
  };
}
