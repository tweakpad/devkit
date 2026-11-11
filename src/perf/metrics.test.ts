import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_METRICS,
  groupMetrics,
  resolveMetric,
  type MetricGroup,
  type PerformanceMetricDefinition,
} from './metrics.js';

const performance = globalThis.performance as Performance & { memory?: unknown };

function withHeap(supported: boolean): void {
  if (supported)
    Object.defineProperty(performance, 'memory', {
      configurable: true,
      get: () => ({ usedJSHeapSize: 64 * 1024 * 1024 }),
    });
  else delete performance.memory;
}

function resolveDefaults(): PerformanceMetricDefinition[] {
  return DEFAULT_METRICS.map(resolveMetric).filter((metric) => metric !== null);
}

const names = (groups: MetricGroup[]) =>
  groups.map(({ name, metrics }) => `${name}:${metrics.map((m) => m.id).join('+')}`);

describe('performance metrics', () => {
  afterEach(() => withHeap(false));

  it('leaves the heap out, and the memory graph with it, where it cannot be measured', () => {
    withHeap(false);
    expect(resolveMetric('heap')).toBeNull();
    expect(names(groupMetrics(resolveDefaults(), undefined))).toEqual(['frame:fps+frameTime']);
  });

  it('keeps a memory graph for other metrics when the heap is unavailable', () => {
    withHeap(false);
    const triangles = { id: 'triangles', label: 'Triangles', graph: 'memory' };
    expect(names(groupMetrics([...resolveDefaults(), triangles], undefined))).toEqual([
      'frame:fps+frameTime',
      'memory:triangles',
    ]);
  });

  it('stacks a frame graph over a memory graph where the heap is available', () => {
    withHeap(true);
    const heap = resolveMetric('heap')!;
    expect(heap.read!()).toBe(64);
    expect(names(groupMetrics(resolveDefaults(), undefined))).toEqual([
      'frame:fps+frameTime',
      'memory:heap',
    ]);
  });

  it('takes explicit graphs as the whole layout, skipping unavailable ids', () => {
    withHeap(false);
    const calls = { id: 'drawCalls', label: 'Draw calls' };
    const triangles = { id: 'triangles', label: 'Triangles', graph: 'memory' };
    const metrics = [...resolveDefaults(), calls, triangles];
    expect(
      names(
        groupMetrics(metrics, {
          frame: ['fps', 'frameTime'],
          calls: { metrics: ['drawCalls'], layout: 'paged' },
          memory: ['heap'],
        }),
      ),
    ).toEqual(['frame:fps+frameTime', 'calls:drawCalls']);
    const groups = groupMetrics(metrics, {
      frame: ['fps'],
      calls: { metrics: ['drawCalls'], layout: 'paged' },
    });
    expect(groups.map((g) => g.layout)).toEqual([undefined, 'paged']);
  });

  it('merges overrides onto built-ins', () => {
    const fps = resolveMetric({ id: 'fps', fill: 0.2, color: '#22d3ee' })!;
    expect([fps.label, fps.fill, fps.color, typeof fps.sample]).toEqual([
      'FPS',
      0.2,
      '#22d3ee',
      'function',
    ]);
    withHeap(false);
    expect(resolveMetric({ id: 'heap', fill: true })).toBeNull();
    expect(() => resolveMetric({ id: 'custom' } as never)).toThrow(TypeError);
  });

  it('rejects duplicate metric ids', () => {
    const a = { id: 'a', label: 'A' };
    expect(() => groupMetrics([a, a], undefined)).toThrow(TypeError);
  });
});
