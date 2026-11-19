/**
 * How a value shows its change, shared by stats and monitors: a preset's name, or the options in
 * full (which can start from a preset).
 */
export type TrendOption = TrendPreset | TrendParams;

/**
 * A named set of trend options:
 * - `'ticker'`: an arrow that follows every change;
 * - `'steady'`: an arrow comparing averages of 8 readings, so noise shows none;
 * - `'flash'`: no icon, the value flashes green or red on each change; for a value inline with
 *   others, where an icon would leave a gap when it is off;
 * - `'tint'`: no icon, the value stays green or red while the trend shows.
 */
export type TrendPreset = 'ticker' | 'steady' | 'flash' | 'tint';

const PRESETS: Record<TrendPreset, TrendParams> = {
  ticker: {},
  steady: { samples: 8 },
  flash: { icon: false, color: 'flash' },
  tint: { icon: false, color: 'sustain' },
};

/** How a value shows its change. Every option counts in samples, never in time. */
export interface TrendParams {
  /** The preset these options start from; the options given here override it. */
  preset?: TrendPreset;
  /**
   * Which way is better, for the chevron's color: `'higher'` shows a rise green and a fall red, as
   * a ticker does; `'lower'` swaps them, for a value where less is better.
   * @default 'higher'
   */
  better?: 'higher' | 'lower';
  /**
   * The mark beside the value: `'arrow'` (arrow-up and arrow-down), `'arrow-diagonal'`
   * (arrow-up-right and arrow-down-right), `'chevron'`, or `'triangle'`, filled with sharp corners.
   * `false` shows no mark and keeps no room for one: with `color`, the value's color alone shows
   * the change.
   * @default 'arrow'
   */
  icon?: TrendIcon | false;
  /**
   * Colors the value itself green or red, with the icon or without it (`icon: false`).
   * `'sustain'` (or `true`) keeps the color while the trend shows, in step with the icon;
   * `'flash'` colors the value on each change, as a ticker does, then restores it. The flash lasts
   * `--tweak-trend-flash` (0.5s by default).
   * @default false
   */
  color?: boolean | 'sustain' | 'flash';
  /**
   * Fades the icon and the value's color in and out instead of switching them at once, and a flash
   * fades out rather than ending at once.
   * @default false
   */
  fade?: boolean;
  /**
   * Where the chevron sits: after the value, or before it. Its slot is kept either way, so a value
   * never shifts when it shows. Before the value, digits also line up with values that have no
   * chevron.
   * @default 'end'
   */
  side?: 'end' | 'start';
  /**
   * Readings on each side of the comparison. 1 compares each reading with the one before, so the
   * chevron follows every change. More compares the average of the last `samples` readings with
   * the average of the `samples` before, and shows a chevron only when the difference stands out
   * from the readings' own noise (see `deviations`): noise shows none, and the more samples, the
   * steadier it gets. No chevron shows until `2 × samples` readings have been taken. The value
   * itself always shows at once.
   * @default 1
   */
  samples?: number;
  /**
   * How far the averages must differ to show a chevron, in standard errors of their difference:
   * how much they differ by chance, from the spread of the readings. 3 hides nearly all noise; 2
   * shows changes sooner and noise more often; 0 shows any difference of the averages. Once a
   * chevron shows, it stays until the difference falls below half of this. With `samples: 1`
   * there is no spread to measure, and it has no effect.
   * @default 3
   */
  deviations?: number;
  /**
   * The change no chevron is shown for: a change of at most this much shows none, however clear.
   * A number in the value's units, or a percentage of the earlier average such as `'2%'`.
   * @default 0
   */
  threshold?: number | `${number}%`;
}

/** The mark a trend shows beside its value. */
export type TrendIcon = 'arrow' | 'arrow-diagonal' | 'chevron' | 'triangle';

/** The direction a chevron shows: up, down, or none. */
export type TrendDirection = -1 | 0 | 1;

/** Chevron attribute values by `better`, then by direction + 1. */
const TOKENS = {
  higher: ['down-worse', '', 'up-better'],
  lower: ['down-better', '', 'up-worse'],
} as const;

/** Readings averaged on each side are capped, so a large `samples` cannot cost much memory. */
const MAX_SAMPLES = 256;

