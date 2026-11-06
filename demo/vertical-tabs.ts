import '@tweakpad/ui/styles.css';
import { Pane } from '../src/index.js';
import { sunIcon } from '@tweakpad/ui/icons/sun';
import { settingsIcon } from '@tweakpad/ui/icons/settings';
import { folderIcon } from '@tweakpad/ui/icons/folder';

const state = { fps: 60, speed: 0.6, size: 6, enabled: true };
const pane = new Pane({ title: 'Vertical tabs preview' });
pane.addBinding(state, 'fps', { label: 'FPS', view: 'monitor' });
const scene = pane.addTabs({
  orientation: 'vertical',
  pages: [
    { title: 'Scene', icon: folderIcon, color: '#a78bfa', hint: 'Scene settings' },
    { title: 'Lighting', icon: sunIcon, color: '#fbbf24' },
    { title: 'Settings', icon: settingsIcon, color: '#6ee7b7' },
  ],
});
const inner = scene.pages[0]!.addTabs({ pages: [{ title: 'Motion' }, { title: 'Shape' }] });
inner.pages[0]!.addBinding(state, 'speed', { min: 0, max: 4 });
for (let i = 0; i < 12; i++) {
  const layer = { amount: i / 12 };
  inner.pages[0]!.addBinding(layer, 'amount', { label: `Layer ${i + 1}`, min: 0, max: 1 });
}
inner.pages[1]!.addBinding(state, 'size', { min: 1, max: 24 });
scene.pages[1]!.addBinding(state, 'enabled');
scene.pages[2]!.addFolder({ title: 'Options' }).addBinding(state, 'enabled');
pane.addBinding(state, 'enabled', { label: 'Shared control' });
const lower = pane.addTabs({
  orientation: 'vertical',
  pages: [
    { title: 'Output', icon: folderIcon, color: '#7dd3fc' },
    { title: 'Settings', icon: settingsIcon, color: '#fda4af' },
  ],
});
lower.pages[0]!.addBinding(state, 'enabled');
for (let i = 0; i < 6; i++) {
  const channel = { enabled: true };
  lower.pages[0]!.addBinding(channel, 'enabled', { label: `Channel ${i + 1}` });
}
lower.pages[1]!.addBinding(state, 'size', { min: 1, max: 24 });

document.getElementById('flip')!.addEventListener('click', () => {
  pane.element.anchor = pane.element.anchor === 'top-right' ? 'top-left' : 'top-right';
});

document.getElementById('placement')!.addEventListener('click', (event) => {
  const placement = scene.element.placement === 'outside' ? 'inside' : 'outside';
  scene.element.placement = placement;
  lower.element.placement = placement;
  (event.currentTarget as HTMLButtonElement).textContent =
    placement === 'outside' ? 'Try inside tabs' : 'Try outside tabs';
});
