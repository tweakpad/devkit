import { describe, expect, it } from 'vitest';
import { Binding, type BindingView } from './binding.js';
import { numberEquals } from './equality.js';
import { Scheduler } from './scheduler.js';
import type { FrameSource } from './frames.js';

/** Hand-driven frames and clock for unit tests. */
class ManualFrames implements FrameSource {
  time = 0;
  /** Added to the clock on every now() call, to simulate work that takes time. */
  costPerRead = 0;
  #callbacks = new Map<number, (time: number) => void>();
  #next = 1;

  request(callback: (time: number) => void): number {
    const handle = this.#next++;
    this.#callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.#callbacks.delete(handle);
  }

  now(): number {
    this.time += this.costPerRead;
    return this.time;
  }

  get pending(): number {
    return this.#callbacks.size;
  }

  /** Advances the clock by one frame and runs the requested callbacks. */
  step(ms = 16): void {
    this.time += ms;
    const callbacks = [...this.#callbacks.values()];
    this.#callbacks.clear();
    for (const callback of callbacks) callback(this.time);
  }
}

class RecordingView<T> implements BindingView<T> {
  writes: T[] = [];
  constructor(readonly heavy = false) {}
  write(value: T): void {
    this.writes.push(value);
  }
}

function setup(budget = 2) {
  const frames = new ManualFrames();
  const scheduler = new Scheduler({ frames, budget });
  return { frames, scheduler };
}

describe('Scheduler + Binding', () => {
  it('uses the same programmatic writes and events for read-only control views', () => {
    const { frames, scheduler } = setup();
    const target = { value: 1 };
    const binding = new Binding<number>(scheduler, target, 'value', { readonly: true });
    const view = new RecordingView<number>();
    const finished: number[] = [];
    binding.attach(view);
    binding.setVisible(true);
    binding.on('finish', (event) => finished.push(event.value));
    binding.propose(2);
    expect(target.value).toBe(1);
    binding.set(3);
    frames.step();
    expect(target.value).toBe(3);
    expect(view.writes).toEqual([1, 3]);
    expect(finished).toEqual([3]);
  });

  it('can deliver equal-valued history samples through normal intervals and visibility', () => {
    const { frames, scheduler } = setup();
    const binding = new Binding<number>(scheduler, { value: 60 }, 'value', {
      equals: () => false,
      interval: 32,
      readonly: true,
    });
    const view = new RecordingView<number>();
    binding.attach(view);
    binding.setVisible(true);
    frames.step();
    frames.step();
    frames.step();
    expect(view.writes).toEqual([60, 60, 60]);
    binding.setVisible(false);
    frames.step(100);
    expect(view.writes).toHaveLength(3);
    expect(scheduler.activeCount).toBe(0);
    binding.refresh();
    frames.step();
    expect(view.writes).toHaveLength(4);
  });

  it('writes only values that changed', () => {
    const { frames, scheduler } = setup();
    const target = { a: 1, b: 2 };
    const a = new Binding<number>(scheduler, target, 'a');
    const b = new Binding<number>(scheduler, target, 'b');
    const va = new RecordingView<number>();
    const vb = new RecordingView<number>();
    a.attach(va);
    b.attach(vb);
    a.setVisible(true);
    b.setVisible(true);
    frames.step();
    expect(va.writes).toEqual([1]);
    target.a = 5;
    frames.step();
    expect(va.writes).toEqual([1, 5]);
    expect(vb.writes).toEqual([2]);
    expect(scheduler.stats.sampled).toBe(2);
    expect(scheduler.stats.lightWrites).toBe(1);
  });

  it('does not sample hidden bindings and stops the loop when idle', () => {
    const { frames, scheduler } = setup();
    const target = { a: 1 };
    const a = new Binding<number>(scheduler, target, 'a');
    a.attach(new RecordingView());
    a.setVisible(true);
    expect(scheduler.activeCount).toBe(1);
    a.setVisible(false);
    expect(scheduler.activeCount).toBe(0);
    frames.step();
    expect(frames.pending).toBe(0);
  });

  it('keeps the active list consistent through swap removal', () => {
    const { scheduler } = setup();
    const target: Record<string, number> = {};
    const bindings = Array.from({ length: 10 }, (_, i) => {
      target[`k${i}`] = i;
      const b = new Binding<number>(scheduler, target, `k${i}`);
      b.setVisible(true);
      return b;
    });
    for (const i of [0, 9, 4, 5]) bindings[i]!.setVisible(false);
    expect(scheduler.activeCount).toBe(6);
    const slots = bindings
      .filter((b) => b.slot !== -1)
      .map((b) => b.slot)
      .sort((x, y) => x - y);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('compares numbers at display resolution', () => {
    const { frames, scheduler } = setup();
    const target = { x: 1 };
    const view = new RecordingView<number>();
    const x = new Binding<number>(scheduler, target, 'x', { equals: numberEquals(0.01) });
    x.attach(view);
    x.setVisible(true);
    target.x = 1.001;
    frames.step();
    target.x = 1.004;
    frames.step();
    expect(view.writes).toEqual([1]);
    target.x = 1.006;
    frames.step();
    expect(view.writes).toEqual([1, 1.006]);
  });

  it('skips sampling while locked and shows the latest value on release', () => {
    const { frames, scheduler } = setup();
    const target = { x: 0 };
    const view = new RecordingView<number>();
    const x = new Binding<number>(scheduler, target, 'x');
    x.attach(view);
    x.setVisible(true);
    const release = x.lock();
    x.propose(10);
    expect(target.x).toBe(10);
    target.x = 99; // the application overwrites during the drag
    frames.step();
    expect(view.writes).toEqual([0]);
    release();
    frames.step();
    expect(view.writes).toEqual([0, 99]);
  });

  it('coalesces change listeners to once per frame and flags the last one', () => {
    const { frames, scheduler } = setup();
    const target = { x: 0 };
    const x = new Binding<number>(scheduler, target, 'x');
    const changes: [number, boolean][] = [];
    const finishes: number[] = [];
    x.on('change', (e) => changes.push([e.value, e.last]));
    x.on('finish', (e) => finishes.push(e.value));
    x.propose(1);
    x.propose(2);
    x.propose(3);
    frames.step();
    x.propose(4);
    x.commit();
    frames.step();
    expect(changes).toEqual([
      [3, false],
      [4, true],
    ]);
    expect(finishes).toEqual([4]);
  });

  it('honors the sampling interval on the shared clock', () => {
    const { frames, scheduler } = setup();
    const target = { x: 0 };
    const view = new RecordingView<number>();
    const x = new Binding<number>(scheduler, target, 'x', { interval: 100 });
    x.attach(view);
    x.setVisible(true);
    for (let i = 1; i <= 12; i++) {
      target.x = i;
      frames.step(16);
    }
    // Samples at t=16 and at the first frame past t=116 (t=128, value 8).
    expect(view.writes).toEqual([0, 1, 8]);
  });

  it('manual bindings (interval -1) are never active', () => {
    const { scheduler } = setup();
    const x = new Binding<number>(scheduler, { x: 0 }, 'x', { interval: -1 });
    x.setVisible(true);
    expect(scheduler.activeCount).toBe(0);
  });

  it('spreads heavy writes over frames within the budget, keeping the latest value', () => {
    const { frames, scheduler } = setup(2);
    frames.costPerRead = 0.5; // every clock read costs 0.5 ms: ~4 heavy writes per frame
    const target: Record<string, number> = {};
    const views: RecordingView<number>[] = [];
    const bindings = Array.from({ length: 12 }, (_, i) => {
      target[`k${i}`] = 0;
      const b = new Binding<number>(scheduler, target, `k${i}`);
      const view = new RecordingView<number>(true);
      views.push(view);
      b.attach(view);
      b.setVisible(true);
      return b;
    });
    for (let i = 0; i < 12; i++) target[`k${i}`] = 1;
    frames.step();
    expect(scheduler.stats.heavyWrites).toBeGreaterThan(0);
    expect(scheduler.stats.deferredWrites).toBeGreaterThan(0);
    for (let i = 0; i < 12; i++) target[`k${i}`] = 2; // newer values while writes are pending
    for (let f = 0; f < 10; f++) frames.step();
    expect(scheduler.stats.deferredWrites).toBe(0);
    // Every view ends on the latest value, and no view was written more than twice after attach.
    for (const view of views) {
      expect(view.writes.at(-1)).toBe(2);
      expect(view.writes.length).toBeLessThanOrEqual(3);
    }
    expect(bindings.length).toBe(12);
  });

  it('isolates a throwing getter', () => {
    const { frames, scheduler } = setup();
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const target = {
        get bad(): number {
          throw new Error('boom');
        },
        good: 1,
      };
      const bad = new Binding<number>(scheduler, { bad: 0 }, 'bad');
      Object.defineProperty(bad, 'target', { value: target });
      const good = new Binding<number>(scheduler, target, 'good');
      const view = new RecordingView<number>();
      good.attach(view);
      bad.setVisible(true);
      good.setVisible(true);
      target.good = 2;
      frames.step();
      expect(view.writes).toEqual([1, 2]);
      expect(errors.length).toBe(1);
      expect(bad.slot).toBe(-1);
    } finally {
      console.error = original;
    }
  });
});
