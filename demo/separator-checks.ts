import { Pane } from '../src/index.js';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Every element under `root` named `tag`, through open shadow roots. */
function deep(root: Element, tag: string): HTMLElement[] {
  const found: HTMLElement[] = [];
  const walk = (node: ParentNode) => {
    for (const el of node.querySelectorAll<HTMLElement>('*')) {
      if (el.localName === tag) found.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  if (root.shadowRoot) walk(root.shadowRoot);
  walk(root);
  return found;
}

/** Separators between rows: the library rule, dimmed and spaced like sections. */
export async function checkSeparators(): Promise<string[]> {
  const checks: string[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;inline-size:320px;opacity:0.01';
  document.body.append(host);
  const pane = new Pane({ container: host, title: 'Separator checks' });
  try {
    const state = { speed: 1, size: 2 };
    pane.addBinding(state, 'speed', { min: 0, max: 4 });
    const separator = pane.addSeparator();
    pane.addBinding(state, 'size', { min: 0, max: 4 });
    for (let i = 0; i < 4; i++) await frame();

    const [rule] = deep(pane.element, 'tp-separator') as (HTMLElement & {
      orientation: string;
      decorative: boolean;
    })[];
    check(
      rule?.orientation === 'horizontal' && rule.decorative,
      'addSeparator adds a decorative horizontal library separator',
    );
    // The gap on each side of the rule is the section gap.
    const probe = document.createElement('div');
    probe.style.blockSize = 'var(--tweak-section-gap)';
    pane.element.shadowRoot!.append(probe);
    const sectionGap = parseFloat(getComputedStyle(probe).blockSize);
    probe.remove();
    const [above, below] = deep(pane.element, 'tp-slider').map((el) => el.getBoundingClientRect());
    const line = rule!.getBoundingClientRect();
    check(
      Math.abs(line.top - above!.bottom - sectionGap) < 0.6 &&
        Math.abs(below!.top - line.bottom - sectionGap) < 0.6,
      'a separator keeps the section gap above and below it',
    );
    // The rule spans half the row, centered.
    const shell = separator.element.getBoundingClientRect();
    check(
      Math.abs(line.width - shell.width / 2) < 0.6 &&
        Math.abs(line.left - shell.left - shell.width / 4) < 0.6,
      'a separator spans half the available width, centered',
    );
    // The rule is dimmer than the library's border.
    const paint = document.createElement('div');
    paint.style.backgroundColor = 'var(--tweak-separator-color)';
    pane.element.shadowRoot!.append(paint);
    const dimmed = getComputedStyle(paint).backgroundColor;
    paint.remove();
    // The Separator element is the painted line; its inner part has no height.
    check(
      getComputedStyle(rule!).backgroundColor === dimmed &&
        rule!.getBoundingClientRect().height > 0 &&
        dimmed !== 'rgba(0, 0, 0, 0)',
      'a separator paints its rule in the dimmed separator color',
    );

    // Search: a rule matches nothing, so it hides while searching.
    const search = pane as unknown as { filter(query: string): number };
    search.filter('speed');
    check(separator.element.hidden === true, 'a separator hides while the pane is searched');
    search.filter('');
    check(!separator.element.hidden, 'it shows again when the search is cleared');

    separator.hidden = true;
    check(separator.element.hidden === true, 'hidden hides the separator');
    separator.dispose();
    check(deep(pane.element, 'tp-separator').length === 0, 'dispose removes the separator');
  } finally {
    pane.dispose();
    host.remove();
  }
  return checks;
}
