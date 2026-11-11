import '@tweakpad/ui/styles.css';
import { SearchableRow } from '../src/api/rows.js';
import { filterSearchTree, type SearchNode } from '../src/core/search.js';
import { containerStyles } from '../src/elements/styles.js';
import { checkButtonApi } from './button-api-checks.js';
import { checkInlineApi } from './inline-api-checks.js';
import { checkColorApi } from './color-api-checks.js';
import { checkMonitorBindings } from './monitor-binding-checks.js';
import { checkGraphs } from './graph-checks.js';
import { checkHistory } from './history-checks.js';

/** Generic composition fixture: no dependency on any production control's rendering. */
class ComposedRow extends SearchableRow {
  active = false;
  constructor(label: string) {
    const surface = document.createElement('section');
    surface.className = 'composed-fixture';
    surface.attachShadow({ mode: 'open' }).innerHTML = `
      <style>.parts { display: grid !important; min-height: 80px; }</style>
      <div class="parts"><span>${label}</span><input value="123"><button>Action</button></div>`;
    super(surface);
  }
  protected override syncVisibility(visible: boolean): void {
    this.active = visible;
  }
}

const host = document.createElement('div');
document.body.append(host);
const root = host.attachShadow({ mode: 'open' });
const fixtureStyles = new CSSStyleSheet();
fixtureStyles.replaceSync('.composed-fixture { display: grid !important; padding: 12px; }');
root.adoptedStyleSheets = [containerStyles.styleSheet!, fixtureStyles];
const composed = new ComposedRow('Position');
const sibling = new ComposedRow('Scale');
root.append(composed.element, sibling.element);
const tree: SearchNode = {
  kind: 'scope',
  children: [
    {
      kind: 'control',
      metadata: { name: 'position', label: 'Position X / Y / Z' },
      target: composed,
    },
    { kind: 'control', metadata: { name: 'scale', label: 'Scale' }, target: sibling },
  ],
};

const checks: string[] = [];
function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  checks.push(message);
}

try {
  composed.setVisible(true);
  sibling.setVisible(true);
  check(filterSearchTree(tree, 'scale') === 1, 'one atomic result');
  check(
    getComputedStyle(composed.element).display === 'none',
    'outer shell overrides component display',
  );
  check(composed.element.getClientRects().length === 0, 'excluded composition occupies no layout');
  const editor = composed.element.querySelector('section')!.shadowRoot!.querySelector('input')!;
  check(editor.getClientRects().length === 0, 'nested shadow editor is hidden with its owner');
  editor.focus();
  check(
    root.activeElement !== composed.element.querySelector('section'),
    'excluded editor cannot receive focus',
  );
  check(sibling.element.getClientRects().length > 0, 'matching sibling stays rendered');
  check(!composed.active && sibling.active, 'visibility gates work for the complete composition');
  check(
    filterSearchTree(tree, 'Y') === 1 && composed.element.getClientRects().length > 0,
    'part metadata retains the entire composition',
  );
  composed.setHidden(true);
  check(filterSearchTree(tree, 'position') === 0, 'explicit hiding excludes matching compositions');
  filterSearchTree(tree, '');
  check(
    composed.element.hidden && !sibling.element.hidden,
    'clear preserves authored hidden state',
  );
  composed.setHidden(false);
  check(
    composed.element.getClientRects().length > 0,
    'authored unhide restores the complete surface',
  );
  composed.dispose();
  check(
    filterSearchTree(tree, 'position') === 0,
    'disposed composition cannot keep a group visible',
  );
  checks.push(...(await checkButtonApi()));
  checks.push(...(await checkInlineApi()));
  checks.push(...(await checkColorApi()));
  checks.push(...(await checkMonitorBindings()));
  checks.push(...(await checkGraphs()));
  checks.push(...(await checkHistory()));
  document.getElementById('result')!.textContent = `${checks.length} browser checks passed.`;
  document.body.dataset.result = 'passed';
} catch (error) {
  document.getElementById('result')!.textContent = String(error);
  document.body.dataset.result = 'failed';
  throw error;
}
