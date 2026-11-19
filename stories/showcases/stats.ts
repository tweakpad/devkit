import { Pane, type PaneAnchor, type TrendIcon } from '@tweakpad/devkit';

export interface StatsArgs {
  anchor: PaneAnchor;
  /** The pane's width in px: narrow it to watch labels fade, hide, and groups wrap. */
  width: number;
  /** The mark beside a changing value, or none. */
  icon: TrendIcon | 'none';
  /** How changing values are colored: not at all, in step with the icon, or in a flash. */
  color: 'off' | 'sustain' | 'flash';
  /** Fades icons and colors in and out. */
  fade: boolean;
}

const MB = 1024 * 1024;

/** Wanders `value` by up to `step` either way, within `min`..`max`. */
function wander(value: number, step: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value + (Math.random() - 0.5) * 2 * step));
}

/**
 * A renderer's debug overview: GPU memory and frame counters side by side, three caches as one
 * matrix, and visibility, LOD and shadow counts, all read a few times a second from a simulated
 * engine. Chevrons show which way each value moves, green up and red down: memory and caches
 * follow every change, while the jittery frame counters compare averages of 8 samples.
 */
export function stats(
  _host: HTMLElement,
  { anchor, width, icon: iconArg, color: colorArg, fade }: StatsArgs,
): () => void {
  const icon: TrendIcon | false = iconArg === 'none' ? false : iconArg;
  const color = colorArg === 'off' ? false : colorArg;
  const engine = {
    memory: {
      textures: 1019 * MB,
      textureCount: 97,
      geometry: 21 * MB,
      geometryCount: 726,
      targets: 60,
    },
    frame: { calls: 277, triangles: 1_832_510, programs: 272 },
    cache: {
      persistent: { hits: 7, misses: 0, entries: 12, bytes: 23.9 * MB },
      session: { hits: 666, misses: 1556, entries: 1556, bytes: 5.4 * MB },
      material: { hits: 30, misses: 0, entries: 20, bytes: 118.7 * MB },
    },
    visible: { enemies: 32, trees: 45 },
    lod: [
      { n: 4, avg: 10_400 },
      { n: 7, avg: 4_600 },
      { n: 34, avg: 2_900 },
    ],
    shadows: { mode: 'realtime', trees: 4, enemies: 32 },
  };
  // Frame counters jitter: compare averages of 8 samples, so their noise shows no chevron.
  const steady = { samples: 8, icon, color, fade };
  // Everything else follows every change.
  const mark = { icon, color, fade };
  // A value inline with others shows its trend by color alone: an icon between them would leave
  // a gap whenever it is off.
  const inline = { icon: false, color: color || 'flash', fade } as const;
  const timer = setInterval(() => {
    const { memory, frame, cache, visible, lod, shadows } = engine;
    memory.textures = Math.round(wander(memory.textures, 4 * MB, 900 * MB, 1200 * MB));
    memory.geometry = Math.round(wander(memory.geometry, 0.5 * MB, 18 * MB, 26 * MB));
    frame.calls = Math.round(wander(frame.calls, 6, 240, 320));
    frame.triangles = Math.round(wander(frame.triangles, 20_000, 1_600_000, 2_100_000));
    cache.session.hits += Math.round(Math.random() * 3);
    cache.session.misses += Math.random() < 0.3 ? 1 : 0;
    cache.persistent.bytes += Math.random() < 0.2 ? 0.1 * MB : 0;
    visible.enemies = Math.round(wander(visible.enemies, 2, 20, 48));
    visible.trees = Math.round(wander(visible.trees, 3, 30, 60));
    for (const level of lod) level.avg = Math.round(wander(level.avg, 200, 1_000, 12_000));
    shadows.enemies = visible.enemies;
    shadows.mode =
      Math.random() < 0.02 ? (shadows.mode === 'realtime' ? 'baked' : 'realtime') : shadows.mode;
  }, 300);

  const pane = new Pane({ title: 'Debug', anchor });
  pane.element.style.setProperty('--tweak-pane-width', `${width}px`);
  const { memory, frame, cache, visible, lod, shadows } = engine;

  pane.addStats({
    title: 'Renderer',
    groups: [
      {
        title: 'GPU memory',
        stats: [
          {
            label: 'textures',
            parts: [
              { value: () => memory.textures, format: 'bytes', trend: inline },
              { value: () => memory.textureCount, muted: true },
            ],
          },
          {
            label: 'geometry',
            parts: [
              { value: () => memory.geometry, format: 'bytes', trend: inline },
              { value: () => memory.geometryCount, muted: true },
            ],
          },
          { label: 'targets', value: () => memory.targets },
          {
            label: 'total',
            value: () => memory.textures + memory.geometry,
            format: 'bytes',
            trend: mark,
          },
        ],
      },
      {
        title: 'Frame',
        stats: [
          { label: 'draw calls', value: () => frame.calls, trend: steady },
          { label: 'triangles', value: () => frame.triangles, trend: steady },
          { label: 'programs', value: () => frame.programs },
        ],
      },
    ],
  });

  const caches = pane.addFolder({ title: 'Cache' });
  caches.addButton({
    title: 'clear',
    onClick: () => {
      for (const each of Object.values(cache))
        for (const key of Object.keys(each)) (each as Record<string, number>)[key] = 0;
    },
  });
  // The caches share their stats, so the matrix writes each label once.
  const cacheStats = (source: (typeof cache)['session']) => [
    { label: 'hits', value: () => source.hits, trend: mark },
    { label: 'misses', value: () => source.misses, trend: mark },
    { label: 'entries', value: () => source.entries },
    { label: 'bytes', value: () => source.bytes, format: 'bytes' as const },
  ];
  caches.addStats({
    title: 'Caches',
    layout: 'matrix',
    groups: [
      { title: 'Persistent', stats: cacheStats(cache.persistent) },
      { title: 'Session', stats: cacheStats(cache.session) },
      { title: 'Material', stats: cacheStats(cache.material) },
    ],
  });

  pane.addStats({
    title: 'Scene',
    groups: [
      {
        title: 'Visible',
        stats: [
          { label: 'enemies', value: () => visible.enemies, trend: mark },
          { label: 'trees', value: () => visible.trees, trend: mark },
          { label: 'total', value: () => visible.enemies + visible.trees },
        ],
      },
      {
        title: 'Tree LOD',
        stats: [
          ...lod.map((level, i) => ({
            label: `L${i}`,
            separator: ' · ',
            parts: [
              { value: () => level.n },
              { value: () => level.avg, format: 'compact' as const },
            ],
          })),
          {
            label: 'tris',
            value: () => lod.reduce((sum, level) => sum + level.n * level.avg, 0),
            format: 'compact',
          },
        ],
      },
      {
        title: 'Shadows',
        stats: [
          { label: 'mode', value: () => shadows.mode },
          { label: 'trees', value: () => shadows.trees },
          { label: 'enemies', value: () => shadows.enemies },
          { label: 'total', value: () => shadows.trees + shadows.enemies },
        ],
      },
    ],
  });

  return () => {
    clearInterval(timer);
    pane.dispose();
  };
}
