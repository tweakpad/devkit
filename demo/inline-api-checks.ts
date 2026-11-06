import type { TpButton, TpSlider } from '@tweakpad/ui';
import { Pane } from '../src/index.js';

/** Mixed-control regressions use public declarations and handles only. */
export async function checkInlineApi(): Promise<string[]> {
  const pane = new Pane({ title: 'Inline API checks', refresh: 'manual' });
  const checks: string[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  try {
    const target = { speed: 2 };
    let resets = 0;
    const folder = pane.addFolder({ title: 'Motion' });
    const row = folder.addRow({
      name: 'mixed',
      items: [
        { type: 'binding', target, key: 'speed', label: 'Speed', min: 0, max: 4 },
        {
          type: 'button',
          title: 'Reset',
          width: 'auto',
          onClick: () => {
            target.speed = 0.6;
            resets++;
          },
        },
      ],
    });
    await pane.element.updateComplete;
    await folder.element.updateComplete;
    for (let i = 0; i < 60 && !row.element.querySelector('tp-slider'); i++) await frame();
    const slider = row.element.querySelector<TpSlider>('tp-slider')!;
    const reset = row.element.querySelector<TpButton>('tp-button')!;
    check(!!slider && !!reset, 'mixed row mounts its normal slider and button controls');
    await Promise.all([slider.updateComplete, reset.updateComplete]);
    const sliderBox = slider.getBoundingClientRect();
    const buttonBox = reset.getBoundingClientRect();
    check(
      sliderBox.width > buttonBox.width && Math.abs(sliderBox.top - buttonBox.top) < 1,
      'slider fills remaining space beside an intrinsic-width Reset',
    );
    row.items[0].value = 3;
    await frame();
    check(
      target.speed === 3 && Number(slider.value) === 3,
      'typed binding handle updates object and rendered slider',
    );
    slider.dispatchEvent(
      new CustomEvent('tp-value-change', {
        detail: { value: 1.75 },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    check(target.speed === 1.75, 'slider proposals write the original object in a mixed row');
    reset.click();
    row.items[0].refresh();
    await frame();
    check(
      target.speed === 0.6 && Number(slider.value) === 0.6 && resets === 1,
      'Reset changes the binding through normal application state',
    );
    check(
      pane.filter('speed') === 1 && !row.element.hidden && reset.getClientRects().length > 0,
      'binding search retains its accompanying action',
    );
    check(
      pane.filter('reset') === 1 && slider.getClientRects().length > 0,
      'action search retains the complete mixed composition',
    );
    check(
      pane.filter('missing') === 0 && row.element.getClientRects().length === 0,
      'nonmatching mixed rows leave no surface behind',
    );
    reset.click();
    check(resets === 1, 'filtering a composition blocks child action callbacks');
    pane.filter('');
    row.disabled = true;
    check(
      slider.disabled && reset.disabled && !row.items[0].disabled,
      'parent disabled state composes without rewriting child flags',
    );
    row.items[1].disabled = true;
    row.disabled = false;
    check(
      !slider.disabled && reset.disabled,
      're-enabling a mixed row preserves action-specific disabling',
    );
    row.items[1].disabled = false;
    row.hidden = true;
    reset.click();
    check(
      resets === 1 && row.element.getClientRects().length === 0,
      'explicit row hiding suppresses its entire composition',
    );
    row.hidden = false;
    row.items[1].hidden = true;
    check(
      pane.filter('reset') === 0,
      'hidden child metadata cannot keep its composition in search results',
    );
    pane.filter('');
    row.items[0].hidden = true;
    check(
      row.element.hidden === true,
      'a composition with every item hidden removes its empty shell',
    );
    row.items[0].hidden = false;
    check(!row.element.hidden, 'unhiding an item restores the composition without custom DOM');
    row.items[1].hidden = false;
    row.dispose();
    reset.click();
    check(
      resets === 1 && pane.filter('mixed') === 0,
      'mixed-row disposal removes bindings, callbacks and search eligibility',
    );
    return checks;
  } finally {
    pane.dispose();
  }
}
