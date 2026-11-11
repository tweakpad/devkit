/** Escapes one path segment like a JSON pointer, so titles may contain `/`. */
export function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** `['Lighting', 'Sun'], 'intensity'` → `Lighting/Sun/intensity`. */
export function joinPath(segments: readonly string[], leaf: string): string {
  return [...segments, leaf].map(escapeSegment).join('/');
}
