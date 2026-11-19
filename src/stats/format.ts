/** A value a stat shows. Numbers are formatted; anything else prints as text. */
export type StatValue = number | bigint | string | boolean | null | undefined;

/**
 * How a stat prints a number:
 *
 * - `'number'`: `precision` decimals, thousands grouped (`1,234.50`);
 * - `'integer'`: rounded, thousands grouped (`1,832,510`);
 * - `'compact'`: `precision` decimals (1 by default) with a k, M, B or T suffix (`10.4k`);
 * - `'bytes'`: binary units, B to TB (`1019 MB`, `23.9 MB`); 1 decimal below 100 of a unit
 *   unless `precision` is set;
 * - `'percent'`: a ratio as a percentage, `0.25` → `25%`, with `precision` decimals (0 by default);
 * - a function: any text of your own.
 *
 * Without a format, integers print grouped and other numbers with `precision` decimals.
 */
export type StatFormat =
  'number' | 'integer' | 'compact' | 'bytes' | 'percent' | ((value: StatValue) => string);

/** The text of a missing value (`null` or `undefined`). */
export const EMPTY_VALUE = '—';

/** Inserts thousands separators into the integer digits of `text` (a toFixed result). */
export function groupDigits(text: string): string {
  const sign = text.charCodeAt(0) === 45 /* - */ ? 1 : 0;
  const dot = text.indexOf('.');
  const end = dot === -1 ? text.length : dot;
  if (end - sign <= 3) return text;
  let i = sign + ((end - sign) % 3 || 3);
  let out = text.slice(0, i);
  for (; i < end; i += 3) out += ',' + text.slice(i, i + 3);
  return out + text.slice(end);
}

const COMPACT = ['', 'k', 'M', 'B', 'T'];
const BYTES = ['B', 'KB', 'MB', 'GB', 'TB'];

function fixed(value: number, precision: number): string {
  // toFixed keeps a minus sign on a rounded-away negative zero ("-0.0"); drop it.
  const text = value.toFixed(precision);
  return Number(text) === 0 && text.charCodeAt(0) === 45 ? text.slice(1) : text;
}

function formatNumber(value: number, format: StatFormat | undefined, precision?: number): string {
  if (!Number.isFinite(value)) return String(value);
  switch (format) {
    case 'integer':
      return groupDigits(fixed(value, 0));
    case 'percent':
      return `${fixed(value * 100, precision ?? 0)}%`;
    case 'compact': {
      let scaled = value;
      let unit = 0;
      while (Math.abs(scaled) >= 1000 && unit < COMPACT.length - 1) {
        scaled /= 1000;
        unit++;
      }
      // A value that rounds up to the next unit moves there (999.95k → 1.0M).
      const digits = precision ?? 1;
      if (
        unit > 0 &&
        Math.abs(Number(fixed(scaled, digits))) >= 1000 &&
        unit < COMPACT.length - 1
      ) {
        scaled /= 1000;
        unit++;
      }
      return unit === 0 && Number.isInteger(value)
        ? String(value)
        : `${fixed(scaled, digits)}${COMPACT[unit]}`;
    }
    case 'bytes': {
      let scaled = value;
      let unit = 0;
      while (Math.abs(scaled) >= 1024 && unit < BYTES.length - 1) {
        scaled /= 1024;
        unit++;
      }
      const digits = unit === 0 ? 0 : (precision ?? (Math.abs(scaled) >= 100 ? 0 : 1));
      return `${fixed(scaled, digits)} ${BYTES[unit]}`;
    }
    case 'number':
      return groupDigits(fixed(value, precision ?? 2));
    default:
      return Number.isInteger(value) && precision === undefined
        ? groupDigits(fixed(value, 0))
        : groupDigits(fixed(value, precision ?? 2));
  }
}

/**
 * The text of one value. toFixed and string work only, no Intl, so formatting every frame stays
 * cheap; the caller writes the result only when it differs from what is shown.
 */
export function formatStat(
  value: StatValue,
  format: StatFormat | undefined,
  precision: number | undefined,
  unit: string | undefined,
): string {
  let text: string;
  if (typeof format === 'function') text = format(value);
  else if (value === null || value === undefined) return EMPTY_VALUE;
  else if (typeof value === 'number') text = formatNumber(value, format, precision);
  else if (typeof value === 'bigint') text = groupDigits(value.toString());
  else text = String(value);
  return unit ? `${text} ${unit}` : text;
}

/** A value as a number for change direction, or NaN when it is not numeric. */
export function numeric(value: StatValue): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return NaN;
}
