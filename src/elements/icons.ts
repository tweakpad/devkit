import { svg, type SVGTemplateResult } from 'lit';
import type { IconDefinition } from '@tweakpad/ui';

export const searchIcon: IconDefinition = {
  viewBox: '0 0 24 24',
  paths: [{ d: 'M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0' }],
};

/** Renders a library icon definition inline: no element per icon. */
export function icon(definition: IconDefinition, size = 16): SVGTemplateResult {
  return svg`<svg
    viewBox=${definition.viewBox}
    width=${size}
    height=${size}
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >${definition.paths.map(
    (path) => svg`<path d=${path.d} stroke-width=${path.strokeWidth ?? 2}></path>`,
  )}</svg>`;
}
