import { Pane } from '../src/index.js';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const frames = async (count: number) => {
  for (let i = 0; i < count; i++) await frame();
};
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Version history through real panes and `localStorage`; a "reload" is dispose + new pane. */
export async function checkHistory(): Promise<string[]> {
  const checks: string[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const key = `checks-${Math.random().toString(36).slice(2)}`;
  const storageKey = `devkit:history:${key}`;
  const stored = () => JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  const panes: Pane[] = [];
  const open = (title = 'History checks') => {
    const pane = new Pane({ title, refresh: 'manual', history: { key } });
    panes.push(pane);
    return pane;
  };

  try {
    // Session 1: edit a few controls in folders, tabs and an inline row.
    const first = open();
    const scene = { intensity: 1, color: { r: 255, g: 0, b: 0 }, quality: 'low', shadows: false };
    const misc = { label: 'one', fps: 60, secret: 'a', old: 3, retyped: 4 };
    const light = first.addFolder({ title: 'Light' });
    const intensity = light.addBinding(scene, 'intensity', { min: 0, max: 5 });
    const color = light.addBinding(scene, 'color');
    const quality = light.addBinding(scene, 'quality', { options: ['low', 'high'] });
    const [page] = first.addTabs({ pages: [{ title: 'Page', id: 'main' }] }).pages;
    page!.addBinding(scene, 'shadows');
    const row = first.addRow({
      items: [{ type: 'binding', target: misc, key: 'label' }],
    });
    first.addBinding(misc, 'fps', { view: 'monitor' });
    first.addBinding(misc, 'secret', { history: false });
    first.addBinding(misc, 'old', { min: 0, max: 10 });
    first.addBinding(misc, 'retyped', { min: 0, max: 10 });
    check(first.history !== null, 'a pane with the history option has a history');
    check(
      JSON.stringify(Object.keys(first.history!.current.values)) ===
        JSON.stringify([
          'Light/intensity',
          'Light/color',
          'Light/quality',
          'main/shadows',
          'label',
          'old',
          'retyped',
        ]),
      'paths follow folders, tab page ids and inline rows; monitors and history: false are left out',
    );

    intensity.value = 3;
    (color as unknown as { value: string }).value = '#00ff00'; // object colors are edited as hex
    quality.value = 'high';
    row.items[0].value = 'two';
    misc.secret = 'b';
    await frames(3);
    check(first.history!.current.changes.length === 4, 'each finished edit is logged');
    check(
      stored() === null || stored().versions[0].changes.length < 4,
      'saving waits for the debounce',
    );
    await wait(600);
    check(
      stored().versions[0].values['Light/intensity'] === 3,
      'the debounced save reaches localStorage',
    );
    first.history!.advance('lit');
    first.dispose();
    check(
      stored().versions.length === 2 && stored().versions[0].frozen,
      'dispose saves the advanced history',
    );

    // Session 2: the schema changed. `old` was renamed `renamed`, `retyped` became text,
    // `intensity` now tops out at 2, and `extra` is new.
    const second = open();
    const next = { intensity: 1, color: { r: 255, g: 0, b: 0 }, quality: 'low', shadows: false };
    const more = { label: 'one', renamed: 3, retyped: 'text', extra: 7 };
    const announced: string[] = [];
    const folder = second.addFolder({ title: 'Light' });
    folder
      .addBinding(next, 'intensity', { min: 0, max: 2 })
      .on('change', () => announced.push('intensity'));
    folder.addBinding(next, 'color');
    folder.addBinding(next, 'quality', { options: ['low', 'high'] });
    second
      .addTabs({ pages: [{ title: 'Renamed page', id: 'main' }] })
      .pages[0]!.addBinding(next, 'shadows');
    second.addRow({ items: [{ type: 'binding', target: more, key: 'label' }] });
    second.addBinding(more, 'renamed', { min: 0, max: 10 });
    second.addBinding(more, 'retyped');
    second.addBinding(more, 'extra');
    await frames(3);
    check(next.intensity === 2, 'a stored value is clamped into the new range');
    check(next.color.g === 255 && next.color.r === 0, 'a color object is restored in place');
    check(
      next.quality === 'high' && more.label === 'two',
      'picks and inline row values are restored',
    );
    check(
      more.retyped === 'text' && more.renamed === 3,
      'retyped and renamed controls keep their defaults',
    );
    check(announced.length === 0, 'restoring on load announces no change');
    check(
      second.history!.current.values.old === 3,
      'the renamed control’s value is kept, not applied',
    );

    const restoreTarget = second.history!.versions[0]!.id;
    folder.dispose();
    const fresh = { intensity: 0.5, color: { r: 0, g: 0, b: 0 }, quality: 'low', shadows: false };
    const again = second.addFolder({ title: 'Light' });
    const restored = again.addBinding(fresh, 'intensity', { min: 0, max: 5 });
    check(fresh.intensity === 2, 'a control added later still gets its stored value');
    let restoredEvents = 0;
    restored.on('change', () => restoredEvents++);
    second.history!.restore(restoreTarget);
    await frames(3);
    check(
      fresh.intensity === 3 && restoredEvents === 1,
      'restore applies a version and announces it',
    );
    second.dispose();

    // Off: no history, no storage access.
    const before = localStorage.length;
    const original = Storage.prototype.getItem;
    let reads = 0;
    Storage.prototype.getItem = function (this: Storage, name: string) {
      reads++;
      return original.call(this, name);
    };
    try {
      const off = new Pane({ title: 'No history', refresh: 'manual' });
      off.addBinding({ x: 1 }, 'x');
      check(
        off.history === null && reads === 0,
        'without the option there is no history and no storage read',
      );
      off.dispose();
    } finally {
      Storage.prototype.getItem = original;
    }
    check(localStorage.length === before, 'without the option nothing is stored');
  } finally {
    for (const pane of panes) if (pane.element.isConnected) pane.dispose();
    localStorage.removeItem(storageKey);
  }
  return checks;
}
