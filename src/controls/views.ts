import type { Binding } from '../core/binding.js';
import { defineElement } from '@tweakpad/ui';
import { TpColorPicker } from '@tweakpad/ui/widgets';
import type { ColorPickerMode } from './color.js';
import { LibraryView, type LibraryElement } from './library-view.js';

export interface NumberSpec {
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  precision?: number | undefined;
}

function decimalsOf(step: number | undefined): number | undefined {
  if (step === undefined || !Number.isFinite(step)) return undefined;
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function make(tag: string, attributes: Record<string, string | undefined>): LibraryElement {
  const el = document.createElement(tag) as LibraryElement;
  el.setAttribute('variant', 'inline');
  for (const name in attributes) {
    const value = attributes[name];
    if (value !== undefined) el.setAttribute(name, value);
  }
  return el;
}

/** A bounded number: tp-slider, inline. */
export class SliderView extends LibraryView<number> {
  constructor(
    binding: Binding<number>,
    label: string,
    private readonly spec: NumberSpec,
  ) {
    super(binding, label);
  }

  protected create(value: number): LibraryElement {
    const { min = 0, max = 100, step } = this.spec;
    const el = make('tp-slider', {
      label: this.label,
      minimum: String(min),
      maximum: String(max),
      step: String(step ?? defaultStep(min, max)),
      'form-associated-value': 'false',
    });
    const decimals = this.spec.precision ?? decimalsOf(step ?? defaultStep(min, max)) ?? 2;
    (el as LibraryElement & { format?: Intl.NumberFormatOptions }).format = {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    };
    el.value = value;
    return el;
  }

  protected apply(el: LibraryElement, value: number): void {
    el.value = value;
  }

  protected parse(proposal: unknown): number | undefined {
    const n = Array.isArray(proposal) ? Number(proposal[0]) : Number(proposal);
    return Number.isFinite(n) ? n : undefined;
  }
}

function defaultStep(min: number, max: number): number {
  const span = Math.abs(max - min);
  if (span === 0) return 1;
  // Roughly 100–1000 steps across the range, on a power of ten.
  return 10 ** Math.floor(Math.log10(span) - 2);
}

/** An unbounded number: tp-input type=number, inline, with its stepper. */
export class NumberView extends LibraryView<number> {
  constructor(
    binding: Binding<number>,
    label: string,
    private readonly spec: NumberSpec,
  ) {
    super(binding, label);
  }

  protected override get locksWhileFocused(): boolean {
    return true;
  }

  protected create(value: number): LibraryElement {
    const { min, max, step, precision } = this.spec;
    const el = make('tp-input', {
      label: this.label,
      type: 'number',
      min: min === undefined ? undefined : String(min),
      max: max === undefined ? undefined : String(max),
      step: String(step ?? 1),
      precision: precision === undefined ? undefined : String(precision),
    });
    el.value = String(value);
    return el;
  }

  protected apply(el: LibraryElement, value: number): void {
    el.value = String(value);
  }

  protected parse(proposal: unknown): number | undefined {
    if (proposal === '' || proposal === null || proposal === undefined) return undefined;
    const n = Number(proposal);
    return Number.isFinite(n) ? n : undefined;
  }
}

/** A string: tp-input, inline. */
export class TextView extends LibraryView<string> {
  protected override get locksWhileFocused(): boolean {
    return true;
  }

  protected create(value: string): LibraryElement {
    const el = make('tp-input', { label: this.label });
    el.value = value;
    return el;
  }

  protected apply(el: LibraryElement, value: string): void {
    el.value = value;
  }

  protected parse(proposal: unknown): string {
    return String(proposal ?? '');
  }
}

/** A boolean: tp-checkbox or tp-switch, inline. Their label is slotted text. */
export class BooleanView extends LibraryView<boolean> {
  constructor(
    binding: Binding<boolean>,
    label: string,
    private readonly tag: 'tp-checkbox' | 'tp-switch',
  ) {
    super(binding, label);
  }

  protected create(value: boolean): LibraryElement {
    const el = make(this.tag, {});
    el.textContent = this.label;
    el.checked = value;
    return el;
  }

  protected apply(el: LibraryElement, value: boolean): void {
    el.checked = value;
  }

  protected override echo(el: LibraryElement, proposal: unknown): void {
    el.checked = proposal === true;
  }

  protected parse(proposal: unknown): boolean {
    return proposal === true;
  }
}

export interface SelectItem {
  value: unknown;
  label: string;
}

/** One of a set of values: tp-select, inline and non-modal (a panel must stay usable). */
export class SelectView extends LibraryView<unknown> {
  constructor(
    binding: Binding<unknown>,
    label: string,
    private readonly items: SelectItem[],
  ) {
    super(binding, label);
  }

  protected create(value: unknown): LibraryElement {
    const el = make('tp-select', { label: this.label }) as LibraryElement & {
      items?: SelectItem[];
      modal?: boolean;
    };
    el.items = this.items;
    el.modal = false;
    el.value = value;
    return el;
  }

  protected apply(el: LibraryElement, value: unknown): void {
    el.value = value;
  }

  protected parse(proposal: unknown): unknown {
    return proposal;
  }
}

/** Notation of a CSS color string, as shown in the control and written to the property. */
export type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'oklch';

/** A CSS color string: tp-color-input, inline. */
export class ColorView extends LibraryView<string> {
  #picker: TpColorPicker | null = null;
  constructor(
    binding: Binding<string>,
    label: string,
    private readonly options: {
      format?: ColorFormat | undefined;
      alpha?: boolean | undefined;
      picker?: ColorPickerMode | undefined;
    },
  ) {
    super(binding, label);
  }

  protected override get locksWhileFocused(): boolean {
    return true;
  }

  protected create(value: string): LibraryElement {
    const el = make('tp-color-input', {
      label: this.label,
      format: this.options.format ?? 'hex',
      picker: this.options.picker === 'tweakpad' ? 'none' : 'native',
    });
    if (this.options.alpha) el.setAttribute('alpha', '');
    el.value = value;
    if (this.options.picker === 'tweakpad') {
      defineElement(TpColorPicker.tagName, TpColorPicker);
      const picker = document.createElement('tp-color-picker') as TpColorPicker;
      picker.picker = 'popup';
      // The inline trigger owns the visible label; the wrapper only needs an accessible name.
      picker.setAttribute('aria-label', this.label);
      picker.format = this.options.format ?? 'hex';
      picker.formats = [picker.format];
      picker.formatSelect = false;
      picker.alpha = this.options.alpha ?? false;
      picker.value = value;
      el.slot = 'trigger';
      picker.append(el);
      this.#picker = picker;
      return picker;
    }
    return el;
  }

  override setVisible(visible: boolean): void {
    if (!visible && this.#picker?.open) this.#picker.close();
  }

  override setDisabled(disabled: boolean): void {
    if (disabled) this.setVisible(false);
    super.setDisabled(disabled);
  }

  override unmount(): void {
    this.setVisible(false);
    super.unmount();
    this.#picker = null;
  }

  protected apply(el: LibraryElement, value: string): void {
    el.value = value;
  }

  protected parse(proposal: unknown): string | undefined {
    return typeof proposal === 'string' ? proposal : undefined;
  }
}
