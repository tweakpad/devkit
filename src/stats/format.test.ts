import { describe, expect, it } from 'vitest';
import { formatStat, groupDigits, numeric } from './format.js';

describe('stat formatting', () => {
  it('groups thousands in the integer digits only', () => {
    expect(groupDigits('1832510')).toBe('1,832,510');
    expect(groupDigits('-1234.5678')).toBe('-1,234.5678');
    expect(groupDigits('999')).toBe('999');
    expect(groupDigits('-100')).toBe('-100');
    expect(groupDigits('1000.00')).toBe('1,000.00');
  });

  it('prints integers grouped and other numbers with precision by default', () => {
    expect(formatStat(1832510, undefined, undefined, undefined)).toBe('1,832,510');
    expect(formatStat(0.4912, undefined, undefined, undefined)).toBe('0.49');
    expect(formatStat(43.9, undefined, 1, 'ms')).toBe('43.9 ms');
    expect(formatStat(12, undefined, 2, undefined)).toBe('12.00');
  });

  it('formats integer, number and percent', () => {
    expect(formatStat(1234.6, 'integer', undefined, undefined)).toBe('1,235');
    expect(formatStat(1234.5, 'number', undefined, undefined)).toBe('1,234.50');
    expect(formatStat(0.257, 'percent', undefined, undefined)).toBe('26%');
    expect(formatStat(0.257, 'percent', 1, undefined)).toBe('25.7%');
    expect(formatStat(-0.0001, 'number', 2, undefined)).toBe('0.00');
  });

  it('formats compact numbers, moving to the next unit when rounding reaches it', () => {
    expect(formatStat(4, 'compact', undefined, undefined)).toBe('4');
    expect(formatStat(10400, 'compact', undefined, undefined)).toBe('10.4k');
    expect(formatStat(176200, 'compact', undefined, undefined)).toBe('176.2k');
    expect(formatStat(1832510, 'compact', undefined, undefined)).toBe('1.8M');
    expect(formatStat(999960, 'compact', undefined, undefined)).toBe('1.0M');
    expect(formatStat(-2900, 'compact', undefined, undefined)).toBe('-2.9k');
  });

  it('formats bytes in binary units', () => {
    expect(formatStat(512, 'bytes', undefined, undefined)).toBe('512 B');
    expect(formatStat(1019 * 1024 * 1024, 'bytes', undefined, undefined)).toBe('1019 MB');
    expect(formatStat(23.9 * 1024 * 1024, 'bytes', undefined, undefined)).toBe('23.9 MB');
    expect(formatStat(5.4 * 1024 * 1024, 'bytes', 2, undefined)).toBe('5.40 MB');
    expect(formatStat(2 * 1024 ** 3, 'bytes', undefined, undefined)).toBe('2.0 GB');
  });

  it('prints text, missing values and custom formats', () => {
    expect(formatStat('realtime', undefined, undefined, undefined)).toBe('realtime');
    expect(formatStat(null, 'bytes', undefined, undefined)).toBe('—');
    expect(formatStat(undefined, undefined, undefined, 'ms')).toBe('—');
    expect(formatStat(12345678901234567890n, undefined, undefined, undefined)).toBe(
      '12,345,678,901,234,567,890',
    );
    expect(formatStat(true, undefined, undefined, undefined)).toBe('true');
    expect(formatStat(NaN, undefined, undefined, undefined)).toBe('NaN');
    expect(formatStat(7, (value) => `(${String(value)})`, undefined, undefined)).toBe('(7)');
  });

  it('reads numbers for change direction', () => {
    expect(numeric(3)).toBe(3);
    expect(numeric(3n)).toBe(3);
    expect(numeric('3')).toBeNaN();
    expect(numeric(null)).toBeNaN();
  });
});
