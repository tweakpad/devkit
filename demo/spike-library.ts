// Measures the per-instance cost of the @tweakpad/ui inline controls, to set the
// lazy-mount and update-cap policy of the binding engine. Not shipped.
import '@tweakpad/ui/styles.css';
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

type El = HTMLElement & { value?: unknown; checked?: boolean; updateComplete?: Promise<unknown> };

interface Kind {
  name: string;
  create(i: number): El;
  set(el: El, frame: number, i: number): void;
}

const ITEMS = ['alpha', 'beta', 'gamma', 'delta'].map((v) => ({ value: v, label: v }));

const kinds: Kind[] = [
  {
    name: 'slider',
    create(i) {
      const el = document.createElement('tp-slider') as El;
      el.setAttribute('variant', 'inline');
      el.setAttribute('label', `Slider ${i}`);
      el.setAttribute('dir', 'ltr');
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
      const el = document.createElement('tp-input') as El;
      el.setAttribute('variant', 'inline');
      el.setAttribute('type', 'number');
      el.setAttribute('step', '0.01');
      el.setAttribute('label', `Number ${i}`);
      el.setAttribute('dir', 'ltr');
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
      const el = document.createElement('tp-input') as El;
      el.setAttribute('variant', 'inline');
      el.setAttribute('label', `Text ${i}`);
      el.setAttribute('dir', 'ltr');
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
      const el = document.createElement('tp-select') as El & { items?: unknown; modal?: boolean };
      el.setAttribute('variant', 'inline');
      el.setAttribute('label', `Select ${i}`);
      el.setAttribute('dir', 'ltr');
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
      const el = document.createElement('tp-checkbox') as El;
      el.setAttribute('variant', 'inline');
      el.setAttribute('dir', 'ltr');
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
      const el = document.createElement('tp-switch') as El;
      el.setAttribute('variant', 'inline');
      el.setAttribute('dir', 'ltr');
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
      const el = document.createElement('tp-color-input') as El;
      el.setAttribute('variant', 'inline');
      el.setAttribute('label', `Color ${i}`);
      el.setAttribute('dir', 'ltr');
      el.value = '#0f766e';
      return el;
    },
    set(el, f, i) {
      const h = ((f * 7 + i * 13) % 256).toString(16).padStart(2, '0');
      el.value = `#${h}66aa`;
    },
  },
];

const stage = document.getElementById('stage')!;
const tbody = document.querySelector('#results tbody')!;
const status = document.getElementById('status')!;
const frame = () => new Promise<number>((r) => requestAnimationFrame(r));
const settle = (els: El[]) => Promise.all(els.map((el) => el.updateComplete));

async function measure(kind: Kind, n: number) {
  stage.replaceChildren();
  await frame();
  const t0 = performance.now();
  const els: El[] = [];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) els.push(frag.appendChild(kind.create(i)) as El);
  stage.appendChild(frag);
  await settle(els);
  const mount = performance.now() - t0;
  await frame();
  const firstFrame = performance.now() - t0;

  const FRAMES = 120;
  const CHANGED = Math.min(30, n);
  const updates: number[] = [];
  const dts: number[] = [];
  let last = await frame();
  for (let f = 0; f < FRAMES; f++) {
    const now = await frame();
    dts.push(now - last);
    last = now;
    const u0 = performance.now();
    const batch: El[] = [];
    // Spread the changed set over the list, like an app touching scattered values.
    for (let k = 0; k < CHANGED; k++) {
      const idx = (k * Math.floor(n / CHANGED) + f) % n;
      const el = els[idx]!;
      kind.set(el, f, idx);
      batch.push(el);
    }
    await settle(batch);
    updates.push(performance.now() - u0);
  }
  const t1 = performance.now();
  stage.replaceChildren();
  const teardown = performance.now() - t1;
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const p95 = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)]!;
  return {
    kind: kind.name,
    n,
    mount,
    mountPerEl: (mount / n) * 1000,
    firstFrame,
    update: avg(updates),
    updatePerEl: (avg(updates) / CHANGED) * 1000,
    dtAvg: avg(dts),
    dtP95: p95(dts),
    teardown,
  };
}

async function runAll() {
  const n = Number((document.getElementById('n') as HTMLInputElement).value) || 1000;
  const only = new URLSearchParams(location.search).get('kind');
  const results = [];
  for (const kind of kinds) {
    if (only && kind.name !== only) continue;
    status.textContent = `measuring ${kind.name}…`;
    const r = await measure(kind, n);
    results.push(r);
    const tr = document.createElement('tr');
    tr.innerHTML = `<th>${r.kind}</th><td>${r.n}</td><td>${r.mount.toFixed(1)}</td><td>${r.mountPerEl.toFixed(0)}</td><td>${r.firstFrame.toFixed(1)}</td><td>${r.update.toFixed(2)}</td><td>${r.updatePerEl.toFixed(0)}</td><td>${r.dtAvg.toFixed(1)}</td><td>${r.dtP95.toFixed(1)}</td><td>${r.teardown.toFixed(1)}</td>`;
    tbody.appendChild(tr);
  }
  status.textContent = 'done';
  (window as unknown as { __spike: unknown }).__spike = results;
  return results;
}

document.getElementById('run')!.addEventListener('click', () => void runAll());
(window as unknown as { runSpike: unknown }).runSpike = runAll;
