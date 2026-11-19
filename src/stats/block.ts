import type { TpTooltip } from '@tweakpad/ui';
import type { Job, Sampler, Scheduler, Writer } from '../core/scheduler.js';
import { CHEVRON_CH, Trend, TrendMark } from '../core/trend.js';
import { fitStats, type Fit, type FitGroup, type FitRow, type FitStat } from './fit.js';
import { formatStat, numeric, type StatValue } from './format.js';
import type { StatParams, StatPartParams, StatsGroupParams } from './types.js';

/** Hover delay before a tooltip opens, unless one of the block is already open. */
const TOOLTIP_DELAY = 300;

/** One value of a stat: its text node, its chevron and its change trend. */
class Part {
  readonly element: HTMLSpanElement;
  readonly read: (() => StatValue) | null;
  readonly trend: Trend | null;
  readonly #text: Text;
  readonly #mark: TrendMark | null;
  /** Characters of the fixed text around the value (separator, `after`) and the chevron slot. */
  readonly #fixedChars: number;
  #raw: StatValue = undefined;
  #hasRaw = false;
  /** The value as shown, as a number: what the trend reads, so changes too small to print never count. */
  #shownValue = NaN;
  shown = '';
  dirty = false;

  constructor(
    readonly def: StatPartParams,
    before: string,
  ) {
    const value = def.value;
    this.read = typeof value === 'function' ? value : null;
    this.element = document.createElement('span');
    this.element.className = 'stat-part';
    if (def.muted) this.element.toggleAttribute('data-muted', true);
    if (before) this.element.append(separator(before));
    this.trend = Trend.from(def.trend);
    // The chevron follows its value (or leads it with `side: 'start'`), inside any `after` text.
    this.#mark = this.trend ? new TrendMark(this.trend, this.element) : null;
    const icon = this.#mark?.icon;
    this.#text = document.createTextNode('');
    if (icon && this.trend!.side === 'start') this.element.append(icon);
    this.element.append(this.#text);
    if (icon && this.trend!.side === 'end') this.element.append(icon);
    if (def.after) this.element.append(separator(def.after));
    this.#fixedChars = before.length + (def.after?.length ?? 0);
    if (typeof value !== 'function') this.accept(value);
  }

  get raw(): StatValue {
    return this.#raw;
  }

  /** Width of the part in ch of the value font. */
  get chars(): number {
    return this.#fixedChars + this.shown.length + (this.#mark?.icon ? CHEVRON_CH : 0);
  }

  /**
   * Takes one reading; true when the text or the chevron changes, and so a write is due. The
   * text follows every reading at once; the trend takes each one as a sample, changed or not.
   */
  accept(next: StatValue): boolean {
    let changed = false;
    if (!this.#hasRaw || !Object.is(next, this.#raw)) {
      this.#hasRaw = true;
      this.#raw = next;
      const text = formatStat(next, this.def.format, this.def.precision, this.def.unit);
      if (text !== this.shown) {
        this.shown = text;
        this.#shownValue = numeric(next);
        changed = true;
      }
    }
    if (this.trend?.push(this.#shownValue)) changed = true;
    if (changed) this.dirty = true;
    return changed;
  }

  /** Forgets the readings so far: the chevron clears, and the next ones start over. */
  resetTrend(): void {
    if (this.trend?.reset()) this.dirty = true;
  }

  write(): void {
    this.dirty = false;
    const changed = this.#text.data !== this.shown;
    if (changed) this.#text.data = this.shown;
    this.#mark?.paint(this.trend!, changed);
  }
}

function separator(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'stat-separator';
  span.textContent = text;
  return span;
}

/** One labelled stat. Its label and value elements move between layouts; they are never rebuilt. */
export class Stat {
  readonly parts: Part[];
  readonly label: HTMLSpanElement;
  readonly value: HTMLSpanElement;
  hidden: boolean;
  /** The widest value seen, in ch; the room the block keeps for it. */
  reserved: number;
  /**
   * Room after the value, in ch: a chevron's slot, kept by a stat without an end chevron in a
   * group that has some, so values line up at the end with or without one.
   */
  pad = 0;
  fullWidth = 0;

  constructor(
    readonly params: StatParams,
    readonly group: Group,
  ) {
    this.hidden = params.hidden ?? false;
    const defs = params.parts?.length ? params.parts : [params];
    const glue = params.separator ?? ' / ';
    this.parts = defs.map(
      (def, i) => new Part(def, i === 0 ? (def.before ?? '') : (def.before ?? glue)),
    );
    this.label = document.createElement('span');
    this.label.className = 'stat-label';
    this.value = document.createElement('span');
    this.value.className = 'stat-value';
    for (const part of this.parts) this.value.append(part.element);
    this.reserved = params.reserve?.length ?? 0;
    this.setLabel(params.label);
    for (const part of this.parts) part.write();
    if (!this.grow()) this.value.style.setProperty('--tweak-stat-width', `${this.reserved}ch`);
  }

  /** The stat's name in paths and its matrix row. */
  get key(): string {
    return this.params.id ?? this.params.label;
  }

  get labelText(): string {
    return this.label.textContent ?? '';
  }

  setLabel(label: string): void {
    this.label.textContent = label;
  }

  /** Whether the value ends with a trend icon: its last part has one on the end side. */
  get endsWithChevron(): boolean {
    const trend = this.parts[this.parts.length - 1]!.trend;
    return trend !== null && trend.icon !== null && trend.side === 'end';
  }

  /** Keeps `pad` ch after the value, inside its box. */
  setPad(pad: number): void {
    if (pad === this.pad) return;
    this.pad = pad;
    this.value.style.paddingInlineEnd = pad ? `${pad}ch` : '';
    this.value.style.setProperty('--tweak-stat-width', `${this.reserved + pad}ch`);
  }

  /** The value as shown, every part with its separators. */
  get text(): string {
    return this.value.textContent ?? '';
  }

  /**
   * Widens the kept room to the current value; true when it grew. The value box takes exactly
   * that room, so it can contain its own layout: a new value relays out only its box.
   */
  grow(): boolean {
    let chars = 0;
    for (const part of this.parts) chars += part.chars;
    if (chars <= this.reserved) return false;
    this.reserved = chars;
    this.value.style.setProperty('--tweak-stat-width', `${chars + this.pad}ch`);
    return true;
  }
}

/** A titled group of stats. */
export class Group {
  readonly stats: Stat[] = [];
  title: string;
  hidden: boolean;
  /** Width of the title as drawn, in px; 0 untitled. */
  titleWidth = 0;

  constructor(readonly params: StatsGroupParams) {
    this.title = params.title ?? '';
    this.hidden = params.hidden ?? false;
    for (const stat of params.stats) this.stats.push(new Stat(stat, this));
    this.alignChevrons();
  }

  /**
   * When some stats end with a chevron, the others keep its slot after their value, so the
   * group's values (a matrix column's, too) line up at the end.
   */
  alignChevrons(): void {
    const any = this.stats.some((stat) => stat.endsWithChevron);
    for (const stat of this.stats) stat.setPad(any && !stat.endsWithChevron ? CHEVRON_CH : 0);
  }

  get key(): string {
    return this.params.id ?? this.params.title ?? '';
  }
}

export interface StatsBlockOptions {
  readonly scheduler: Scheduler;
  /** Milliseconds between reads; 0 every frame, -1 only on refresh. */
  readonly interval: number;
  readonly layout: 'groups' | 'matrix';
  readonly min: number;
  readonly max: number | undefined;
  readonly labels: 'auto' | 'show' | 'hide';
  /** Whether a titled group draws a guide line along its stats, as a folder does. */
  readonly guides: boolean;
  /** The block's name, for its accessible name and the overflow warning. */
  readonly name: string;
}

interface Measures {
  ch: number;
  columnGap: number;
  labelGap: number;
  /** How far a label too long for its room fades out. */
  fade: number;
  /** Room a titled group's guide takes before its stats; 0 without guides. */
  guide: number;
}

let canvas: CanvasRenderingContext2D | null | undefined;
function textWidth(font: string, text: string): number {
  if (!text) return 0;
  canvas ??= document.createElement('canvas').getContext('2d');
  if (!canvas) return text.length * 7;
  canvas.font = font;
  return canvas.measureText(text).width;
}

function fontOf(element: Element): string {
  const style = getComputedStyle(element);
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

/** Blocks observed for their width, and re-measured when web fonts finish loading. */
const blocks = new Map<Element, StatsBlock>();
let resizeObserver: ResizeObserver | undefined;
let fontsWatched = false;

function observe(block: StatsBlock, root: Element): void {
  resizeObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) blocks.get(entry.target)?.resize(entry.contentRect.width);
  });
  if (!fontsWatched && typeof document !== 'undefined' && document.fonts) {
    fontsWatched = true;
    document.fonts.addEventListener('loadingdone', () => {
      for (const each of blocks.values()) each.remeasure();
    });
  }
  blocks.set(root, block);
  resizeObserver.observe(root);
}

function unobserve(root: Element): void {
  if (!blocks.delete(root)) return;
  resizeObserver?.unobserve(root);
}

/**
 * A block of stats: plain DOM whose value text nodes are written in place, sampled by the shared
 * scheduler only while visible, and laid out from measured widths. Labels are measured once (and
 * again when fonts load or a label changes); values are monospaced, so their width is their length
 * in ch, kept at the widest seen. Sampling never reads layout, and only a value outgrowing its room
 * or a width change refits the block.
 */
export class StatsBlock {
  /** The block: the grid root, then the tooltip once it is first needed. */
  readonly element: HTMLDivElement;
  readonly root: HTMLDivElement;
  readonly groups: Group[];
  readonly #options: StatsBlockOptions;
  readonly #probe: HTMLSpanElement;
  readonly #probeLabel: HTMLSpanElement;
  readonly #probeTitle: HTMLSpanElement;
  readonly #probeValue: HTMLSpanElement;
  readonly #sampler: Sampler = { slot: -1, sample: (now) => this.#sample(now) };
  readonly #writer: Writer = { queued: false, heavy: false, write: () => this.#write() };
  readonly #measureJob: Job = { queued: false, run: () => this.#measure() };
  #interval: number;
  #due = 0;
  #visible = false;
  #disposed = false;
  #measures: Measures | null = null;
  #width = 0;
  #fit: Fit | null = null;
  /** The group sections of the groups layout, in visible group order; empty for the matrix. */
  #sections: HTMLElement[] = [];
  #structure: 'groups' | 'matrix' | null = null;
  #cols: HTMLTableColElement[] = [];
  #warned = false;
  #tooltip: TpTooltip | null = null;
  #tipLines: HTMLDivElement | null = null;
  /** What the tooltip shows: a stat, or a group title cut short. */
  #tip: Stat | HTMLElement | null = null;
  #tipTimer: ReturnType<typeof setTimeout> | undefined;
  #focusIndex = -1;

