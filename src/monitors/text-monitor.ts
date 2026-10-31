import type { BindingView } from '../core/binding.js';

/** Formats a monitored value for display. Numbers use toFixed: several times cheaper than Intl. */
export function formatValue(value: unknown, precision: number): string {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value.toFixed(precision) : String(value);
  if (value === null || value === undefined) return '—';
  return String(value);
}

/**
 * A read-only row: label and value text. The value is one Text node written in place; no element
 * update, no layout read.
 */
export class TextMonitorView implements BindingView<unknown> {
  readonly heavy = false;
  readonly element: HTMLDivElement;
  readonly #text: Text;
  #shown = '';

  constructor(
    label: string,
    private readonly precision: number,
  ) {
    const row = document.createElement('div');
    row.className = 'row monitor';
    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'value';
    this.#text = document.createTextNode('');
    valueEl.append(this.#text);
    row.append(labelEl, valueEl);
    this.element = row;
  }

  write(value: unknown): void {
    const text = formatValue(value, this.precision);
    if (text === this.#shown) return;
    this.#shown = text;
    this.#text.data = text;
  }
}
