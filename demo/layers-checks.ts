import type { TpLayers } from '@tweakpad/ui/widgets';
import { Pane } from '../src/index.js';
import type { TweakLayers } from '../src/elements/layers.js';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const frames = async (count: number) => {
  for (let i = 0; i < count; i++) await frame();
};

/** Every element under `root`, through open shadow roots. */
function deep(root: ParentNode, tag: string): HTMLElement[] {
  const found: HTMLElement[] = [];
  const walk = (node: ParentNode) => {
    for (const el of node.querySelectorAll<HTMLElement>('*')) {
      if (el.localName === tag) found.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(root);
  if (root instanceof Element && root.shadowRoot) walk(root.shadowRoot);
  return found;
}

type Row = HTMLElement & { value: string };

/**
 * Layer stacks through real panes, on the library's Layers widget: the widget's proposals become
 * the stack's changes under its rules, and the stack's state becomes the widget's.
 */
export async function checkLayers(): Promise<string[]> {
  const checks: string[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;inline-size:320px;opacity:0.01';
  document.body.append(host);
  const panes: Pane[] = [];
  const open = (history?: string) => {
    const pane = new Pane({
      container: host,
      title: 'Layer checks',
      ...(history ? { history: { key: history, storage: 'memory' as const } } : {}),
    });
    panes.push(pane);
    return pane;
  };
  const widget = (stack: { element: TweakLayers }): TpLayers => stack.element.layers;
  const rows = (stack: { element: TweakLayers }) => deep(stack.element, 'tp-tree-item') as Row[];
  const row = (stack: { element: TweakLayers }, id: string) =>
    rows(stack).find((item) => item.value === id)!;
  /** The span showing a row's name. */
  const label = (item: Row) =>
    [...item.querySelectorAll<HTMLElement>(':scope > span:not([slot])')].at(0)!;
  const settle = async (stack: { element: TweakLayers }) => {
    await stack.element.updateComplete;
    await widget(stack).updateComplete;
    await frames(2);
  };

  try {
    // Selection, panels and events.
    const pane = open();
    const params = { size: 1, other: 2 };
    const events: string[] = [];
    let allowMove = true;
    let allowRemove = true;
    const stack = pane.addLayers({
      rename: true,
      remove: true,
      states: [{ key: 'visible', label: 'Visible', default: true, mutes: true }],
      allow: {
        move: () => allowMove,
        remove: () => allowRemove,
        rename: (_layer, name) => name.slice(0, 8),
      },
      types: { dot: { title: 'Dot' }, ring: { title: 'Ring' } },
      layers: [
        { id: 'a', name: 'A', controls: (panel) => panel.addBinding(params, 'size') },
        { id: 'b', name: 'B', controls: (panel) => panel.addBinding(params, 'other') },
        { id: 'c', name: 'C' },
      ],
      footer: [{ type: 'add' }, { type: 'remove' }],
    });
    for (const type of ['select', 'reorder', 'rename', 'state', 'add', 'remove'] as const)
      stack.on(type, (event) => events.push(`${type}:${event.source}`));
    await settle(stack);
    const shownPages = () =>
      [...stack.element.panels.children].filter((page) => !(page as HTMLElement).hidden).length;
    check(
      stack.selected?.id === 'a' && shownPages() === 1 && widget(stack).active === 'a',
      'the top layer starts active, in the widget too',
    );
    check(rows(stack).length === 3, 'the widget shows a row per layer');
    widget(stack).selectLayers(['b'], 'b');
    await settle(stack);
    check(
      stack.selected?.id === 'b' && shownPages() === 1 && events.at(-1) === 'select:user',
      'a selection the widget proposes makes the layer active and shows only its panel',
    );
    widget(stack).selectLayers(['c'], 'c');
    await settle(stack);
    check(stack.element.panels.hidden === true, 'a layer without controls shows no panel');
    widget(stack).selectLayers(['a', 'c'], 'c');
    await settle(stack);
    check(
      stack.selection.map((layer) => layer.id).join() === 'a,c' && stack.selected?.id === 'c',
      'several layers can be selected, one of them active',
    );

    // Reorder through the widget, as a drop does, and the rule that refuses it.
    events.length = 0;
    widget(stack).moveLayers(['c'], { parentId: null, index: 0 });
    await settle(stack);
    check(
      stack.layers.map((layer) => layer.id).join() === 'c,a,b' &&
        events.join() === 'reorder:user' &&
        rows(stack)[0]!.value === 'c',
      'a move the widget proposes reorders the stack and fires reorder from the user',
    );
    allowMove = false;
    check(
      widget(stack).canDrop?.({
        itemId: 'c',
        fromParentId: null,
        fromIndex: 0,
        toParentId: null,
        toIndex: 2,
      }) === false,
      'the move rule keeps the widget from offering a place',
    );
    widget(stack).moveLayers(['c'], { parentId: null, index: 2 });
    await settle(stack);
    check(
      stack.layers.map((layer) => layer.id).join() === 'c,a,b' && rows(stack)[0]!.value === 'c',
      'a move the rule refuses leaves the stack as it was',
    );
    stack.move('b', 0);
    await settle(stack);
    check(
      stack.layers[0]!.id === 'b' &&
        events.at(-1) === 'reorder:api' &&
        rows(stack)[0]!.value === 'b',
      'code moves past rules, and the widget follows',
    );
    allowMove = true;

    // Rows are the pane's control rows.
    const probe = document.createElement('div');
    probe.style.blockSize = 'var(--tp-control-height-md)';
    stack.element.shadowRoot!.append(probe);
    const controlHeight = parseFloat(getComputedStyle(probe).blockSize);
    probe.remove();
    check(
      rows(stack).every(
        (item) => Math.abs(item.getBoundingClientRect().height - controlHeight) < 0.5,
      ),
      'layer rows have the height of the pane’s controls',
    );

    // Rename, through the widget's field, and the rule that corrects the name.
    stack.selected = 'a';
    await settle(stack);
    await widget(stack).renameLayer('a');
    await settle(stack);
    const input = deep(stack.element, 'tp-input').find((field) =>
      field.hasAttribute('data-layer-rename'),
    ) as HTMLElement & { value: string };
    check(input !== undefined, 'renaming opens a field in the row');
    const field = (input.querySelector('input') ??
      input.shadowRoot?.querySelector('input')) as HTMLInputElement;
    field.value = 'Renamed layer';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settle(stack);
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
    );
    await settle(stack);
    check(
      stack.get('a')!.name === 'Renamed' &&
        events.at(-1) === 'rename:user' &&
        label(row(stack, 'a')).textContent?.trim() === 'Renamed',
      'Enter renames the layer, as the rename rule corrects it',
    );

    // States dim the row, and a disabled layer is frozen.
    stack.get('a')!.setState('visible', false);
    await settle(stack);
    check(
      label(row(stack, 'a')).hasAttribute('data-dimmed') && events.at(-1) === 'state:api',
      'a muting state off dims the row',
    );
    stack.get('b')!.setState('enabled', false);
    await settle(stack);
    check(
      widget(stack).getLayerState('b', 'enabled') === 'false' &&
        row(stack, 'b').getAttribute('aria-disabled') === 'true',
      'a disabled layer is frozen in the widget',
    );
    stack.get('b')!.setState('enabled', true);

    // Remove, and the rule that refuses it.
    const removeButton = deep(stack.element, 'tp-button').find(
      (button) =>
        (button as HTMLElement & { ariaLabel: string | null }).ariaLabel === 'Remove layer',
    ) as HTMLElement & { disabled: boolean };
    // Rules are asked again whenever the stack changes, and on each press.
    allowRemove = false;
    stack.selected = 'c';
    await settle(stack);
    check(removeButton.disabled, 'the remove action is disabled while the rule refuses');
    allowRemove = true;
    stack.selected = 'b';
    await settle(stack);
    removeButton.click();
    await settle(stack);
    check(
      !stack.get('b') && stack.selected !== null && events.includes('remove:user'),
      'the remove action removes the selected layer and makes a neighbour active',
    );

    // Delete on a focused row removes the selection, and focus goes to the layer in its place.
    stack.add({ type: 'dot' });
    stack.add({ type: 'ring' });
    await settle(stack);
    widget(stack).selectLayers(['dot-1', 'ring-2'], 'dot-1');
    await settle(stack);
    await widget(stack).focusLayer('dot-1');
    row(stack, 'dot-1').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, composed: true }),
    );
    await settle(stack);
    const focused = deep(stack.element, 'tp-tree-item').find((item) => item.matches(':focus'));
    check(
      !stack.get('dot-1') &&
        !stack.get('ring-2') &&
        stack.selected !== null &&
        (focused as Row | undefined)?.value === stack.selected.id,
      'Delete removes the selected layers and focuses the layer that takes their place',
    );

    // Adding from types.
    const added = stack.add({ type: 'dot', select: true });
    check(
      added.id === 'dot-3' && added.name === 'Dot' && stack.selected === added,
      'an added layer takes its type defaults and an id from its type',
    );
    pane.dispose();

    // Alignment: when some layers have icons, every name starts at the same place.
    const aligned = open();
    const icon = { viewBox: '0 0 24 24', paths: [{ d: 'M4 4h16v16H4z' }] };
    const mixed = aligned.addLayers({
      layers: [{ name: 'With icon', icon }, { name: 'Without icon' }, { name: 'Also', icon }],
    });
    await settle(mixed);
    const starts = rows(mixed).map((item) => label(item).getBoundingClientRect().left);
    check(
      starts.length === 3 && starts.every((left) => Math.abs(left - starts[0]!) < 0.5),
      'names line up when only some layers have icons',
    );
    aligned.dispose();

    // History: the structure, names, states and panel values survive a reload.
    const key = `layer-checks-${Math.random().toString(36).slice(2)}`;
    const build = (session: Pane, values: { a: number }[], handles: { value: number }[] = []) =>
      session.addLayers({
        id: 'stack',
        rename: true,
        remove: true,
        types: {
          spot: {
            title: 'Spot',
            controls: (panel) => {
              const value = { a: 1 };
              values.push(value);
              handles.push(panel.addBinding(value, 'a', { min: 0, max: 10 }));
            },
          },
        },
        layers: [{ id: 'base', name: 'Base' }],
      });
    const first = open(key);
    const firstValues: { a: number }[] = [];
    const firstHandles: { value: number }[] = [];
    const before = build(first, firstValues, firstHandles);
    const spot = before.add({ type: 'spot' });
    spot.name = 'Key light';
    spot.setState('enabled', false);
    firstHandles[0]!.value = 7;
    before.move(spot, 1);
    await frames(3);
    first.history!.advance('v1');
    first.dispose();

    const second = open(key);
    const secondValues: { a: number }[] = [];
    const after = build(second, secondValues);
    check(
      after.layers.map((layer) => `${layer.id}:${layer.name}:${layer.states.enabled}`).join() ===
        'base:Base:true,spot-1:Key light:false',
      'a reload restores the order, added layers, names and states',
    );
    check(secondValues[0]?.a === 7, "a reload restores an added layer's panel values");
    const restoredEvents: string[] = [];
    after.on('add', (event) => restoredEvents.push(`add:${event.source}`));
    after.on('remove', (event) => restoredEvents.push(`remove:${event.source}`));
    after.get('spot-1')!.remove();
    const v1 = second.history!.versions.find((version) => version.label === 'v1')!;
    second.history!.restore(v1.id);
    await settle(after);
    check(
      after.get('spot-1')?.name === 'Key light' &&
        restoredEvents.join() === 'remove:api,add:restore' &&
        rows(after).length === 2,
      'restoring a version re-creates a removed layer from its type',
    );
    second.dispose();

    // Cost: 200 layers with five controls each.
    const big = open();
    const values = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const startBuild = performance.now();
    const many = big.addLayers({
      layers: Array.from({ length: 200 }, (_, index) => ({
        name: `Layer ${index}`,
        controls: (panel) => {
          for (const key of ['a', 'b', 'c', 'd', 'e'] as const) panel.addBinding(values, key);
        },
      })),
    });
    await settle(many);
    const buildMs = performance.now() - startBuild;
    const startSelect = performance.now();
    many.selected = many.layers[150]!;
    await settle(many);
    const selectMs = performance.now() - startSelect;
    console.info(
      `devkit layers: 200 layers × 5 controls in ${buildMs.toFixed(0)} ms, select ${selectMs.toFixed(0)} ms`,
    );
    check(rows(many).length === 200, 'a stack renders 200 layers');
    big.dispose();
  } finally {
    for (const pane of panes) if (pane.element.isConnected) pane.dispose();
    host.remove();
  }
  return checks;
}
