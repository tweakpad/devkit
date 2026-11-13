import { html, nothing, render } from 'lit';
import type { IconDefinition, TpButton, TpMenu } from '@tweakpad/ui';
import type { PaneContext } from './context.js';
import { SearchableRow } from './rows.js';
import type { SearchMetadata } from '../core/search.js';

/** One entry of a menu. */
export interface MenuEntry {
  /** What `onSelect` receives when the entry is picked. */
  value: string;
  /** Visible text of the entry. */
  label: string;
  /** Icon shown before the label. */
  icon?: IconDefinition;
  /**
   * Shows the entry dimmed, and picking it does nothing.
   * @default false
   */
  disabled?: boolean;
}

/** A button that opens a menu of entries; devkit's bars use it. */
export interface MenuParams {
  /** Text of the button, or with `iconOnly` its accessible name and tooltip; matched by search. */
  title: string;
  /** Icon of the button. */
  icon?: IconDefinition | undefined;
  /** Shows only the icon. */
  iconOnly?: boolean | undefined;
  /** Stable searchable name; defaults to the title. */
  name?: string | undefined;
  /** The entries, or a function that lists them each time the menu opens. */
  entries: readonly MenuEntry[] | (() => readonly MenuEntry[]);
  /** Called with the picked entry's value. */
  onSelect: (value: string) => void;
}

/** A menu button in a row. */
export class MenuRow extends SearchableRow {
  readonly metadata: SearchMetadata;
  readonly #menu: TpMenu;
  readonly #trigger: TpButton;

  constructor(
    context: PaneContext,
    private readonly params: MenuParams,
  ) {
    const menu = document.createElement('tp-menu') as TpMenu;
    super(menu);
    void context;
    this.#menu = menu;
    menu.label = params.title;
    const trigger = document.createElement('tp-button') as TpButton;
    trigger.slot = 'trigger';
    trigger.type = 'button';
    trigger.variant = 'ghost';
    if (params.icon) trigger.icon = params.icon;
    if (params.iconOnly && params.icon) {
      trigger.size = 'icon-sm';
      trigger.ariaLabel = params.title;
      trigger.title = params.title;
    } else trigger.textContent = params.title;
    this.#trigger = trigger;
    this.metadata = { name: params.name ?? params.title, label: params.title };
    menu.addEventListener('tp-open-change', (event) => {
      if ((event as CustomEvent<{ value?: boolean; open?: boolean }>).target === menu)
        this.refresh();
    });
    menu.addEventListener('tp-action', (event) => {
      const { value } = (event as CustomEvent<{ value: unknown }>).detail;
      if (typeof value === 'string' && !this.effectiveDisabled) params.onSelect(value);
    });
    this.refresh();
  }

  /** Lists the entries again, as when the menu opens. */
  refresh(): void {
    const { entries } = this.params;
    const list = typeof entries === 'function' ? entries() : entries;
    render(
      html`${this.#trigger}${list.map(
        (entry) =>
          html`<tp-menu-item value=${entry.value} .disabled=${entry.disabled ?? false}
            >${entry.icon ? html`<tp-icon .icon=${entry.icon}></tp-icon>` : nothing}${entry.label}</tp-menu-item
          >`,
      )}`,
      this.#menu,
    );
  }

  protected override syncVisibility(): void {
    // Nothing is scheduled: the menu renders its entries when it opens.
  }

  protected override syncDisabled(disabled: boolean): void {
    this.#trigger.disabled = disabled;
  }
}
