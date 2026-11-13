import type { TpSeparator } from '@tweakpad/ui';
import type { PaneContext } from './context.js';
import { SearchableRow } from './rows.js';
import type { SearchMetadata } from '../core/search.js';

/** Options of `addSeparator()`. */
export interface SeparatorParams {
  /**
   * Hides the rule from assistive technology, as the library's Separator does. Set it to `false`
   * when the rule marks a real boundary between groups, so it is announced as a separator.
   * @default true
   */
  decorative?: boolean;
  /**
   * Starts the separator hidden.
   * @default false
   */
  hidden?: boolean;
}

/** The library's rule between rows. It matches no search, so it hides while the pane is searched. */
export class SeparatorRow extends SearchableRow {
  readonly metadata: SearchMetadata = { name: '', label: '' };

  constructor(params: SeparatorParams) {
    const separator = document.createElement('tp-separator') as TpSeparator;
    separator.decorative = params.decorative ?? true;
    super(separator);
    this.element.classList.add('separator');
    this.setHidden(params.hidden ?? false);
  }

  protected override syncVisibility(): void {
    // A rule has no scheduled work.
  }
}

/** The handle `addSeparator` returns. */
export class SeparatorApi {
  constructor(
    private readonly row: SeparatorRow,
    private readonly context: PaneContext,
  ) {}
  /** Whether the separator is hidden. */
  get hidden(): boolean {
    return this.row.hidden;
  }
  set hidden(hidden: boolean) {
    this.row.setHidden(hidden);
    this.context.refreshSearch?.();
  }
  /** The stable visibility shell containing the rule. */
  get element(): HTMLElement {
    return this.row.element;
  }
  /** Removes the separator. */
  dispose(): void {
    this.row.dispose();
    this.context.refreshSearch?.();
  }
}
