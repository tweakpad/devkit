import { formatValue } from './text-monitor.js';

export interface GraphOptions {
  label: string;
  min?: number | undefined;
  max?: number | undefined;
  /** Samples kept; one sample per interval. */
  bufferSize: number;
  precision: number;
}

/** Passive numeric history view. The owning Binding supplies samples and visibility. */
export class GraphMonitorView {
  readonly element: HTMLDivElement;

  readonly #options: GraphOptions;
  readonly #history: Float32Array;
  #head = 0;
  #count = 0;
  #visible = false;
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D | null;
  readonly #valueText: Text;
  #width = 0;
  #height = 0;
  #ratio = 1;
  #stroke = 'currentColor';
  #resize: ResizeObserver | null = null;

  constructor(options: GraphOptions) {
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
  }

  setVisible(visible: boolean): void {
    if (visible === this.#visible) return;
    this.#visible = visible;
    if (visible) {
      this.#observeSize();
      this.#draw();
    }
  }

  write(value: unknown): void {
    const sample = Number(value);
    this.#history[this.#head] = sample;
    this.#head = (this.#head + 1) % this.#history.length;
    if (this.#count < this.#history.length) this.#count++;
    this.#valueText.data = formatValue(sample, this.#options.precision);
    if (this.#visible) this.#draw();
  }

  dispose(): void {
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
