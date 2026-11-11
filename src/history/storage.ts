import type { HistoryStorage } from './types.js';

/** Survives disposing and recreating a pane on the same page (HMR), not a reload. */
const memory = new Map<string, string>();

export const memoryStorage: HistoryStorage = {
  read: (key) => memory.get(key) ?? null,
  write: (key, data) => {
    memory.set(key, data);
  },
  remove: (key) => {
    memory.delete(key);
  },
};

/** `localStorage`, or null where it is missing or blocked (private mode, sandboxed frames). */
export function localStorageAdapter(): HistoryStorage | null {
  let store: Storage;
  try {
    store = globalThis.localStorage;
    if (!store) return null;
    store.getItem('devkit:history:probe');
  } catch {
    return null;
  }
  return {
    read: (key) => store.getItem(key),
    // Write errors (quota) reach the history, which trims and retries.
    write: (key, data) => store.setItem(key, data),
    remove: (key) => store.removeItem(key),
  };
}
