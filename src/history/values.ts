import { isColorString } from '../controls/color.js';
import { decodeStructure } from '../layers/model.js';
import type { ControlDescriptor, HistoryDiff, HistoryValue, StoredValue } from './types.js';

const HEX6 = /^#[0-9a-f]{6}$/i;

export function isPrimitive(value: unknown): value is HistoryValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/** A control's value in stored form, or undefined when it cannot be stored. */
export function encode(value: unknown, descriptor: ControlDescriptor): StoredValue | undefined {
  switch (descriptor.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'string':
    case 'color':
      return typeof value === 'string' ? value : undefined;
    case 'layers':
      return decodeStructure(value) ? (value as string) : undefined;
    case 'option': {
      const item = descriptor.items.find((candidate) => Object.is(candidate.value, value));
      if (!item) return undefined;
      return { v: isPrimitive(item.value) ? item.value : null, l: item.label };
    }
  }
}

/**
 * The value a stored entry gives a control, or undefined when it does not apply: best effort,
 * judged by what the value is rather than by what control stored it, so a slider that became a
 * number field, or a pick that became a slider, keeps its value.
 */
export function decode(
  stored: StoredValue,
  descriptor: ControlDescriptor,
): { value: unknown } | undefined {
  const plain = typeof stored === 'object' && stored !== null ? stored.v : stored;
  switch (descriptor.type) {
    case 'number': {
      if (typeof plain !== 'number' || !Number.isFinite(plain)) return undefined;
      let value = plain;
      if (descriptor.min !== undefined && value < descriptor.min) value = descriptor.min;
      if (descriptor.max !== undefined && value > descriptor.max) value = descriptor.max;
      return { value };
    }
    case 'boolean':
      return typeof plain === 'boolean' ? { value: plain } : undefined;
    case 'string':
      return typeof plain === 'string' ? { value: plain } : undefined;
    case 'layers':
      return decodeStructure(plain) ? { value: plain } : undefined;
    case 'color':
      if (typeof plain !== 'string') return undefined;
      return (descriptor.object ? HEX6.test(plain) : isColorString(plain))
        ? { value: plain }
        : undefined;
    case 'option': {
      const { items } = descriptor;
      if (plain !== null) {
        const byValue = items.find((item) => Object.is(item.value, plain));
        if (byValue) return { value: byValue.value };
      }
      if (typeof stored === 'object' && stored !== null) {
        const byLabel = items.find((item) => item.label === stored.l);
        if (byLabel) return { value: byLabel.value };
      }
      return undefined;
    }
  }
}

/** How the history reports a stored value: options by value, or by label when it has none. */
export function toPublic(stored: StoredValue): HistoryValue {
  return typeof stored === 'object' && stored !== null ? (stored.v ?? stored.l) : stored;
}

export function sameValue(a: StoredValue | undefined, b: StoredValue | undefined): boolean {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null)
    return Object.is(a.v, b.v) && a.l === b.l;
  return Object.is(a, b);
}

export function sameValues(
  a: Readonly<Record<string, StoredValue>>,
  b: Readonly<Record<string, StoredValue>>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

/** What changed from `a` to `b`. */
export function diffValues(
  a: Readonly<Record<string, StoredValue>>,
  b: Readonly<Record<string, StoredValue>>,
): HistoryDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: { path: string; from: HistoryValue; to: HistoryValue }[] = [];
  for (const [path, from] of Object.entries(a)) {
    if (!Object.hasOwn(b, path)) removed.push(path);
    else if (!sameValue(from, b[path]))
      changed.push({ path, from: toPublic(from), to: toPublic(b[path]!) });
  }
  for (const path of Object.keys(b)) if (!Object.hasOwn(a, path)) added.push(path);
  return { added, removed, changed };
}
