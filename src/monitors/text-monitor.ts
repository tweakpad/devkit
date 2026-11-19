import type { BindingView } from '../core/binding.js';
import { TrendMark, type Trend } from '../core/trend.js';

/** Formats a monitored value for display. Numbers use toFixed: several times cheaper than Intl. */
export function formatValue(value: unknown, precision: number): string {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value.toFixed(precision) : String(value);
  if (value === null || value === undefined) return '—';
  return String(value);
}

/**
 * A read-only row: label and value text. The value is one Text node written in place; no element
 * update, no layout read. With a trend, a chevron beside the value shows the direction of change,
 * and every sample is written here (changed or not), since each one is a reading of the trend.
 */
export class TextMonitorView implements BindingView<unknown> {
  readonly heavy = false;
  readonly element: HTMLDivElement;
  readonly #text: Text;
  readonly #trend: Trend | null;
  readonly #mark: TrendMark | null;
  #shown = '';
  #raw: unknown = undefined;
  #hasRaw = false;
  /** The value as shown, as a number: what the trend reads. */
  #shownValue = NaN;
  /**
   * Mounting again writes the current value once more; that is not a new sample, so it is not
   * a reading of a trend that already has some.
   */
  #remount: boolean;

  constructor(
    label: string,
    private readonly precision: number,
    trend: Trend | null = null,
  ) {
    const row = document.createElement('div');
    row.className = 'row monitor';
    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'value';
    this.#trend = trend;
    this.#remount = trend !== null && !trend.empty;
    this.#mark = trend ? new TrendMark(trend, valueEl) : null;
    this.#mark?.paint(trend!);
    this.#text = document.createTextNode('');
    const icon = this.#mark?.icon;
    if (icon && trend!.side === 'start') valueEl.append(icon, this.#text);
    else if (icon) valueEl.append(this.#text, icon);
    else valueEl.append(this.#text);
    row.append(labelEl, valueEl);
    this.element = row;
  }

  write(value: unknown): void {
    // With a trend every sample arrives here; an unchanged one skips formatting.
    let changed = false;
    if (!this.#hasRaw || !Object.is(value, this.#raw)) {
      this.#hasRaw = true;
      this.#raw = value;
      const text = formatValue(value, this.precision);
      if (text !== this.#shown) {
        this.#shown = text;
        this.#shownValue = typeof value === 'number' ? value : NaN;
        this.#text.data = text;
        changed = true;
      }
    }
    if (this.#remount) {
      this.#remount = false;
      return;
    }
    const turned = this.#trend?.push(this.#shownValue) ?? false;
    if (turned || changed) this.#mark?.paint(this.#trend!, changed);
  }
}
