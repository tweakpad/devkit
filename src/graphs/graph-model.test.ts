import { describe, expect, it } from 'vitest';
import type { PlotStream } from '@tweakpad/ui/widgets';
import { GraphModel, type StreamFactory } from './graph-model.js';
import { niceCeil, Scale } from './scale.js';
import type { GraphSeries } from './types.js';

/** Records what the plot would receive. */
class FakeStream {
  frames: Record<string, number | null>[] = [];
  /** Identities of the frame objects pushed, to prove reuse. */
  identities = new Set<object>();
  clears = 0;
  disposed = false;
  constructor(readonly seriesIds: readonly string[]) {}
  push(values: Record<string, number | null>): void {
    this.identities.add(values);
    this.frames.push({ ...values });
  }
  clear(): void {
    this.clears++;
    this.frames = [];
  }
  dispose(): void {
    this.disposed = true;
  }
}

function setup(
  series: GraphSeries[],
  options: { capacity?: number; layout?: 'paged' | 'overlay'; pages?: string[][] } = {},
) {
  const streams: FakeStream[] = [];
  const createStream: StreamFactory = (ids) => {
    const stream = new FakeStream(ids);
    streams.push(stream);
    return stream as unknown as PlotStream;
  };
  const model = new GraphModel(series, {
    capacity: options.capacity ?? 4,
    layout: options.layout ?? 'paged',
    pages: options.pages,
    createStream,
  });
  return { model, streams, stream: () => streams[streams.length - 1]! };
}

describe('Scale', () => {
  it('snaps to nice steps', () => {
    expect([0.3, 1, 1.2, 2.2, 3, 7, 61, 900].map(niceCeil)).toEqual([
      0.5, 1, 2, 2.5, 5, 10, 100, 1000,
    ]);
  });

  it('relative: fits both bounds to the data with headroom, on round steps', () => {
    const scale = new Scale({ mode: 'relative' });
    expect(scale.fit(0.08, 0.12)).toBe(true);
    expect([scale.lo, scale.hi]).toEqual([0.06, 0.14]);
    expect(scale.normalize(0.1)).toBeCloseTo(0.5);
  });

  it('keeps its range for ordinary samples and refits when data leaves it', () => {
    const scale = new Scale({ mode: 'relative' });
    scale.fit(0.08, 0.12);
    expect(scale.fit(0.07, 0.13)).toBe(false);
    expect(scale.fit(0.07, 0.2)).toBe(true);
    expect(scale.hi).toBeGreaterThanOrEqual(0.2);
  });

  it('relative: shrinks once the data uses less than a third of the range', () => {
    const scale = new Scale({ mode: 'relative' });
    scale.fit(0, 100);
    expect([scale.lo, scale.hi]).toEqual([0, 150]);
    expect(scale.fit(40, 45)).toBe(true);
    expect([scale.lo, scale.hi]).toEqual([38, 46]);
  });

  it('relative: gives a flat line a band and never pads positive data below zero', () => {
    const scale = new Scale({ mode: 'relative' });
    scale.fit(60, 60);
    expect([scale.lo, scale.hi]).toEqual([58, 62]);
    scale.reset();
    scale.fit(0, 10);
    expect([scale.lo, scale.hi]).toEqual([0, 15]);
  });

  it('absolute (default): keeps zero in range and fits the far bound', () => {
    const scale = new Scale();
    scale.fit(118, 124);
    expect([scale.lo, scale.hi]).toEqual([0, 150]);
    scale.reset();
    scale.fit(0.1, 0.1);
    expect([scale.lo, scale.hi]).toEqual([0, 0.15]);
    scale.reset();
    scale.fit(-0.5, 0.8);
    expect([scale.lo, scale.hi]).toEqual([-1, 1]);
  });

  it('absolute: shrinks the far bound once the data uses less than a third of it', () => {
    const scale = new Scale();
    scale.fit(0, 100);
    expect([scale.lo, scale.hi]).toEqual([0, 150]);
    expect(scale.fit(40, 45)).toBe(true);
    expect([scale.lo, scale.hi]).toEqual([0, 60]);
    expect(() => new Scale({ mode: 'log' as never })).toThrow(RangeError);
  });

  it('fits only the automatic bound when the other is fixed', () => {
    const scale = new Scale({ min: 0 });
    scale.fit(40, 45);
    expect([scale.lo, scale.hi]).toEqual([0, 60]);
  });

  it('keeps fixed bounds and clamps normalization', () => {
    const scale = new Scale({ min: -1, max: 1 });
    expect(scale.fit(-5, 5)).toBe(false);
    expect(scale.normalize(0)).toBe(0.5);
    expect(scale.normalize(5)).toBe(1);
    expect(scale.baseline).toBe(0.5);
    expect(scale.contains(2)).toBe(false);
    expect(() => new Scale({ min: 1, max: 1 })).toThrow(RangeError);
  });
});