  constructor(groups: readonly StatsGroupParams[], options: StatsBlockOptions) {
    this.#options = options;
    this.#interval = options.interval;
    this.groups = groups.map((group) => new Group(group));
    this.element = document.createElement('div');
    this.element.className = 'stats-block';
    this.root = document.createElement('div');
    this.root.className = 'stats';
    this.root.setAttribute('role', 'group');
    if (options.name) this.root.setAttribute('aria-label', options.name);
    // Styled like a label and a value, so their fonts can be read whatever the layout shows.
    this.#probe = document.createElement('span');
    this.#probe.className = 'stats-probe';
    this.#probe.setAttribute('aria-hidden', 'true');
    this.#probeLabel = document.createElement('span');
    this.#probeLabel.className = 'stat-label';
    this.#probeTitle = document.createElement('span');
    this.#probeTitle.className = 'stats-title';
    this.#probeValue = document.createElement('span');
    this.#probeValue.className = 'stat-value';
    this.#probe.append(this.#probeLabel, this.#probeTitle, this.#probeValue);
    this.element.append(this.root);
    this.#build(options.layout);
    this.root.addEventListener('pointerover', this.#onPointerOver);
    this.root.addEventListener('pointerleave', this.#onPointerLeave);
    this.root.addEventListener('focus', this.#onFocus);
    this.root.addEventListener('blur', this.#onBlur);
    this.root.addEventListener('keydown', this.#onKeyDown);
  }

  /** The current layout decision; null until the block has been measured on screen. */
  get fit(): Fit | null {
    return this.#fit;
  }

  get interval(): number {
    return this.#interval;
  }

  set interval(interval: number) {
    this.#interval = interval;
    this.#due = 0;
    this.#updateSampling();
  }

  get #reads(): boolean {
    for (const group of this.groups)
      for (const stat of group.stats) for (const part of stat.parts) if (part.read) return true;
    return false;
  }

  setVisible(visible: boolean): void {
    if (this.#disposed || visible === this.#visible) return;
    this.#visible = visible;
    if (visible) {
      // Read at once on return: the values (and chevrons) catch up with what changed meanwhile.
      this.#due = 0;
      if (!this.#measures) this.#options.scheduler.enqueueJob(this.#measureJob);
    } else {
      this.#closeTooltip();
    }
    this.#updateSampling();
  }

  #updateSampling(): void {
    const scheduler = this.#options.scheduler;
    if (this.#visible && this.#interval >= 0 && this.#reads) scheduler.activate(this.#sampler);
    else scheduler.deactivate(this.#sampler);
  }

  /** Reads every value now, whatever the interval. */
  refresh(): void {
    if (this.#disposed) return;
    this.#readAll();
  }

  #sample(now: number): void {
    if (this.#interval > 0) {
      if (now < this.#due) return;
      this.#due = now + this.#interval;
    }
    this.#readAll();
  }

  #readAll(): void {
    let dirty = false;
    for (const group of this.groups) {
      if (group.hidden) continue;
      for (const stat of group.stats) {
        if (stat.hidden) continue;
        for (const part of stat.parts) {
          if (part.read && part.accept(part.read())) dirty = true;
        }
      }
    }
    if (dirty) this.#options.scheduler.enqueueWrite(this.#writer);
  }

  /** Values pushed with `StatApi.set()`. */
  set(stat: Stat, values: readonly StatValue[]): void {
    let dirty = false;
    stat.parts.forEach((part, i) => {
      if (i < values.length && part.accept(values[i])) dirty = true;
    });
    if (dirty) this.#options.scheduler.enqueueWrite(this.#writer);
  }

  resetTrend(stat: Stat): void {
    for (const part of stat.parts) part.resetTrend();
    this.#options.scheduler.enqueueWrite(this.#writer);
  }

  #write(): void {
    if (this.#disposed) return;
    let grew = false;
    let tip = false;
    for (const group of this.groups)
      for (const stat of group.stats) {
        let changed = false;
        for (const part of stat.parts)
          if (part.dirty) {
            part.write();
            changed = true;
          }
        if (!changed) continue;
        if (stat.grow()) grew = true;
        if (stat === this.#tip) tip = true;
      }
    if (grew) this.#refit();
    if (tip) this.#renderTooltip();
  }

  /** The stat at `path` (`'group/stat'`) or with that key in any group. */
  find(path: string): Stat | undefined {
    const slash = path.indexOf('/');
    if (slash !== -1) {
      const groupKey = path.slice(0, slash);
      const statKey = path.slice(slash + 1);
      const group = this.groups.find((each) => each.key === groupKey);
      const found = group?.stats.find((stat) => stat.key === statKey);
      if (found) return found;
    }
    for (const group of this.groups) {
      const found = group.stats.find((stat) => stat.key === path);
      if (found) return found;
    }
    return undefined;
  }

  addGroup(params: StatsGroupParams, index = this.groups.length): Group {
    const group = new Group(params);
    this.groups.splice(clampIndex(index, this.groups.length), 0, group);
    this.structureChanged(true);
    return group;
  }

  addStat(group: Group, params: StatParams, index = group.stats.length): Stat {
    const stat = new Stat(params, group);
    group.stats.splice(clampIndex(index, group.stats.length), 0, stat);
    this.structureChanged(true);
    return stat;
  }

  removeGroup(group: Group): void {
    const index = this.groups.indexOf(group);
    if (index === -1) return;
    this.groups.splice(index, 1);
    this.structureChanged(false);
  }

  removeStat(stat: Stat): void {
    const index = stat.group.stats.indexOf(stat);
    if (index === -1) return;
    stat.group.stats.splice(index, 1);
    this.structureChanged(false);
  }

  /**
   * Stats or groups came, went, hid or were renamed: rebuild the layout from the same label and
   * value elements, re-measure labels when asked, and refit.
   */
  structureChanged(remeasure: boolean): void {
    if (this.#disposed) return;
    this.#closeTooltip();
    this.#build(this.#structure ?? this.#options.layout);
    if (remeasure && this.#measures) this.#measureLabels();
    this.#updateSampling();
    this.#fit = null;
    this.#refit();
    if (this.#visible) this.#readAll();
  }

  /** Fonts changed: measure again. */
  remeasure(): void {
    if (!this.#measures || this.#disposed) return;
    this.#measures = null;
    if (this.#visible) this.#measure();
  }

  resize(width: number): void {
    if (width === this.#width) return;
    this.#width = width;
    const fit = this.#fit;
    this.#refit();
    // The same fit at a new width: the matrix spreads its spare room again.
    if (fit === this.#fit && fit?.layout === 'matrix') this.#sizeMatrix();
  }

  /**
   * Sizes the matrix's columns (fixed matrix layout): the label column to the label most rows fit
   * within, growing toward its longest with spare room, each value column to its widest value
   * kept, and the rest of the spare room shared by the value columns. Values never resize a
   * column as they change, and the columns line up across rows.
   */
  #sizeMatrix(): void {
    const fit = this.#fit;
    const measures = this.#measures;
    if (!fit || fit.layout !== 'matrix' || !measures) return;
    let label = fit.tracks[0]! > 0 ? Math.ceil(fit.tracks[0]! + measures.labelGap) : 0;
    const values = fit.tracks
      .slice(1)
      .map((track, i) => Math.ceil(track + (i > 0 ? measures.columnGap : 0)));
    const used = values.reduce((sum, value) => sum + value, label);
    let free = Math.max(0, this.#width - used);
    // The label column is laid out for most labels; spare room goes first to its longest, so a
    // label fades only when the room is truly short, then to the value columns.
    const mode = fit.labels[0];
    if (label > 0 && mode !== 'hidden') {
      let longest = 0;
      for (const stat of this.#rows(this.#visibleGroups()).values())
        longest = Math.max(longest, stat.fullWidth);
      // Toward the longest label whole and clear of the fade.
      const reach = Math.max(measures.labelGap, measures.fade);
      const grow = Math.min(free, Math.max(0, Math.ceil(longest + reach) - label));
      label += grow;
      free -= grow;
    }
    const spare = values.length ? Math.floor(free / values.length) : 0;
    this.#cols.forEach((col, i) => {
      col.style.inlineSize = `${i === 0 ? label : values[i - 1]! + spare}px`;
    });
  }

  #measure(): void {
    if (this.#disposed || !this.#visible || !this.root.isConnected) return;
    this.root.append(this.#probe);
    const probe = getComputedStyle(this.#probe);
    this.#measures = {
      ch: textWidth(fontOf(this.#probeValue), '0') || 8,
      labelGap: parseFloat(probe.paddingInlineStart) || 0,
      fade: parseFloat(probe.marginInlineEnd) || 0,
      columnGap: parseFloat(probe.paddingInlineEnd) || 0,
      guide: this.#options.guides ? parseFloat(probe.marginInlineStart) || 0 : 0,
    };
    this.#measureLabels();
    this.#probe.remove();
    if (!blocks.has(this.root)) observe(this, this.root);
    else this.#refit();
  }

  #measureLabels(): void {
    this.root.append(this.#probe);
    const font = fontOf(this.#probeLabel);
    const titleFont = fontOf(this.#probeTitle);
    const tracking = parseFloat(getComputedStyle(this.#probeTitle).letterSpacing) || 0;
    this.#probe.remove();
    for (const group of this.groups) {
      // Titles are drawn in capitals, spaced out.
      const title = group.title.toUpperCase();
      group.titleWidth = title
        ? Math.ceil(textWidth(titleFont, title) + tracking * title.length)
        : 0;
      for (const stat of group.stats) {
        // Rounded up: canvas and layout disagree in fractions of a pixel, and a label a hair
        // too wide for its room is cut.
        stat.fullWidth = Math.ceil(textWidth(font, stat.labelText));
      }
    }
  }

  #visibleGroups(): Group[] {
    return this.groups.filter((group) => !group.hidden && group.stats.some((stat) => !stat.hidden));
  }

  /** Visible keys of the matrix layout in first-seen order, each with the stat that labels it. */
  #rows(groups: readonly Group[]): Map<string, Stat> {
    const rows = new Map<string, Stat>();
    for (const group of groups)
      for (const stat of group.stats)
        if (!stat.hidden && !rows.has(stat.key)) rows.set(stat.key, stat);
    return rows;
  }

  #refit(): void {
    const measures = this.#measures;
    if (!measures || this.#width <= 0 || this.#disposed) return;
    const groups = this.#visibleGroups();
    const fitGroups: FitGroup[] = groups.map((group) => ({
      // In the groups layout, a titled group's guide takes room before its stats; a matrix has none.
      inset: group.title ? measures.guide : 0,
      title: group.titleWidth,
      stats: group.stats
        .filter((stat) => !stat.hidden)
        .map<FitStat>((stat) => ({
          full: stat.fullWidth,
          value: (stat.reserved + stat.pad) * measures.ch,
        })),
    }));
    const rows: FitRow[] = [];
    if (this.#options.layout === 'matrix')
      for (const stat of this.#rows(groups).values()) rows.push({ full: stat.fullWidth });
    const columns = this.#options.max ?? groups.length;
    const fit = fitStats({
      width: this.#width,
      columnGap: measures.columnGap,
      labelGap: measures.labelGap,
      fade: measures.fade,
      min: this.#options.min,
      max: columns,
      labels: this.#options.labels,
      layout: this.#options.layout,
      groups: fitGroups,
      rows,
    });
    if (this.#fit && sameFit(this.#fit, fit)) return;
    this.#fit = fit;
    this.#apply(fit);
  }

  #apply(fit: Fit): void {
    if (fit.layout !== this.#structure) this.#build(fit.layout);
    const root = this.root;
    root.toggleAttribute('data-overflow', fit.overflow);
    if (fit.layout === 'groups') {
      // The matrix's label column is laid out here; a group column decides its own, in CSS.
      root.removeAttribute('data-labels');
      root.style.gridTemplateColumns = fit.overflow
        ? `repeat(${fit.columns}, minmax(0, 1fr))`
        : fit.tracks.map((track) => `minmax(${Math.ceil(track)}px, 1fr)`).join(' ');
      this.#setThresholds(fit);
    } else {
      root.dataset.labels = fit.labels[0]!;
      root.style.gridTemplateColumns = '';
      this.#sizeMatrix();
    }
    // Without labels the cells are reached from the keyboard, for the tooltips that name them.
    const reachable = fit.labels.includes('hidden');
    if (reachable) root.tabIndex = 0;
    else root.removeAttribute('tabindex');
    if (fit.overflow && !this.#warned) {
      this.#warned = true;
      console.warn(
        `devkit: the stats ${this.#options.name ? `"${this.#options.name}" ` : ''}do not fit their width even without labels; values are cut`,
      );
    }
    if (this.#tip) this.#renderTooltip();
  }

  /**
   * Gives each group column the width its CSS shows its labels from (see ColumnNeeds), as a
   * container width in px: --tweak-stats-full. Written only when it changes, which is when labels
   * are measured or a value grows.
   */
  #setThresholds(fit: Fit): void {
    const labels = this.#options.labels;
    this.#sections.forEach((section, i) => {
      const needs = fit.needs[i];
      if (!needs) return;
      // With labels: 'hide', or values cut short (nothing fits), every column hides its labels.
      const hide = labels === 'hide' || fit.overflow;
      const full = hide ? 1e6 : labels === 'show' ? 0 : Math.ceil(needs.full);
      // Without labels, values align to the start of the column (see .stats-group[data-bare]).
      section.toggleAttribute('data-bare', hide || fit.labels[i] === 'hidden');
      const style = section.style;
      if (style.getPropertyValue('--tweak-stats-full') !== `${full}px`)
        style.setProperty('--tweak-stats-full', `${full}px`);
    });
  }

  /** Lays the stats out as groups (sections of rows) or as one matrix, reusing their elements. */
  #build(layout: 'groups' | 'matrix'): void {
    this.#structure = layout;
    for (const group of this.groups) group.alignChevrons();
    this.root.dataset.layout = layout;
    const groups = this.#visibleGroups();
    const titled = groups.some((group) => group.title);
    this.#cols = [];
    let index = 0;
    if (layout === 'groups') {
      const sections = groups.map((group, column) => {
        let line = 0;
        const section = document.createElement('section');
        section.className = 'stats-group';
        // A titled group's stats hang from a guide line, as a folder's controls do.
        if (group.title && this.#options.guides) section.toggleAttribute('data-guide', true);
        if (titled) {
          const title = document.createElement('div');
          title.className = 'stats-title';
          title.textContent = group.title;
          // An untitled group beside titled ones keeps the row so its stats line up.
          if (!group.title) title.setAttribute('aria-hidden', 'true');
          section.append(title);
        }
        const list = document.createElement('dl');
        list.className = 'stats-list';
        for (const stat of group.stats) {
          if (stat.hidden) continue;
          const row = document.createElement('div');
          row.className = 'stat';
          row.dataset.stat = String(index++);
          row.dataset.col = String(column);
          row.dataset.row = String(line++);
          const term = document.createElement('dt');
          term.append(stat.label);
          const detail = document.createElement('dd');
          detail.append(stat.value);
          row.append(term, detail);
          list.append(row);
        }
        section.append(list);
        return section;
      });
      this.#sections = sections;
      this.root.replaceChildren(...sections);
      return;
    }
    this.#sections = [];
    const matrix = document.createElement('table');
    matrix.className = 'stats-matrix';
    const colgroup = document.createElement('colgroup');
    for (let i = 0; i <= groups.length; i++) {
      const col = document.createElement('col');
      colgroup.append(col);
      this.#cols.push(col);
    }
    matrix.append(colgroup);
    if (titled) {
      const head = document.createElement('thead');
      const row = document.createElement('tr');
      row.append(document.createElement('td'));
      for (const group of groups) {
        const th = document.createElement('th');
        th.scope = 'col';
        th.className = 'stats-title';
        th.textContent = group.title;
        row.append(th);
      }
      head.append(row);
      matrix.append(head);
    }
    const body = document.createElement('tbody');
    let line = 0;
    for (const [key, labelled] of this.#rows(groups)) {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.append(labelled.label);
      row.append(th);
      groups.forEach((group, column) => {
        const td = document.createElement('td');
        const stat = group.stats.find((each) => !each.hidden && each.key === key);
        if (stat) {
          td.append(stat.value);
          td.dataset.stat = String(index++);
          td.dataset.col = String(column);
          td.dataset.row = String(line);
        }
        row.append(td);
      });
      line++;
      body.append(row);
    }
    matrix.append(body);
    this.root.replaceChildren(matrix);
  }

  /** The cells that carry a stat, in reading order. */
  #cells(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>('[data-stat]')];
  }

  #statOf(cell: Element): Stat | null {
    const value = cell.querySelector('.stat-value');
    if (!value) return null;
    for (const group of this.groups)
      for (const stat of group.stats) if (stat.value === value) return stat;
    return null;
  }

  // ---- Tooltip: one per block, anchored to the hovered or focused cell -------------------------

  /**
   * What the tooltip says about `stat`: only its label, with its group, and only while the label
   * does not show in full (its column hid labels, or it fades into its value). A tooltip never
   * repeats a value. Read on hover or focus only.
   */
  tooltipLines(stat: Stat): string[] {
    // A label shows unless its column hid it (no width) or it fades into its value (cut short).
    const slot = stat.label.parentElement;
    if (!slot || (slot.clientWidth > 0 && slot.scrollWidth <= slot.clientWidth + 1)) return [];
    const title = stat.group.title;
    return [title ? `${title} · ${stat.labelText}` : stat.labelText];
  }

  #onPointerOver = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    const target = event.target as Element;
    const cell = target.closest?.('[data-stat]');
    const stat = cell && this.root.contains(cell) ? this.#statOf(cell) : null;
    if (stat && cell) {
      this.#scheduleTooltip(stat, cell as HTMLElement);
      return;
    }
    const heading = target.closest?.('.stats-title');
    this.#scheduleTooltip(heading instanceof HTMLElement ? heading : null, heading as HTMLElement);
  };

  #onPointerLeave = (): void => {
    if (this.#focusIndex === -1) this.#scheduleTooltip(null, null);
  };

  #onFocus = (): void => {
    const cells = this.#cells();
    if (cells.length === 0) return;
    this.#moveFocus(cells, Math.max(0, Math.min(this.#focusIndex, cells.length - 1)));
  };

  #onBlur = (): void => {
    for (const cell of this.#cells()) cell.removeAttribute('data-focused');
    this.#focusIndex = -1;
    this.#scheduleTooltip(null, null);
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    const cells = this.#cells();
    if (cells.length === 0) return;
    const current = cells[this.#focusIndex];
    const col = Number(current?.dataset.col ?? 0);
    const row = Number(current?.dataset.row ?? 0);
    /** The index of the cell at a column and row, or -1. */
    const at = (c: number, r: number): number =>
      cells.findIndex((cell) => cell.dataset.col === String(c) && cell.dataset.row === String(r));
    const inColumn = (c: number): HTMLElement[] =>
      cells.filter((cell) => cell.dataset.col === String(c));
    let next = -1;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        // The next filled cell down or up the column; a matrix's column may have gaps.
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const column = inColumn(col);
        const rows = column.map((cell) => Number(cell.dataset.row));
        const target = step > 0 ? rows.find((r) => r > row) : rows.reverse().find((r) => r < row);
        if (target !== undefined) next = at(col, target);
        break;
      }
      case 'ArrowRight':
      case 'ArrowLeft': {
        // The next column with a cell, at the nearest row.
        const step = event.key === 'ArrowRight' ? 1 : -1;
        for (let c = col + step; next === -1 && inColumn(c).length > 0; c += step) {
          let best = -1;
          for (const cell of inColumn(c)) {
            const r = Number(cell.dataset.row);
            if (best === -1 || Math.abs(r - row) < Math.abs(Number(cells[best]!.dataset.row) - row))
              best = cells.indexOf(cell);
          }
          next = best;
        }
        break;
      }
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = cells.length - 1;
        break;
      case 'Escape':
        this.#closeTooltip();
        return;
      default:
        return;
    }
    event.preventDefault();
    if (next !== -1) this.#moveFocus(cells, next);
  };

  #moveFocus(cells: HTMLElement[], index: number): void {
    cells[this.#focusIndex]?.removeAttribute('data-focused');
    this.#focusIndex = index;
    const cell = cells[index]!;
    cell.toggleAttribute('data-focused', true);
    const stat = this.#statOf(cell);
    if (stat) this.#openTooltip(stat, cell);
  }

  /** The tooltip's lines for a stat, or a title's full text when it is cut short. */
  #linesOf(subject: Stat | HTMLElement): string[] {
    if (subject instanceof Stat) return this.tooltipLines(subject);
    // A layout read, on hover only.
    return subject.scrollWidth > subject.clientWidth ? [subject.textContent ?? ''] : [];
  }

  #scheduleTooltip(subject: Stat | HTMLElement | null, anchor: HTMLElement | null): void {
    clearTimeout(this.#tipTimer);
    if (!subject || !anchor || this.#linesOf(subject).length === 0) {
      this.#closeTooltip();
      return;
    }
    if (this.#tip === subject) return;
    // Moving between cells of an open tooltip switches at once.
    if (this.#tip) this.#openTooltip(subject, anchor);
    else this.#tipTimer = setTimeout(() => this.#openTooltip(subject, anchor), TOOLTIP_DELAY);
  }

  #openTooltip(subject: Stat | HTMLElement, anchor: HTMLElement): void {
    if (this.#disposed || !anchor.isConnected) return;
    if (!this.#tooltip) {
      const tooltip = document.createElement('tp-tooltip') as TpTooltip;
      tooltip.className = 'stats-tooltip';
      tooltip.describes = 'none';
      tooltip.wrap = true;
      tooltip.maxWidth = '16rem';
      tooltip.addEventListener('tp-open-change', (event) => {
        if (!(event as CustomEvent<{ open: boolean }>).detail.open) this.#closeTooltip();
      });
      this.#tipLines = document.createElement('div');
      this.#tipLines.className = 'stats-tip';
      tooltip.append(this.#tipLines);
      this.element.append(tooltip);
      this.#tooltip = tooltip;
    }
    this.#tip = subject;
    this.#renderTooltip();
    if (!this.#tip) return;
    (this.#tooltip as unknown as { anchor: Element }).anchor = anchor;
    this.#tooltip.open = true;
  }

  #renderTooltip(): void {
    const subject = this.#tip;
    if (!subject || !this.#tipLines) return;
    const lines = this.#linesOf(subject);
    if (lines.length === 0) {
      this.#closeTooltip();
      return;
    }
    const children = this.#tipLines.children;
    lines.forEach((line, i) => {
      let element = children[i] as HTMLDivElement | undefined;
      if (!element) {
        element = document.createElement('div');
        this.#tipLines!.append(element);
      }
      if (element.textContent !== line) element.textContent = line;
    });
    while (children.length > lines.length) children[children.length - 1]!.remove();
  }

  #closeTooltip(): void {
    clearTimeout(this.#tipTimer);
    this.#tip = null;
    if (this.#tooltip?.open) this.#tooltip.open = false;
  }

  /** The stat the tooltip shows, for checks. */
  get tooltipStat(): Stat | null {
    return this.#tip instanceof Stat ? this.#tip : null;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#closeTooltip();
    this.#disposed = true;
    this.#options.scheduler.deactivate(this.#sampler);
    unobserve(this.root);
    this.#tooltip?.remove();
  }
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(Math.floor(index), length));
}

function sameFit(a: Fit, b: Fit): boolean {
  if (
    a.layout !== b.layout ||
    a.columns !== b.columns ||
    a.overflow !== b.overflow ||
    a.tracks.length !== b.tracks.length ||
    a.labels.length !== b.labels.length ||
    a.needs.length !== b.needs.length
  )
    return false;
  return (
    a.tracks.every((track, i) => Math.ceil(track) === Math.ceil(b.tracks[i]!)) &&
    a.labels.every((mode, i) => mode === b.labels[i]) &&
    a.needs.every((need, i) => Math.ceil(need.full) === Math.ceil(b.needs[i]!.full))
  );
}
