// Evidence for an @tweakpad/ui issue: what one `.value` update of an inline control costs, where
// the cost goes, and how much two candidate fixes save. The fixes are applied as runtime patches
// to the library's prototypes, so the library source stays untouched. Not shipped.
//
// Variants:
//   baseline    the library as published
//   idempotent  PresentationController.refresh() only writes `part` tokens and attributes that
//               actually change (DOMTokenList.add / setAttribute guarded during refresh)
//   skip        idempotent + hostUpdated() skips refresh() when the update changed no
//               presentation input (no axis property, no partPresentation)
//   quiet       skip + every attribute / class write during a Lit update cycle is idempotent
//               (state markers, ARIA and form syncing in updated() rewrite unchanged values)
//
// Safety check for `skip`: after a run, the original refresh() is run on every controller that
// was skipped. If skipping lost anything, that refresh would change adopted sheets, `part`
// tokens or presentation attributes. The page reports every such difference.
import '@tweakpad/ui/styles.css';
import { LitElement } from 'lit';
import { PresentationController } from '@tweakpad/ui';
import { kinds, type El, type Kind } from './library-kinds.js';

type Variant = 'baseline' | 'idempotent' | 'skip' | 'quiet';

// ---------------------------------------------------------------- instrumentation

const counters = {
  updates: 0,
  /** Updates of elements outside the one whose value was set (neither it nor inside it). */
  outsideUpdates: 0,
  refreshes: 0,
  refreshMs: 0,
  skippedRefreshes: 0,
  computedStyle: 0,
  querySelectorAll: 0,
};
const resetCounters = () => {
  for (const key in counters) (counters as Record<string, number>)[key] = 0;
};

/** The controller as seen from outside: `host` is TypeScript-private, so it is typed here. */
type Controller = { host: LitElement & Record<string, unknown> };
const proto = PresentationController.prototype as unknown as {
  refresh(this: Controller): void;
  hostUpdated(this: Controller): void;
};
const originalRefresh = proto.refresh;
const originalHostUpdated = proto.hostUpdated;
const changedKeys = new WeakMap<object, string[]>();
const controllersSeen = new Set<Controller>();

// Count Lit update cycles and remember which properties each one changed.
const litProto = LitElement.prototype as unknown as {
  update(this: LitElement, changed: Map<PropertyKey, unknown>): void;
};
const originalUpdate = litProto.update;
let currentTarget: Element | null = null;
/** Every element whose value was set during the current count. */
const touched = new Set<Element>();
const outsideNames = new Map<string, number>();
function isInside(node: Node | null, ancestor: Element): boolean {
  for (let n = node; n; n = n.parentNode ?? (n as ShadowRoot).host ?? null)
    if (n === ancestor) return true;
  return false;
}
litProto.update = function (changed) {
  counters.updates++;
  if (currentTarget && !isInside(this, currentTarget)) {
    counters.outsideUpdates++;
    // Name the element and whether it is another control of the stage (a sibling) or inside one.
    const owner = [...stageRoot.children].find((c) => isInside(this, c));
    const which = owner && touched.has(owner) ? 'an earlier target, deferred' : 'untouched control';
    const keys = [...changed.keys()].map(String).join(',') || 'requestUpdate()';
    const label = `${this.localName}${owner && owner !== this ? ` inside ${owner.localName}` : ''} (${owner ? which : 'outside stage'}) [${keys}]`;
    outsideNames.set(label, (outsideNames.get(label) ?? 0) + 1);
  }
  changedKeys.set(this, [...changed.keys()].map(String));
  return originalUpdate.call(this, changed);
};

const originalGCS = window.getComputedStyle;
window.getComputedStyle = function (this: Window, ...args: Parameters<typeof getComputedStyle>) {
  counters.computedStyle++;
  return originalGCS.apply(this, args);
} as typeof getComputedStyle;

for (const target of [Element.prototype, DocumentFragment.prototype, Document.prototype]) {
  const original = target.querySelectorAll;
  (target as { querySelectorAll: unknown }).querySelectorAll = function (
    this: ParentNode,
    selector: string,
  ) {
    counters.querySelectorAll++;
    return original.call(this, selector);
  };
}