describe('GraphModel', () => {
  it('pushes normalized frames into one stream, reusing the frame object', () => {
    const { model, stream } = setup([
      { id: 'a', label: 'A', min: 0, max: 10 },
      { id: 'b', label: 'B', min: 0, max: 100 },
    ]);
    model.stageAll({ a: 5, b: 25 });
    model.commit();
    model.stageAll({ a: 10 });
    model.commit();
    expect(stream().frames).toEqual([
      { a: 0.5, b: 0.25 },
      { a: 1, b: null },
    ]);
    expect(stream().identities.size).toBe(1);
    expect(model.get('a')!.value).toBe(10);
    expect(model.get('b')!.value).toBeNull();
  });

  it('holds staged values across frames when asked to', () => {
    const { model, stream } = setup([{ id: 'a', label: 'A', min: 0, max: 10 }]);
    model.stage('a', 2);
    model.commit(true);
    model.commit(true);
    expect(stream().frames).toEqual([{ a: 0.2 }, { a: 0.2 }]);
  });

  it('measures min and max over the bounded history', () => {
    const { model } = setup([{ id: 'a', label: 'A', min: 0, max: 100 }], { capacity: 3 });
    for (const v of [50, 1, 7, 9]) {
      model.stage('a', v);
      model.commit();
    }
    const a = model.get('a')!;
    model.measure(a);
    expect([a.min, a.max]).toEqual([1, 9]);
  });

  it('renormalizes the whole history once when a fitted range changes', () => {
    const { model, stream } = setup([{ id: 'fps', label: 'FPS', scale: 'relative' }]);
    const revision = model.layoutRevision;
    model.stage('fps', 30);
    model.commit();
    expect(stream().frames).toEqual([{ fps: 0.5 }]);
    const clears = stream().clears;
    model.stage('fps', 31);
    model.commit();
    expect(stream().clears).toBe(clears);
    expect(stream().frames).toEqual([{ fps: 0.5 }, { fps: 1 }]);
    model.stage('fps', 90);
    model.commit();
    expect(stream().clears).toBe(clears + 1);
    expect(stream().frames).toEqual([{ fps: 0.125 }, { fps: 0.1375 }, { fps: 0.875 }]);
    expect(model.layoutRevision).toBeGreaterThan(revision);
  });

  it('shows guides only while their value is in range', () => {
    const { model } = setup([{ id: 't', label: 'T', guides: [{ value: 16.7 }] }]);
    model.stage('t', 0.1);
    model.commit();
    expect(model.pages[0]!.guides).toEqual([]);
    model.stage('t', 20);
    model.commit();
    expect(model.pages[0]!.guides).toHaveLength(1);
  });

  it('builds paged and overlay layouts with stable identities until the layout changes', () => {
    const series = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];
    const paged = setup(series).model;
    expect(paged.pages.map((p) => p.title)).toEqual(['A', 'B', 'C']);
    expect(paged.pages[0]!.plotSeries[0]!.fill).toBeDefined();

    expect(paged.series.some((s) => s.overlaid)).toBe(false);

    const overlay = setup(series, { layout: 'overlay' }).model;
    expect(overlay.pages).toHaveLength(1);
    expect(overlay.series.every((s) => s.overlaid)).toBe(true);
    // One plot's fills share the default opacity, so overlaps stay light.
    for (const series of overlay.pages[0]!.plotSeries)
      expect(series.fill && series.fill.opacity).toBeCloseTo(0.05);
    overlay.stage('a', 0.5);
    overlay.commit();
    const plotSeries = overlay.pages[0]!.plotSeries;
    overlay.commit(true);
    expect(overlay.pages[0]!.plotSeries).toBe(plotSeries);

    const grouped = setup(series, { pages: [['a', 'c']] }).model;
    expect(grouped.pages.map((p) => p.title)).toEqual(['A, C', 'B']);
  });

  it('attaches units to overlaid readouts only', () => {
    const series = [
      { id: 'a', label: 'A', unit: 'ms', precision: 1 },
      { id: 'b', label: 'B' },
    ];
    for (const [layout, expected] of [
      ['paged', ['16.7 ms', '3.00']],
      ['overlay', ['16.7ms', '3.00']],
    ] as const) {
      const { model } = setup(series, { layout });
      model.stageAll({ a: 16.7, b: 3 });
      model.commit();
      expect(model.series.map((s) => s.format())).toEqual(expected);
    }
  });

  it('draws average guides at the mean of the visible history, moving them only by a pixel or more', () => {
    const { model } = setup([
      { id: 'a', label: 'A', min: 0, max: 100, guides: [{ value: 'average' }] },
    ]);
    const guide = () => model.pages[0]!.guides[0]!;
    for (const v of [10, 30]) {
      model.stage('a', v);
      model.commit();
    }
    expect(guide().value).toBeCloseTo(0.2);
    expect(guide().layer).toBe('front');
    expect(guide().color).toBe('var(--tp-chart-1)');
    const revision = model.guidesRevision;
    const guides = model.pages[0]!.guides;
    model.stage('a', 20.5); // mean 20.17: under a pixel of movement
    model.commit();
    expect(model.guidesRevision).toBe(revision);
    expect(model.pages[0]!.guides).toBe(guides);
    model.stage('a', 60); // mean 30.1
    model.commit();
    expect(model.guidesRevision).toBe(revision + 1);
    expect(guide().value).toBeCloseTo(0.30125);
  });

  it('cycles pages and notifies listeners', () => {
    const { model } = setup([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    const seen: number[] = [];
    model.onPage((page) => seen.push(page));
    model.page = model.page + 1;
    model.page = model.page + 1;
    model.page = -1;
    expect(seen).toEqual([1, 0, 1]);
  });

  it('replaces the stream when series change, carrying history over', () => {
    const { model, streams } = setup([{ id: 'a', label: 'A', min: 0, max: 10 }]);
    model.stage('a', 5);
    model.commit();
    model.addSeries({ id: 'b', label: 'B', min: 0, max: 10 });
    expect(streams).toHaveLength(2);
    expect(streams[0]!.disposed).toBe(true);
    expect(streams[1]!.seriesIds).toEqual(['a', 'b']);
    expect(streams[1]!.frames).toEqual([{ a: 0.5, b: null }]);
    model.removeSeries('a');
    expect(streams[2]!.frames).toEqual([{ b: null }]);
    expect(() => model.removeSeries('b')).toThrow(RangeError);
  });

  it('rejects unknown and duplicate series', () => {
    const { model } = setup([{ id: 'a', label: 'A' }]);
    expect(() => model.stageAll({ nope: 1 })).toThrow(RangeError);
    expect(() => model.addSeries({ id: 'a', label: 'again' })).toThrow(TypeError);
    expect(() => setup([])).toThrow(RangeError);
  });

  it('clear() drops history and resets automatic ranges', () => {
    const { model, stream } = setup([{ id: 'a', label: 'A' }]);
    model.stage('a', 40);
    model.commit();
    const scale = model.get('a')!.scale;
    expect(scale.lo < 40 && scale.hi > 40).toBe(true);
    model.clear();
    expect(model.count).toBe(0);
    expect([scale.lo, scale.hi]).toEqual([0, 1]);
    expect(stream().frames).toEqual([]);
  });
});
