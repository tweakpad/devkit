import { describe, expect, it } from 'vitest';
import { FORMAT, parseDocument } from './document.js';
import { History, type HistoryConfig } from './history.js';
import { joinPath } from './paths.js';
import type { ControlDescriptor, HistoryStorage, TrackedControl } from './types.js';
import { decode, encode } from './values.js';

/** A binding without DOM: `edit` is a user edit, `set` a programmatic one; both finish. */
class Control implements TrackedControl {
  readonly loads: unknown[] = [];
  readonly sets: unknown[] = [];
  readonly #listeners = new Set<(value: unknown) => void>();
  constructor(
    public value: unknown,
    readonly descriptor: ControlDescriptor,
  ) {}
  read(): unknown {
    return this.value;
  }
  load(value: unknown): void {
    this.value = value;
    this.loads.push(value);
  }
  set(value: unknown): void {
    this.sets.push(value);
    this.edit(value);
  }
  edit(value: unknown): void {
    this.value = value;
    for (const listener of this.#listeners) listener(value);
  }
  onFinish(listener: (value: unknown) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

const NUMBER: ControlDescriptor = { type: 'number', min: 0, max: 10 };
const BOOLEAN: ControlDescriptor = { type: 'boolean' };
const TEXT: ControlDescriptor = { type: 'string' };
const QUALITY: ControlDescriptor = {
  type: 'option',
  items: [
    { label: 'Low', value: 1 },
    { label: 'High', value: 2 },
  ],
};

class Store implements HistoryStorage {
  readonly data = new Map<string, string>();
  writes = 0;
  /** Longest text that fits. */
  capacity = Infinity;
  read(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  write(key: string, data: string): void {
    if (data.length > this.capacity) throw new Error('QuotaExceededError');
    this.writes++;
    this.data.set(key, data);
  }
  remove(key: string): void {
    this.data.delete(key);
  }
}

/** A page: a history over shared storage, with a manual clock and timers. Reload = a new one. */
function page(store: Store, config: Partial<HistoryConfig> = {}) {
  let time = 1000;
  const timers = new Set<() => void>();
  const warnings: string[] = [];
  const history = new History({
    key: 'k',
    storage: store,
    mode: 'manual',
    limit: 50,
    maxChanges: 200,
    now: () => (time += 1),
    setTimer: (callback) => {
      timers.add(callback);
      return callback;
    },
    clearTimer: (handle) => timers.delete(handle as () => void),
    warn: (message) => warnings.push(message),
    ...config,
  });
  const runTimers = (): void => {
    for (const timer of [...timers]) {
      timers.delete(timer);
      timer();
    }
  };
  return { history, timers, runTimers, warnings };
}

describe('history values', () => {
  it('escapes paths like JSON pointers', () => {
    expect(joinPath(['Light/Shadow', 'a~b'], 'x')).toBe('Light~1Shadow/a~0b/x');
  });

  it('applies stored values best effort', () => {
    expect(decode(12, NUMBER)).toEqual({ value: 10 });
    expect(decode('12', NUMBER)).toBeUndefined();
    expect(decode(true, TEXT)).toBeUndefined();
    // A pick found by value, then by label when values were renumbered.
    expect(decode({ v: 2, l: 'High' }, QUALITY)).toEqual({ value: 2 });
    expect(decode({ v: 9, l: 'Low' }, QUALITY)).toEqual({ value: 1 });
    expect(decode({ v: 9, l: 'Ultra' }, QUALITY)).toBeUndefined();
    // A pick that became a slider keeps its number; a plain number is found among options.
    expect(decode({ v: 2, l: 'High' }, NUMBER)).toEqual({ value: 2 });
    expect(decode(1, QUALITY)).toEqual({ value: 1 });
    expect(decode('rgb(1, 2, 3)', { type: 'color', object: true })).toBeUndefined();
    expect(decode('#ff0000', { type: 'color', object: true })).toEqual({ value: '#ff0000' });
    expect(decode('nope', { type: 'color', object: false })).toBeUndefined();
    expect(encode(Number.NaN, NUMBER)).toBeUndefined();
    expect(encode(2, QUALITY)).toEqual({ v: 2, l: 'High' });
    const value = {};
    expect(encode(value, { type: 'option', items: [{ label: 'A', value }] })).toEqual({
      v: null,
      l: 'A',
    });
  });
});

describe('History', () => {
  it('records finished edits with what they replaced and saves after a debounce', () => {
    const store = new Store();
    const { history, timers, runTimers } = page(store);
    const speed = new Control(1, NUMBER);
    history.track(['Motion'], 'speed', speed);
    expect(history.current.values).toEqual({ 'Motion/speed': 1 });
    expect(history.current.changes).toEqual([]);
    speed.edit(3);
    speed.edit(3); // no-op: not logged
    speed.edit(4);
    expect(history.current.changes.map((c) => [c.path, c.from, c.to, c.source])).toEqual([
      ['Motion/speed', 1, 3, 'edit'],
      ['Motion/speed', 3, 4, 'edit'],
    ]);
    expect(timers.size).toBe(1);
    expect(store.writes).toBe(0);
    runTimers();
    expect(store.writes).toBe(1);
    expect(JSON.parse(store.data.get('k')!).versions[0].values).toEqual({ 'Motion/speed': 4 });
  });

  it('restores values silently on reload, skipping what no longer fits', () => {
    const store = new Store();
    const first = page(store).history;
    const controls = {
      speed: new Control(1, NUMBER),
      on: new Control(false, BOOLEAN),
      name: new Control('a', TEXT),
      quality: new Control(1, QUALITY),
    };
    for (const [key, control] of Object.entries(controls)) first.track([], key, control);
    controls.speed.edit(7);
    controls.on.edit(true);
    controls.name.edit('b');
    controls.quality.edit(2);
    first.dispose();

    // The schema changed: speed is unchanged, `on` became text, `name` was renamed `title`,
    // quality gained an option and new values, and `size` is new.
    const { history } = page(store);
    const speed = new Control(1, NUMBER);
    const on = new Control('x', TEXT);
    const title = new Control('a', TEXT);
    const quality = new Control(0, {
      type: 'option',
      items: [
        { label: 'Off', value: 0 },
        { label: 'Low', value: 10 },
        { label: 'High', value: 20 },
      ],
    });
    const size = new Control(5, NUMBER);
    history.track([], 'speed', speed);
    history.track([], 'on', on);
    history.track([], 'title', title);
    history.track([], 'quality', quality);
    history.track([], 'size', size);
    expect([speed.value, on.value, title.value, quality.value, size.value]).toEqual([
      7,
      'x',
      'a',
      20,
      5,
    ]);
    // Loaded, not set: no change is announced and none is logged.
    expect(speed.loads).toEqual([7]);
    expect(speed.sets).toEqual([]);
    expect(history.current.changes).toHaveLength(4);
    // The renamed control's value is kept, never applied, and prunable.
    expect(history.current.values.name).toBe('b');
    expect(history.current.values.on).toBe('x');
    expect(history.prune()).toBe(1);
    expect(history.current.values.name).toBeUndefined();
  });

  it('keeps a late control restorable, and numbers duplicate paths', () => {
    const store = new Store();
    const first = page(store).history;
    first.track([], 'x', new Control(1, NUMBER));
    const b = new Control(2, NUMBER);
    first.track([], 'x', b);
    b.edit(9);
    expect(Object.keys(first.current.values)).toEqual(['x', 'x#2']);
    first.dispose();
    const { history, warnings } = page(store);
    const late = new Control(0, NUMBER);
    history.track([], 'x', new Control(1, NUMBER));
    const untrack = history.track([], 'x', late);
    expect(late.value).toBe(9);
    expect(warnings).toHaveLength(1);
    untrack();
    const again = new Control(0, NUMBER);
    history.track([], 'x', again);
    expect(again.value).toBe(9);
  });

  it('advances, never duplicating the newest frozen version, within the limit', () => {
    const { history } = page(new Store(), { limit: 2 });
    const speed = new Control(1, NUMBER);
    history.track([], 'speed', speed);
    const v1 = history.advance('first');
    expect([v1.id, v1.frozen, v1.label]).toEqual([1, true, 'first']);
    expect(history.current.id).toBe(2);
    expect(history.current.values).toEqual({ speed: 1 });
    expect(history.advance().id).toBe(1); // identical: no new version
    speed.edit(2);
    speed.edit(1); // reverted
    expect(history.advance().id).toBe(1);
    speed.edit(3);
    expect(history.advance().id).toBe(2);
    speed.edit(4);
    history.advance();
    expect(history.versions.map((v) => v.id)).toEqual([2, 3, 4]);
    expect(history.diff(2)).toEqual({
      added: [],
      removed: [],
      changed: [{ path: 'speed', from: 3, to: 4 }],
    });
  });

  it('auto: a reload makes a version only when the session before changed something new', () => {
    const store = new Store();
    const session = (edit?: (speed: Control) => void, extra = false) => {
      const { history } = page(store, { mode: 'auto' });
      const speed = new Control(1, NUMBER);
      history.track([], 'speed', speed);
      if (extra) history.track([], 'added', new Control(5, NUMBER));
      edit?.(speed);
      const ids = history.versions.map((v) => `${v.id}${v.frozen ? '*' : ''}`);
      history.dispose();
      return ids;
    };
    expect(session((s) => s.edit(2))).toEqual(['1']);
    expect(session()).toEqual(['1*', '2']); // the edited session froze on this load
    expect(session()).toEqual(['1*', '2']); // no edits: nothing new
    expect(session((s) => (s.edit(5), s.edit(2)))).toEqual(['1*', '2']); // reverted
    expect(session(undefined, true)).toEqual(['1*', '2']); // only a new default
    expect(session((s) => s.edit(6))).toEqual(['1*', '2']);
    expect(session()).toEqual(['1*', '2*', '3']);
  });

  it('restores a version into the working one as one group, announcing each value', () => {
    const { history } = page(new Store());
    const speed = new Control(1, NUMBER);
    const on = new Control(false, BOOLEAN);
    history.track([], 'speed', speed);
    history.track([], 'on', on);
    history.advance();
    speed.edit(5);
    on.edit(true);
    history.restore(1);
    expect([speed.value, on.value]).toEqual([1, false]);
    expect(speed.sets).toEqual([1]);
    const restored = history.current.changes.filter((c) => c.source === 'restore');
    expect(restored.map((c) => [c.path, c.from, c.to, c.group])).toEqual([
      ['speed', 5, 1, 1],
      ['on', true, false, 1],
    ]);
    // The controls' own finish events were no-ops.
    expect(history.current.changes).toHaveLength(4);
    expect(() => history.restore(99)).toThrow(RangeError);
    expect(() => history.delete(history.current.id)).toThrow(RangeError);
    history.delete(1);
    expect(history.versions).toHaveLength(1);
  });

  it('restores layer stacks first, so the controls they re-create get their values', () => {
    const { history } = page(new Store());
    const panel: Control[] = [];
    // A stack whose `set` re-creates a layer, and the layer's control, as a stack does.
    const stack = new Control('{"l":[["a",null]],"d":["a"],"n":1}', { type: 'layers' });
    let untrackB = () => {};
    const createB = () => {
      const control = new Control(0, NUMBER);
      panel.push(control);
      untrackB = history.track(['Layers', 'b'], 'size', control);
      return control;
    };
    // b's value comes first in the stored values: the restore must still apply the stack first.
    const b = createB();
    history.track(['Layers'], '@layers', stack);
    history.track(['Layers', 'a'], 'size', new Control(1, NUMBER));
    stack.edit('{"l":[["a",null],["b","t"]],"d":["a"],"n":2}');
    b.edit(7);
    history.advance();
    // Remove b: its value stays in the working version, but it has no control.
    b.edit(3);
    stack.edit('{"l":[["a",null]],"d":["a"],"n":2}');
    untrackB();
    const original = stack.set.bind(stack);
    stack.set = (value) => {
      original(value);
      if (String(value).includes('"b"')) createB();
    };
    history.restore(1);
    expect(panel).toHaveLength(2);
    expect(panel[1]!.value).toBe(7);
    // Applied to the live control and announced, not only loaded on creation.
    expect(panel[1]!.sets).toEqual([7]);
    expect(history.current.values['Layers/b/size']).toBe(7);
  });

  it('keeps layer structures only when they decode', () => {
    const descriptor: ControlDescriptor = { type: 'layers' };
    expect(encode('{"l":[],"d":[],"n":1}', descriptor)).toBe('{"l":[],"d":[],"n":1}');
    expect(encode('nope', descriptor)).toBeUndefined();
    expect(decode('{"l":[],"d":[],"n":1}', descriptor)).toEqual({ value: '{"l":[],"d":[],"n":1}' });
    expect(decode(3, descriptor)).toBeUndefined();
  });

  it('caps the change log and pauses while disabled', () => {
    const { history, timers } = page(new Store(), { maxChanges: 2 });
    const speed = new Control(0, NUMBER);
    history.track([], 'speed', speed);
    for (const v of [1, 2, 3]) speed.edit(v);
    expect(history.current.changes.map((c) => c.to)).toEqual([2, 3]);
    history.save();
    history.enabled = false;
    speed.edit(4);
    expect(history.current.values.speed).toBe(3);
    expect(timers.size).toBe(0);
  });

  it('exports and imports a document, applying its working version', () => {
    const { history } = page(new Store());
    const speed = new Control(1, NUMBER);
    history.track([], 'speed', speed);
    speed.edit(4);
    const doc = history.export();
    expect(doc.format).toBe(FORMAT);
    speed.edit(8);
    history.import(JSON.stringify(doc));
    expect(speed.value).toBe(4);
    history.clear();
    expect(history.versions).toHaveLength(1);
    expect(history.current.values).toEqual({ speed: 4 });
    expect(() => history.import({ format: 99 } as never)).toThrow(RangeError);
  });

  it('reads damaged storage leniently and never overwrites a newer format', () => {
    expect(parseDocument('{nope', 1).warnings).toHaveLength(1);
    const partial = parseDocument(
      JSON.stringify({
        format: 1,
        versions: [
          { id: 1, frozen: true, values: { a: 1, b: { bad: true } }, changes: [{ p: 'a' }] },
          { id: 1, values: {} },
          'junk',
          { id: 3, frozen: true, values: { a: 2 } },
        ],
      }),
      1,
    );
    expect(partial.doc.versions.map((v) => [v.id, v.frozen, v.values])).toEqual([
      [1, true, { a: 1 }],
      [3, true, { a: 2 }],
      [4, false, { a: 2 }],
    ]);
    expect(partial.doc.versions[0]!.changes).toEqual([]);

    const store = new Store();
    const newer = JSON.stringify({ format: FORMAT + 1, versions: [] });
    store.data.set('k', newer);
    const { history, runTimers, warnings } = page(store);
    const speed = new Control(1, NUMBER);
    history.track([], 'speed', speed);
    speed.edit(2);
    runTimers();
    history.dispose();
    expect(store.data.get('k')).toBe(newer);
    expect(warnings).toHaveLength(1);
  });

  it('drops frozen logs, then old versions, when storage is full', () => {
    const store = new Store();
    const { history, warnings } = page(store);
    const name = new Control('a', TEXT);
    history.track([], 'name', name);
    for (let i = 0; i < 6; i++) {
      name.edit(`value ${i}`);
      history.advance();
    }
    name.edit('last');
    // Just too small for the whole history: frozen versions lose their logs, all versions stay.
    store.capacity = JSON.stringify(history.export()).length - 1;
    history.save();
    expect(warnings).toEqual([expect.stringContaining('change logs')]);
    const saved = JSON.parse(store.data.get('k')!);
    expect(saved.versions).toHaveLength(7);
    expect(saved.versions.at(-1).changes).toHaveLength(1);
    expect(saved.versions[0].changes).toEqual([]);
    // Too small even then: the older half of the frozen versions goes too.
    name.edit('later');
    store.capacity = JSON.stringify(history.export()).length - 1;
    history.save();
    expect(warnings[1]).toContain('oldest versions');
    expect(JSON.parse(store.data.get('k')!).versions).toHaveLength(4);
  });
});
