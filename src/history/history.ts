import { cloneDocument, emptyDocument, newVersion, parseDocument } from './document.js';
import { joinPath } from './paths.js';
import { decode, diffValues, encode, sameValue, sameValues, toPublic } from './values.js';
import type {
  HistoryChange,
  HistoryDiff,
  HistoryDocument,
  HistoryMode,
  HistoryStorage,
  HistoryVersion,
  StoredChange,
  StoredValue,
  StoredVersion,
  TrackedControl,
} from './types.js';

/** Trailing delay between a recorded change and the write to storage. */
export const SAVE_DELAY = 500;

export interface HistoryConfig {
  /** Full storage key. */
  key: string;
  storage: HistoryStorage;
  mode: HistoryMode;
  limit: number;
  maxChanges: number;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  warn?: (message: string) => void;
}

interface Live {
  control: TrackedControl;
  unsubscribe: () => void;
}

type ChangeListener = (change: HistoryChange) => void;
type VersionListener = () => void;

function publicChange(change: StoredChange): HistoryChange {
  return {
    path: change.p,
    ...(change.f !== undefined ? { from: toPublic(change.f) } : {}),
    to: toPublic(change.t),
    at: change.at,
    source: change.s ?? 'edit',
    ...(change.g !== undefined ? { group: change.g } : {}),
  };
}

function publicVersion(version: StoredVersion): HistoryVersion {
  return Object.freeze({
    id: version.id,
    ...(version.label !== undefined ? { label: version.label } : {}),
    created: version.created,
    updated: version.updated,
    frozen: version.frozen,
    values: Object.freeze(
      Object.fromEntries(Object.entries(version.values).map(([p, v]) => [p, toPublic(v)])),
    ),
    changes: Object.freeze(version.changes.map(publicChange)),
  });
}

/**
 * The version history of one pane's control values.
 *
 * The last version is the working one: every finished edit updates its values and is logged with
 * what it replaced, so undo can be built on the log. `advance()` freezes it and continues in a new
 * version; in `'auto'` mode each reload does, when the session before changed something. Values
 * are keyed by control path and applied best effort: a control whose stored value no longer fits
 * keeps its code default, and stored values without a control are kept but never applied.
 */
export class History {
  readonly key: string;
  readonly mode: HistoryMode;
  #doc: HistoryDocument;
  readonly #storage: HistoryStorage;
  readonly #limit: number;
  readonly #maxChanges: number;
  readonly #now: () => number;
  readonly #setTimer: (callback: () => void, ms: number) => unknown;
  readonly #clearTimer: (handle: unknown) => void;
  readonly #warn: (message: string) => void;
  /** False when the stored history comes from a newer devkit: it must not be overwritten. */
  readonly #writable: boolean;
  readonly #live = new Map<string, Live>();
  readonly #warnedPaths = new Set<string>();
  readonly #changeListeners = new Set<ChangeListener>();
  readonly #versionListeners = new Set<VersionListener>();
  #enabled = true;
  #dirty = false;
  #timer: unknown = null;
  #disposed = false;

