import type { Sampler, Scheduler, Writer } from '../core/scheduler.js';
import { formatValue } from './text-monitor.js';

export interface GraphOptions {
  label: string;
  min?: number | undefined;
  max?: number | undefined;
  /** Samples kept; one sample per interval. */
  bufferSize: number;
  /** Milliseconds between samples; 0 samples every frame. */
  interval: number;
  precision: number;
}

/**
 * A number over time. It keeps sampling into a fixed Float32Array ring while its row is off
 * screen (opening a folder shows recent history), and draws only while on screen.
 */
export class GraphMonitor implements Sampler, Writer {
  slot = -1;
  queued = false;
  readonly heavy = false;
  readonly element: HTMLDivElement;

  readonly #target: Record<PropertyKey, unknown>;
  readonly #key: PropertyKey;
  readonly #scheduler: Scheduler;
  readonly #options: GraphOptions;
  readonly #history: Float32Array;
  #head = 0;
  #count = 0;
  #due = 0;
  #visible = false;
  #last = NaN;
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D | null;
  readonly #valueText: Text;
  #width = 0;
  #height = 0;
  #ratio = 1;
  #stroke = 'currentColor';
  #resize: ResizeObserver | null = null;

  constructor(scheduler: Scheduler, target: object, key: PropertyKey, options: GraphOptions) {
    this.#scheduler = scheduler;
    this.#target = target as Record<PropertyKey, unknown>;
    this.#key = key;
    this.#options = options;
    this.#history = new Float32Array(Math.max(2, options.bufferSize));

    const row = document.createElement('div');
    row.className = 'row monitor graph';
    const head = document.createElement('div');
    head.className = 'head';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = options.label;
    const value = document.createElement('span');
    value.className = 'value';
    this.#valueText = document.createTextNode('');
    value.append(this.#valueText);
    head.append(label, value);
    this.#canvas = document.createElement('canvas');
    this.#context = this.#canvas.getContext('2d');
    row.append(head, this.#canvas);
    this.element = row;
    scheduler.activate(this);
  }

  setVisible(visible: boolean): void {
    if (visible === this.#visible) return;
    this.#visible = visible;
    if (visible) {
      this.#observeSize();
      this.#scheduler.enqueueWrite(this);
    }
  }

  sample(now: number): void {
    if (this.#options.interval > 0) {
      if (now < this.#due) return;
      this.#due = now + this.#options.interval;
    }
    const value = Number(this.#target[this.#key]);
    this.#history[this.#head] = value;
    this.#head = (this.#head + 1) % this.#history.length;
    if (this.#count < this.#history.length) this.#count++;
    this.#last = value;
    if (this.#visible) this.#scheduler.enqueueWrite(this);
  }

  write(): void {
    this.#valueText.data = formatValue(this.#last, this.#options.precision);
    this.#draw();
  }

  dispose(): void {
    this.#scheduler.deactivate(this);
    this.#resize?.disconnect();
    this.#resize = null;
  }

  #observeSize(): void {
    if (this.#resize) return;
    this.#resize = new ResizeObserver((entries) => {
      const box = entries[0]?.contentBoxSize[0];
      if (!box) return;
      this.#ratio = devicePixelRatio || 1;
      this.#width = Math.round(box.inlineSize * this.#ratio);
      this.#height = Math.round(box.blockSize * this.#ratio);
      this.#canvas.width = this.#width;
      this.#canvas.height = this.#height;
      // Colors come from the tokens; read once per size change, never per frame.
      this.#stroke = getComputedStyle(this.#canvas).color || this.#stroke;
      this.#draw();
    });
    this.#resize.observe(this.#canvas);
  }

  #draw(): void {
    const ctx = this.#context;
    const width = this.#width;
    const height = this.#height;
    if (!ctx || width === 0 || height === 0) return;
    const history = this.#history;
    const size = history.length;
    const count = this.#count;
    ctx.clearRect(0, 0, width, height);
    if (count < 2) return;

    let min = this.#options.min;
    let max = this.#options.max;
    if (min === undefined || max === undefined) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < count; i++) {
        const v = history[(this.#head - count + i + size) % size]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      min ??= lo;
      max ??= hi === lo ? lo + 1 : hi;
    }
    const span = max - min || 1;
    const pad = this.#ratio;
    const step = (width - 2 * pad) / (size - 1);
    const start = size - count;
    ctx.lineWidth = 1.5 * this.#ratio;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.#stroke;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const v = history[(this.#head - count + i + size) % size]!;
      const t = Math.min(1, Math.max(0, (v - min) / span));
      const x = pad + (start + i) * step;
      const y = height - pad - t * (height - 2 * pad);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
