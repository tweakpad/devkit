import type { TrendOption } from '../core/trend.js';
import type { StatFormat, StatValue } from './format.js';

/** One value of a stat. A stat shows one value, or several joined by its `separator`. */
export interface StatPartParams {
  /**
   * The value: a function read at the block's `interval`, or a fixed value changed with
   * `StatApi.set()`.
   */
  value?: StatValue | (() => StatValue);
  /** How a number prints. */
  format?: StatFormat;
  /** Decimals of a number; see `format` for each format's default. */
  precision?: number;
  /** A unit after the value, separated by a space, such as `ms`. */
  unit?: string;
  /** Text before the value in place of the stat's separator, such as `' ('`. */
  before?: string;
  /** Text right after the value, such as `')'`. */
  after?: string;
  /**
   * Shows a secondary value in the label color.
   * @default false
   */
  muted?: boolean;
  /**
   * Shows the direction of the value's change, a rise green and a fall red: a preset's name
   * (`'ticker'`, `'steady'`, `'flash'`, `'tint'`) or options. Each read of the block's `interval`,
   * or each `StatApi.set()`, is one sample; with no change between samples, or one within the
   * `threshold`, none shows. Off by default.
   */
  trend?: TrendOption;
}

/** One labelled stat: a value or several (`parts`). */
export interface StatParams extends StatPartParams {
  /** The label, muted beside the value. When there is no room it hides and shows on hover. */
  label: string;
  /** The stat's name in `StatsApi.stat()` paths and its row in the matrix layout, in place of the label. */
  id?: string;
  /**
   * Several values in one stat, such as memory and count. They replace the single-value options
   * on the stat.
   */
  parts?: StatPartParams[];
  /**
   * Text between parts.
   * @default ' / '
   */
  separator?: string;
  /**
   * A sample of the widest text the value will show, such as `'0000 MB / 000'`, so the block keeps
   * room for it from the start. Without it, room grows with the widest value seen.
   */
  reserve?: string;
  /**
   * Starts the stat hidden.
   * @default false
   */
  hidden?: boolean;
}

/** A titled group of stats: a column of the block, or a column of the matrix layout. */
export interface StatsGroupParams {
  /** The heading, small and muted above the group (or above the column, in the matrix layout). */
  title?: string;
  /** The group's name in `StatsApi.group()` and `stat()` paths, in place of the title. */
  id?: string;
  /** The group's stats, top first. */
  stats: StatParams[];
  /**
   * Starts the group hidden.
   * @default false
   */
  hidden?: boolean;
}

/** The options of `addStats()` that apply whether it takes titled `groups` or untitled `stats`. */
export interface StatsCommonParams {
  /** The block's name in search. The block renders no heading of its own: put it in a folder for one. */
  title?: string;
  /** The block's name, in place of the title. */
  id?: string;
  /**
   * How often values are read: milliseconds between reads, `'frame'` for every frame or `'manual'`
   * for `refresh()` only. A glance needs no more than a few reads a second.
   * @default 250, or 'manual' when the pane's `refresh` is 'manual'
   */
  interval?: number | 'frame' | 'manual';
  /**
   * `'groups'` sets groups side by side, each a column of labels and values. `'matrix'` writes the
   * labels once, as rows, with a column for each group: for groups with the same stats.
   * @default 'groups'
   */
  layout?: 'groups' | 'matrix';
  /**
   * Group columns: a number for exactly that many, or a range. Within it, groups take as many
   * columns as have room for their labels.
   * @default { min: 1, max: groups.length }
   */
  columns?: number | { min?: number; max?: number };
  /**
   * `'auto'`: each column shows its labels while two thirds of them show two thirds of their
   * text (longer ones fade); groups sit in as many columns as have room for their labels, and
   * stack, never to return, as the block narrows. `'show'` keeps every column's labels (groups wrap instead),
   * `'hide'` always hides them. Hidden labels show on hover and stay readable to screen readers.
   * @default 'auto'
   */
  labels?: 'auto' | 'show' | 'hide';
  /**
   * Draws a guide line along each titled group's stats, as a folder draws one along its
   * controls, so they read as the group's items. The matrix layout has none.
   * @default true
   */
  guides?: boolean;
  /**
   * Starts the block hidden.
   * @default false
   */
  hidden?: boolean;
}

/** Options of `addStats()`: titled `groups`, or one untitled group of `stats`. */
export type StatsParams = StatsCommonParams &
  (
    | {
        /** Groups of stats, side by side when they fit. */
        groups: StatsGroupParams[];
        stats?: never;
      }
    | {
        /** The stats of one untitled group. */
        stats: StatParams[];
        groups?: never;
      }
  );