// Guards that make refresh()'s DOM writes idempotent; installed only while refresh() runs.
const tokenAdd = DOMTokenList.prototype.add;
const setAttribute = Element.prototype.setAttribute;
function guardedAdd(this: DOMTokenList, ...tokens: string[]) {
  const missing = tokens.filter((token) => !this.contains(token));
  if (missing.length) tokenAdd.apply(this, missing);
}
function guardedSetAttribute(this: Element, name: string, value: string) {
  if (this.getAttribute(name) !== String(value)) setAttribute.call(this, name, value);
}
const tokenRemove = DOMTokenList.prototype.remove;
const toggleAttribute = Element.prototype.toggleAttribute;
const removeAttribute = Element.prototype.removeAttribute;
function guardedRemove(this: DOMTokenList, ...tokens: string[]) {
  const present = tokens.filter((token) => this.contains(token));
  if (present.length) tokenRemove.apply(this, present);
}
function guardedToggleAttribute(this: Element, name: string, force?: boolean) {
  const has = this.hasAttribute(name);
  if (force === undefined) return toggleAttribute.call(this, name);
  if (has !== force) toggleAttribute.call(this, name, force);
  return force;
}
function guardedRemoveAttribute(this: Element, name: string) {
  if (this.hasAttribute(name)) removeAttribute.call(this, name);
}
let guardDepth = 0;
function withGuards<T>(run: () => T): T {
  if (guardDepth++ === 0) {
    DOMTokenList.prototype.add = guardedAdd;
    DOMTokenList.prototype.remove = guardedRemove;
    Element.prototype.setAttribute = guardedSetAttribute;
    Element.prototype.toggleAttribute = guardedToggleAttribute;
    Element.prototype.removeAttribute = guardedRemoveAttribute;
  }
  try {
    return run();
  } finally {
    if (--guardDepth === 0) {
      DOMTokenList.prototype.add = tokenAdd;
      DOMTokenList.prototype.remove = tokenRemove;
      Element.prototype.setAttribute = setAttribute;
      Element.prototype.toggleAttribute = toggleAttribute;
      Element.prototype.removeAttribute = removeAttribute;
    }
  }
}
const reactiveProto = Object.getPrototypeOf(LitElement.prototype) as {
  performUpdate(this: LitElement): void;
  requestUpdate(this: LitElement, name?: PropertyKey, ...rest: unknown[]): void;
};
const originalRequestUpdate = reactiveProto.requestUpdate;
/** Stacks of bare requestUpdate() calls aimed at a control other than the one being changed. */
const crossRequests = new Map<string, number>();
reactiveProto.requestUpdate = function (this: LitElement, name?: PropertyKey, ...rest: unknown[]) {
  if (
    currentTarget &&
    name === undefined &&
    this.parentNode === stageRoot &&
    this !== currentTarget &&
    !touched.has(this)
  ) {
    const stack = (new Error().stack ?? '')
      .split('\n')
      .slice(2, 6)
      .map((line) =>
        line
          .trim()
          .replace(
            /\(http:\/\/localhost:\d+\/@fs\/Volumes\/Development\/code\/tweakpad\/library\//,
            '(',
          ),
      )
      .join(' <- ');
    const children = [...stageRoot.children];
    const offset = children.indexOf(this) - children.indexOf(currentTarget);
    const key = `offset ${offset}: ${stack}`;
    crossRequests.set(key, (crossRequests.get(key) ?? 0) + 1);
  }
  return originalRequestUpdate.call(this, name, ...rest);
};
const originalPerformUpdate = reactiveProto.performUpdate;

function idempotentRefresh(this: Controller) {
  withGuards(() => originalRefresh.call(this));
}

/** Properties whose change can alter what refresh() produces for this host. */
function presentationKeys(host: object): Set<string> {
  const ctor = host.constructor as {
    presentation?: { definition?: { axes?: readonly { name: string }[] } };
    presentationFamilies?: readonly { definition?: { axes?: readonly { name: string }[] } }[];
  };
  const keys = new Set(['partPresentation', 'presentationOwner']);
  for (const family of [ctor.presentation, ...(ctor.presentationFamilies ?? [])])
    for (const axis of family?.definition?.axes ?? []) keys.add(axis.name);
  return keys;
}

let variant: Variant = 'baseline';
let traceRefresh = false;
const refreshCallers = new Map<string, number>();
function install(next: Variant) {
  variant = next;
  reactiveProto.performUpdate =
    next === 'quiet'
      ? function (this: LitElement) {
          return withGuards(() => originalPerformUpdate.call(this));
        }
      : originalPerformUpdate;
  proto.refresh = function (this: Controller) {
    counters.refreshes++;
    if (traceRefresh) {
      const stack = (new Error().stack ?? '').split('\n').slice(2, 7).join(' <- ');
      refreshCallers.set(stack, (refreshCallers.get(stack) ?? 0) + 1);
    }
    const t = performance.now();
    try {
      if (variant === 'baseline') originalRefresh.call(this);
      else idempotentRefresh.call(this);
    } finally {
      counters.refreshMs += performance.now() - t;
    }
  };
  proto.hostUpdated = function (this: Controller) {
    controllersSeen.add(this);
    if (variant === 'skip' || variant === 'quiet') {
      const changed = changedKeys.get(this.host) ?? [];
      const relevant = presentationKeys(this.host);
      if (!changed.some((key) => relevant.has(key))) {
        counters.skippedRefreshes++;
        return;
      }
    }
    originalHostUpdated.call(this);
  };
}
install('baseline');

// ---------------------------------------------------------------- mutation accounting

interface MutationTally {
  total: number;
  /** Attribute records whose old value equals the value after the batch: rewrites, no change. */
  noop: number;
  byAttribute: Record<string, number>;
  childList: number;
}
let tally: MutationTally = { total: 0, noop: 0, byAttribute: {}, childList: 0 };
const observer = new MutationObserver((records) => {
  for (const record of records) {
    tally.total++;
    if (record.type === 'childList') tally.childList++;
    if (record.type !== 'attributes') continue;
    const name = record.attributeName!;
    tally.byAttribute[name] = (tally.byAttribute[name] ?? 0) + 1;
    if ((record.target as Element).getAttribute(name) === record.oldValue) tally.noop++;
  }
});
function observeDeep(root: Node) {
  observer.observe(root, {
    attributes: true,
    attributeOldValue: true,
    childList: true,
    subtree: true,
    characterData: true,
  });
  const walk = (node: Node) => {
    const shadow = (node as Element).shadowRoot;
    if (shadow) {
      observeDeep(shadow);
    }
    for (const child of node.childNodes) walk(child);
  };
  for (const child of root.childNodes) walk(child);
}

// ---------------------------------------------------------------- harness

// The stage lives in a shadow root, as tweakpad's rows do.
const host = document.getElementById('stage')!;
const stageRoot = host.attachShadow({ mode: 'open' });
const frame = () => new Promise<number>((r) => requestAnimationFrame(r));
const settle = () => new Promise((r) => setTimeout(r, 0));
const N = 40;
const CHANGED = 30;

async function mount(kind: Kind): Promise<El[]> {
  stageRoot.replaceChildren();
  const style = document.createElement('style');
  style.textContent = ':host{display:grid;gap:4px}';
  stageRoot.append(style);
  const els: El[] = [];
  for (let i = 0; i < N; i++) els.push(stageRoot.appendChild(kind.create(i)));
  await Promise.all(els.map((el) => el.updateComplete));
  for (let i = 0; i < 3; i++) await frame();
  // Presence transitions started by the first render finish on timers; let them land first.
  await new Promise((r) => setTimeout(r, 800));
  return els;
}

/** Counters for one `.value` update, all follow-up microtasks included; averaged over 20. */
async function countOneUpdate(kind: Kind, els: El[]) {
  observeDeep(stageRoot);
  await settle();
  const SAMPLES = 20;
  resetCounters();
  outsideNames.clear();
  crossRequests.clear();
  touched.clear();
  tally = { total: 0, noop: 0, byAttribute: {}, childList: 0 };
  for (let s = 0; s < SAMPLES; s++) {
    const el = els[s]!;
    currentTarget = el;
    touched.add(el);
    // Booleans flip, so every sample is a real change.
    if (typeof el.checked === 'boolean') el.checked = !el.checked;
    else kind.set(el, 1000 + s * 7, s);
    await settle();
  }
  observer.disconnect();
  currentTarget = null;
  const per = (n: number) => Math.round((n / SAMPLES) * 10) / 10;
  return {
    litUpdates: per(counters.updates),
    litUpdatesOutsideTarget: per(counters.outsideUpdates),
    outsideUpdatedElements: Object.fromEntries([...outsideNames].map(([k, n]) => [k, per(n)])),
    crossRequestStacks: Object.fromEntries([...crossRequests].map(([k, n]) => [k, per(n)])),
    refreshes: per(counters.refreshes),
    skippedRefreshes: per(counters.skippedRefreshes),
    getComputedStyle: per(counters.computedStyle),
    querySelectorAll: per(counters.querySelectorAll),
    mutations: per(tally.total),
    noopAttributeWrites: per(tally.noop),
    attributes: Object.fromEntries(
      Object.entries(tally.byAttribute).map(([name, n]) => [name, per(n)]),
    ),
  };
}

/** 30 of 40 visible controls updated per frame, flushed synchronously as tweakpad does. */
async function timeFrames(kind: Kind, els: El[], frames = 90) {
  const sync: number[] = [];
  const work: number[] = [];
  const probe = new MessageChannel();
  let start = 0;
  let recording = false;
  probe.port1.onmessage = () => {
    if (recording) work.push(performance.now() - start);
  };
  resetCounters();
  for (let f = 0; f < frames + 10; f++) {
    const now = await frame();
    recording = f >= 10;
    start = now;
    probe.port2.postMessage(0);
    const t = performance.now();
    for (let k = 0; k < CHANGED; k++) {
      const el = els[k]!;
      kind.set(el, f, k);
      if (el.isUpdatePending) (el as unknown as { performUpdate(): void }).performUpdate();
    }
    if (recording) sync.push(performance.now() - t);
  }
  await frame();
  await settle();
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const p95 = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)]!;
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    syncMsPerFrame: r(avg(sync)),
    usPerUpdate: Math.round((avg(sync) / CHANGED) * 1000),
    frameWorkAvg: r(avg(work)),
    frameWorkP95: r(p95(work)),
    refreshShareOfSync: r(counters.refreshMs / sync.reduce((s, v) => s + v, 0)),
  };
}

