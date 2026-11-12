import { expectTypeOf, it } from 'vitest';
import type { Pane } from './pane.js';
import type { BindingApi, TabsApi } from './container.js';
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
      { type: 'binding', view: 'monitor', target: state, key: 'caption' },
    ],
  });
}

it('preserves each inline item handle and binding value type', () => {
  type Items = ReturnType<typeof declareMixedRow>['items'];
  expectTypeOf<Items[0]>().toEqualTypeOf<BindingApi<number>>();
  expectTypeOf<Items[1]>().toEqualTypeOf<ButtonApi>();
  expectTypeOf<Items[2]>().toEqualTypeOf<BindingApi<string>>();
});

/** Compile-time invalid-key cases; deliberately never called. */
export function rejectInvalidKeys(pane: Pane): void {
  // @ts-expect-error Monitoring uses the regular addBinding API.
  pane.addMonitor({}, 'value');
  const state = { speed: 1 };
  // @ts-expect-error A binding key must exist on its declared target.
  pane.addRow({ items: [{ type: 'binding', target: state, key: 'missing' }] });
  // @ts-expect-error A monitor key must exist on its declared target.
  pane.addRow({ items: [{ type: 'binding', view: 'monitor', target: state, key: 'missing' }] });
}

export function declareVerticalTabs(pane: Pane) {
  const icon = { viewBox: '0 0 24 24', paths: [{ d: 'M0 0h24' }] };
  const vertical = pane.addTabs({
    orientation: 'vertical',
    side: 'right',
    pages: [{ title: 'Scene', icon, color: 'var(--tp-primary)', hint: 'Scene settings' }],
  });
  vertical.pages[0]!.addTabs({ pages: [{ title: 'Motion' }] });
  // @ts-expect-error Vertical pages require icons.
  pane.addTabs({ orientation: 'vertical', pages: [{ title: 'Missing icon' }] });
  return vertical;
}

it('preserves the tabs API for vertical groups', () => {
  expectTypeOf<ReturnType<typeof declareVerticalTabs>>().toEqualTypeOf<TabsApi>();
});
