export type Equals<T> = (a: T, b: T) => boolean;

export const strictEquals: Equals<unknown> = (a, b) => Object.is(a, b);

/**
 * Number equality at display resolution: values closer than half a display step are the same,
 * so float jitter below what the row can show never costs a write. The comparison is against the
 * last value written, so a slow drift still adds up and shows once it crosses the step.
 */
export function numberEquals(resolution: number): Equals<number> {
  if (!(resolution > 0)) return strictEquals as Equals<number>;
  const epsilon = resolution / 2;
  return (a, b) => a === b || Math.abs(a - b) < epsilon || (a !== a && b !== b);
}

/** Smallest step a row displays: the step, or one unit of the last shown decimal. */
export function displayResolution(step: number | undefined, precision: number | undefined): number {
  if (precision !== undefined && precision >= 0) return 10 ** -precision;
  if (step !== undefined && step > 0) return step;
  return 0;
}