interface Snapshot {
  sheets: CSSStyleSheet[];
  attributes: string;
}
/** What refresh() owns on one element: adopted sheets, part tokens, presentation attributes. */
function snapshot(controller: Controller): Snapshot {
  const host = controller.host as unknown as HTMLElement & { renderRoot?: Node };
  const root = host.renderRoot as ShadowRoot | undefined;
  const parts: string[] = [];
  const collect = (el: Element) =>
    parts.push(
      `${el.localName}|${el.getAttribute('part') ?? ''}|${el.getAttribute('data-tp-presentation-part') ?? ''}|${el.getAttribute('data-tp-presentation-owner') ?? ''}`,
    );
  collect(host);
  root?.querySelectorAll('*').forEach(collect);
  host.querySelectorAll('*').forEach(collect);
  return {
    sheets: root?.adoptedStyleSheets ? [...root.adoptedStyleSheets] : [],
    attributes: parts.join('\n'),
  };
}

/** Runs the original refresh() on every controller and reports what it would have changed. */
function verifySkipWasSafe() {
  let checked = 0;
  const differences: string[] = [];
  for (const controller of controllersSeen) {
    if (!controller.host.isConnected) continue;
    checked++;
    const before = snapshot(controller);
    idempotentRefresh.call(controller);
    const after = snapshot(controller);
    const sameSheets =
      before.sheets.length === after.sheets.length &&
      before.sheets.every((sheet, i) => sheet === after.sheets[i]);
    if (!sameSheets || before.attributes !== after.attributes)
      differences.push(
        `${controller.host.localName}: ${sameSheets ? 'attributes' : 'adopted sheets'} changed`,
      );
  }
  return { controllersChecked: checked, differences };
}

