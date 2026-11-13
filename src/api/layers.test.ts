import { expectTypeOf, it } from 'vitest';
import type { Pane } from './pane.js';
import type { LayerApi, LayersApi } from './layers.js';

interface Sky {
  opacity: number;
}

export function declareStack(pane: Pane) {
  return pane.addLayers({
    states: [{ key: 'visible', label: 'Visible', default: true }],
    types: {
      sun: { title: 'Sun', data: (): Sky => ({ opacity: 1 }) },
      moon: { title: 'Moon', data: (): Sky => ({ opacity: 1 }) },
    },
    layers: [{ type: 'sun', states: { visible: false } }],
    allow: { add: (type) => type !== 'moon' },
  });
}

export function declarePlainStack(pane: Pane) {
  return pane.addLayers({ layers: [{ name: 'Background' }] });
}

it('types state keys, layer types and data from the declaration', () => {
  type Stack = ReturnType<typeof declareStack>;
  expectTypeOf<Stack>().toEqualTypeOf<LayersApi<'visible', Sky, 'sun' | 'moon'>>();
  type Layer = Stack['layers'][number];
  expectTypeOf<Layer['states']>().toEqualTypeOf<Readonly<Record<'enabled' | 'visible', boolean>>>();
  expectTypeOf<Layer['type']>().toEqualTypeOf<'sun' | 'moon' | null>();
  expectTypeOf<Layer['data']>().toEqualTypeOf<Sky>();
  expectTypeOf<ReturnType<typeof declarePlainStack>['layers'][number]>().toEqualTypeOf<
    LayerApi<never, unknown, never>
  >();
});

export function rejectsUnknownKeys(pane: Pane, stack: ReturnType<typeof declareStack>) {
  // @ts-expect-error: `locked` is not a state of the stack.
  stack.layers[0]!.setState('locked', true);
  // @ts-expect-error: `star` is not a type of the stack.
  stack.add({ type: 'star' });
  pane.addLayers({
    states: [{ key: 'visible', label: 'Visible' }],
    // @ts-expect-error: per-layer states use the stack's keys.
    layers: [{ name: 'A', states: { hidden: true } }],
  });
}
