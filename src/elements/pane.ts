import { css, html, LitElement, type TemplateResult } from 'lit';
import { chevronDownIcon } from '@tweakpad/ui/icons/chevron-down';
import type { TpInput } from '@tweakpad/ui';
import { icon, searchIcon } from './icons.js';
import { containerStyles, paneTokens } from './styles.js';

export type PaneAnchor = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

/**
 * The floating panel: a title bar (drag to move, button to collapse) over a scrolling body.
 *
 * Moving the panel never touches an attribute: the offset lives in a stylesheet of the pane's
 * own, so the library controls inside (which watch their ancestors' `style` and `class`) stay
 * asleep during a drag.
 *
 * @fires tweak-toggle - detail `{ open }`, after the collapse button is pressed.
 */
export class TweakPane extends LitElement {
  static readonly tagName = 'tweak-pane';

  static override properties = {
    heading: { type: String },
    expanded: { type: Boolean, reflect: true },
    floating: { type: Boolean, reflect: true },
    anchor: { type: String, reflect: true },
    movable: { type: Boolean, reflect: true },
    searchOpen: { state: true },
    searchQuery: { state: true },
    searchMatches: { state: true },
  };

  static override styles = [
    paneTokens,
    containerStyles,
    css`
      :host {
        --tweak-pane-width: 17.5rem;
        --tweak-pane-inset: var(--tp-space-2);

        display: block;
        inline-size: var(--tweak-pane-width);
        font-family: var(--tp-font-sans);
        color: var(--tp-foreground);
        z-index: 1000;
      }

      :host([floating]) {
        position: fixed;
      }

      :host([floating][anchor='top-right']),
      :host([floating]:not([anchor])) {
        inset-block-start: var(--tweak-pane-inset);
        inset-inline-end: var(--tweak-pane-inset);
      }

      :host([floating][anchor='top-left']) {
        inset-block-start: var(--tweak-pane-inset);
        inset-inline-start: var(--tweak-pane-inset);
      }

      :host([floating][anchor='bottom-right']) {
        inset-block-end: var(--tweak-pane-inset);
        inset-inline-end: var(--tweak-pane-inset);
      }

      :host([floating][anchor='bottom-left']) {
        inset-block-end: var(--tweak-pane-inset);
        inset-inline-start: var(--tweak-pane-inset);
      }

      .panel {
        box-sizing: border-box;
        display: grid;
        grid-template-rows: auto auto minmax(0, 1fr);
        max-block-size: calc(100dvh - 2 * var(--tweak-pane-inset));
        padding: var(--tp-space-1-5);
        border: var(--tp-border-width) var(--tp-border-style) var(--tp-edge);
        border-radius: var(--tp-radius-lg);
        background: var(--tp-card);
        color: var(--tp-card-foreground);
        box-shadow: var(--tp-shadow-lg);
      }

      :host(:not([floating])) .panel {
        max-block-size: none;
        box-shadow: none;
      }

      .header {
        display: grid;
        grid-template-columns: minmax(var(--tp-control-height-xs), 1fr) minmax(0, auto) minmax(
            var(--tp-control-height-xs),
            1fr
          );
        align-items: center;
        gap: var(--tp-space-1);
        min-block-size: var(--tp-control-height-sm);
        touch-action: none;
        user-select: none;
      }

      :host([movable]) .header {
        cursor: grab;
      }

      :host([movable]) .header.dragging {
        cursor: grabbing;
      }

      .title {
        min-inline-size: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--tp-text-sm);
        font-weight: var(--tp-font-semibold);
        text-align: center;
      }

      .actions {
        display: flex;
        align-items: center;
        gap: var(--tp-space-0-5);
        justify-self: end;
      }

      .icon-button {
        all: unset;
        box-sizing: border-box;
        display: inline-grid;
        place-items: center;
        inline-size: var(--tp-control-height-xs);
        block-size: var(--tp-control-height-xs);
        border-radius: var(--tp-radius-lg);
        color: var(--tp-muted-foreground);
        cursor: pointer;
      }

      .icon-button:hover {
        background: var(--tp-muted);
        color: var(--tp-foreground);
      }

      .icon-button[aria-pressed='true'] {
        background: var(--tp-control);
        color: var(--tp-primary);
      }

      .search-reveal {
        display: grid;
        grid-template-rows: 0fr;
        opacity: 0;
        translate: 0 calc(-1 * var(--tp-space-1));
        transition:
          grid-template-rows calc(var(--tp-duration-fast) * var(--tp-motion-scale, 1))
            var(--tp-easing-standard),
          opacity calc(var(--tp-duration-fast) * var(--tp-motion-scale, 1))
            var(--tp-easing-standard),
          translate calc(var(--tp-duration-fast) * var(--tp-motion-scale, 1))
            var(--tp-easing-standard);
      }

      .search-reveal[data-open] {
        grid-template-rows: 1fr;
        opacity: 1;
        translate: 0 0;
      }

      .search-clip {
        min-block-size: 0;
        overflow: clip;
        overflow-clip-margin: var(--tp-ring-width);
      }

      .search-row {
        display: flex;
        align-items: center;
        gap: var(--tp-space-1);
        margin-block-start: var(--tp-space-1-5);
        padding-inline-end: var(--tp-space-1-5);
        border-radius: var(--tp-radius-lg);
        background: var(--tp-control);
      }

      .search-input {
        flex: 1;
        min-inline-size: 0;
      }

      .search-input > input[data-tp-editor] {
        border-color: transparent;
        background: transparent;
        font-family: var(--tp-font-sans);
      }

      .clear-button {
        all: unset;
        display: inline-flex;
        align-items: center;
        gap: var(--tp-space-1);
        padding: var(--tp-space-0-5) var(--tp-space-1);
        border-radius: var(--tp-radius-lg);
        font-size: var(--tp-text-xs);
        color: var(--tp-muted-foreground);
        cursor: pointer;
      }

      .clear-button:hover {
        color: var(--tp-foreground);
      }

      .clear-button:focus-visible {
        outline: var(--tp-ring-width) solid var(--tp-ring);
      }

      .empty {
        margin: var(--tp-space-2);
        font-size: var(--tp-text-sm);
        color: var(--tp-muted-foreground);
        text-align: center;
      }

      .icon-button:focus-visible {
        outline: var(--tp-ring-width) solid var(--tp-ring);
        outline-offset: var(--tp-ring-offset);
      }

      .chevron {
        display: inline-flex;
        transition: rotate calc(var(--tp-duration-fast) * var(--tp-motion-scale, 1))
          var(--tp-easing-standard);
      }

      :host(:not([expanded])) .chevron {
        rotate: 180deg;
      }

      .scroll {
        min-block-size: 0;

        /* One scroll viewport contains the controls and outside tab columns. */
        margin-inline: calc(
            -1 *
              (var(--tp-space-1-5) + var(--tp-border-width) + var(--tweak-tabs-outside-left, 0px))
          )
          calc(
            -1 *
              (var(--tp-space-1-5) + var(--tp-border-width) + var(--tweak-tabs-outside-right, 0px))
          );
        padding-inline: calc(
            var(--tp-space-1-5) + var(--tp-border-width) + var(--tweak-tabs-outside-left, 0px)
          )
          calc(var(--tp-space-1-5) + var(--tp-border-width) + var(--tweak-tabs-outside-right, 0px));
        margin-block: var(--tp-space-1-5) calc(-1 * (var(--tp-space-1-5) + var(--tp-border-width)));
        padding-block: var(--tp-space-1-5) var(--tp-radius-lg);
        border-block-start: var(--tp-border-width) var(--tp-border-style) var(--tp-hairline);
        overflow: auto;
        clip-path: shape(
          from 0 0,
          hline to 100%,
          vline to calc(100% - var(--tp-radius-lg)),
          hline to calc(100% - var(--tweak-tabs-outside-right, 0px)),
          arc to calc(100% - var(--tweak-tabs-outside-right, 0px) - var(--tp-radius-lg)) 100% of
            var(--tp-radius-lg) cw,
          hline to calc(var(--tweak-tabs-outside-left, 0px) + var(--tp-radius-lg)),
          arc to calc(var(--tweak-tabs-outside-left, 0px)) calc(100% - var(--tp-radius-lg)) of
            var(--tp-radius-lg) cw,
          hline to 0,
          close
        );
        overscroll-behavior: none contain;
        scrollbar-width: thin;
        scrollbar-color: var(--tp-border) transparent;
      }

      .scroll[hidden] {
        display: none;
      }

      .body > tweak-folder:first-child {
        padding-block-start: 0;
        border-block-start: none;
      }
    `,
  ];

