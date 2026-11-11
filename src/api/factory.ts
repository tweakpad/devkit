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

export type ControlKind =
  'slider' | 'number' | 'text' | 'checkbox' | 'switch' | 'select' | 'color' | 'monitor';

export type OptionList =
  | Record<string, unknown>
  | readonly (string | number | boolean)[]
  | readonly { label: string; value: unknown }[];

export interface ColorBindingParams {
  type?: ColorObjectType;
  format?: ColorFormat;
  alpha?: boolean;
  /** Overrides the pane's picker choice for this binding. */
  picker?: ColorPickerMode;
}

export interface BindingParams {
  /** Row label; defaults to the property key. */
  label?: string;
  /** Control to use; inferred from the value and the other options when omitted. */
  view?: ControlKind;
  min?: number;
  max?: number;
  step?: number;
  /** Decimals shown and compared; defaults to the decimals of `step`. */
  precision?: number;
  /** Turns any value into a pick from these options. */
  options?: OptionList;
  /** Color handling: object channel range, string notation, alpha. */
  color?: ColorBindingParams;
  /** Presentation options when view is 'monitor'; other binding options stay the same. */
  monitor?: MonitorOptions;
  /** Sampling interval in ms for this binding; 0 every frame, -1 only on refresh(). */
  interval?: number;
  disabled?: boolean;
  hidden?: boolean;
  /**
   * Stable name in the pane's history, in place of the property key. Keeps stored values when
   * the key or label changes, and tells apart bindings of the same key in one container.
   */
  id?: string;
  /** Set false to leave this binding out of the pane's history. Default true. */
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
