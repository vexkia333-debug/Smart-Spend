export const OFFLINE_CACHE_KEY = 'smartspend_offline_cache_v1';
export const PENDING_SYNC_KEY = 'smartspend_pending_sync_v1';

export function readOfflineCache() {
  try {
    const raw = localStorage.getItem(OFFLINE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeOfflineCachePatch(patch) {
  try {
    const prev = readOfflineCache() || {};
    const next = { ...prev, ...patch, lastSyncedAt: new Date().toISOString() };
    localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

export function readPendingSyncQueue() {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writePendingSyncQueue(list) {
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
}