  heading = '';
  expanded = true;
  floating = true;
  anchor: PaneAnchor = 'top-right';
  movable = true;
  searchOpen = false;
  searchQuery = '';
  searchMatches = 0;
  /** Where the pane's rows, folders and tabs go. Owned by the API layer, never by the template. */
  readonly body: HTMLDivElement;

  readonly #offsetSheet = new CSSStyleSheet();
  #offsetX = 0;
  #offsetY = 0;
  #drag: { id: number; x: number; y: number; ox: number; oy: number } | null = null;

  constructor() {
    super();
    this.body = document.createElement('div');
    this.body.className = 'body';
    this.#offsetSheet.replaceSync(':host{translate:0 0}');
    this.addEventListener('keydown', this.#onSearchKeyDown, true);
  }

  protected override createRenderRoot() {
    const root = super.createRenderRoot() as ShadowRoot;
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, this.#offsetSheet];
    return root;
  }

  /** Moves the floating pane by an offset from its anchor, in CSS pixels. */
  moveTo(x: number, y: number): void {
    this.#offsetX = x;
    this.#offsetY = y;
    (this.#offsetSheet.cssRules[0] as CSSStyleRule).style.setProperty('translate', `${x}px ${y}px`);
  }

  get offset(): { x: number; y: number } {
    return { x: this.#offsetX, y: this.#offsetY };
  }

  protected override render(): TemplateResult {
    return html`<div class="panel" part="panel">
      <div
        class="header"
        part="header"
        @pointerdown=${this.#onPointerDown}
        @pointermove=${this.#onPointerMove}
        @pointerup=${this.#onPointerUp}
        @pointercancel=${this.#onPointerUp}
      >
        <button
          class="icon-button search-toggle"
          type="button"
          aria-label="Search fields"
          aria-pressed=${String(this.searchOpen)}
          aria-expanded=${String(this.searchOpen)}
          aria-controls="search"
          @click=${this.#onSearchToggle}
        >
          ${icon(searchIcon, 14)}
        </button>
        <span class="title">${this.heading}</span>
        <span class="actions">
          <slot name="actions"></slot>
          <button
            class="icon-button"
            aria-label=${this.expanded ? 'Collapse panel' : 'Expand panel'}
            aria-expanded=${this.expanded ? 'true' : 'false'}
            @click=${this.#onToggle}
          >
            <span class="chevron">${icon(chevronDownIcon, 14)}</span>
          </button>
        </span>
      </div>
      <div
        class="search-reveal"
        id="search"
        role="search"
        ?data-open=${this.searchOpen && this.expanded}
        ?inert=${!this.searchOpen || !this.expanded}
      >
        <div class="search-clip">
          <div class="search-row">
            <tp-input
              class="search-input"
              label="Search fields"
              placeholder="Search fields…"
              .value=${this.searchQuery}
              @tp-value-change=${this.#onSearchInput}
            ></tp-input>
            <button
              class="clear-button"
              type="button"
              @click=${this.#closeSearch}
              aria-label="Clear and close search"
              aria-keyshortcuts="Escape"
            >
              Clear <tp-kbd value="Escape" aria-hidden="true"></tp-kbd>
            </button>
          </div>
        </div>
      </div>
      <div class="scroll" part="body" ?hidden=${!this.expanded}>
        <p
          class="empty"
          role="status"
          ?hidden=${!this.searchQuery.trim() || this.searchMatches > 0}
        >
          No matching fields
        </p>
        ${this.body}
      </div>
    </div>`;
  }

  #onSearchToggle = (): void => {
    if (this.searchOpen) {
      this.#closeSearch();
      return;
    }
    this.searchOpen = true;
    this.expanded = true;
    void this.updateComplete.then(async () => {
      const input = this.renderRoot.querySelector<TpInput>('.search-input')!;
      await input.updateComplete;
      if (this.searchOpen) input.inputElement?.focus({ preventScroll: true });
    });
  };

  #closeSearch = (): void => {
    this.searchOpen = false;
    this.searchQuery = '';
    this.#notifySearch();
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLButtonElement>('.search-toggle')!.focus(),
    );
  };

