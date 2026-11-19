/** How labels show: shown (fading where too long), or hidden (offered on hover instead). */
export type LabelMode = 'shown' | 'hidden';

/** Widths, in px, of one stat: its label and its value. */
export interface FitStat {
  readonly full: number;
  readonly value: number;
}

/** The visible stats of one group. */
export interface FitGroup {
  readonly stats: readonly FitStat[];
  /** Room before the stats in the groups layout, such as a guide line's; 0 by default. */
  readonly inset?: number;
  /** Width of its title; 0 (the default) for an untitled group. */
  readonly title?: number;
}

/** One row of the matrix layout: the label width of its key. */
export interface FitRow {
  readonly full: number;
}

export interface FitInput {
  /** Width available to the block. */
  readonly width: number;
  /** Space between group columns (and between matrix value columns). */
  readonly columnGap: number;
  /** Space between a label and its value. */
  readonly labelGap: number;
  /** How far a label too long for its room fades out, ending at its value; `labelGap` by default. */
  readonly fade?: number;
  /** Group columns allowed; `max` is clamped to the number of groups. */
  readonly min: number;
  readonly max: number;
  readonly labels: 'auto' | 'show' | 'hide';
  readonly layout: 'groups' | 'matrix';
  readonly groups: readonly FitGroup[];
  /** Matrix rows, for the matrix layout. */
  readonly rows?: readonly FitRow[];
}

/**
 * The widths, in px, of one group column: from `full` it shows its labels (those without room
 * fading), below it the column hides them. `full` is what the column's CSS compares its own width
 * with.
 */
export interface ColumnNeeds {
  readonly full: number;
  /** The width at which its longest label shows whole: spare room goes toward it. */
  readonly longest: number;
  /** The width at which its title shows whole. */
  readonly title: number;
}

export interface Fit {
  readonly layout: 'groups' | 'matrix';
  /** Group columns of the groups layout; the matrix always has one column per group. */
  readonly columns: number;
  /**
   * How labels show: one per group in the groups layout, each column deciding its own, or one
   * for the matrix's label column.
   */
  readonly labels: readonly LabelMode[];
  /**
   * Minimum width of each grid track: one per group column, or for the matrix the label column
   * followed by one per group.
   */
  readonly tracks: readonly number[];
  /**
   * The label thresholds each group's column uses, in group order (groups layout): its grid
   * column's, the strictest of the groups stacked in it.
   */
  readonly needs: readonly ColumnNeeds[];
  /** Nothing fitted: values may be cut. */
  readonly overflow: boolean;
}

/** A width within half a pixel of the room still fits: measured widths are fractional. */
const SLACK = 0.5;

/**
 * The label width a column is laid out for: the one two thirds of its labels fit within. A single
 * long label among short ones does not hide them all (it fades instead); when most labels are
 * long, they set the width.
 */
export function labelWidthFor(widths: readonly number[]): number {
  const shown = widths.filter((width) => width > 0).sort((a, b) => a - b);
  if (shown.length === 0) return 0;
  return shown[Math.ceil((shown.length * 2) / 3) - 1]!;
}

/**
 * The share of a label that must show for it to read: a column shows its labels while two thirds
 * of them show at least two thirds of their text, and hides them sooner than show less.
 */
const READABLE = 2 / 3;

/** The widest value of a group, with its inset: the room its column cannot give up. */
export function valueNeed(group: FitGroup): number {
  let value = 0;
  for (const stat of group.stats) if (stat.value > value) value = stat.value;
  return (group.inset ?? 0) + value;
}

/**
 * The thresholds of one group column (see `ColumnNeeds`). Each stat's label reads from the width
 * that holds its own value, the gap and two thirds of the label; the column shows its labels from
 * the width at which two thirds of them read. A long label, or a long value, is an outlier that
 * fades rather than hide the others.
 */
