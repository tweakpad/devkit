import type { TpDragDropList } from '@tweakpad/ui';
import { Pane } from '../src/index.js';
import type { TweakLayerRow, TweakLayers } from '../src/elements/layers.js';

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

/** Layer stacks through real panes: rows, rules, panels, alignment, history and cost. */
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
  const rows = (stack: { element: TweakLayers }) =>
    deep(stack.element, 'tweak-layer-row') as TweakLayerRow[];
  const settle = async (stack: { element: TweakLayers }) => {
    await stack.element.updateComplete;
    await stack.element.list.updateComplete;
    for (const row of rows(stack)) await row.updateComplete;
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
      allow: { move: () => allowMove, remove: () => allowRemove },
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
    check(stack.selected?.id === 'a' && shownPages() === 1, 'the top layer starts selected');
    rows(stack)[1]!.click();
    await settle(stack);
    check(
      stack.selected?.id === 'b' && shownPages() === 1 && events.at(-1) === 'select:user',
      'a click selects a layer and shows only its panel',
    );
    rows(stack)[2]!.click();
    await settle(stack);
    check(stack.element.panels.hidden === true, 'a layer without controls shows no panel');
    check(
      deep(stack.element, 'tp-list-item').filter((item) => item.hasAttribute('selected')).length ===
        1,
      'exactly one row shows as selected',
    );

    // Reorder through the list, as a drop does, and the rule that refuses it.
    const list = stack.element.list as TpDragDropList<unknown>;
    events.length = 0;
    list.moveItem('c', { index: 0 });
    await settle(stack);
    check(
      stack.layers.map((layer) => layer.id).join() === 'c,a,b' && events.join() === 'reorder:user',
      'a drop reorders the stack and fires reorder from the user',
    );
    allowMove = false;
    list.moveItem('c', { index: 2 });
    await settle(stack);
    check(
      stack.layers.map((layer) => layer.id).join() === 'c,a,b',
      'a drop the move rule refuses goes back',
    );
    stack.move('b', 0);
    check(stack.layers[0]!.id === 'b' && events.at(-1) === 'reorder:api', 'code moves past rules');

    // Rows are the pane's control rows.
    const probe = document.createElement('div');
    probe.style.blockSize = 'var(--tp-control-height-md)';
    stack.element.shadowRoot!.append(probe);
    const controlHeight = parseFloat(getComputedStyle(probe).blockSize);
    probe.remove();
    const rowHeights = deep(stack.element, 'tp-list-item').map(
      (item) => item.getBoundingClientRect().height,
    );
    check(
      rowHeights.every((height) => Math.abs(height - controlHeight) < 0.5),
      'layer rows have the height of the pane’s controls',
    );

    // Rename with a double-click.
    const target = rows(stack).find((row) => row.layerId === 'a')!;
    const nameRange = document.createRange();
    nameRange.selectNodeContents(target.renderRoot.querySelector('.label')!);
    const nameStart = nameRange.getBoundingClientRect().left;
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await settle(stack);
    const input = target.renderRoot.querySelector('tp-input') as HTMLElement & { value: string };
    check(input !== null, 'a double-click opens the name for editing');
    const field = (input.querySelector('input') ??
      input.shadowRoot?.querySelector('input')) as HTMLInputElement;
    const copy = input.shadowRoot?.querySelector('[part~="input-copy"]');
    const fieldStyle = getComputedStyle(field);
    check(
      (!copy || getComputedStyle(copy).display === 'none') &&
        fieldStyle.textAlign === 'start' &&
        Math.abs(
          field.getBoundingClientRect().left + parseFloat(fieldStyle.paddingLeft) - nameStart,
        ) < 0.5,
      'the rename field offers no copy and starts its text where the name was',
    );
    field.value = 'Renamed';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settle(stack);
    field.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
    );
    await settle(stack);
    check(
      stack.get('a')!.name === 'Renamed' && events.at(-1) === 'rename:user',
      'Enter renames the layer',
    );

    // Leaving the field for another control keeps the name and leaves focus there.
    const other = rows(stack).find((row) => row.layerId === 'c')!;
    other.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await settle(stack);
    const elsewhere = document.createElement('input');
    host.append(elsewhere);
    elsewhere.focus();
    await settle(stack);
    check(
      !other.renaming && document.activeElement === elsewhere,
      'a rename ended by focusing elsewhere leaves focus there',
    );
    elsewhere.remove();

    // States mute the row.
    stack.get('a')!.setState('visible', false);
    await settle(stack);
    check(
      rows(stack).find((row) => row.layerId === 'a')!.muted && events.at(-1) === 'state:api',
      'a muting state off dims the row',
    );

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
      'the remove action removes the selected layer and selects a neighbour',
    );

    // Adding from types.
    const added = stack.add({ type: 'dot', select: true });
    check(
      added.id === 'dot-1' && added.name === 'Dot' && stack.selected === added,
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
    const starts = rows(mixed).map(
      (row) => row.renderRoot.querySelector('.label')!.getBoundingClientRect().left,
    );
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
            controls: (panel, layer) => {
              const value = { a: 1 };
              values.push(value);
              handles.push(panel.addBinding(value, 'a', { min: 0, max: 10 }));
              void layer;
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
    check(
      after.get('spot-1')?.name === 'Key light' &&
        restoredEvents.join() === 'remove:api,add:restore',
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