const VARIANTS: Variant[] = ['baseline', 'idempotent', 'skip', 'quiet'];
const ROUNDS = 5;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

async function runKind(kind: Kind) {
  const result: Record<string, Record<string, unknown>> = {};
  // 1. Deterministic counters, on a fresh mount per variant, then the safety check.
  for (const v of VARIANTS) {
    install(v);
    controllersSeen.clear();
    const els = await mount(kind);
    const entry: Record<string, unknown> = await countOneUpdate(kind, els);
    if (v === 'skip' || v === 'quiet') entry.safety = verifySkipWasSafe();
    result[v] = entry;
  }
  // 2. Timing: one mount, variants interleaved over rounds, medians reported.
  install('baseline');
  controllersSeen.clear();
  const els = await mount(kind);
  const samples = new Map<Variant, Awaited<ReturnType<typeof timeFrames>>[]>();
  for (let round = 0; round < ROUNDS; round++)
    for (const v of VARIANTS) {
      install(v);
      const timing = await timeFrames(kind, els, 45);
      samples.set(v, [...(samples.get(v) ?? []), timing]);
    }
  // Every update of the timing rounds ran under each variant; check once more at the end.
  const finalSafety = verifySkipWasSafe();
  for (const v of VARIANTS) {
    const runs = samples.get(v)!;
    const pick = (key: keyof (typeof runs)[number]) => median(runs.map((run) => run[key]));
    Object.assign(result[v]!, {
      usPerUpdate: pick('usPerUpdate'),
      syncMsPerFrame: pick('syncMsPerFrame'),
      frameWorkAvg: pick('frameWorkAvg'),
      frameWorkP95: pick('frameWorkP95'),
      refreshShareOfSync: pick('refreshShareOfSync'),
    });
  }
  result.quiet!.safetyAfterTiming = finalSafety;
  install('baseline');
  stageRoot.replaceChildren();
  return result;
}

