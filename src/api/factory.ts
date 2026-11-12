import { Binding, type ValueCodec } from '../core/binding.js';
import { displayResolution, numberEquals, type Equals } from '../core/equality.js';
import {
  colorObjectCodec,
  isColorObject,
  isColorString,
  type ColorObjectType,
  type ColorPickerMode,
} from '../controls/color.js';
import type { ControlView } from '../controls/library-view.js';
import { frameRateFor } from '../graphs/graph-view.js';
import { MonitorView, type MonitorOptions } from '../controls/monitor-view.js';
import {
  BooleanView,
  ColorView,
  NumberView,
  SelectView,
  SliderView,
  TextView,
  type ColorFormat,
  type SelectItem,
} from '../controls/views.js';
import type { ControlDescriptor } from '../history/types.js';
import type { PaneContext } from './context.js';

/**
 * The control a binding uses. `'monitor'` displays the value without an editor; the others edit
 * it.
 */
export type ControlKind =
  'slider' | 'number' | 'text' | 'checkbox' | 'switch' | 'select' | 'color' | 'monitor';

/**
 * The choices of a select: a record of labels to values, a list of values labeled with their
 * text, or a list of `{ label, value }`.
 */
export type OptionList =
  | Record<string, unknown>
  | readonly (string | number | boolean)[]
  | readonly { label: string; value: unknown }[];

/** Color options of a binding, its `color` option. */
export interface ColorBindingParams {
  /**
   * Channel scale of `{r, g, b}` object values: 0–255 integers or 0–1 floats.
   * @default 'int'
   */
  type?: ColorObjectType;
  /**
   * Notation of CSS color string values, both shown and written. Object values always use hex.
   * @default 'hex'
   */
  format?: ColorFormat;
  /**
   * Whether CSS color string values keep transparency. Object values have no alpha channel.
   * @default false
   */
  alpha?: boolean;
  /** Overrides the pane's `colorPicker` for this binding. */
  picker?: ColorPickerMode;
}

/** Options of `addBinding()`, and of binding items in `addRow()`. */
export interface BindingParams {
  /** Row label, also matched by search. Defaults to the property key. */
  label?: string;
  /** Control to use; inferred from the value and the other options when omitted. */
  view?: ControlKind;
  /**
   * Lowest value of a number. With `max`, a number gets a slider; a monitor graph uses it as its
   * fixed lower bound.
   */
  min?: number;
  /**
   * Highest value of a number. With `min`, a number gets a slider; a monitor graph uses it as its
   * fixed upper bound.
   */
  max?: number;
  /**
   * Increment of a number control. Omitted, sliders take a round step for their range and number
   * inputs step by 1.
   */
  step?: number;
  /**
   * Decimals shown, and the resolution below which number changes are ignored. Defaults to the
   * decimals of `step`, or 2 for monitors.
   */
  precision?: number;
  /** Turns any value into a pick from these options. */
  options?: OptionList;
  /** Color options: the picker, the channel scale of `{r, g, b}` objects, notation and alpha. */
  color?: ColorBindingParams;
  /** How a `view: 'monitor'` binding is shown: as text or as a graph of its history. */
  monitor?: MonitorOptions;
  /**
   * Milliseconds between samples of this binding, in place of the pane's `refresh`: 0 samples
   * every frame, -1 only on `refresh()`.
   */
  interval?: number;
  /**
   * Starts the control disabled: shown dimmed and ignoring input.
   * @default false
   */
  disabled?: boolean;
  /**
   * Starts the control hidden, which also leaves it out of search.
   * @default false
   */
  hidden?: boolean;
  /**
   * Stable name in the pane's history, in place of the property key. Keeps stored values when
   * the key or label changes, and tells apart bindings of the same key in one container.
   */
  id?: string;
  /**
   * Whether the pane's history records this binding. Monitors are never recorded.
   * @default true
   */
  history?: boolean;
}