/**
 * The direction of a value's change over its last readings. Each `push` is one reading of the
 * value as shown.
 *
 * With one sample a side it compares each reading with the one before. With more, it compares
 * the average of the newest `samples` readings with the average of the `samples` before (a
 * two-sample t-test): the difference counts when it exceeds `deviations` standard errors, the
 * spread of each side over the square root of its size. Noise then shows no chevron, and longer
 * windows tell smaller real changes from it. Hysteresis keeps a shown chevron until the
 * difference falls below half the bar, so it does not flicker at the edge.
 *
 * Sums of the readings and of their squares are kept running, so a reading costs the same
 * whatever `samples` is; they are summed afresh once per turn of the ring, relative to a pivot
 * reading so large values keep their precision. Allocation-free after construction.
 */
export class Trend {
  readonly better: 'higher' | 'lower';
  readonly side: 'end' | 'start';
  /** The mark's icon, or null for none. */
  readonly icon: TrendIcon | null;
  /** How the value itself is colored, or null for not at all. */
  readonly color: 'sustain' | 'flash' | null;
  readonly fade: boolean;
  readonly samples: number;
  readonly #deviations: number;
  readonly #threshold: number;
  readonly #relative: boolean;
  readonly #ring: Float64Array;
  #head = 0;
  #count = 0;
  /** Readings in a row equal to the one before: a whole ring of them is no change, exactly. */
  #same = 0;
  /** Sums of the earlier and recent sides, of `reading - pivot` and of its square. */
  #pivot = 0;
  #earlierSum = 0;
  #earlierSquares = 0;
  #recentSum = 0;
  #recentSquares = 0;
  direction: TrendDirection = 0;
  /** Averages of the last comparison, earlier and recent; NaN before the first. */
  earlier = NaN;
  recent = NaN;

  constructor(params: TrendParams = {}) {
    this.better = params.better ?? 'higher';
    this.side = params.side === 'start' ? 'start' : 'end';
    const icon = params.icon ?? 'arrow';
    if (icon !== false && !(icon in ICONS))
      throw new RangeError(`devkit: unknown trend icon ${String(icon)}`);
    this.icon = icon || null;
    const color = params.color ?? false;
    this.color = color === 'flash' ? 'flash' : color ? 'sustain' : null;
    this.fade = params.fade ?? false;
    const samples = Math.floor(params.samples ?? 1);
    if (!(samples >= 1)) throw new RangeError('devkit: trend samples must be at least 1');
    this.samples = Math.min(samples, MAX_SAMPLES);
    const deviations = params.deviations ?? 3;
    if (!(deviations >= 0)) throw new RangeError('devkit: trend deviations must be at least 0');
    this.#deviations = deviations;
    const threshold = params.threshold ?? 0;
    if (typeof threshold === 'string') {
      const match = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*%\s*$/.exec(threshold);
      if (!match) throw new RangeError(`devkit: trend threshold ${threshold} is not a percentage`);
      this.#threshold = Number(match[1]) / 100;
      this.#relative = true;
    } else {
      if (!(threshold >= 0)) throw new RangeError('devkit: trend threshold must be at least 0');
      this.#threshold = threshold;
      this.#relative = false;
    }
    this.#ring = new Float64Array(this.samples * 2);
  }

