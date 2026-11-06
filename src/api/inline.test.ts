import { expectTypeOf, it } from 'vitest';
import type { Pane } from './pane.js';
import type { BindingApi, MonitorApi } from './container.js';
import type { ButtonApi } from './buttons.js';

export function declareMixedRow(pane: Pane) {
  const state = { speed: 1, caption: 'Scene' };
  return pane.addRow({
    items: [
      { type: 'binding', target: state, key: 'speed', min: 0, max: 4 },
      {
        type: 'button',
        title: 'Reset',
        width: 'auto',
        onClick: () => {
          state.speed = 1;
        },
      },
      { type: 'monitor', target: state, key: 'caption' },
    ],
  });
}

it('preserves each inline item handle and binding value type', () => {
  type Items = ReturnType<typeof declareMixedRow>['items'];
  expectTypeOf<Items[0]>().toEqualTypeOf<BindingApi<number>>();
  expectTypeOf<Items[1]>().toEqualTypeOf<ButtonApi>();
  expectTypeOf<Items[2]>().toEqualTypeOf<MonitorApi>();
});

/** Compile-time invalid-key cases; deliberately never called. */
export function rejectInvalidKeys(pane: Pane): void {
  const state = { speed: 1 };
  // @ts-expect-error A binding key must exist on its declared target.
  pane.addRow({ items: [{ type: 'binding', target: state, key: 'missing' }] });
  // @ts-expect-error A monitor key must exist on its declared target.
  pane.addRow({ items: [{ type: 'monitor', target: state, key: 'missing' }] });
}