async function runAll(only?: string[]) {
  const out: Record<string, unknown> = {};
  for (const kind of kinds) {
    if (only && !only.includes(kind.name)) continue;
    out[kind.name] = await runKind(kind);
  }
  (window as unknown as { __proof: unknown }).__proof = out;
  render(out);
  return out;
}

function render(out: Record<string, unknown>) {
  const pre = document.getElementById('out')!;
  pre.textContent = JSON.stringify(out, null, 2);
}

document.getElementById('run')!.addEventListener('click', () => void runAll());
/** Who calls refresh() during `count` single updates of `kindName` under `v`. */
async function traceRefreshCallers(kindName: string, v: Variant, count = 10) {
  const kind = kinds.find((k) => k.name === kindName)!;
  install(v);
  const els = await mount(kind);
  refreshCallers.clear();
  traceRefresh = true;
  for (let s = 0; s < count; s++) {
    const el = els[s]!;
    if (typeof el.checked === 'boolean') el.checked = !el.checked;
    else kind.set(el, 1000 + s * 7, s);
    await settle();
  }
  traceRefresh = false;
  install('baseline');
  return [...refreshCallers].map(([stack, n]) => ({ calls: n / count, stack }));
}

/** Counters only, for one kind and variant. */
async function countOnly(kindName: string, v: Variant = 'baseline') {
  const kind = kinds.find((k) => k.name === kindName)!;
  install(v);
  const els = await mount(kind);
  const counts = await countOneUpdate(kind, els);
  install('baseline');
  return counts;
}

Object.assign(window, {
  countOnly,
  traceRefreshCallers,
  runProof: runAll,
  litDevMode: Boolean((globalThis as { litIssuedWarnings?: unknown }).litIssuedWarnings),
});