  /** The trend of an option (a preset's name or options), or null without one. */
  static from(option: TrendOption | undefined): Trend | null {
    if (option === undefined) return null;
    if (typeof option === 'string') {
      const preset = PRESETS[option];
      if (!preset) throw new RangeError(`devkit: unknown trend preset ${option}`);
      return new Trend(preset);
    }
    if (!option.preset) return new Trend(option);
    const base = PRESETS[option.preset];
    if (!base) throw new RangeError(`devkit: unknown trend preset ${option.preset}`);
    // Options left undefined keep the preset's.
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(option)) if (value !== undefined) merged[key] = value;
    return new Trend(merged as TrendParams);
  }

  /**
   * Takes one reading; true when the direction changed. A reading that is not a finite number
   * (text, an empty value) clears the history, so the chevron starts over.
   */
  push(value: number): boolean {
    if (!Number.isFinite(value)) return this.reset();
    const ring = this.#ring;
    const size = ring.length;
    const head = this.#head;
    const side = this.samples;
    if (this.#count > 0) this.#same = value === ring[(head + size - 1) % size] ? this.#same + 1 : 0;
    if (this.#count < size) {
      // Filling: nothing to compare until both sides are full.
      ring[head] = value;
      this.#head = (head + 1) % size;
      if (++this.#count < size) return this.#turn(0);
      if (side > 1) this.#sum();
    } else if (side === 1) {
      ring[head] = value;
      this.#head = head ^ 1;
    } else {
      // The oldest reading leaves the earlier side, the oldest recent one moves to it, and the
      // new one joins the recent side: a few sums, whatever `samples` is.
      const pivot = this.#pivot;
      const moved = ring[(head + side) % size]! - pivot;
      const left = ring[head]! - pivot;
      const added = value - pivot;
      this.#earlierSum += moved - left;
      this.#earlierSquares += moved * moved - left * left;
      this.#recentSum += added - moved;
      this.#recentSquares += added * added - moved * moved;
      ring[head] = value;
      this.#head = (head + 1) % size;
      // Once per turn of the ring, sum afresh so rounding never builds up.
      if (this.#head === 0) this.#sum();
    }
    if (side === 1) {
      this.recent = value;
      this.earlier = ring[this.#head]!;
      return this.#judge(value - this.earlier, 0);
    }
    const pivot = this.#pivot;
    this.recent = pivot + this.#recentSum / side;
    this.earlier = pivot + this.#earlierSum / side;
    // A whole ring of equal readings: no change, whatever rounding the running sums kept.
    if (this.#same >= size - 1) return this.#judge(0, 0);
    const change = (this.#recentSum - this.#earlierSum) / side;
    const spread =
      variance(this.#earlierSum, this.#earlierSquares, side) +
      variance(this.#recentSum, this.#recentSquares, side);
    return this.#judge(change, Math.sqrt(spread / side));
  }

  /** Sums both sides from the ring, relative to its oldest reading. */
  #sum(): void {
    const ring = this.#ring;
    const size = ring.length;
    const side = this.samples;
    const pivot = ring[this.#head]!;
    let earlier = 0;
    let earlierSquares = 0;
    let recent = 0;
    let recentSquares = 0;
    for (let i = 0; i < side; i++) {
      const a = ring[(this.#head + i) % size]! - pivot;
      const b = ring[(this.#head + side + i) % size]! - pivot;
      earlier += a;
      earlierSquares += a * a;
      recent += b;
      recentSquares += b * b;
    }
    this.#pivot = pivot;
    this.#earlierSum = earlier;
    this.#earlierSquares = earlierSquares;
    this.#recentSum = recent;
    this.#recentSquares = recentSquares;
  }

  /**
   * Turns the chevron by `change`, the difference of the averages, against `error`, its standard
   * error (0 with one sample a side, or when both sides hold steady).
   */
  #judge(change: number, error: number): boolean {
    let limit = this.#relative ? Math.abs(this.earlier) * this.#threshold : this.#threshold;
    // Running sums can leave a rounding residue where the averages are equal.
    if (this.samples > 1)
      limit = Math.max(limit, (Math.abs(this.earlier) + Math.abs(this.recent)) * 1e-12);
    if (!(Math.abs(change) > limit)) return this.#turn(0);
    const sign: TrendDirection = change > 0 ? 1 : -1;
    const bar = this.#deviations * error;
    // A shown chevron stays until the difference falls below half the bar; a new one needs all.
    const needed = sign === this.direction ? bar / 2 : bar;
    return this.#turn(Math.abs(change) > needed ? sign : 0);
  }

  /** Whether no reading has been taken since construction or the last reset. */
  get empty(): boolean {
    return this.#count === 0;
  }

  /** Forgets every reading; true when a chevron was showing. */
  reset(): boolean {
    this.#head = 0;
    this.#count = 0;
    this.#same = 0;
    this.#pivot = 0;
    this.#earlierSum = 0;
    this.#earlierSquares = 0;
    this.#recentSum = 0;
    this.#recentSquares = 0;
    this.earlier = NaN;
    this.recent = NaN;
    return this.#turn(0);
  }

  /**
   * The chevron's state as one attribute value: `''` (none), or `'up'` or `'down'` with `-better`
   * or `-worse`. One value, so showing a change is one write.
   */
  get token(): string {
    return TOKENS[this.better][this.direction + 1]!;
  }

  #turn(direction: TrendDirection): boolean {
    if (direction === this.direction) return false;
    this.direction = direction;
    return true;
  }
}

/** Sample variance of `n` readings from their sum and sum of squares; never below 0. */
function variance(sum: number, squares: number, n: number): number {
  return Math.max(0, (squares - (sum * sum) / n) / (n - 1));
}

const SVG_NS = 'http://www.w3.org/2000/svg';

interface IconShape {
  /** The paths' bounds: x, y, width, height. */
  readonly bounds: readonly [number, number, number, number];
  readonly paths: readonly string[];
  /** Filled rather than stroked. */
  readonly filled?: boolean;
}

/**
 * Each mark pointing up; flipped vertically for down (arrow-up to arrow-down, arrow-up-right to
 * arrow-down-right, the triangle to its down twin). The arrow is the library's arrow-up, the
 * chevron its ascending sort mark, the diagonal Lucide's arrow-up-right.
 */
const ICONS: Record<TrendIcon, IconShape> = {
  arrow: { bounds: [5, 5, 14, 14], paths: ['m5 12 7-7 7 7', 'M12 19V5'] },
  'arrow-diagonal': { bounds: [7, 7, 10, 10], paths: ['M7 7h10v10', 'M7 17 17 7'] },
  chevron: { bounds: [7, 9.5, 10, 5], paths: ['m7 14.5 5-5 5 5'] },
  triangle: { bounds: [5, 6, 14, 10], paths: ['M5 16 12 6l7 10z'], filled: true },
};

/**
 * The view box and stroke of a mark. A stroked mark's stroke is a third of its drawing's width,
 * and the box takes in half of it on every side: every mark's ink then fills its box exactly,
 * edge to edge, 0.8ch wide with a stroke of 0.2ch whatever the icon. Nothing overhangs the box
 * (the value box clips what does), and the gap to the value is the same for each.
 */
function frame(icon: IconShape): { viewBox: string; stroke: number } {
  const [x, y, width, height] = icon.bounds;
  const stroke = icon.filled ? 0 : width / 3;
  const pad = stroke / 2;
  return { viewBox: `${x - pad} ${y - pad} ${width + stroke} ${height + stroke}`, stroke };
}

/** A mark's slot in ch of the value font, its gap included (see `.trend` in the styles). */
export const CHEVRON_CH = 1.2;

/**
 * How a trend shows on a value: its icon beside it (after it by default), its color on the value
 * itself, or both. The icon's slot is always kept, so values never shift. Both show or hide at
 * once, with no transition, from one attribute written only when the state changes.
 */
export class TrendMark {
  /** The icon to place beside the value, or null with `icon: false`. */
  readonly icon: SVGSVGElement | null;
  /** The element colored with the trend, or null without `color`. */
  readonly #colored: HTMLElement | null;
  readonly #flash: boolean;
  readonly #fade: boolean;
  #token = '';
  /** Which of the two flash animations runs; switching between them restarts it. */
  #flashName: 'a' | 'b' = 'b';

  /** `value` is the element holding the value's text, colored when the trend has `color`. */
  constructor(trend: Pick<Trend, 'side' | 'icon' | 'color' | 'fade'>, value: HTMLElement) {
    this.icon = trend.icon ? createIcon(trend.icon, trend.side) : null;
    this.#colored = trend.color ? value : null;
    this.#flash = trend.color === 'flash';
    this.#fade = trend.fade;
    if (this.#colored) {
      this.#colored.classList.add('trend-value');
      this.#colored.setAttribute('data-color', trend.color!);
    }
    if (trend.fade) {
      this.icon?.setAttribute('data-fade', '');
      this.#colored?.setAttribute('data-fade', '');
    }
  }

  /**
   * Shows the trend's state as `data-trend` on the icon and the colored value: `up` or `down`,
   * with `-better` or `-worse`. With `fade`, a cleared mark keeps its last state as `data-was`,
   * so it fades out as it was. A flash starts when the trend turns, and again on each change of
   * the value (`changed`) while it shows.
   */
  paint(trend: Trend, changed = false): void {
    const token = trend.token;
    const turned = token !== this.#token;
    if (turned) {
      const was = this.#token;
      this.#token = token;
      this.#show(this.icon, token, was);
      // A flash keeps its tone: the animation alone decides when the color goes.
      if (!this.#flash) this.#show(this.#colored, token, was);
      else if (token) this.#colored!.setAttribute('data-trend', token);
    }
    if (this.#flash && token && (turned || changed)) {
      this.#flashName = this.#flashName === 'a' ? 'b' : 'a';
      this.#colored!.setAttribute('data-flash', this.#flashName);
    }
  }

  #show(element: Element | null, token: string, was: string): void {
    if (!element) return;
    if (token) element.setAttribute('data-trend', token);
    else {
      element.removeAttribute('data-trend');
      if (this.#fade && was) element.setAttribute('data-was', was);
    }
  }
}

/** The icon element: blank until painted. */
function createIcon(name: TrendIcon, side: 'end' | 'start'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'trend');
  svg.setAttribute('data-icon', name);
  if (side === 'start') svg.setAttribute('data-side', 'start');
  const icon = ICONS[name];
  const { viewBox, stroke } = frame(icon);
  svg.setAttribute('viewBox', viewBox);
  if (stroke) svg.setAttribute('stroke-width', String(stroke));
  svg.setAttribute('aria-hidden', 'true');
  for (const d of icon.paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
