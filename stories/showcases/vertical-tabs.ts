import { Pane, type PaneAnchor } from '@tweakpad/devkit';
import { folderIcon } from '@tweakpad/ui/icons/folder';
import { settingsIcon } from '@tweakpad/ui/icons/settings';
import { sunIcon } from '@tweakpad/ui/icons/sun';

export interface VerticalTabsArgs {
  anchor: PaneAnchor;
  side: 'auto' | 'left' | 'right';
}

/** Stacked vertical tab groups with horizontal tabs inside, in a pane short enough to scroll. */
export function verticalTabs(host: HTMLElement, { anchor, side }: VerticalTabsArgs): () => void {
  // A short pane, so the groups scroll.
  const style = document.createElement('style');
  style.textContent = 'tweak-pane::part(panel) { max-block-size: min(28rem, 65dvh); }';
  host.append(style);
  const state = { speed: 0.6, size: 6, enabled: true };
  const pane = new Pane({ title: 'Vertical tabs', anchor });
  pane.addPerformanceMonitor({ metrics: ['fps'] });
  const scene = pane.addTabs({
    orientation: 'vertical',
    side,
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
    side,
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

  return () => pane.dispose();
}