export function columnNeeds(group: FitGroup, labelGap: number, fade = labelGap): ColumnNeeds {
  const base = valueNeed(group);
  const inset = group.inset ?? 0;
  const reads = group.stats
    .filter((stat) => stat.full > 0)
    .map((stat) => inset + stat.value + labelGap + stat.full * READABLE);
  const full = Math.max(base, labelWidthFor(reads));
  let longest = full;
  for (const stat of group.stats)
    if (stat.full > 0)
      // Whole and clear of the fade.
      longest = Math.max(longest, inset + stat.value + Math.max(labelGap, fade) + stat.full);
  return { full, longest, title: group.title ?? 0 };
}

function total(tracks: readonly number[], gap: number): number {
  let sum = 0;
  for (const track of tracks) sum += track;
  return sum + Math.max(0, tracks.length - 1) * gap;
}

/**
 * The widths CSS grid gives tracks of `minmax(min, weight fr)`: free space shared by weight, a
 * track never below its minimum. The groups layout uses equal weights (`1fr`).
 */
export function shareTracks(
  mins: readonly number[],
  weights: readonly number[],
  space: number,
): number[] {
  const fixed = mins.map(() => false);
  for (;;) {
    let free = space;
    let weight = 0;
    mins.forEach((min, i) => {
      if (fixed[i]) free -= min;
      else weight += weights[i]!;
    });
    const unit = weight > 0 ? Math.max(0, free) / weight : 0;
    let changed = false;
    mins.forEach((min, i) => {
      if (!fixed[i] && weights[i]! * unit < min) {
        fixed[i] = true;
        changed = true;
      }
    });
    if (!changed) return mins.map((min, i) => (fixed[i] ? min : weights[i]! * unit));
  }
}

/** How a column of `width` shows its labels, by its thresholds and the `labels` option. */
export function labelModeAt(
  width: number,
  needs: ColumnNeeds,
  labels: FitInput['labels'],
): LabelMode {
  if (labels === 'hide') return 'hidden';
  if (labels === 'show' || width + SLACK >= needs.full) return 'shown';
  return 'hidden';
}

/**
 * The groups in `columns` grid columns (group i in column i % columns, as CSS places them): the
 * thresholds each column shares among the groups stacked in it, and the room each column holds.
 */
function columnsOf(
  input: FitInput,
  needs: readonly ColumnNeeds[],
  columns: number,
): { shared: ColumnNeeds[]; values: number[] } {
  const shared: ColumnNeeds[] = [];
  const values: number[] = [];
  for (let track = 0; track < columns; track++) {
    let full = 0;
    let longest = 0;
    let title = 0;
    let value = 0;
    for (let i = track; i < input.groups.length; i += columns) {
      full = Math.max(full, needs[i]!.full);
      longest = Math.max(longest, needs[i]!.longest);
      title = Math.max(title, needs[i]!.title);
      value = Math.max(value, valueNeed(input.groups[i]!));
    }
    // Groups stacked in one column take the strictest of their thresholds, so a column never
    // shows labels in one group and hides them in the next.
    shared.push({ full, longest, title });
    values.push(value);
  }
  return { shared, values };
}

