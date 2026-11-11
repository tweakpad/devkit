import { describe, expect, it } from 'vitest';
import { FrameMeter } from './frame-meter.js';

/** Ticks the meter like devkit's frame loop, every `step` ms until `until`. */
function run(meter: FrameMeter, from: number, until: number, step: number): boolean[] {
  const closed: boolean[] = [];
  for (let t = from; t <= until; t += step) closed.push(meter.tick(t));
  return closed;
}

describe('FrameMeter', () => {
  it('measures presented frames from its own loop', () => {
    const meter = new FrameMeter(250);
    const closed = run(meter, 0, 250, 1000 / 60);
    expect(closed.filter(Boolean)).toHaveLength(0);
    expect(meter.tick((1000 / 60) * 16)).toBe(true);
    expect(meter.sample.fps).toBeCloseTo(60, 0);
    expect(meter.sample.frameTime).toBeCloseTo(16.67, 1);
    expect(meter.mode).toBe('raf');
  });

  it('reports the worst frame of the window', () => {
    const meter = new FrameMeter(100);
    meter.tick(0);
    meter.tick(16);
    meter.tick(66);
    meter.tick(82);
    expect(meter.tick(100)).toBe(true);
    expect(meter.sample.frameTimeMax).toBe(50);
    expect(meter.sample.frames).toBe(4);
  });

  it('switches from auto to the application loop on begin()', () => {
    const meter = new FrameMeter(100);
    meter.tick(0);
    meter.tick(16);
    meter.begin(20);
    expect(meter.mode).toBe('manual');
    meter.end(24);
    for (let t = 30; t < 120; t += 10) {
      meter.begin(t);
      meter.end(t + 4);
    }
    expect(meter.tick(120)).toBe(true);
    expect(meter.sample.frameTime).toBeCloseTo(4);
    // begin() at 20, 30 … 110: ten frames in the 100 ms window opened by the switch.
    expect(meter.sample.fps).toBeCloseTo(100, 0);
  });

  it('drops to zero FPS when a manual loop stops', () => {
    const meter = new FrameMeter(100, 'manual');
    meter.tick(0);
    expect(meter.tick(150)).toBe(true);
    expect(meter.sample.fps).toBe(0);
    expect(meter.sample.frames).toBe(0);
  });

  it('ignores begin() in raf mode and restarts cleanly after reset()', () => {
    const meter = new FrameMeter(100, 'raf');
    meter.begin(5);
    expect(meter.mode).toBe('raf');
    meter.tick(0);
    meter.reset();
    meter.tick(5000);
    expect(meter.tick(5016)).toBe(false);
    expect(meter.tick(5100)).toBe(true);
    expect(meter.sample.frameTimeMax).toBeLessThan(100);
  });

  it('rejects a non-positive interval', () => {
    expect(() => new FrameMeter(0)).toThrow(RangeError);
  });
});
