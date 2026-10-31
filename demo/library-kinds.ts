// The six @tweakpad/ui inline controls tweakpad uses, configured as tweakpad configures them
// (variant="inline", controlled value, dir set). Shared by the measurement pages. Not shipped.
import {
  defineElement,
  TpCheckbox,
  TpColorInput,
  TpInput,
  TpSelect,
  TpSlider,
  TpSwitch,
} from '@tweakpad/ui';

for (const C of [TpInput, TpSlider, TpSelect, TpCheckbox, TpSwitch, TpColorInput])
  defineElement((C as unknown as { tagName: string }).tagName, C);

export type El = HTMLElement & {
  value?: unknown;
  checked?: boolean;
  updateComplete?: Promise<unknown>;
  isUpdatePending?: boolean;
  hasUpdated?: boolean;
};

export interface Kind {
  name: string;
  create(i: number): El;
  set(el: El, frame: number, i: number): void;
}

const ITEMS = ['alpha', 'beta', 'gamma', 'delta'].map((v) => ({ value: v, label: v }));

function inline(tag: string, i: number, label?: string): El {
  const el = document.createElement(tag) as El;
  el.setAttribute('variant', 'inline');
  el.setAttribute('dir', 'ltr');
  if (label) el.setAttribute('label', `${label} ${i}`);
  return el;
}

export const kinds: Kind[] = [
  {
    name: 'slider',
    create(i) {
      const el = inline('tp-slider', i, 'Slider');
      el.value = i % 100;
      return el;
    },
    set(el, f, i) {
      el.value = (f + i) % 100;
    },
  },
  {
    name: 'input-number',
    create(i) {
      const el = inline('tp-input', i, 'Number');
      el.setAttribute('type', 'number');
      el.setAttribute('step', '0.01');
      el.value = String(i);
      return el;
    },
    set(el, f, i) {
      el.value = String(((f + i) * 0.37) % 100);
    },
  },
  {
    name: 'input-text',
    create(i) {
      const el = inline('tp-input', i, 'Text');
      el.value = `value ${i}`;
      return el;
    },
    set(el, f, i) {
      el.value = `value ${f + i}`;
    },
  },
  {
    name: 'select',
    create(i) {
      const el = inline('tp-select', i, 'Select') as El & { items?: unknown; modal?: boolean };
      el.items = ITEMS;
      el.modal = false;
      el.value = ITEMS[i % 4]!.value;
      return el;
    },
    set(el, f, i) {
      el.value = ITEMS[(f + i) % 4]!.value;
    },
  },
  {
    name: 'checkbox',
    create(i) {
      const el = inline('tp-checkbox', i);
      el.textContent = `Checkbox ${i}`;
      el.checked = i % 2 === 0;
      return el;
    },
    set(el, f, i) {
      el.checked = (f + i) % 2 === 0;
    },
  },
  {
    name: 'switch',
    create(i) {
      const el = inline('tp-switch', i);
      el.textContent = `Switch ${i}`;
      el.checked = i % 2 === 0;
      return el;
    },
    set(el, f, i) {
      el.checked = (f + i) % 2 === 0;
    },
  },
  {
    name: 'color',
    create(i) {
      const el = inline('tp-color-input', i, 'Color');
      el.value = '#0f766e';
      return el;
    },
    set(el, f, i) {
      const h = ((f * 7 + i * 13) % 256).toString(16).padStart(2, '0');
      el.value = `#${h}66aa`;
    },
  },
];
