import type { ValueCodec } from '../core/binding.js';

/** Channel scale of `{r, g, b}` color objects: `'int'` for 0–255, `'float'` for 0–1. */
export type ColorObjectType = 'int' | 'float';
/** Which picker a color control opens: the browser's own, or Tweakpad's color picker popup. */
export type ColorPickerMode = 'native' | 'tweakpad';

interface RgbObject {
  r: number;
  g: number;
  b: number;
}

export function isColorObject(value: unknown): value is RgbObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RgbObject).r === 'number' &&
    typeof (value as RgbObject).g === 'number' &&
    typeof (value as RgbObject).b === 'number'
  );
}

const COLOR_STRING = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\()/i;

export function isColorString(value: unknown): value is string {
  return typeof value === 'string' && COLOR_STRING.test(value.trim());
}

const hex = (n: number): string => n.toString(16).padStart(2, '0');

/**
 * `{r, g, b}` objects (0–255 ints, or 0–1 floats as in most 3D engines) shown as hex. Sampling
 * compares the packed 24-bit integer, so watching a color allocates nothing until it changes.
 * Writes go into the same object, keeping the application's reference.
 */
export function colorObjectCodec(type: ColorObjectType): ValueCodec<string> & {
  pack(raw: unknown): number;
} {
  const scale = type === 'float' ? 255 : 1;
  const channel = (v: number) => Math.max(0, Math.min(255, Math.round(v * scale)));
  const pack = (raw: unknown): number => {
    if (!isColorObject(raw)) return 0;
    return (channel(raw.r) << 16) | (channel(raw.g) << 8) | channel(raw.b);
  };
  let lastPacked = -1;
  let lastText = '#000000';
  return {
    pack,
    read(raw) {
      const packed = pack(raw);
      if (packed !== lastPacked) {
        lastPacked = packed;
        lastText = `#${hex(packed >> 16)}${hex((packed >> 8) & 255)}${hex(packed & 255)}`;
      }
      return lastText;
    },
    write(value, current) {
      const match = /^#?([0-9a-f]{6})/i.exec(value.trim());
      if (!match || !isColorObject(current)) return undefined;
      const packed = parseInt(match[1]!, 16);
      current.r = (packed >> 16) / scale;
      current.g = ((packed >> 8) & 255) / scale;
      current.b = (packed & 255) / scale;
      return undefined;
    },
  };
}
