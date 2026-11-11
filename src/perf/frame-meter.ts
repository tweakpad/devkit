/** One measurement window. The object is reused: read it inside the callback, never keep it. */
export interface FrameSample {
  /** Frames per second over the window. */
  fps: number;
  /** Mean milliseconds per frame: frame interval in `'raf'` mode, `begin`→`end` work in `'manual'`. */
  frameTime: number;
  /** The slowest frame of the window, in ms. */
  frameTimeMax: number;
  /** Frames counted in the window. */
  frames: number;
  /** End of the window, in ms (performance.now clock). */
  now: number;
}

/**
 * - `'raf'`: measures the frames the browser presents, from devkit's own frame loop.
 * - `'manual'`: measures the application loop between `begin()` and `end()`.
 * - `'auto'` (default): `'raf'` until the first `begin()`, then `'manual'`.
 */
export type FrameSource = 'auto' | 'raf' | 'manual';

/**
 * Turns frame timestamps into FPS and frame time per window. Every call is a few arithmetic
 * operations on numbers; nothing allocates per frame.
 */
export class FrameMeter {
  readonly sample: FrameSample = { fps: 0, frameTime: 0, frameTimeMax: 0, frames: 0, now: 0 };
  readonly interval: number;
  #mode: 'raf' | 'manual';
  readonly #source: FrameSource;
  #windowStart = -1;
  #last = -1;
  #frames = 0;
  #sum = 0;
  #max = 0;
  #measured = 0;
  #beginAt = -1;

  constructor(interval = 250, source: FrameSource = 'auto') {
    if (!(interval > 0)) throw new RangeError('devkit: monitor interval must be positive');
    this.interval = interval;
    this.#source = source;
    this.#mode = source === 'manual' ? 'manual' : 'raf';
  }

  get mode(): 'raf' | 'manual' {
    return this.#mode;
  }

  /**
   * Called every frame of devkit's loop. Records a frame in `'raf'` mode, and closes the window
   * once `interval` has passed (so FPS drops to 0 when a manual loop stops). True when
   * `sample` holds a new window.
   */
  tick(now: number): boolean {
    if (this.#windowStart < 0) {
      this.#windowStart = now;
      this.#last = now;
      return false;
    }
    if (this.#mode === 'raf' && now > this.#last) {
      this.#record(now - this.#last);
      this.#frames++;
      this.#last = now;
    }
    const elapsed = now - this.#windowStart;
    if (elapsed < this.interval) return false;
    const sample = this.sample;
    sample.fps = (this.#frames * 1000) / elapsed;
    sample.frameTime = this.#measured > 0 ? this.#sum / this.#measured : 0;
    sample.frameTimeMax = this.#max;
    sample.frames = this.#frames;
    sample.now = now;
    this.#windowStart = now;
    this.#frames = 0;
    this.#sum = 0;
    this.#max = 0;
    this.#measured = 0;
    return true;
  }

  /** Marks the start of an application frame. */
  begin(now = performance.now()): void {
    if (this.#mode === 'raf') {
      if (this.#source === 'raf') return;
      // auto: the application measures its own loop from now on.
      this.#mode = 'manual';
      this.#restart(now);
    }
    if (this.#windowStart >= 0) this.#frames++;
    this.#beginAt = now;
  }

  /** Marks the end of the application frame started by `begin()`. */
  end(now = performance.now()): void {
    if (this.#mode !== 'manual' || this.#beginAt < 0) return;
    this.#record(now - this.#beginAt);
    this.#beginAt = -1;
  }

  /** Forgets the open window, e.g. after the monitor was hidden. */
  reset(): void {
    this.#windowStart = -1;
    this.#last = -1;
    this.#frames = 0;
    this.#sum = 0;
    this.#max = 0;
    this.#measured = 0;
    this.#beginAt = -1;
  }

  #restart(now: number): void {
    this.reset();
    this.#windowStart = now;
    this.#last = now;
  }

  #record(ms: number): void {
    this.#sum += ms;
    this.#measured++;
    if (ms > this.#max) this.#max = ms;
  }
}
