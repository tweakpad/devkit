import { css, html, nothing, LitElement, type PropertyValues, type TemplateResult } from 'lit';
import type { IconDefinition, TpDragDropList, TpInput } from '@tweakpad/ui';
import { containerStyles } from './styles.js';
import { icon } from './icons.js';

/** What a layer row asks of its stack: the action, the layer's id, and what goes with it. */
export type LayerAction =
  | { action: 'select'; id: string }
  | { action: 'rename-start'; id: string }
  /** `keyboard`: ended with Enter or Escape, so focus returns to the name. */
  | { action: 'rename'; id: string; name: string | null; keyboard: boolean }
  | { action: 'step'; id: string; delta: number }
  | { action: 'remove'; id: string }
  | { action: 'state'; id: string; key: string; value: boolean };

/** The event every layer row and toggle dispatches; the stack's API handles it. */
export const LAYER_ACTION = 'tweak-layer-action';

/** Dispatches an action; the handler sets `accepted` when it carried the action out. */
function act(element: HTMLElement, action: LayerAction): boolean {
  const detail: LayerAction & { accepted?: boolean } = { ...action };
  element.dispatchEvent(new CustomEvent(LAYER_ACTION, { detail, bubbles: true, composed: true }));
  return detail.accepted === true;
}

/**
 * A layer stack: the header bar, the reorderable list, the footer bar, and the panels of the
 * layers, one shown at a time. The API layer owns the list's rows and the bars' contents.
 */
export class TweakLayers extends LitElement {
  static readonly tagName = 'tweak-layers';

  static override properties = {
    hasIcons: { type: Boolean, attribute: 'has-icons', reflect: true },
    activation: { type: String, reflect: true },
  };

  static override styles = [
    containerStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--tweak-row-gap);

