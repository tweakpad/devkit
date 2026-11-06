import type { TpButton } from '@tweakpad/ui';
import type { PaneContext } from './context.js';
import { SearchableRow } from './rows.js';
import type { SearchMetadata } from '../core/search.js';

/** One action in a button or an inline button row. */
export interface ButtonActionParams {
  title: string;
  onClick: (event: MouseEvent) => void;
  disabled?: boolean;
}

export interface ButtonParams extends ButtonActionParams {
  /** Stable searchable name; defaults to the initial title. */
  name?: string;
  hidden?: boolean;
}

export interface ButtonsParams {
  /** Actions share one inline row and one atomic search boundary. At least one is required. */
  buttons: readonly [ButtonActionParams, ...ButtonActionParams[]];
  /** Stable searchable name; defaults to the initial button titles. */
  name?: string;
  /** Optional search label, in addition to the button titles. */
  label?: string;
  disabled?: boolean;
  hidden?: boolean;
}

/** Title and disabled state of one action. Its row owns search, hiding and disposal. */
export class ButtonActionApi {
  #disabled: boolean;
  #title: string;
  readonly #onClick: (event: MouseEvent) => void;

  constructor(
    private readonly button: TpButton,
    private readonly row: ButtonRow,
    params: ButtonActionParams,
    private readonly context: PaneContext,
  ) {
    this.#title = params.title;
    this.#disabled = params.disabled ?? false;
    button.textContent = this.#title;
    this.#onClick = (event) => {
      if (row.searchVisible && !row.disabled && !this.#disabled) params.onClick(event);
    };
    button.addEventListener('click', this.#onClick);
    this.syncDisabled();
  }

  get title(): string {
    return this.#title;
  }
  set title(title: string) {
    this.#title = title;
    this.button.textContent = title;
    this.context.refreshSearch?.();
  }

  get disabled(): boolean {
    return this.#disabled;
  }
  set disabled(disabled: boolean) {
    this.#disabled = disabled;
    this.syncDisabled();
  }

  /** @internal Applies row-level disabling without overwriting the action's authored state. */
  syncDisabled(): void {
    this.button.disabled = this.#disabled || this.row.disabled;
  }

  /** @internal The containing row releases every action listener together. */
  release(): void {
    this.button.removeEventListener('click', this.#onClick);
  }
}

/** One complete button surface, containing either a single action or an inline composition. */
export class ButtonRow extends SearchableRow {
  readonly actions: readonly ButtonActionApi[];
  readonly metadata: SearchMetadata;
  #disabled = false;

  constructor(context: PaneContext, params: ButtonsParams) {
    if (params.buttons.length === 0)
      throw new RangeError('devkit: a button row needs at least one action');
    const surface = document.createElement('div');
    surface.className = 'button-row';
    super(surface);
    this.actions = params.buttons.map((action) => {
      const button = document.createElement('tp-button') as TpButton;
      button.type = 'button';
      button.variant = 'secondary';
      surface.append(button);
      return new ButtonActionApi(button, this, action, context);
    });
    const actions = this.actions;
    this.metadata = {
      name: params.name ?? params.buttons.map((button) => button.title).join(' / '),
      get label() {
        return [params.label, ...actions.map((action) => action.title)].filter(Boolean).join(' / ');
      },
    };
    this.setDisabled(params.disabled ?? false);
    this.setHidden(params.hidden ?? false);
  }

  get disabled(): boolean {
    return this.#disabled;
  }
  setDisabled(disabled: boolean): void {
    this.#disabled = disabled;
    for (const action of this.actions) action.syncDisabled();
  }

  protected override syncVisibility(): void {
    // Buttons have no sampled or scheduled work; the shell owns their visibility.
  }

  override dispose(): void {
    for (const action of this.actions) action.release();
    super.dispose();
  }
}

/** Shared row-level API for an action or an inline button composition. */
class ButtonRowApi {
  constructor(
    protected readonly row: ButtonRow,
    private readonly context: PaneContext,
  ) {}

  get disabled(): boolean {
    return this.row.disabled;
  }
  set disabled(disabled: boolean) {
    this.row.setDisabled(disabled);
  }
  get hidden(): boolean {
    return this.row.hidden;
  }
  set hidden(hidden: boolean) {
    this.row.setHidden(hidden);
    this.context.refreshSearch?.();
  }
  get element(): HTMLElement {
    return this.row.element;
  }

  dispose(): void {
    this.row.dispose();
    this.context.refreshSearch?.();
  }
}

/** The inline composition handle returned by `addButtons`. */
export class ButtonsApi extends ButtonRowApi {
  readonly buttons: readonly ButtonActionApi[];

  constructor(row: ButtonRow, context: PaneContext) {
    super(row, context);
    this.buttons = row.actions;
  }
}

/** The single-button handle returned by `addButton`. */
export class ButtonApi extends ButtonRowApi {
  get title(): string {
    return this.row.actions[0]!.title;
  }
  set title(title: string) {
    this.row.actions[0]!.title = title;
  }
}
