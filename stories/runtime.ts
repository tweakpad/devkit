import * as devkit from '@tweakpad/devkit';
import type { PaneOptions } from '@tweakpad/devkit';

/**
 * Storybook's runtime for devkit: what a story or a documentation preview builds is disposed when
 * Storybook re-renders or leaves it, so no pane, frame loop or timer outlives its story.
 */

const cleanups = new Map<string, () => void>();

/** Runs and forgets the cleanup registered for a story, if any. */
export function cleanUp(storyId: string): void {
  const cleanup = cleanups.get(storyId);
  cleanups.delete(storyId);
  cleanup?.();
}

/** Registers what tears a story's render down; a later render of the same story replaces it. */
export function onCleanUp(storyId: string, cleanup: () => void): void {
  cleanUp(storyId);
  cleanups.set(storyId, cleanup);
}

/** The attribute that marks a documentation preview's host. */
export const PREVIEW_HOST = 'data-devkit-preview';
const panesByHost = new WeakMap<Element, Set<devkit.Pane>>();

/**
 * The pane a documentation preview script builds: a `Pane` that remembers the preview it was
 * built in, so disposing the preview disposes it.
 */
class PreviewPane extends devkit.Pane {
  constructor(options: PaneOptions = {}) {
    super(options);
    const host = options.container?.closest(`[${PREVIEW_HOST}]`);
    if (!host) return;
    let panes = panesByHost.get(host);
    if (!panes) panesByHost.set(host, (panes = new Set()));
    panes.add(this);
  }
}

/** `@tweakpad/devkit` as documentation previews import it. */
export const previewDevkit = { ...devkit, Pane: PreviewPane };

/** Disposes the panes a preview built inside `host`. */
export function releasePanes(host: Element): void {
  for (const pane of panesByHost.get(host) ?? []) pane.dispose();
  panesByHost.delete(host);
}

/** Mounts a showcase: returns what tears it down (panes, frame loops, timers, listeners). */
export type Showcase<Args> = (host: HTMLElement, args: Args) => () => void;

/**
 * The render function of a showcase story: a full-size host the showcase builds into, torn down
 * before the story renders again (an Args change) or Storybook leaves it.
 */
export function showcase<Args>(mount: Showcase<Args>) {
  return (args: Args, context: { id: string }): HTMLElement => {
    cleanUp(context.id);
    const host = document.createElement('div');
    host.className = 'devkit-showcase';
    onCleanUp(context.id, mount(host, args));
    return host;
  };
}

/** The `anchor` control of a story whose pane floats over the canvas. */
export const anchor = {
  description: 'The corner the pane floats in',
  control: 'select' as const,
  options: ['top-right', 'top-left', 'bottom-right', 'bottom-left'],
};
