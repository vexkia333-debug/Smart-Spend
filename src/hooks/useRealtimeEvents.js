import { useEffect, useRef } from 'react';

/**
 * Kết nối SSE thời gian thực và tự động đồng bộ lại khi người dùng quay lại tab/ứng dụng.
 */
export function useRealtimeEvents({
  isLocked,
  authToken,
  onInitialLoad,
  onPromptEvent,
  onTxChange,
  onAccountChange,
  onCategoryChange,
  onForegroundRefresh
}) {
  const handlersRef = useRef({
    onInitialLoad,
    onPromptEvent,
    onTxChange,
    onAccountChange,
    onCategoryChange,
    onForegroundRefresh
  });
  handlersRef.current = {
    onInitialLoad,
    onPromptEvent,
    onTxChange,
    onAccountChange,
    onCategoryChange,
    onForegroundRefresh
  };

  useEffect(() => {
    if (isLocked) return undefined;

    handlersRef.current.onInitialLoad();

    const currentToken =
      authToken ||
      localStorage.getItem('smartspend_pin_token') ||
      sessionStorage.getItem('smartspend_pin_token') ||
      '';
    const eventSource = new EventSource(`/api/events?token=${encodeURIComponent(currentToken)}`);

    eventSource.addEventListener('NEW_TRANSACTION_PROMPT', (event) => {
      try {
        const payload = JSON.parse(event.data);
        handlersRef.current.onPromptEvent(payload);
      } catch (e) {
        console.error('SSE Error:', e);
      }
    });

    eventSource.addEventListener('TRANSACTION_UPDATED', () => handlersRef.current.onTxChange());
    eventSource.addEventListener('TRANSACTION_CREATED', () => handlersRef.current.onTxChange());
    eventSource.addEventListener('TRANSACTION_IGNORED', () => handlersRef.current.onTxChange());
    eventSource.addEventListener('ACCOUNT_UPDATED', () => handlersRef.current.onAccountChange());
    eventSource.addEventListener('CATEGORY_CREATED', () => handlersRef.current.onCategoryChange());
    eventSource.addEventListener('TRANSACTIONS_CLEARED', () => handlersRef.current.onInitialLoad());
    eventSource.addEventListener('DATA_RESET', () => handlersRef.current.onInitialLoad());

    return () => {
      eventSource.close();
    };
  }, [isLocked, authToken]);

  useEffect(() => {
    if (isLocked) return undefined;

    const handleForeground = () => {
      if (document.visibilityState === 'visible') {
        handlersRef.current.onForegroundRefresh();
      }
    };

    window.addEventListener('visibilitychange', handleForeground);
    window.addEventListener('focus', handleForeground);
    return () => {
      window.removeEventListener('visibilitychange', handleForeground);
      window.removeEventListener('focus', handleForeground);
    };
  }, [isLocked]);
}
