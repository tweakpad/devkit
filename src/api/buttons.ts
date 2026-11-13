import type { IconDefinition, TpButton, TpTooltip } from '@tweakpad/ui';
import type { PaneContext } from './context.js';
import { SearchableRow } from './rows.js';
import type { SearchMetadata } from '../core/search.js';

/** Options of `addButton()`, and of button items in `addRow()`. */
export interface ButtonParams {
  /** Visible and accessible text of the button, also matched by search. */
  title: string;
  /** Called when the button is pressed with a pointer or the keyboard, unless it is disabled. */
  onClick: (event: MouseEvent) => void;
  /** Stable searchable name; defaults to the initial title. */
  name?: string;
  /** Icon shown before the title, or alone with `iconOnly`. */
  icon?: IconDefinition;
  /**
   * Shows only the icon, as a square button; the title becomes its accessible name and tooltip,
   * and search still matches it.
   * @default false
   */
  iconOnly?: boolean;
  /**
   * Starts the control disabled: shown dimmed and ignoring input.
   * @default false
   */
  disabled?: boolean;
  /**
   * Starts the control hidden, which also leaves it out of search.
   * @default false
   */
  hidden?: boolean;
}

/** How devkit's own buttons look, beside what `ButtonParams` offers. */
export interface ButtonLook {
  variant?: 'secondary' | 'ghost';
  size?: 'icon-sm' | 'icon';
}

/** The button, wrapped in a tooltip of its title when it shows only its icon. */
function buttonSurface(params: ButtonParams, look: ButtonLook): [TpButton, HTMLElement] {
  const button = document.createElement('tp-button') as TpButton;
  button.type = 'button';
  button.variant = look.variant ?? 'secondary';
  if (params.icon) button.icon = params.icon;
  if (!params.iconOnly || !params.icon) return [button, button];
  button.size = look.size ?? 'icon';
  button.slot = 'trigger';
  const tooltip = document.createElement('tp-tooltip') as TpTooltip;
  tooltip.className = 'button-tooltip';
  tooltip.append(button, document.createElement('span'));
  return [button, tooltip];
}

/** One action. Inline composition belongs to the general row API. */
export class ButtonRow extends SearchableRow {
  readonly metadata: SearchMetadata;
  readonly #button: TpButton;
  readonly #context: PaneContext;
  readonly #onClick: (event: MouseEvent) => void;
  readonly #iconOnly: boolean;
  #title: string;

  constructor(context: PaneContext, params: ButtonParams, look: ButtonLook = {}) {
    const [button, surface] = buttonSurface(params, look);
    super(surface);
    this.#button = button;
    this.#context = context;
    this.#iconOnly = surface !== button;
    this.#title = params.title;
    this.#showTitle();
    const currentTitle = () => this.title;
    this.metadata = {
      name: params.name ?? params.title,
      get label() {
        return currentTitle();
      },
    };
    this.#onClick = (event) => {
      if (this.searchVisible && !this.effectiveDisabled) params.onClick(event);
    };
    button.addEventListener('click', this.#onClick);
    this.setDisabled(params.disabled ?? false);
    this.setHidden(params.hidden ?? false);
  }

  get title(): string {
    return this.#title;
  }
  set title(title: string) {
    this.#title = title;
    this.#showTitle();
    this.#context.refreshSearch?.();
  }

  #showTitle(): void {
    if (!this.#iconOnly) {
      this.#button.textContent = this.#title;
      return;
    }
    this.#button.ariaLabel = this.#title;
    this.surface.lastElementChild!.textContent = this.#title;
  }

  protected override syncVisibility(): void {
    // Buttons have no scheduled work; their visibility shell contains the complete surface.
  }

  protected override syncDisabled(disabled: boolean): void {
    this.#button.disabled = disabled;
  }

  override dispose(): void {
    this.#button.removeEventListener('click', this.#onClick);
    super.dispose();
  }
}

/** The handle `addButton` returns. */
export class ButtonApi {
  constructor(
    private readonly row: ButtonRow,
    private readonly context: PaneContext,
  ) {}
  /** Text of the button. Search matches the new title; the `name` stays the same. */
  get title(): string {
    return this.row.title;
  }
  set title(title: string) {
    this.row.title = title;
  }
  /** Whether the button is shown dimmed and ignores presses. A disabled button stays searchable. */
  get disabled(): boolean {
    return this.row.disabled;
  }
  set disabled(disabled: boolean) {
    this.row.setDisabled(disabled);
  }
  /** Whether the button is hidden, which also leaves it out of search. */
  get hidden(): boolean {
    return this.row.hidden;
  }
  set hidden(hidden: boolean) {
    this.row.setHidden(hidden);
    this.context.refreshSearch?.();
  }
  /** The stable visibility shell containing the complete button. */
  get element(): HTMLElement {
    return this.row.element;
  }
  /** Removes the button and releases its click listener. */
  dispose(): void {
    this.row.dispose();
    this.context.refreshSearch?.();
  }
}
