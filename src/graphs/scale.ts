/** The smallest of 1, 2, 2.5 and 5 × 10^k that is at least `value`. */
export function niceCeil(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return 1;
  const base = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5]) if (step * base >= value * (1 - 1e-9)) return step * base;
  return 10 * base;
}

/** A round step that splits `span` into about four parts. */
export function niceStep(span: number): number {
  return niceCeil(span / 4);
}

/** Room left above and below the data, as a share of its span. */
const HEADROOM = 0.15;
/** A fitted range is refitted once the data uses less than this share of it. */
const SHRINK_BELOW = 0.35;

const tidy = (value: number): number => Number(value.toPrecision(12));

/**
 * - `'absolute'`: the range always includes zero, so lines show true magnitude; the far bound
 *   still fits the data, so small values are not squashed against the floor.
 * - `'relative'`: both bounds fit the visible data, so small variations fill the height.
 */
export type ScaleMode = 'absolute' | 'relative';

export interface ScaleOptions {
  /** Fixed lower bound. Omitted: fitted to the visible data. */
  min?: number | undefined;
  /** Fixed upper bound. Omitted: fitted to the visible data. */
  max?: number | undefined;
  /** How automatic bounds fit the data. Default `'absolute'`. */
  mode?: ScaleMode | undefined;
}

/**
 * One series' value range. Automatic bounds fit the visible data with some headroom, snapped to
 * round steps: including zero (`'absolute'`, default) or tightly around the data (`'relative'`).
 *
 * Each refit renormalizes the history (one full plot redraw), so it happens only when the data
 * leaves the range or uses less than a third of it, never on ordinary samples.
 */
export class Scale {
  lo = 0;
  hi = 1;
  #options: ScaleOptions = {};
  #fitted = false;

  constructor(options: ScaleOptions = {}) {
    this.configure(options);
  }

  get options(): Readonly<ScaleOptions> {
    return this.#options;
  }

  /** True when at least one bound follows the data. */
  get automatic(): boolean {
    return this.#options.min === undefined || this.#options.max === undefined;
  }

  configure(options: ScaleOptions): void {
    const { min, max } = options;
    if (min !== undefined && !Number.isFinite(min))
      throw new RangeError('devkit: graph min must be finite');
    if (max !== undefined && !Number.isFinite(max))
      throw new RangeError('devkit: graph max must be finite');
    if (min !== undefined && max !== undefined && max <= min)
      throw new RangeError('devkit: graph max must be greater than min');
    if (options.mode !== undefined && options.mode !== 'absolute' && options.mode !== 'relative')
      throw new RangeError("devkit: graph scale must be 'absolute' or 'relative'");
    this.#options = { min, max, mode: options.mode };
    this.reset();
  }

  /** Back to the configured range, before any data. */
  reset(): void {
    const { min, max } = this.#options;
    this.lo = min ?? (max !== undefined ? Math.min(0, max - 1) : 0);
    this.hi = max ?? this.lo + 1;
    this.#fitted = false;
  }

  /**
   * Fits the automatic bounds to the visible data `[low, high]`. True when the range changed,
   * which means the history has to be renormalized.
   */
  fit(low: number, high: number): boolean {
    if (!this.automatic || !(low <= high)) return false;
    if (this.#options.mode !== 'relative') {
      // Absolute: fit as if the data reached zero, so zero stays in range.
      low = Math.min(low, 0);
      high = Math.max(high, 0);
    }
    if (this.#fitted) {
      const inside = low >= this.lo && high <= this.hi;
      if (inside && (high - low) / (this.hi - this.lo) >= SHRINK_BELOW) return false;
    }
    this.#fitted = true;
    const [lo, hi] = this.#target(low, high);
    if (lo === this.lo && hi === this.hi) return false;
    this.lo = lo;
    this.hi = hi;
    return true;
  }

  /** Maps a value into 0..1, clamped. */
  normalize(value: number): number {
    const t = (value - this.lo) / (this.hi - this.lo);
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }

  /** Whether a value is within the range, e.g. to show a guide. */
  contains(value: number): boolean {
    return value >= this.lo && value <= this.hi;
  }

  /** Where a fill should start: zero when it is in range, else the nearer bound. */
  get baseline(): number {
    return this.normalize(0);
  }

  #target(low: number, high: number): [number, number] {
    const { min, max } = this.#options;
    const from = min ?? low;
    const to = max ?? high;
    // A flat line still gets a band around it, proportional to its value.
    const span = to - from > 0 ? to - from : Math.abs(to) * 0.1 || 1;
    const pad = span * HEADROOM;
    const step = niceStep(span + 2 * pad);
    let lo = min ?? Math.floor((low - pad) / step) * step;
    let hi = max ?? Math.ceil((high + pad) / step) * step;
    // Headroom never crosses zero: data that stays positive keeps a floor of 0 at most.
    if (min === undefined && low >= 0 && lo < 0) lo = 0;
    if (max === undefined && high <= 0 && hi > 0) hi = 0;
    if (hi <= lo) hi = lo + step;
    return [tidy(lo), tidy(hi)];
  }
}
