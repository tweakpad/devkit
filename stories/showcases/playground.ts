import { Pane, type PaneAnchor } from '@tweakpad/devkit';

export interface PlaygroundArgs {
  anchor: PaneAnchor;
}

/** An orbit study on a canvas, tuned live from a pane with tabs, folders, rows and monitors. */
export function playground(host: HTMLElement, { anchor }: PlaygroundArgs): () => void {
  const params = {
    orbs: 24,
    speed: 0.6,
    radius: 180,
    size: 6,
    wobble: 0.25,
    hue: '#38bdf8',
    glow: { r: 0.97, g: 0.45, b: 0.09 },
    blend: 'lighter' as GlobalCompositeOperation,
    trails: true,
    paused: false,
    caption: 'Orbit study',
    seed: 7,
  };
  const stats = { angle: 0 };

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display: block; inline-size: 100%; block-size: 100%;';
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const resize = new ResizeObserver(() => {
    canvas.width = host.clientWidth * devicePixelRatio;
    canvas.height = host.clientHeight * devicePixelRatio;
  });
  resize.observe(host);

  const pane = new Pane({ title: 'Playground', anchor });
  const tabs = pane.addTabs({
    pages: [{ title: 'Scene' }, { title: 'Style' }, { title: 'Stats' }],
  });
  const [scene, style, perf] = tabs.pages as [
    (typeof tabs.pages)[number],
    (typeof tabs.pages)[number],
    (typeof tabs.pages)[number],
  ];

  scene.addBinding(params, 'caption', { label: 'Caption' });
  scene.addBinding(params, 'paused', { label: 'Paused', view: 'switch' });
  const actions = scene.addFolder({ title: 'Actions' });
  actions.addButton({
    name: 'reset-scene',
    title: 'Reset scene',
    onClick: () => {
      Object.assign(params, { orbs: 24, speed: 0.6, radius: 180, wobble: 0.25, seed: 7 });
      params.paused = false;
      stats.angle = 0;
    },
  });
  actions.addRow({
    name: 'playback',
    label: 'Playback',
    items: [
      { type: 'button', title: 'Pause', onClick: () => (params.paused = true) },
      { type: 'button', title: 'Resume', onClick: () => (params.paused = false) },
    ],
  });
  const motion = scene.addFolder({ title: 'Motion' });
  motion.addBinding(params, 'orbs', { label: 'Orbs', min: 1, max: 200, step: 1 });
  motion.addRow({
    name: 'speed-control',
    items: [
      { type: 'binding', target: params, key: 'speed', label: 'Speed', min: 0, max: 4, step: 0.01 },
      { type: 'button', title: 'Reset', width: 'auto', onClick: () => (params.speed = 0.6) },
    ],
  });
  motion.addBinding(params, 'radius', { label: 'Radius', min: 20, max: 400, step: 1 });
  motion.addBinding(params, 'wobble', { label: 'Wobble', min: 0, max: 1, step: 0.01 });
  motion.addBinding(params, 'seed', { label: 'Seed', step: 1 });
  const live = scene.addFolder({ title: 'Live values' });
  live.addBinding(stats, 'angle', {
    label: 'Angle (app-driven)',
    min: 0,
    max: 6.283,
    precision: 2,
  });

  style.addBinding(params, 'hue', { label: 'Orb color (native)', color: { picker: 'native' } });
  style.addBinding(params, 'glow', {
    label: 'Glow (Tweakpad)',
    color: { type: 'float', picker: 'tweakpad' },
  });
  style.addBinding(params, 'size', { label: 'Orb size', min: 1, max: 24, step: 0.5 });
  style.addBinding(params, 'blend', {
    label: 'Blend',
    options: { Add: 'lighter', Normal: 'source-over', Screen: 'screen', Multiply: 'multiply' },
  });
  style.addBinding(params, 'trails', { label: 'Trails' });

  // The default monitor: FPS and frame time, with memory below, measuring this app's own loop
  // through begin()/end().
  const monitor = perf.addPerformanceMonitor();
  perf.addBinding(stats, 'angle', { view: 'monitor', label: 'Angle', precision: 3, interval: 0 });

  const draw = () => {
    const w = canvas.width;
    const h = canvas.height;
    const dpr = devicePixelRatio;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = params.trails ? 'rgba(10, 10, 12, 0.18)' : 'rgb(10, 10, 12)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = params.blend;
    const glow = `rgb(${params.glow.r * 255}, ${params.glow.g * 255}, ${params.glow.b * 255})`;
    for (let i = 0; i < params.orbs; i++) {
      const phase = (i / params.orbs) * Math.PI * 2 + stats.angle * (1 + (i % params.seed) * 0.1);
      const r = params.radius * (1 + params.wobble * Math.sin(phase * 3 + i)) * dpr;
      ctx.fillStyle = i % 2 ? params.hue : glow;
      ctx.beginPath();
      ctx.arc(
        w / 2 + Math.cos(phase) * r,
        h / 2 + Math.sin(phase) * r,
        params.size * dpr,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `${14 * dpr}px system-ui`;
    ctx.fillText(params.caption, 16 * dpr, 28 * dpr);
  };

  let last = performance.now();
  let request = 0;
  const frame = (now: number) => {
    const dt = now - last;
    last = now;
    monitor.begin();
    if (!params.paused) stats.angle = (stats.angle + (dt / 1000) * params.speed) % (Math.PI * 2);
    draw();
    monitor.end();
    request = requestAnimationFrame(frame);
  };
  request = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(request);
    resize.disconnect();
    pane.dispose();
  };
}
