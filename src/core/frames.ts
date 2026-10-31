/** Where frames come from. The browser uses requestAnimationFrame; tests drive frames by hand. */
export interface FrameSource {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
  /** Monotonic clock in milliseconds, used to bound the per-frame work budget. */
  now(): number;
}

export const animationFrames: FrameSource = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};
