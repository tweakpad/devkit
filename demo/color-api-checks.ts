import type { TpColorInput } from '@tweakpad/ui';
import type { TpColorPicker } from '@tweakpad/ui/widgets';
import { Pane } from '../src/index.js';

/** Picker selection goes through public binding configuration, including mixed rows. */
export async function checkColorApi(): Promise<string[]> {
  const pane = new Pane({ title: 'Color API checks', refresh: 'manual', colorPicker: 'tweakpad' });
  const checks: string[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  try {
    const object = { r: 1, g: 0, b: 0 };
    const target = { native: '#123456', object, css: 'rgba(255, 0, 0, 0.5)', inline: '#336699' };
    const native = pane.addBinding(target, 'native', { color: { picker: 'native' } });
    const custom = pane.addBinding(target, 'object', { color: { type: 'float' } });
    const css = pane.addBinding(target, 'css', {
      color: { picker: 'tweakpad', format: 'hsl', alpha: true },
    });
    const inline = pane.addRow({
      items: [
        { type: 'binding', target, key: 'inline', color: { picker: 'tweakpad' } },
        {
          type: 'button',
          title: 'Reset color',
          width: 'auto',
          onClick: () => {
            target.inline = '#336699';
          },
        },
      ],
    });
    await pane.element.updateComplete;
    for (let i = 0; i < 90 && !inline.element.querySelector('tp-color-picker'); i++) await frame();
    const nativeInput = native.element.querySelector<TpColorInput>('tp-color-input')!;
    const picker = custom.element.querySelector<TpColorPicker>('tp-color-picker')!;
    const cssPicker = css.element.querySelector<TpColorPicker>('tp-color-picker')!;
    const rowPicker = inline.element.querySelector<TpColorPicker>('tp-color-picker')!;
    check(
      !!nativeInput && !!picker && !!cssPicker && !!rowPicker,
      'picker configuration works for standalone bindings and mixed rows',
    );
    await Promise.all([nativeInput, picker, cssPicker, rowPicker].map((el) => el.updateComplete));
    const trigger = picker.querySelector<TpColorInput>('tp-color-input[slot="trigger"]')!;
    await trigger.updateComplete;
    check(
      nativeInput.picker === 'native' &&
        (nativeInput.inputElement as HTMLInputElement).type === 'color',
      'native override retains the browser color input',
    );
    check(
      picker.picker === 'popup' && trigger.picker === 'none' && trigger.variant === 'inline',
      'pane default uses a Tweakpad popup with the standard inline trigger',
    );
    let nativeFinished = 0;
    let customFinished = 0;
    native.on('finish', () => {
      nativeFinished++;
    });
    custom.on('finish', () => {
      customFinished++;
    });
    check(
      nativeInput.setValue('#445566') && target.native === '#445566',
      'native color proposals update the original binding',
    );
    check(
      picker.setValue('#00ff00') &&
        target.object === object &&
        object.r === 0 &&
        object.g === 1 &&
        object.b === 0,
      'Tweakpad proposals preserve and update float RGB objects',
    );
    await picker.updateComplete;
    await trigger.updateComplete;
    check(trigger.value === picker.value, 'popup proposals synchronize the inline value text');
    check(
      trigger.setValue('#0000ff') && object.b === 1 && object.g === 0,
      'inline trigger text edits flow through the popup into the binding',
    );
    await frame();
    check(
      nativeFinished === 1 && customFinished === 1,
      'both picker paths preserve coalesced finish notifications',
    );
    check(
      cssPicker.format === 'hsl' && cssPicker.alpha && !picker.alpha,
      'format and alpha settings survive picker selection and object conversion',
    );
    cssPicker.setValue('rgba(0, 255, 0, 0.25)');
    check(
      Math.abs((cssPicker.color?.alpha ?? -1) - 0.25) < 0.001 && target.css.startsWith('hsl'),
      'Tweakpad picker preserves configured CSS format and alpha',
    );
    target.object.r = 1;
    target.object.g = 0;
    target.object.b = 1;
    custom.refresh();
    await frame();
    await picker.updateComplete;
    await trigger.updateComplete;
    check(
      picker.value === '#ff00ff' && trigger.value === '#ff00ff',
      'external object changes update both composed picker surfaces',
    );
    trigger.inputElement!.click();
    await picker.updateComplete;
    await frame();
    check(picker.open, 'inline swatch opens the Tweakpad picker');
    pane.filter('native');
    await picker.updateComplete;
    check(
      !picker.open && custom.element.hidden === true,
      'filtering closes the popup with its complete control',
    );
    pane.filter('');
    custom.disabled = true;
    await picker.updateComplete;
    await trigger.updateComplete;
    check(picker.disabled && trigger.disabled, 'disabled state reaches popup and inline trigger');
    custom.disabled = false;
    custom.dispose();
    check(
      !picker.isConnected && pane.filter('object') === 0,
      'composed picker disposal removes its complete search owner',
    );
    return checks;
  } finally {
    pane.dispose();
  }
}
