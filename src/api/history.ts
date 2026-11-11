import { History } from '../history/history.js';
import { localStorageAdapter, memoryStorage } from '../history/storage.js';
import type {
  HistoryChange,
  HistoryDiff,
  HistoryDocument,
  HistoryMode,
  HistoryOptions,
  HistoryStorage,
  HistoryVersion,
} from '../history/types.js';

const PREFIX = 'devkit:history:';

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1)
    throw new RangeError(`devkit: history ${name} must be a positive integer`);
  return value;
}

/** Builds a pane's history from its `history` option, or null when it is off. */
export function createHistory(
  option: boolean | HistoryOptions | undefined,
  title: string | undefined,
): History | null {
  if (!option) return null;
  const options: HistoryOptions = option === true ? {} : option;
  const mode: HistoryMode = options.mode ?? 'manual';
  if (mode !== 'manual' && mode !== 'auto')
    throw new RangeError("devkit: history mode must be 'manual' or 'auto'");
  let storage: HistoryStorage;
  const requested = options.storage ?? 'local';
  if (requested === 'memory') storage = memoryStorage;
  else if (requested === 'local') {
    const local = localStorageAdapter();
    if (!local) console.warn('devkit: localStorage is unavailable; history is kept in memory');
    storage = local ?? memoryStorage;
  } else if (typeof requested.read === 'function' && typeof requested.write === 'function')
    storage = requested;
  else throw new TypeError("devkit: history storage must be 'local', 'memory' or a HistoryStorage");
  return new History({
    key: PREFIX + (options.key ?? (title || 'pane')),
    storage,
    mode,
    limit: positiveInteger(options.limit, 50, 'limit'),
    maxChanges: positiveInteger(options.maxChanges, 200, 'maxChanges'),
  });
}

/**
 * The handle `pane.history` returns: the versions of the pane's control values. The working
 * version (the last) takes every finished edit; `advance()` freezes it.
 */
export class HistoryApi {
  readonly #history: History;
  readonly #flush = (): void => this.#history.save();
  readonly #onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.#history.save();
  };

  constructor(history: History) {
    this.#history = history;
    // A reload or tab close must not lose the last debounced write.
    addEventListener('pagehide', this.#flush);
    document.addEventListener('visibilitychange', this.#onVisibility);
  }

  /** The storage key, e.g. `devkit:history:Scene`. */
  get key(): string {
    return this.#history.key;
  }

  get mode(): HistoryMode {
    return this.#history.mode;
  }

  /** While false, edits are neither recorded nor saved. */
  get enabled(): boolean {
    return this.#history.enabled;
  }

  set enabled(enabled: boolean) {
    this.#history.enabled = enabled;
  }

  /** Oldest first; the last one is the working version. */
  get versions(): readonly HistoryVersion[] {
    return this.#history.versions;
  }

  /** The working version, which takes every finished edit. */
  get current(): HistoryVersion {
    return this.#history.current;
  }

  version(id: number): HistoryVersion | undefined {
    return this.#history.version(id);
  }

  /** Freezes the working version and continues in a copy; returns the frozen one, never a duplicate. */
  advance(label?: string): HistoryVersion {
    return this.#history.advance(label);
  }

  /** Applies a version's values to the controls and the working version. */
  restore(id: number): void {
    this.#history.restore(id);
  }

  rename(id: number, label: string): void {
    this.#history.rename(id, label);
  }

  /** Deletes a frozen version. */
  delete(id: number): void {
    this.#history.delete(id);
  }

  /** What changed from one version to another (default: the working version). */
  diff(from: number, to?: number): HistoryDiff {
    return this.#history.diff(from, to);
  }

  /** The whole history as a JSON-safe document. */
  export(): HistoryDocument {
    return this.#history.export();
  }

  /** Replaces the history with a document or its JSON text and applies its working version. */
  import(document: HistoryDocument | string): void {
    this.#history.import(document);
  }

  /** Drops stored values that no control has now; returns how many. */
  prune(): number {
    return this.#history.prune();
  }

  /** Drops every version; a new working version starts from the controls' values. */
  clear(): void {
    this.#history.clear();
  }

  /** Writes pending changes now instead of after the debounce. */
  save(): void {
    this.#history.save();
  }

  /** `change`: one finished edit or restored value. `version`: the version list changed. */
  on(type: 'change', listener: (change: HistoryChange) => void): () => void;
  on(type: 'version', listener: () => void): () => void;
  on(type: 'change' | 'version', listener: (change: HistoryChange) => void): () => void {
    return this.#history.on(type as 'change', listener);
  }

  /** Saves and stops; called by `pane.dispose()`. */
  dispose(): void {
    removeEventListener('pagehide', this.#flush);
    document.removeEventListener('visibilitychange', this.#onVisibility);
    this.#history.dispose();
  }
}
