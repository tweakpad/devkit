import { describe, expect, it } from 'vitest';
import { Trend } from './trend.js';

/** Readings around `center`, spread uniformly by up to `spread` either way, from a fixed seed. */
function noise(count: number, center: number, spread: number): number[] {
  let seed = 7;
  return Array.from({ length: count }, () => {
    seed = (seed * 16807) % 2147483647;
    return Math.round(center + (seed / 2147483647 - 0.5) * 2 * spread);
  });
}

function directions(trend: Trend, values: readonly number[]): number[] {
  return values.map((value) => {
    trend.push(value);
    return trend.direction;
  });
}

describe('Trend', () => {
  it('follows every change with one sample, and shows none without a change', () => {
    expect(directions(new Trend(), [5, 6, 6, 4, 4, 9])).toEqual([0, 1, 0, -1, 0, 1]);
  });

  it('reports a direction change from push', () => {
    const trend = new Trend();
    expect(trend.push(1)).toBe(false);
    expect(trend.push(2)).toBe(true);
    expect(trend.push(3)).toBe(false);
    expect(trend.push(3)).toBe(true);
  });

  it('compares the averages of the last samples with the samples before', () => {
    const trend = new Trend({ samples: 2, deviations: 0 });
    // Nothing until both sides are full; then 14 + 8 against 12 + 10.
    expect(directions(trend, [10, 12, 8, 14])).toEqual([0, 0, 0, 0]);
    expect([trend.earlier, trend.recent]).toEqual([11, 11]);
    trend.push(14);
    expect([trend.earlier, trend.recent]).toEqual([10, 14]);
    expect(trend.direction).toBe(1);
  });

  it('shows no chevron for noise, and steadies as samples grow', () => {
    const readings = noise(2000, 275, 15);
    const shown = (samples: number) =>
      directions(new Trend({ samples }), readings).filter((d) => d !== 0).length / readings.length;
    const plain = directions(new Trend({ samples: 8, deviations: 0 }), readings);
    expect(plain.filter((d) => d !== 0).length / readings.length).toBeGreaterThan(0.9);
    expect(shown(8)).toBeLessThan(0.05);
    expect(shown(32)).toBeLessThan(shown(8));
  });

  it('tells a slow rise from the noise around it', () => {
    const readings = noise(400, 1000, 4).map((value, i) => value + i * 0.5);
    const shown = directions(new Trend({ samples: 16 }), readings).slice(32);
    expect(shown.filter((d) => d === 1).length / shown.length).toBeGreaterThan(0.9);
    expect(shown.includes(-1)).toBe(false);
  });

  it('shows a step, then clears once both sides have settled on it', () => {
    const trend = new Trend({ samples: 3 });
    const shown = directions(trend, [1, 1, 1, 1, 1, 1, 5, 5, 5, 5, 5, 5, 5]);
    expect(shown.slice(0, 8).every((d) => d === 0)).toBe(true);
    // Shown once the recent side is all 5s, kept by hysteresis, cleared as the earlier side fills.
    expect(shown.slice(8, 10)).toEqual([1, 1]);
    expect(shown.slice(10).every((d) => d === 0)).toBe(true);
  });

  it('holds a shown chevron until the difference falls below half the bar', () => {
    // Both end on the same sides, 0 0 10 10 against 10 10 10 10: about 1.7 standard errors apart.
    const shown = new Trend({ samples: 4 });
    directions(shown, [0, 0, 0, 0, 10, 10, 10, 10, 10, 10]);
    const fresh = new Trend({ samples: 4 });
    directions(fresh, [0, 0, 10, 10, 10, 10, 10, 10]);
    expect([shown.direction, fresh.direction]).toEqual([1, 0]);
  });

  it('shows no chevron for a change within the threshold', () => {
    expect(directions(new Trend({ threshold: 2 }), [10, 12, 15, 14, 11])).toEqual([0, 0, 1, 0, -1]);
  });

  it('takes the threshold as a share of the earlier average', () => {
    expect(directions(new Trend({ threshold: '10%' }), [100, 109, 121, 115])).toEqual([0, 0, 1, 0]);
    expect(() => new Trend({ threshold: 'ten%' as `${number}%` })).toThrow(RangeError);
  });

  it('matches averages taken afresh over many turns of the ring', () => {
    const trend = new Trend({ samples: 5 });
    const readings: number[] = [];
    let seed = 3;
    for (let i = 0; i < 500; i++) {
      seed = (seed * 16807) % 2147483647;
      const value = i < 400 ? (seed / 2147483647) * 100 + i * 0.1 : 0.1 + 0.2;
      readings.push(value);
      trend.push(value);
      if (readings.length < 10) continue;
      const mean = (from: number) => readings.slice(from, from + 5).reduce((a, b) => a + b) / 5;
      expect(trend.recent).toBeCloseTo(mean(readings.length - 5), 9);
      expect(trend.earlier).toBeCloseTo(mean(readings.length - 10), 9);
    }
    // Equal readings show no chevron, rounding of the running sums aside.
    expect(trend.direction).toBe(0);
  });

  it('starts over after a reading that is not a number', () => {
    const trend = new Trend();
    directions(trend, [1, 2]);
    expect(trend.push(NaN)).toBe(true);
    expect(directions(trend, [5, 6])).toEqual([0, 1]);
  });

  it('names the chevron state in one token, toned by better', () => {
    const higher = new Trend({ better: 'higher' });
    const lower = new Trend({ better: 'lower' });
    const plain = new Trend();
    expect(higher.token).toBe('');
    for (const trend of [higher, lower, plain]) directions(trend, [1, 2]);
    expect([higher.token, lower.token, plain.token]).toEqual([
      'up-better',
      'up-worse',
      'up-better',
    ]);
    for (const trend of [higher, lower, plain]) directions(trend, [1]);
    expect([higher.token, lower.token, plain.token]).toEqual([
      'down-worse',
      'down-better',
      'down-worse',
    ]);
  });

  it('reads presets, and options that start from one', () => {
    const steady = Trend.from('steady')!;
    const flash = Trend.from('flash')!;
    const tint = Trend.from('tint')!;
    expect([steady.samples, steady.icon]).toEqual([8, 'arrow']);
    expect([flash.icon, flash.color, tint.icon, tint.color]).toEqual([
      null,
      'flash',
      null,
      'sustain',
    ]);
    const lower = Trend.from({ preset: 'steady', better: 'lower' })!;
    expect([lower.samples, lower.better]).toEqual([8, 'lower']);
    expect(Trend.from({ preset: 'flash', icon: 'triangle' })!.icon).toBe('triangle');
    expect(() => Trend.from('loud' as 'ticker')).toThrow(RangeError);
  });

  it('reads the shorthand options', () => {
    expect(Trend.from(undefined)).toBeNull();
    expect(Trend.from({ better: 'lower' })!.better).toBe('lower');
    expect(Trend.from({ samples: 8 })!.samples).toBe(8);
    expect(() => new Trend({ samples: 0 })).toThrow(RangeError);
    expect([Trend.from('ticker')!.icon, Trend.from({ icon: 'chevron' })!.icon]).toEqual([
      'arrow',
      'chevron',
    ]);
    expect(() => new Trend({ icon: 'star' as 'arrow' })).toThrow(RangeError);
    const tinted = Trend.from({ icon: false, color: true })!;
    expect([tinted.icon, tinted.color, Trend.from('ticker')!.color]).toEqual([
      null,
      'sustain',
      null,
    ]);
    expect([Trend.from({ color: 'flash' })!.color, Trend.from({ fade: true })!.fade]).toEqual([
      'flash',
      true,
    ]);
  });
});
