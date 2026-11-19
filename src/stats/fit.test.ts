import { describe, expect, it } from 'vitest';
import {
  columnNeeds,
  fitStats,
  labelModeAt,
  labelWidthFor,
  shareTracks,
  valueNeed,
  type FitGroup,
  type FitInput,
} from './fit.js';

/** A group whose stats have these label and value widths. */
function group(...stats: [full: number, value: number][]): FitGroup {
  return { stats: stats.map(([full, value]) => ({ full, value })) };
}

const base = {
  columnGap: 16,
  labelGap: 8,
  min: 1,
  max: 2,
  labels: 'auto',
  layout: 'groups',
} as const satisfies Omit<FitInput, 'width' | 'groups'>;

function fit(input: Partial<FitInput> & Pick<FitInput, 'width' | 'groups'>) {
  return fitStats({ ...base, ...input });
}

/** About 6px a character. */
const chars = (n: number) => n * 6;

describe('stats fit', () => {
  it('lays a column out for the label two thirds of its labels fit within', () => {
    // Four labels under 8 characters and one of 32: the long one fades, the others decide.
    expect(labelWidthFor([chars(6), chars(32), chars(7), chars(5), chars(8)])).toBe(chars(8));
    // Three of four labels over 24 characters: they decide.
    expect(labelWidthFor([chars(26), chars(6), chars(30), chars(25)])).toBe(chars(26));
    expect(labelWidthFor([chars(10)])).toBe(chars(10));
    expect(labelWidthFor([0, 0])).toBe(0);
  });

  it('shows a column’s labels while two thirds of them show two thirds of their text', () => {
    const needs = columnNeeds({ ...group([60, 50], [42, 30]), inset: 8, title: 70 }, 8);
    // Inset, widest value, gap, and two thirds of the label two thirds of them fit within.
    expect(needs.full).toBe(8 + 50 + 8 + 40);
    // Room is given toward the longest label whole, and the title.
    expect(needs.longest).toBe(8 + 50 + 8 + 60);
    expect(needs.title).toBe(70);
    // With a fade wider than the gap, the longest label gets room to clear it, so it shows crisp.
    expect(columnNeeds(group([60, 50]), 8, 16).longest).toBe(50 + 16 + 60);
    expect(valueNeed({ ...group([60, 50], [40, 70]), inset: 8 })).toBe(78);
  });

  it('shares spare width by weight, never below a minimum', () => {
    expect(shareTracks([50, 50], [1, 1], 300)).toEqual([150, 150]);
    expect(shareTracks([50, 50], [1, 2], 300)).toEqual([100, 200]);
    expect(shareTracks([250, 10], [1, 1], 300)).toEqual([250, 50]);
  });

  it('shows labels or hides them by the width of the column', () => {
    const needs = { full: 120, longest: 140, title: 0 };
    expect(labelModeAt(120, needs, 'auto')).toBe('shown');
    expect(labelModeAt(100, needs, 'auto')).toBe('hidden');
    expect(labelModeAt(80, needs, 'show')).toBe('shown');
    expect(labelModeAt(500, needs, 'hide')).toBe('hidden');
  });

  it('keeps groups side by side while every column has room for its labels', () => {
    const two = [group([60, 50]), group([40, 50])];
    expect(fit({ width: 400, groups: two })).toMatchObject({
      columns: 2,
      labels: ['shown', 'shown'],
    });
  });

  it('stacks groups once side by side a column would lose its labels', () => {
    const two = [group([90, 30]), group([90, 30])];
    expect(fit({ width: 120, groups: two })).toMatchObject({
      columns: 1,
      labels: ['shown', 'shown'],
    });
  });

  it('stacks groups before hiding labels, then hides them, values first', () => {
    // Labels too long to show even stacked: the groups stay stacked and hide them.
    const two = [group([400, 50]), group([400, 50])];
    expect(fit({ width: 200, groups: two })).toMatchObject({
      columns: 1,
      labels: ['hidden', 'hidden'],
      overflow: false,
    });
  });

  it('stacks the long-label groups of a narrow pane rather than hide their labels', () => {
    // Renderer (3 long labels) and Physics (2), in a pane of 260px.
    const renderer = { ...group([230, 56], [190, 24], [245, 24]), title: 70, inset: 8 };
    const physics = { ...group([190, 24], [200, 40]), title: 140, inset: 8 };
    expect(fit({ width: 260, groups: [renderer, physics] })).toMatchObject({
      columns: 1,
      labels: ['shown', 'shown'],
    });
  });

  it('never mixes shown and hidden labels among groups stacked in one column', () => {
    // Stacked, the long group's labels decide for the column: both groups hide theirs.
    const short = group([20, 40]);
    const long = group([400, 40], [380, 40]);
    const result = fit({ width: 90, groups: [short, long], max: 1 });
    expect(result.labels).toEqual(['hidden', 'hidden']);
    expect(result.needs[0]).toEqual(result.needs[1]);
  });

  it('gives room first where it lets a column show its labels', () => {
    // An even share would hide the wide column's labels; its own threshold shows both.
    const narrow = group([20, 40]);
    const wide = group([100, 40]);
    const result = fit({ width: 193, groups: [narrow, wide] });
    // An even share (88.5 each) is below the wide column's threshold (114.7).
    expect(result.columns).toBe(2);
    expect(result.labels).toEqual(['shown', 'shown']);
  });

  it("gives what is left toward a column's longest label before sharing it evenly", () => {
    // One long label among short ones: the column takes the spare room toward it.
    const outlier = group([20, 40], [20, 40], [200, 40]);
    const small = group([10, 20]);
    const result = fit({ width: 260 + 16 + 60, groups: [outlier, small] });
    expect(result.tracks[0]).toBeCloseTo(248);
    expect(result.tracks[1]).toBeCloseTo(38);
  });

  it("keeps a column's labels with 'show', dropping columns instead", () => {
    const two = [group([60, 50]), group([40, 50])];
    expect(fit({ width: 150, groups: two, labels: 'show' })).toMatchObject({
      columns: 1,
      labels: ['shown', 'shown'],
    });
  });

  it("hides labels with 'hide'", () => {
    const two = [group([60, 50]), group([40, 50])];
    expect(fit({ width: 1000, groups: two, labels: 'hide' }).labels).toEqual(['hidden', 'hidden']);
  });

  it('honours the column range', () => {
    const three = [group([10, 10]), group([10, 10]), group([10, 10])];
    expect(fit({ width: 1000, groups: three, max: 2 }).columns).toBe(2);
    expect(fit({ width: 1000, groups: three, max: 10 }).columns).toBe(3);
    expect(fit({ width: 40, groups: three, min: 3, max: 3 })).toMatchObject({
      columns: 3,
      overflow: true,
    });
  });

  it('cuts values when nothing fits, with every label hidden', () => {
    expect(fit({ width: 20, groups: [group([60, 50]), group([40, 50])] })).toMatchObject({
      columns: 1,
      labels: ['hidden', 'hidden'],
      overflow: true,
    });
  });

  it('fits a matrix: labels once, laid out for most of them, then hidden', () => {
    const groups = [group([0, 40]), group([0, 60])];
    const rows = [{ full: 60 }, { full: 40 }, { full: 200 }];
    const matrix = { layout: 'matrix' as const, groups, rows };
    // Two of three labels fit within 60: the long row fades instead of widening the column.
    expect(fit({ ...matrix, width: 60 + 8 + 40 + 16 + 60 })).toMatchObject({
      layout: 'matrix',
      labels: ['shown'],
      tracks: [60, 40, 60],
    });
    expect(fit({ ...matrix, width: 60 + 40 + 16 + 60 }).labels).toEqual(['hidden']);
  });

  it('falls back from a matrix to groups when even its values do not fit', () => {
    const result = fit({
      layout: 'matrix',
      groups: [group([0, 80]), group([0, 80])],
      rows: [{ full: 20 }],
      width: 120,
    });
    expect(result).toMatchObject({ layout: 'groups', columns: 1 });
  });

  it('handles a block without groups', () => {
    expect(fit({ width: 100, groups: [] })).toMatchObject({ columns: 0, tracks: [], labels: [] });
  });

  it('holds its rules for any block, at every width', () => {
    // A small deterministic generator: blocks of 1 to 6 groups of 1 to 6 stats, labels and values
    // from 1 to 50 characters, with and without titles and guides, in every labels mode.
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const pick = (from: number, to: number) => from + Math.floor(random() * (to - from + 1));
    for (let block = 0; block < 500; block++) {
      const groups: FitGroup[] = Array.from({ length: pick(1, 6) }, () => ({
        inset: random() < 0.5 ? 8 : 0,
        title: random() < 0.7 ? chars(pick(3, 20)) : 0,
        stats: Array.from({ length: pick(1, 6) }, () => ({
          full: chars(pick(1, 50)),
          value: chars(pick(1, random() < 0.8 ? 10 : 50)),
        })),
      }));
      const labels = (['auto', 'auto', 'show', 'hide'] as const)[pick(0, 3)]!;
      const max = pick(1, 6);
      const min = pick(1, max);
      let columns = Infinity;
      for (let width = 1200; width >= 20; width -= 7) {
        const result = fit({ width, groups, labels, min, max });
        const columnCount = result.columns;
        // Whether the values fit in `count` columns.
        const valuesFit = (count: number) => {
          const tracks = new Array<number>(count).fill(0);
          groups.forEach((each, i) => {
            tracks[i % count] = Math.max(tracks[i % count]!, valueNeed(each));
          });
          return tracks.reduce((sum, track) => sum + track, 0) + (count - 1) * 16 <= width + 0.5;
        };
        const fewest = Math.max(1, Math.min(min, groups.length));
        const most = Math.max(1, Math.min(max, groups.length));
        // Narrowing never brings columns back, unless the values need them (a minimum above one).
        if (columnCount > columns) expect(valuesFit(fewest)).toBe(false);
        columns = columnCount;
        // A column never mixes shown and hidden labels.
        groups.forEach((_, i) => {
          if (i >= columnCount) expect(result.labels[i]).toBe(result.labels[i % columnCount]);
        });
        // Values come first: they are cut only when no column count holds them.
        if (labels !== 'show') {
          let any = false;
          for (let count = fewest; count <= most; count++) if (valuesFit(count)) any = true;
          expect(result.overflow).toBe(!any);
        }
        // Side by side beyond the fewest columns only while every column shows its labels (or
        // while the values need the columns).
        if (labels === 'auto' && columnCount > fewest && valuesFit(fewest))
          expect(result.labels.every((mode) => mode === 'shown')).toBe(true);
      }
    }
  });
});
