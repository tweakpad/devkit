import '@tweakpad/ui/styles.css';
import { Pane } from '../src/index.js';

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
const stats = { fps: 0, frameMs: 0, angle: 0 };

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
}
addEventListener('resize', resize);
resize();

const pane = new Pane({ title: 'Playground' });
const tabs = pane.addTabs({ pages: [{ title: 'Scene' }, { title: 'Style' }, { title: 'Stats' }] });
const [scene, style, perf] = tabs.pages as [
  (typeof tabs.pages)[number],
  (typeof tabs.pages)[number],
  (typeof tabs.pages)[number],
];

scene.addBinding(params, 'caption', { label: 'Caption' });
scene.addBinding(params, 'paused', { label: 'Paused', view: 'switch' });
const motion = scene.addFolder({ title: 'Motion' });
motion.addBinding(params, 'orbs', { label: 'Orbs', min: 1, max: 200, step: 1 });
motion.addBinding(params, 'speed', { label: 'Speed', min: 0, max: 4, step: 0.01 });
motion.addBinding(params, 'radius', { label: 'Radius', min: 20, max: 400, step: 1 });
motion.addBinding(params, 'wobble', { label: 'Wobble', min: 0, max: 1, step: 0.01 });
motion.addBinding(params, 'seed', { label: 'Seed', step: 1 });
const live = scene.addFolder({ title: 'Live values' });
live.addBinding(stats, 'angle', { label: 'Angle (app-driven)', min: 0, max: 6.283, precision: 2 });

style.addBinding(params, 'hue', { label: 'Orb color' });
style.addBinding(params, 'glow', { label: 'Glow', color: { type: 'float' } });
style.addBinding(params, 'size', { label: 'Orb size', min: 1, max: 24, step: 0.5 });
style.addBinding(params, 'blend', {
  label: 'Blend',
  options: { Add: 'lighter', Normal: 'source-over', Screen: 'screen', Multiply: 'multiply' },
});
style.addBinding(params, 'trails', { label: 'Trails' });

perf.addMonitor(stats, 'fps', { label: 'FPS', view: 'graph', min: 0, max: 144, precision: 0 });
perf.addMonitor(stats, 'frameMs', { label: 'Frame (ms)', precision: 2 });
perf.addMonitor(stats, 'angle', { label: 'Angle', precision: 3, interval: 0 });

Object.assign(window, { pane, params, stats });

let last = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
function frame(now: number) {
  const dt = now - last;
  last = now;
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 250) {
    stats.fps = (fpsFrames * 1000) / fpsAccum;
    fpsAccum = 0;
    fpsFrames = 0;
  }
  const t0 = performance.now();
  if (!params.paused) stats.angle = (stats.angle + (dt / 1000) * params.speed) % (Math.PI * 2);
  draw();
  stats.frameMs = performance.now() - t0;
  requestAnimationFrame(frame);
}

function draw() {
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
    const x = w / 2 + Math.cos(phase) * r;
    const y = h / 2 + Math.sin(phase) * r;
    ctx.fillStyle = i % 2 ? params.hue : glow;
    ctx.beginPath();
    ctx.arc(x, y, params.size * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `${14 * dpr}px system-ui`;
  ctx.fillText(params.caption, 16 * dpr, 28 * dpr);
}
requestAnimationFrame(frame);