  #onSearchInput = (event: CustomEvent<{ value: string }>): void => {
    this.searchQuery = event.detail.value;
    (event.currentTarget as TpInput).value = this.searchQuery;
    this.#notifySearch();
  };

  #notifySearch(): void {
    this.dispatchEvent(new CustomEvent('tweak-search', { detail: { query: this.searchQuery } }));
  }

  #onSearchKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.searchOpen || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    this.#closeSearch();
  };

  #onToggle = (): void => {
    this.expanded = !this.expanded;
    this.dispatchEvent(
      new CustomEvent('tweak-toggle', {
        detail: { open: this.expanded },
        bubbles: true,
        composed: true,
      }),
    );
  };

  #onPointerDown = (event: PointerEvent): void => {
    if (!this.movable || !this.floating || event.button !== 0) return;
    if ((event.target as Element).closest('button, a, input, [role="button"]')) return;
    const header = event.currentTarget as HTMLElement;
    header.setPointerCapture(event.pointerId);
    header.classList.add('dragging');
    this.#drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ox: this.#offsetX,
      oy: this.#offsetY,
    };
  };

  #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (!drag || drag.id !== event.pointerId) return;
    this.moveTo(drag.ox + event.clientX - drag.x, drag.oy + event.clientY - drag.y);
  };

  #onPointerUp = (event: PointerEvent): void => {
    if (!this.#drag || this.#drag.id !== event.pointerId) return;
    this.#drag = null;
    (event.currentTarget as HTMLElement).classList.remove('dragging');
  };
}
