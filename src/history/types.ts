/** A control value as the history reports it. Option values that are not JSON primitives are reported by their label. */
export type HistoryValue = number | string | boolean | null;

/**
 * A stored control value: a plain JSON primitive, or for a pick from options its value (null
 * when it is not a JSON primitive) and label, so it can still be found when values change.
 */
export type StoredValue = HistoryValue | { v: HistoryValue; l: string };

/** One finished edit. `f` is absent for the first value a path ever had in this version. */
export interface StoredChange {
  /** Control path. */
  p: string;
  /** Value before the change. */
  f?: StoredValue;
  /** Value after the change. */
  t: StoredValue;
  /** Epoch ms. */
  at: number;
  /** Where the change came from; absent for an edit. */
  s?: 'restore';
  /** Changes applied together (one restore) share a group, so they can be undone as one. */
  g?: number;
}

/** One version as stored: the working version or a frozen one. */
export interface StoredVersion {
  /** Version number, counting up from 1 as versions are made. */
  id: number;
  /** Name given by `advance(label)` or `rename()`. */
  label?: string;
  /** Epoch ms. */
  created: number;
  /** Epoch ms of the last recorded change. */
  updated: number;
  /** Frozen versions never change again; the last version is the working one and never frozen. */
  frozen: boolean;
  /** Control values by path. */
  values: Record<string, StoredValue>;
  /** Log of the version's finished changes, oldest first. */
  changes: StoredChange[];
}

/** What a history serializes to: `versions` oldest first, the last one being the working version. */
export interface HistoryDocument {
  /** Format version. A document of a newer format is left untouched. */
  format: 1;
  /** All versions, oldest first; the last is the working version. */
  versions: StoredVersion[];
}

/** What a control holds, used to check whether a stored value still applies to it. */
export type ControlDescriptor =
  | { type: 'number'; min?: number | undefined; max?: number | undefined }
  | { type: 'boolean' }
  | { type: 'string' }
  /** `object`: a `{r, g, b}` object, which only takes `#rrggbb`. */
  | { type: 'color'; object: boolean }
  | { type: 'option'; items: readonly { label: string; value: unknown }[] };

/** The part of a binding the history needs: no DOM, so it can be tested on its own. */
export interface TrackedControl {
  readonly descriptor: ControlDescriptor;
  /** The value shown now. */
  read(): unknown;
  /** Writes the target and the view without announcing a change, like a code default. */
  load(value: unknown): void;
  /** Writes the target and the view and announces a final change, so the application reacts. */
  set(value: unknown): void;
  /** Called with the value when an edit finishes. Returns the unsubscribe function. */
  onFinish(listener: (value: unknown) => void): () => void;
}

/** Synchronous key-value storage, such as `localStorage`. */
export interface HistoryStorage {
  /** Returns the text stored under `key`, or null when there is none. */
  read(key: string): string | null;
  /** Stores `data` under `key`. Throwing (e.g. when full) makes the history trim and retry. */
  write(key: string, data: string): void;
  /** Deletes what is stored under `key`. */
  remove(key: string): void;
}

/**
 * When the history makes versions. `'manual'`: one working version until `advance()`. `'auto'`:
 * also a new version on each reload whose previous session changed something.
 */
export type HistoryMode = 'manual' | 'auto';

/** Options of a pane's version history, its `history` option. */
export interface HistoryOptions {
  /** Storage namespace, stored as `devkit:history:<key>`. Default: the pane title, else `'pane'`. */
  key?: string;
  /**
   * `'local'` survives reloads; `'memory'` is lost on reload; or any `HistoryStorage`. Where
   * `localStorage` is blocked, `'local'` falls back to memory with a warning.
   * @default 'local'
   */
  storage?: 'local' | 'memory' | HistoryStorage;
  /**
   * `'manual'`: one working version until `advance()`. `'auto'`: also a new version on each
   * reload whose previous session changed something.
   * @default 'manual'
   */
  mode?: HistoryMode;
  /**
   * Frozen versions kept; the oldest go first.
   * @default 50
   */
  limit?: number;
  /**
   * Changes logged per version; the oldest go first.
   * @default 200
   */
  maxChanges?: number;
}

/** One finished change as the history reports it. */
export interface HistoryChange {
  /** Path of the control, e.g. `Lighting/Sun/intensity`. */
  readonly path: string;
  /** Absent for the first value a path has in its version. */
  readonly from?: HistoryValue;
  /** Value after the change. */
  readonly to: HistoryValue;
  /** Epoch ms. */
  readonly at: number;
  /** `'edit'` for a finished edit, `'restore'` for a value applied by `restore()`. */
  readonly source: 'edit' | 'restore';
  /** Shared by the changes of one restore. */
  readonly group?: number;
}

/** A read-only view of one version. */
export interface HistoryVersion {
  /** Version number, counting up from 1 as versions are made. */
  readonly id: number;
  /** Name given by `advance(label)` or `rename()`. */
  readonly label?: string;
  /** Epoch ms. */
  readonly created: number;
  /** Epoch ms of the last recorded change. */
  readonly updated: number;
  /** Frozen versions never change again; only the working version is not frozen. */
  readonly frozen: boolean;
  /** Control values by path. */
  readonly values: Readonly<Record<string, HistoryValue>>;
  /** Log of the version's finished changes, oldest first. */
  readonly changes: readonly HistoryChange[];
}

/** What `diff()` returns: the paths that differ between two versions. */
export interface HistoryDiff {
  /** Paths only in the newer version. */
  readonly added: readonly string[];
  /** Paths only in the older version. */
  readonly removed: readonly string[];
  /** Paths in both versions with different values, from the older value to the newer. */
  readonly changed: readonly { path: string; from: HistoryValue; to: HistoryValue }[];
}