        /* How far before a row's content its free start edge is: the row's padding and border,
           or with a grip, the gap after it. The rename field reaches back to it. */
        --_tweak-layer-edge: calc(var(--tp-space-2-5) + var(--tp-border-width));
      }

      :host([activation='handle']) {
        --_tweak-layer-edge: var(--tp-space-2);
      }

      .panels {
        padding-block-start: var(--tweak-section-gap);
        border-block-start: 1px solid var(--tp-border);
      }

      .bar:empty,
      .panels:empty {
        display: none;
      }

      .bar.header {
        padding-block-end: var(--tweak-row-gap);
        border-block-end: 1px solid var(--tp-border);
      }

      .bar.footer {
        padding-block-start: var(--tweak-row-gap);
        border-block-start: 1px solid var(--tp-border);
      }

      tp-drag-drop-list {
        display: block;
      }

      /* Rows are the pane's control rows: same height, padding, radius and gap as a field. */
      tp-drag-drop-list::part(list) {
        gap: var(--tweak-row-gap);
      }

      /* The row is a subgrid of its item: its content's height sets the row's. */
      tp-drag-drop-list::part(row-content) {
        justify-content: center;
        min-block-size: calc(var(--tp-control-height-md) - 2 * var(--tp-border-width));
      }

      tp-drag-drop-list::part(row) {
        box-sizing: border-box;
        padding: 0 var(--tp-space-2-5);
        border-radius: var(--tp-radius-lg);
        column-gap: var(--tp-space-2);
      }

      tp-drag-drop-list::part(row-actions) {
        gap: var(--tp-space-1);
        padding-inline-end: calc(var(--tp-space-1) + var(--tp-border-width));
      }

      :host([activation='none']) tp-drag-drop-list::part(handle) {
        display: none;
      }

      /* Rows drag from anywhere: the grip stays as the keyboard's way in. It shows over the start
         of the row while it has keyboard focus, so it never pushes the names aside. */
      tp-drag-drop-list::part(item) {
        position: relative;
      }

      /* Its cell takes no room either, so the rows start at the same inset as the fields. */
      :host([activation='item']) tp-drag-drop-list::part(row-media),
      :host([activation='none']) tp-drag-drop-list::part(row-media) {
        position: absolute;
      }

      :host([activation='item']) tp-drag-drop-list::part(handle) {
        position: absolute;
        inset-inline-start: 0;
        inset-block-start: 50%;
        z-index: 1;
        translate: 0 -50%;
        opacity: 0;
        pointer-events: none;
      }

      :host([activation='item']) tp-drag-drop-list::part(handle):focus-visible {
        opacity: 1;
        background: var(--tp-background);
      }
    `,
  ];

  /** Every row reserves an icon cell when any layer has an icon, so the names line up. */
  hasIcons = false;
  /** How rows are picked up: anywhere on the row, by the grip, or not at all. */
  activation: 'item' | 'handle' | 'none' = 'item';
  readonly header: HTMLDivElement;
  readonly footer: HTMLDivElement;
  readonly panels: HTMLDivElement;
  readonly list: TpDragDropList<unknown>;

  constructor() {
    super();
    const div = (className: string) => {
      const element = document.createElement('div');
      element.className = className;
      return element;
    };
    this.header = div('bar header');
    this.footer = div('bar footer');
    this.panels = div('panels');
    this.list = document.createElement('tp-drag-drop-list') as TpDragDropList<unknown>;
    this.list.variant = 'ghost';
    this.list.size = 'sm';
  }

  protected override render(): TemplateResult {
    return html`${this.header}${this.list}${this.footer}${this.panels}`;
  }
}

/** The icon and name of one layer row, or the field that renames it. */
export class TweakLayerRow extends LitElement {
  static readonly tagName = 'tweak-layer-row';

  static override properties = {
    layerId: { attribute: false },
    name: { attribute: false },
    icon: { attribute: false },
    reserveIcon: { type: Boolean, attribute: 'reserve-icon', reflect: true },
    trailing: { type: Boolean, reflect: true },
    muted: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    renaming: { type: Boolean, reflect: true },
    focusable: { attribute: false },
  };

  static override styles = css`
    :host {
      display: flex;
      flex: 1;
      align-items: center;
      gap: var(--tp-space-2);
      min-inline-size: 0;
      cursor: default;
      user-select: none;
    }

    :host([disabled]) {
      opacity: 0.5;
    }

    .icon {
      display: inline-flex;
      flex: none;
      inline-size: 14px;
      justify-content: center;
    }

    .label {
      flex: 1;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border-radius: var(--tp-radius-sm);
      outline: none;
    }

    /* A ring around the name would read as a text field; the focused name is underlined. */
    .label:focus-visible {
      text-decoration: underline 2px var(--tp-ring);
      text-underline-offset: 3px;
    }

    :host([muted]) .label,
    :host([muted]) .icon {
      opacity: 0.45;
    }

    /*
     * The rename field fills the row: from its start edge (or the grip) to its end edge (or the
     * toggles), over the icon. Its text starts where the name's does.
     */
    tp-input {
      --_tweak-name-start: 0px;

      flex: 1;
      min-inline-size: 0;
      margin-block: calc(-1 * var(--tp-border-width));
      margin-inline-start: calc(-1 * var(--_tweak-layer-edge));
    }

    tp-input.after-icon {
      --_tweak-name-start: calc(14px + var(--tp-space-2));
    }

    :host(:not([trailing])) tp-input {
      margin-inline-end: calc(-1 * (var(--tp-space-2-5) + var(--tp-border-width)));
    }

    tp-input::part(input-row) {
      padding-inline-start: calc(
        var(--_tweak-layer-edge) - var(--tp-border-width) + var(--_tweak-name-start)
      );
    }

    tp-input > input[data-tp-presentation-part] {
      padding-inline-start: 0;
      text-align: start;
    }
  `;

  layerId = '';
  name = '';
  icon: IconDefinition | undefined;
  reserveIcon = false;
  /** Whether toggles follow the name in the row; the rename field stops before them. */
  trailing = false;
  muted = false;
  disabled = false;
  renaming = false;
  /** Whether the name is the list's one tab stop. */
  focusable = false;

  constructor() {
    super();
    this.addEventListener('click', () => {
      if (!this.renaming) act(this, { action: 'select', id: this.layerId });
    });
    this.addEventListener('dblclick', () => {
      if (!this.renaming) act(this, { action: 'rename-start', id: this.layerId });
    });
  }

  /** Moves keyboard focus to the name. */
  focusName(): void {
    this.renderRoot.querySelector<HTMLElement>('.label')?.focus();
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('renaming') && this.renaming) {
      const input = this.renderRoot.querySelector<TpInput & HTMLElement>('tp-input');
      void input?.updateComplete.then(() => {
        // The native field lives in the input's own tree.
        const field = input.querySelector('input') ?? input.renderRoot.querySelector('input');
        field?.focus();
        field?.select();
      });
    }
  }

  protected override render(): TemplateResult {
    const cell =
      this.reserveIcon || this.icon
        ? html`<span class="icon">${this.icon ? icon(this.icon, 14) : nothing}</span>`
        : nothing;
    if (this.renaming)
      return html`<tp-input
        class=${cell === nothing ? '' : 'after-icon'}
        variant="inline"
        size="sm"
        copyable="false"
        aria-label="Layer name"
        .defaultValue=${this.name}
        @keydown=${this.#onRenameKey}
        @focusout=${this.#onRenameBlur}
      ></tp-input>`;
    return html`${cell}<span
        class="label"
        tabindex=${this.focusable ? 0 : -1}
        @keydown=${this.#onKey}
        >${this.name}</span
      >`;
  }

  #onKey = (event: KeyboardEvent): void => {
    const id = this.layerId;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown':
        act(this, { action: 'step', id, delta: event.key === 'ArrowUp' ? -1 : 1 });
        break;
      case 'Enter':
      case ' ':
        act(this, { action: 'select', id });
        break;
      case 'F2':
        act(this, { action: 'rename-start', id });
        break;
      case 'Delete':
      case 'Backspace':
        act(this, { action: 'remove', id });
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  #renamed = false;

  #finishRename(name: string | null, keyboard: boolean): void {
    if (this.#renamed) return;
    this.#renamed = true;
    act(this, { action: 'rename', id: this.layerId, name, keyboard });
    queueMicrotask(() => (this.#renamed = false));
  }

  #onRenameKey = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      this.#finishRename((event.currentTarget as TpInput).value, true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.#finishRename(null, true);
    }
  };

  #onRenameBlur = (event: FocusEvent): void => {
    // Focus has gone where the user put it: the name does not take it back.
    if (this.renaming) this.#finishRename((event.currentTarget as TpInput).value, false);
  };
}

/** One state toggle of a layer row, as the stack declares it. */
export interface LayerStateView {
  readonly key: string;
  readonly label: string;
  readonly icon: IconDefinition | undefined;
  readonly offIcon: IconDefinition | undefined;
  readonly display: 'always' | 'on' | 'off';
}

/** The state toggles at the end of a layer row, in declaration order. */
export class TweakLayerStates extends LitElement {
  static readonly tagName = 'tweak-layer-states';

  static override properties = {
    layerId: { attribute: false },
    states: { attribute: false },
    values: { attribute: false },
    disabled: { type: Boolean, reflect: true },
  };

  static override styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--tp-space-1);
    }

    /* A toggle shown only in one state keeps its place, so the other toggles line up. */
    .concealed {
      visibility: hidden;
    }

    .concealed:focus-within {
      visibility: visible;
    }

    :host(:hover) .concealed {
      visibility: visible;
    }

    tp-toggle svg {
      display: block;
    }

    /* When the icon or the toggle's presence already shows the state, a pressed fill adds noise. */
    tp-toggle.plain {
      --tp-pressed: transparent;
      --tp-pressed-foreground: currentcolor;
    }
  `;

  layerId = '';
  states: readonly LayerStateView[] = [];
  values: Readonly<Record<string, boolean>> = {};
  disabled = false;

  protected override render(): TemplateResult {
    // A state without an icon has no toggle in the row; code and bar actions change it.
    return html`${this.states.map((state) => {
      if (!state.icon) return nothing;
      const on = this.values[state.key] ?? false;
      const shown = state.display === 'always' || (state.display === 'on') === on;
      const shape = on ? state.icon : (state.offIcon ?? state.icon);
      const plain = state.offIcon !== undefined || state.display !== 'always';
      return html`<tp-toggle
        class=${[shown ? '' : 'concealed', plain ? 'plain' : ''].join(' ')}
        size="icon-xs"
        variant="ghost"
        aria-label=${state.label}
        title=${state.label}
        .pressed=${on}
        .disabled=${this.disabled}
        @tp-value-change=${(event: CustomEvent<{ value: unknown }>) =>
          this.#propose(event, state.key)}
        >${icon(shape, 14)}</tp-toggle
      >`;
    })}`;
  }

  #propose(event: CustomEvent<{ value: unknown }>, key: string): void {
    if (event.target !== event.currentTarget) return;
    const value = event.detail.value === true;
    // The toggles are controlled: assigning the proposal accepts it, leaving it rejects it.
    if (act(this, { action: 'state', id: this.layerId, key, value })) {
      (event.currentTarget as HTMLElement & { pressed: boolean }).pressed = value;
    }
  }
}