export function toItems(options: OptionList): SelectItem[] {
  if (Array.isArray(options))
    return options.map((option) =>
      typeof option === 'object' && option !== null
        ? { label: String((option as SelectItem).label), value: (option as SelectItem).value }
        : { label: String(option), value: option },
    );
  return Object.entries(options).map(([label, value]) => ({ label, value }));
}

export function inferKind(value: unknown, params: BindingParams): ControlKind {
  if (params.view) return params.view;
  if (params.options) return 'select';
  switch (typeof value) {
    case 'number':
      return params.min !== undefined && params.max !== undefined ? 'slider' : 'number';
    case 'boolean':
      return 'checkbox';
    case 'string':
      return isColorString(value) ? 'color' : 'text';
    default:
      if (isColorObject(value)) return 'color';
      throw new TypeError(
        `devkit: no control for a value of type ${value === null ? 'null' : typeof value}`,
      );
  }
}

export interface CreatedControl {
  binding: Binding<unknown>;
  view: ControlView<unknown>;
  kind: ControlKind;
  /** What the value is, for the history; null for monitors, which are not recorded. */
  descriptor: ControlDescriptor | null;
}

export function createControl(
  context: PaneContext,
  target: object,
  key: PropertyKey,
  params: BindingParams,
): CreatedControl {
  const raw = (target as Record<PropertyKey, unknown>)[key];
  const kind = inferKind(raw, params);
  const label = params.label ?? String(key);
  const interval = params.interval ?? context.interval;
  const scheduler = context.scheduler;

  const make = <T>(equals?: Equals<T>, codec?: ValueCodec<T>): Binding<T> =>
    new Binding<T>(scheduler, target, key, {
      interval,
      readonly: kind === 'monitor',
      ...(equals ? { equals } : {}),
      ...(codec ? { codec } : {}),
    });

  switch (kind) {
    case 'monitor': {
      const graph = params.monitor?.view === 'graph';
      if (graph && typeof raw !== 'number')
        throw new TypeError('devkit: graph views require a numeric binding');
      const binding = make<unknown>(graph ? () => false : undefined);
      const view = new MonitorView(
        label,
        params.monitor ?? {},
        params.precision ?? 2,
        params.min,
        params.max,
        { maxFrameRate: frameRateFor(interval), scheduler: () => context.plotScheduler },
      );
      return { binding, view, kind, descriptor: null };
    }
    case 'slider':
    case 'number': {
      const spec = {
        min: params.min,
        max: params.max,
        step: params.step,
        precision: params.precision,
      };
      const binding = make<number>(numberEquals(displayResolution(params.step, params.precision)));
      const view =
        kind === 'slider'
          ? new SliderView(binding, label, spec)
          : new NumberView(binding, label, spec);
      const descriptor = { type: 'number', min: params.min, max: params.max } as const;
      return { binding, view, kind, descriptor } as unknown as CreatedControl;
    }
    case 'checkbox':
    case 'switch': {
      const binding = make<boolean>();
      const view = new BooleanView(binding, label, kind === 'switch' ? 'tp-switch' : 'tp-checkbox');
      return { binding, view, kind, descriptor: { type: 'boolean' } } as unknown as CreatedControl;
    }
    case 'select': {
      const binding = make<unknown>();
      const items = toItems(params.options ?? []);
      const view = new SelectView(binding, label, items);
      return { binding, view, kind, descriptor: { type: 'option', items } };
    }
    case 'color': {
      const objectValue = isColorObject(raw);
      const binding = objectValue
        ? make<string>(undefined, colorObjectCodec(params.color?.type ?? 'int'))
        : make<string>();
      const view = new ColorView(binding, label, {
        picker: params.color?.picker ?? context.colorPicker,
        format: objectValue ? 'hex' : params.color?.format,
        alpha: objectValue ? false : params.color?.alpha,
      });
      const descriptor = { type: 'color', object: objectValue } as const;
      return { binding, view, kind, descriptor } as unknown as CreatedControl;
    }
    case 'text': {
      const binding = make<string>();
      const view = new TextView(binding, label);
      return { binding, view, kind, descriptor: { type: 'string' } } as unknown as CreatedControl;
    }
  }
}
