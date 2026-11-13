import { Pane, type LayerApi, type LayersApi, type PaneAnchor } from '@tweakpad/devkit';
import type { IconDefinition } from '@tweakpad/ui';
import { eyeIcon } from '@tweakpad/ui/icons/eye';
import { eyeOffIcon } from '@tweakpad/ui/icons/eye-off';
import { banIcon } from '@tweakpad/ui/icons/ban';
import { lockIcon } from '@tweakpad/ui/icons/lock';

export interface LayersArgs {
  anchor: PaneAnchor;
  /** Which layers the add menu offers: any type, or only the type already in the stack. */
  rule: 'any type' | 'one type';
  reorder: 'item' | 'handle';
}

const shape = (...paths: string[]): IconDefinition => ({
  viewBox: '0 0 24 24',
  paths: paths.map((d) => ({ d })),
});
const icons = {
  gradient: shape('M4 4h16v16H4z', 'M4 20 20 4'),
  clouds: shape('M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z'),
  sun: shape(
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4',
  ),
  moon: shape('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z'),
  stars: shape('M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 17v4M17 19h4'),
};

type Blend = 'source-over' | 'screen' | 'multiply' | 'overlay' | 'lighter';
interface Sky {
  blend: Blend;
  opacity: number;
  top: string;
  bottom: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  count: number;
  seed: number;
}
type Type = 'gradient' | 'clouds' | 'sun' | 'moon' | 'stars';
type Layer = LayerApi<'locked' | 'visible', Sky, Type>;
type Layers = LayersApi<'locked' | 'visible', Sky, Type>;

const BLENDS = [
  { label: 'Normal', value: 'source-over' },
  { label: 'Screen', value: 'screen' },
  { label: 'Multiply', value: 'multiply' },
  { label: 'Overlay', value: 'overlay' },
  { label: 'Add', value: 'lighter' },
] as const;

const defaults = (type: Type): Sky => ({
  blend: type === 'gradient' ? 'source-over' : 'screen',
  opacity: 100,
  top: '#0b1430',
  bottom: '#3d2a5c',
  x: type === 'moon' ? 0.75 : 0.3,
  y: type === 'moon' ? 0.25 : 0.35,
  radius: type === 'sun' ? 70 : 40,
  color: type === 'sun' ? '#ffcf6b' : type === 'clouds' ? '#c9d3e6' : '#f2f0e6',
  count: type === 'stars' ? 220 : 6,
  seed: Math.floor(Math.random() * 1000),
});

/** A random sequence that repeats for a seed, so stars and clouds stay put between frames. */
function random(seed: number): () => number {
  let state = seed + 1;
  return () => ((state = (state * 16807) % 2147483647) - 1) / 2147483646;
}

function draw(context: CanvasRenderingContext2D, layer: Layer, width: number, height: number) {
  const sky = layer.data;
  context.globalAlpha = sky.opacity / 100;
  context.globalCompositeOperation = sky.blend;
  const next = random(sky.seed);
  switch (layer.type) {
    case 'gradient': {
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, sky.top);
      gradient.addColorStop(1, sky.bottom);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      break;
    }
    case 'sun':
    case 'moon': {
      const x = sky.x * width;
      const y = sky.y * height;
      const glow = context.createRadialGradient(x, y, sky.radius * 0.6, x, y, sky.radius * 3);
      glow.addColorStop(0, `${sky.color}66`);
      glow.addColorStop(1, `${sky.color}00`);
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      context.fillStyle = sky.color;
      context.beginPath();
      context.arc(x, y, sky.radius, 0, Math.PI * 2);
      context.fill();
      if (layer.type === 'moon') {
        context.fillStyle = '#00000022';
        for (const [dx, dy, r] of [
          [-0.3, -0.2, 0.22],
          [0.25, 0.15, 0.3],
          [-0.1, 0.4, 0.15],
        ]) {
          context.beginPath();
          context.arc(x + dx! * sky.radius, y + dy! * sky.radius, r! * sky.radius, 0, Math.PI * 2);
          context.fill();
        }
      }
      break;
    }
    case 'clouds':
      context.fillStyle = sky.color;
      for (let i = 0; i < sky.count; i++) {
        const x = next() * width;
        const y = height * (0.15 + next() * 0.5);
        for (let puff = 0; puff < 5; puff++) {
          context.beginPath();
          context.ellipse(x + puff * 28, y + (puff % 2) * 10, 46, 22, 0, 0, Math.PI * 2);
          context.fill();
        }
      }
      break;
    case 'stars':
      context.fillStyle = sky.color;
      for (let i = 0; i < sky.count; i++) {
        const size = next() * 1.6 + 0.3;
        context.fillRect(next() * width, next() * height, size, size);
      }
      break;
  }
}

/**
 * A sky painted from layers: drag to reorder, toggle visibility, lock, rename, and add layers of
 * five types. The header edits the selected layer's blend and opacity.
 */