  constructor(config: HistoryConfig) {
    this.key = config.key;
    this.mode = config.mode;
    this.#storage = config.storage;
    this.#limit = config.limit;
    this.#maxChanges = config.maxChanges;
    this.#now = config.now ?? Date.now;
    this.#setTimer = config.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.#clearTimer =
      config.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.#warn = config.warn ?? ((message) => console.warn(message));

    let raw: string | null = null;
    try {
      raw = this.#storage.read(this.key);
    } catch {
      this.#warn('devkit: history storage could not be read; starting a new history');
    }
    const parsed = parseDocument(raw, this.#now());
    for (const warning of parsed.warnings) this.#warn(warning);
    this.#doc = parsed.doc;
    this.#writable = !parsed.newer;
    if (this.mode === 'auto' && this.#startSession()) this.#changed();
  }

  /** While false, edits are neither recorded nor saved. Restoring and loading still work. */
  get enabled(): boolean {
    return this.#enabled;
  }

  set enabled(enabled: boolean) {
    this.#enabled = enabled;
    if (enabled && this.#dirty) this.#scheduleSave();
  }

  get versions(): readonly HistoryVersion[] {
    return this.#doc.versions.map(publicVersion);
  }

  /** The working version: the one edits go to. */
  get current(): HistoryVersion {
    return publicVersion(this.#working);
  }

  version(id: number): HistoryVersion | undefined {
    const version = this.#doc.versions.find((candidate) => candidate.id === id);
    return version && publicVersion(version);
  }

  /**
   * Starts following a control at `segments/leaf`: applies its stored value, if it still fits,
   * without announcing a change, then records its finished edits. Returns the function that stops.
   */
  track(segments: readonly string[], leaf: string, control: TrackedControl): () => void {
    const base = joinPath(segments, leaf);
    let path = base;
    for (let n = 2; this.#live.has(path); n++) path = `${base}#${n}`;
    if (path !== base && !this.#warnedPaths.has(base)) {
      this.#warnedPaths.add(base);
      this.#warn(
        `devkit: several history controls share the path ${base}; give them an id to keep their values apart`,
      );
    }
    const working = this.#working;
    const stored = working.values[path];
    if (stored !== undefined) {
      const decoded = decode(stored, control.descriptor);
      if (decoded) control.load(decoded.value);
    }
    // The working version holds every control's value, so a frozen version is a whole setup.
    const current = encode(control.read(), control.descriptor);
    if (current !== undefined && !sameValue(current, stored)) {
      working.values[path] = current;
      this.#markDirty();
    }
    const unsubscribe = control.onFinish((value) => this.#record(path, control, value));
    const live: Live = { control, unsubscribe };
    this.#live.set(path, live);
    return () => {
      if (this.#live.get(path) !== live) return;
      this.#live.delete(path);
      unsubscribe();
    };
  }

  /**
   * Freezes the working version and continues in a copy of it. When nothing differs from the
   * newest frozen version, that one is returned and no duplicate is made.
   */
  advance(label?: string): HistoryVersion {
    const working = this.#working;
    const previous = this.#doc.versions.at(-2);
    if (previous && sameValues(working.values, previous.values)) return publicVersion(previous);
    this.#freeze(label);
    this.#changed();
    return publicVersion(working);
  }

  /**
   * Applies a version's values to the live controls (announcing each change, so the application
   * reacts) and to the working version, logged as one group. Values that no longer fit a control
   * are skipped; values without a control are carried over.
   */
  restore(id: number): void {
    const source = this.#find(id);
    const working = this.#working;
    if (source === working) return;
    const group = 1 + working.changes.reduce((max, change) => Math.max(max, change.g ?? 0), 0);
    const at = this.#now();
    let any = false;
    for (const path of this.#restoreOrder(source.values)) {
      const stored = source.values[path]!;
      const live = this.#live.get(path);
      let to: StoredValue = stored;
      if (live) {
        const decoded = decode(stored, live.control.descriptor);
        if (!decoded) continue;
        to = encode(decoded.value, live.control.descriptor) ?? stored;
      }
      const from = working.values[path];
      if (sameValue(from, to)) continue;
      // The value is recorded first, so the control's own finish event is a no-op.
      working.values[path] = to;
      if (live) live.control.set(decode(to, live.control.descriptor)!.value);
      this.#log(working, {
        p: path,
        ...(from !== undefined ? { f: from } : {}),
        t: to,
        at,
        s: 'restore',
        g: group,
      });
      any = true;
    }
    if (!any) return;
    working.updated = at;
    this.#changed();
  }

  rename(id: number, label: string): void {
    this.#find(id).label = label;
    this.#changed();
  }

  /** Deletes a frozen version. */
  delete(id: number): void {
    const version = this.#find(id);
    if (version === this.#working)
      throw new RangeError('devkit: the working version cannot be deleted');
    this.#doc.versions.splice(this.#doc.versions.indexOf(version), 1);
    this.#changed();
  }

  /** What changed from version `from` to version `to` (default: the working version). */
  diff(from: number, to?: number): HistoryDiff {
    const a = this.#find(from);
    const b = to === undefined ? this.#working : this.#find(to);
    return diffValues(a.values, b.values);
  }

  /** The whole history as a JSON-safe document, sharing nothing with the live one. */
  export(): HistoryDocument {
    return cloneDocument(this.#doc);
  }

  /**
   * Replaces the history with a document (or its JSON text), read as leniently as storage, and
   * applies its working version to the live controls.
   */
  import(input: HistoryDocument | string): void {
    // Parsing builds new objects throughout, so nothing is shared with `input`.
    const parsed = parseDocument(input, this.#now());
    if (parsed.newer) throw new RangeError(parsed.warnings[0]);
    for (const warning of parsed.warnings) this.#warn(warning);
    this.#doc = parsed.doc;
    const working = this.#working;
    for (const [path, live] of this.#live) {
      const stored = working.values[path];
      const decoded = stored === undefined ? undefined : decode(stored, live.control.descriptor);
      if (decoded) live.control.set(decoded.value);
      const current = encode(
        decoded ? decoded.value : live.control.read(),
        live.control.descriptor,
      );
      if (current !== undefined) working.values[path] = current;
    }
    this.#changed();
  }

  /** Drops the working version's values that no control has now. Returns how many. */
  prune(): number {
    const { values } = this.#working;
    let count = 0;
    for (const path of Object.keys(values))
      if (!this.#live.has(path)) {
        delete values[path];
        count++;
      }
    if (count > 0) this.#changed();
    return count;
  }

  /** Drops every version; a new working version starts from the controls' values now. */
  clear(): void {
    this.#doc = emptyDocument(this.#now());
    const { values } = this.#working;
    for (const [path, live] of this.#live) {
      const current = encode(live.control.read(), live.control.descriptor);
      if (current !== undefined) values[path] = current;
    }
    this.#changed();
  }

  /** Writes pending changes now instead of after the debounce. */
  save(): void {
    if (this.#timer !== null) {
      this.#clearTimer(this.#timer);
      this.#timer = null;
    }
    if (!this.#dirty || !this.#writable || !this.#enabled) return;
    this.#write();
  }

  on(type: 'change', listener: ChangeListener): () => void;
  on(type: 'version', listener: VersionListener): () => void;
  on(type: 'change' | 'version', listener: ChangeListener | VersionListener): () => void {
    const set = (type === 'change' ? this.#changeListeners : this.#versionListeners) as Set<
      typeof listener
    >;
    set.add(listener);
    return () => set.delete(listener);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.save();
    this.#disposed = true;
    for (const live of this.#live.values()) live.unsubscribe();
    this.#live.clear();
    this.#changeListeners.clear();
    this.#versionListeners.clear();
  }

  get #working(): StoredVersion {
    return this.#doc.versions.at(-1)!;
  }

  #find(id: number): StoredVersion {
    const version = this.#doc.versions.find((candidate) => candidate.id === id);
    if (!version) throw new RangeError(`devkit: no history version ${id}`);
    return version;
  }

  /**
   * Auto mode, on load: the previous session becomes a version of its own when it changed
   * something and ended somewhere new. No edits, reverted edits or only new defaults make none.
   */
  #startSession(): boolean {
    const working = this.#working;
    const previous = this.#doc.versions.at(-2);
    // Only edited paths count: values that merely appeared (new controls) are not a change.
    const baseline = new Map<string, StoredValue | undefined>();
    for (const change of working.changes)
      if (!baseline.has(change.p))
        baseline.set(
          change.p,
          previous && Object.hasOwn(previous.values, change.p)
            ? previous.values[change.p]
            : change.f,
        );
    for (const [path, before] of baseline)
      if (!sameValue(working.values[path], before)) {
        this.#freeze(undefined);
        return true;
      }
    return false;
  }

  /**
   * The order a restore applies values in: layer stacks first, outer before inner, so the layers
   * a stack re-creates have live controls before their own values are applied. Paths are looked
   * up live as the restore goes, so they find controls created on the way.
   */
  *#restoreOrder(values: Readonly<Record<string, StoredValue>>): Generator<string> {
    const done = new Set<string>();
    const isStack = (path: string) => this.#live.get(path)?.control.descriptor.type === 'layers';
    for (;;) {
      const next = Object.keys(values)
        .filter((path) => !done.has(path) && isStack(path))
        .sort((a, b) => a.split('/').length - b.split('/').length)[0];
      if (next === undefined) break;
      done.add(next);
      yield next;
    }
    for (const path of Object.keys(values)) if (!done.has(path)) yield path;
  }

  #freeze(label: string | undefined): void {
    const working = this.#working;
    working.frozen = true;
    if (label !== undefined) working.label = label;
    const now = this.#now();
    this.#doc.versions.push(newVersion(working.id + 1, now, { ...working.values }));
    const versions = this.#doc.versions;
    while (versions.length - 1 > this.#limit) versions.shift();
  }

  #record(path: string, control: TrackedControl, value: unknown): void {
    if (!this.#enabled || this.#disposed) return;
    const to = encode(value, control.descriptor);
    if (to === undefined) return;
    const working = this.#working;
    const from = working.values[path];
    if (sameValue(from, to)) return;
    const at = this.#now();
    working.values[path] = to;
    working.updated = at;
    const change: StoredChange = { p: path, ...(from !== undefined ? { f: from } : {}), t: to, at };
    this.#log(working, change);
    this.#markDirty();
  }

  #log(version: StoredVersion, change: StoredChange): void {
    version.changes.push(change);
    const excess = version.changes.length - this.#maxChanges;
    if (excess > 0) version.changes.splice(0, excess);
    if (this.#changeListeners.size > 0) {
      const event = publicChange(change);
      for (const listener of this.#changeListeners) listener(event);
    }
  }

  /** The version list or its metadata changed. */
  #changed(): void {
    this.#markDirty();
    for (const listener of this.#versionListeners) listener();
  }

  #markDirty(): void {
    this.#dirty = true;
    this.#scheduleSave();
  }

  #scheduleSave(): void {
    if (this.#timer !== null || !this.#enabled || !this.#writable || this.#disposed) return;
    this.#timer = this.#setTimer(() => {
      this.#timer = null;
      this.save();
    }, SAVE_DELAY);
  }

  /** Writes the document; when storage is full, drops frozen logs, then older versions. */
  #write(): void {
    const attempt = (): boolean => {
      try {
        this.#storage.write(this.key, JSON.stringify(this.#doc));
        return true;
      } catch {
        return false;
      }
    };
    this.#dirty = false;
    if (attempt()) return;
    const frozen = this.#doc.versions.slice(0, -1);
    for (const version of frozen) version.changes = [];
    if (attempt()) {
      this.#warn('devkit: history storage is full; dropped the change logs of frozen versions');
      return;
    }
    this.#doc.versions.splice(0, Math.ceil(frozen.length / 2));
    if (attempt()) {
      this.#warn('devkit: history storage is full; dropped the oldest versions');
      return;
    }
    this.#warn('devkit: history could not be saved');
  }
}
