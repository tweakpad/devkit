import { svg, type SVGTemplateResult } from 'lit';
import type { IconDefinition } from '@tweakpad/ui';

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
