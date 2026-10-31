// Splits the cost of one library `.value` update into its phases. Not shipped.
import { PresentationController, TpFormElement, TpSlider, TpCheckbox, TpInput } from '@tweakpad/ui';

type Proto = Record<string, (...a: unknown[]) => unknown>;
const totals = new Map<string, number>();
function wrap(proto: object, method: string, label: string) {
  const p = proto as Proto;
  const original = p[method];
  if (typeof original !== 'function') return;
  p[method] = function (this: unknown, ...args: unknown[]) {
    const t = performance.now();
    try {
      return original.apply(this, args);
    } finally {
      totals.set(label, (totals.get(label) ?? 0) + performance.now() - t);
    }
  };
}
wrap(PresentationController.prototype, 'refresh', 'presentation.refresh');
wrap(TpFormElement.prototype, 'updated', 'TpFormElement.updated(+subclass super)');
for (const [C, name] of [
  [TpSlider, 'slider'],
  [TpCheckbox, 'checkbox'],
  [TpInput, 'input'],
] as const) {
  wrap(C.prototype, 'update', `${name}.update(total incl render)`);
  wrap(C.prototype, 'render', `${name}.render`);
  wrap(C.prototype, 'updated', `${name}.updated`);
}
(window as unknown as { profileTotals: unknown }).profileTotals = () => {
  const o = Object.fromEntries([...totals].map(([k, v]) => [k, Math.round(v * 10) / 10]));
  totals.clear();
  return o;
};