export function layers(host: HTMLElement, args: LayersArgs): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;inline-size:100%;block-size:100%';
  host.append(canvas);
  const context = canvas.getContext('2d')!;

  // The header's controls edit whichever layer is selected: they read and write through it.
  // The stack does not exist yet when the header's controls first read.
  const current: { stack?: Layers } = {};
  const selected = {
    get blend() {
      return current.stack?.selected?.data.blend ?? 'source-over';
    },
    set blend(blend: Blend) {
      const layer = current.stack?.selected;
      if (layer) layer.data.blend = blend;
    },
    get opacity() {
      return current.stack?.selected?.data.opacity ?? 100;
    },
    set opacity(opacity: number) {
      const layer = current.stack?.selected;
      if (layer) layer.data.opacity = opacity;
    },
  };

  const pane = new Pane({ title: 'Sky', anchor: args.anchor });
  const type = (
    title: string,
    icon: IconDefinition,
    build: (sky: Sky, panel: Layer['panel']) => void,
  ) => ({
    title,
    icon,
    data: (layer: Layer) => defaults(layer.type!),
    controls: (panel: NonNullable<Layer['panel']>, layer: Layer) => build(layer.data, panel),
  });
  const stack = pane.addLayers({
    title: 'Layers',
    reorder: args.reorder,
    rename: true,
    remove: true,
    states: [
      { key: 'locked', label: 'Lock', icon: lockIcon, display: 'on' },
      {
        key: 'visible',
        label: 'Visible',
        icon: eyeIcon,
        offIcon: eyeOffIcon,
        default: true,
        mutes: true,
      },
    ],
    types: {
      gradient: type('Gradient', icons.gradient, (sky, panel) => {
        panel!.addBinding(sky, 'top', { label: 'Top' });
        panel!.addBinding(sky, 'bottom', { label: 'Bottom' });
      }),
      clouds: type('Clouds', icons.clouds, (sky, panel) => {
        panel!.addBinding(sky, 'color', { label: 'Color' });
        panel!.addBinding(sky, 'count', { label: 'Count', min: 1, max: 20, step: 1 });
        panel!.addBinding(sky, 'seed', { label: 'Seed', min: 0, max: 999, step: 1 });
      }),
      sun: type('Sun', icons.sun, (sky, panel) => {
        panel!.addBinding(sky, 'color', { label: 'Color' });
        panel!.addBinding(sky, 'radius', { label: 'Radius', min: 10, max: 160 });
        panel!.addBinding(sky, 'x', { label: 'X', min: 0, max: 1 });
        panel!.addBinding(sky, 'y', { label: 'Y', min: 0, max: 1 });
      }),
      moon: type('Moon', icons.moon, (sky, panel) => {
        panel!.addBinding(sky, 'color', { label: 'Color' });
        panel!.addBinding(sky, 'radius', { label: 'Radius', min: 10, max: 120 });
        panel!.addBinding(sky, 'x', { label: 'X', min: 0, max: 1 });
        panel!.addBinding(sky, 'y', { label: 'Y', min: 0, max: 1 });
      }),
      stars: type('Starfield', icons.stars, (sky, panel) => {
        panel!.addBinding(sky, 'count', { label: 'Stars', min: 0, max: 1000, step: 10 });
        panel!.addBinding(sky, 'seed', { label: 'Seed', min: 0, max: 999, step: 1 });
      }),
    },
    allow:
      args.rule === 'one type'
        ? { add: (kind, layers) => layers.layers.every((layer) => layer.type === kind) }
        : {},
    layers: [
      { type: 'moon', states: { locked: true } },
      { type: 'stars' },
      { type: 'sun', name: 'Sun' },
      { type: 'clouds', id: 'clouds' },
      { type: 'gradient', name: 'Night sky', reorder: false, remove: false },
    ],
    header: [
      {
        type: 'binding',
        target: selected,
        key: 'blend',
        label: 'Blend',
        options: BLENDS,
        width: 1.3,
      },
      {
        type: 'binding',
        target: selected,
        key: 'opacity',
        label: 'Opacity',
        min: 0,
        max: 100,
        step: 1,
      },
    ],
    footer: [
      { type: 'add' },
      {
        type: 'button',
        title: 'Duplicate',
        width: 'auto',
        onClick: (_event, layers) => {
          const source = layers.selected;
          if (!source?.type) return;
          const copy = layers.add({
            type: source.type,
            name: `${source.name} copy`,
            index: source.index,
            select: true,
          });
          Object.assign(copy.data, source.data);
        },
      },
      {
        // `enabled` has no toggle in the rows: this action turns the selected layer on and off.
        type: 'button',
        title: 'Enable or disable layer',
        icon: banIcon,
        iconOnly: true,
        width: 'auto',
        onClick: (_event, layers) => {
          const layer = layers.selected;
          if (layer) layer.setState('enabled', !layer.states.enabled);
        },
      },
      { type: 'remove' },
    ],
  });

  current.stack = stack;

  let frame = requestAnimationFrame(function paint() {
    const ratio = devicePixelRatio;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    // The list is top first; paint bottom up.
    for (const layer of [...stack.layers].reverse()) {
      const { enabled, visible } = layer.states;
      if (enabled && visible) draw(context, layer, width, height);
    }
    frame = requestAnimationFrame(paint);
  });

  return () => {
    cancelAnimationFrame(frame);
    pane.dispose();
    canvas.remove();
  };
}
