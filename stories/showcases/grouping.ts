import { Pane, type PaneAnchor } from '@tweakpad/devkit';

export interface GroupingArgs {
  anchor: PaneAnchor;
}

/** Folders and tabs nested in each other, and stacked tab groups at the pane root. */
export function grouping(_host: HTMLElement, { anchor }: GroupingArgs): () => void {
  const state = { enabled: true, speed: 0.6, radius: 180, wobble: 0.25, size: 6, trails: true };
  const pane = new Pane({ title: 'Grouping', anchor });

  const upper = pane.addTabs({ pages: [{ title: 'Scene' }, { title: 'Style' }] });
  const scene = upper.pages[0]!;
  scene.addBinding(state, 'enabled', { label: 'Enabled' });
  const motion = scene.addFolder({ title: 'Motion' });
  motion.addBinding(state, 'speed', { label: 'Speed', min: 0, max: 4 });
  const orbit = motion.addFolder({ title: 'Orbit' });
  orbit.addBinding(state, 'radius', { label: 'Radius', min: 20, max: 400 });
  const variation = orbit.addFolder({ title: 'Variation' });
  variation.addBinding(state, 'wobble', { label: 'Wobble', min: 0, max: 1 });
  const appearance = scene.addFolder({ title: 'Appearance' });
  const nested = appearance.addTabs({ pages: [{ title: 'Shape' }, { title: 'Trail' }] });
  nested.pages[0]!.addBinding(state, 'size', { label: 'Size', min: 1, max: 24 });
  nested.pages[1]!.addBinding(state, 'trails', { label: 'Trails' });
  upper.pages[1]!.addBinding(state, 'trails', { label: 'Trails' });

  const lower = pane.addTabs({ pages: [{ title: 'Playback' }, { title: 'Output' }] });
  lower.pages[0]!.addBinding(state, 'speed', { label: 'Playback speed', min: 0, max: 4 });
  lower.pages[1]!.addBinding(state, 'enabled', { label: 'Output enabled' });

  const output = pane.addFolder({ title: 'Output' });
  output.addBinding(state, 'enabled', { label: 'Enabled' });

  return () => pane.dispose();
}