function fitGroups(input: FitInput): Fit {
  const count = input.groups.length;
  const max = Math.max(1, Math.min(Math.floor(input.max), count));
  const min = Math.max(1, Math.min(Math.floor(input.min), max));
  const needs = input.groups.map((group) => columnNeeds(group, input.labelGap, input.fade));
  // What a column needs to keep: its labels, or with labels: 'hide' its values only.
  const keep = (layout: ReturnType<typeof columnsOf>) =>
    input.labels === 'hide' ? layout.values : layout.shared.map((need) => need.full);

  const fits = (each: number, of: (layout: ReturnType<typeof columnsOf>) => number[]) =>
    total(of(columnsOf(input, needs, each)), input.columnGap) <= input.width + SLACK;
  // The most columns in which every column has room for its labels; if none has, the fewest.
  // Whether a column count fits only gets harder as the block narrows, so narrowing never
  // brings columns back: groups that stacked stay stacked.
  let columns = min;
  for (let each = max; each > min; each--)
    if (fits(each, keep)) {
      columns = each;
      break;
    }
  // Values come first: when even they do not fit at the fewest columns (only a minimum above
  // one can do that, as stacked is the narrowest for values), the fewest columns that hold them.
  if (columns === min && !fits(min, (layout) => layout.values))
    for (let each = min + 1; each <= max; each++)
      if (fits(each, (layout) => layout.values)) {
        columns = each;
        break;
      }

  const { shared, values } = columnsOf(input, needs, columns);
  // Values come first: a column holds its values, and its labels give way. With labels: 'show'
  // they never hide, so it holds its labels too.
  const tracks = input.labels === 'show' ? shared.map((need) => need.full) : values.slice();
  if (total(tracks, input.columnGap) > input.width + SLACK)
    // Not even the values fit: they are cut, and every label hides.
    return {
      layout: 'groups',
      columns,
      labels: needs.map(() => 'hidden'),
      tracks,
      needs: input.groups.map((_, i) => shared[i % columns]!),
      overflow: true,
    };

  // Spare room goes first where it lets a column show its labels, cheapest first, then toward
  // what each column shows whole (its longest label, if it shows labels, and its title); CSS
  // shares what is left evenly (1fr).
  const space = input.width - (columns - 1) * input.columnGap;
  let used = tracks.reduce((sum, track) => sum + track, 0);
  if (input.labels === 'auto') {
    const order = shared
      .map((need, track) => ({ track, extra: need.full - tracks[track]! }))
      .filter((each) => each.extra > 0)
      .sort((a, b) => a.extra - b.extra);
    for (const { track, extra } of order) {
      if (used + extra > space + SLACK) continue;
      tracks[track] = tracks[track]! + extra;
      used += extra;
    }
  }
  shared.forEach((need, track) => {
    const labelled = labelModeAt(tracks[track]!, need, input.labels) === 'shown';
    const whole = Math.max(need.title, labelled ? need.longest : 0);
    const give = Math.min(Math.max(0, whole - tracks[track]!), Math.max(0, space - used));
    tracks[track] = tracks[track]! + give;
    used += give;
  });
  const widths = shareTracks(
    tracks,
    tracks.map(() => 1),
    space,
  );
  return {
    layout: 'groups',
    columns,
    labels: input.groups.map((_, i) =>
      labelModeAt(widths[i % columns]!, shared[i % columns]!, input.labels),
    ),
    tracks,
    needs: input.groups.map((_, i) => shared[i % columns]!),
    overflow: false,
  };
}

function matrixTracks(input: FitInput, mode: LabelMode): number[] {
  const rows = input.rows ?? [];
  const label = mode === 'hidden' ? 0 : labelWidthFor(rows.map((row) => row.full));
  const tracks = [label];
  for (const group of input.groups) {
    let value = 0;
    for (const stat of group.stats) value = Math.max(value, stat.value);
    tracks.push(value);
  }
  return tracks;
}

function matrixModes(input: FitInput): LabelMode[] {
  if (input.labels === 'hide') return ['hidden'];
  return input.labels === 'auto' ? ['shown', 'hidden'] : ['shown'];
}

/**
 * Chooses the layout for `width` from measured widths only (no layout reads).
 *
 * Groups take the most columns, up to `max`, in which every column has room for its labels (see
 * `ColumnNeeds`); if none has, the fewest, where each column shows or hides its labels by its own
 * width, values first. Narrowing never brings columns back. Spare width goes first where it lets
 * a column show labels, then toward each column's longest label and title, then evenly. The matrix
 * layout shows its label column, laid out for the label two thirds of the rows fit within (longer
 * ones fade), or hides it, and falls back to groups when even its values do not fit.
 */
export function fitStats(input: FitInput): Fit {
  if (input.groups.length === 0)
    return {
      layout: input.layout,
      columns: 0,
      labels: [],
      tracks: [],
      needs: [],
      overflow: false,
    };
  if (input.layout === 'matrix') {
    for (const labels of matrixModes(input)) {
      const tracks = matrixTracks(input, labels);
      const gaps =
        (tracks[0]! > 0 ? input.labelGap : 0) + (input.groups.length - 1) * input.columnGap;
      if (tracks.reduce((sum, track) => sum + track, 0) + gaps <= input.width + SLACK)
        return {
          layout: 'matrix',
          columns: input.groups.length,
          labels: [labels],
          tracks,
          needs: [],
          overflow: false,
        };
    }
  }
  return fitGroups(input);
}
