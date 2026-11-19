import '@tweakpad/ui/styles.css';
import { Pane, type TrendIcon } from '../../src/index.js';

/** One pane per icon, and a last one with no icon, its values colored instead. */
const ICONS: readonly (TrendIcon | false)[] = [
  'arrow',
  'arrow-diagonal',
  'chevron',
  'triangle',
  false,
];
const MB = 1024 * 1024;

/** Wanders `value` by up to `step` either way, within `min`..`max`. */
function wander(value: number, step: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value + (Math.random() - 0.5) * 2 * step));
}

const host = document.getElementById('panes')!;
const widthInput = document.getElementById('width') as HTMLInputElement;
const colorInput = document.getElementById('color') as HTMLSelectElement;
const fadeInput = document.getElementById('fade') as HTMLInputElement;

const data = {
  textures: 1019 * MB,
  count: 97,
  calls: 277,
  triangles: 1_832_510,
  hits: 666,
  misses: 1556,
  fps: 60,
};
setInterval(() => {
  data.textures = Math.round(wander(data.textures, 4 * MB, 900 * MB, 1200 * MB));
  data.calls = Math.round(wander(data.calls, 6, 240, 320));
  data.triangles = Math.round(wander(data.triangles, 20_000, 1_600_000, 2_100_000));
  data.hits += Math.round(Math.random() * 3);
  data.misses += Math.random() < 0.3 ? 1 : 0;
  data.fps = 57 + Math.random() * 6;
}, 300);

let panes: Pane[] = [];

/** Builds the panes for the current color and fade; the width alone just resizes them. */
function build(): void {
  for (const pane of panes) pane.dispose();
  host.replaceChildren();
  const color = colorInput.value as 'off' | 'sustain' | 'flash';
  const fade = fadeInput.checked;
  panes = ICONS.map((icon) => {
    const container = document.createElement('div');
    host.append(container);
    const pane = new Pane({ container, title: icon || 'color only' });
    const tint = color === 'off' ? (icon === false ? 'sustain' : false) : color;
    const mark = { icon, color: tint, fade };
    const steady = { icon, color: tint, fade, samples: 8 };
    // Inline with the count, textures shows its trend by color alone: no gap when it is off.
    const inline = { icon: false, color: tint || 'flash', fade } as const;
    pane.addStats({
      groups: [
        {
          title: 'Memory',
          stats: [
            {
              label: 'textures',
              parts: [
                { value: () => data.textures, format: 'bytes', trend: inline },
                { value: () => data.count, muted: true },
              ],
            },
            { label: 'hits', value: () => data.hits, trend: mark },
            { label: 'misses', value: () => data.misses, trend: mark },
          ],
        },
        {
          title: 'Frame',
          stats: [
            { label: 'draw calls', value: () => data.calls, trend: steady },
            { label: 'triangles', value: () => data.triangles, trend: steady },
            { label: 'programs', value: () => 272 },
          ],
        },
      ],
    });
    pane.addBinding(data, 'fps', {
      view: 'monitor',
      interval: 250,
      precision: 0,
      monitor: { trend: mark },
    });
    return pane;
  });
  resize();
}

function resize(): void {
  for (const pane of panes)
    pane.element.style.setProperty('--tweak-pane-width', `${widthInput.value}px`);
}

widthInput.addEventListener('input', resize);
colorInput.addEventListener('change', build);
fadeInput.addEventListener('change', build);
build();
