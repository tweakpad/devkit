import { css, html, LitElement, type PropertyValues } from 'lit';
import { containerStyles } from './styles.js';

/** One page of a tweak-tabs. Hidden pages are out of rendering, so their bindings sleep. */
export class TweakTabPage extends LitElement {
  static readonly tagName = 'tweak-tab-page';

  static override styles = [
    containerStyles,
    css`
      /* A hidden page keeps its rendering state, so switching back to it is cheap. */
      :host([hidden]) {
        display: block;
        content-visibility: hidden;
        block-size: 0;
      }
    `,
  ];

  readonly body: HTMLDivElement;

  constructor() {
    super();
    this.body = document.createElement('div');
    this.body.className = 'body';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('role', 'tabpanel');
  }

  protected override render() {
    return html`${this.body}`;
  }
}

/**
 * Navigation tabs: a compact strip of page names over the selected page.
 *
 * @fires tweak-select - detail `{ index }`, after the user picks a page.
 */
export class TweakTabs extends LitElement {
  static readonly tagName = 'tweak-tabs';

  static override properties = {
    labels: { attribute: false },
    selected: { type: Number },
  };

  static override styles = css`
    :host {
      display: block;
    }

    .strip {
      margin-block-end: var(--tweak-section-gap);
      display: flex;
      gap: var(--tp-space-0-5);
      padding: var(--tp-space-0-5);
      border-radius: var(--tp-radius-lg);
      background: var(--tp-muted);
      overflow-x: auto;
      scrollbar-width: none;
    }

    .tab {
      all: unset;
      box-sizing: border-box;
      flex: 1 0 auto;
      min-block-size: var(--tp-control-height-xs);
      padding-inline: var(--tp-space-2);
      border-radius: var(--tp-radius-md);
      font-size: var(--tp-text-xs);
      font-weight: var(--tp-font-medium);
      line-height: var(--tp-control-height-xs);
      text-align: center;
      white-space: nowrap;
      color: var(--tp-muted-foreground);
      cursor: pointer;
      user-select: none;
    }

    .tab:hover {
      color: var(--tp-foreground);
    }

    .tab[aria-selected='true'] {
      background: var(--tp-background);
      color: var(--tp-foreground);
      box-shadow: var(--tp-shadow-sm);
    }

    .tab:focus-visible {
      outline: var(--tp-ring-width) solid var(--tp-ring);
      outline-offset: calc(var(--tp-ring-width) * -1);
    }
  `;

  labels: string[] = [];
  selected = 0;

  get pages(): TweakTabPage[] {
    return [...this.children].filter((c): c is TweakTabPage => c instanceof TweakTabPage);
  }

  select(index: number): void {
    this.selected = Math.max(0, Math.min(index, this.labels.length - 1));
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('selected') || changed.has('labels')) this.#syncPages();
  }

  #syncPages(): void {
    this.pages.forEach((page, index) => {
      page.hidden = index !== this.selected;
      page.setAttribute('aria-label', this.labels[index] ?? '');
    });
  }

  /** Re-applies page visibility after pages were added. */
  syncPages(): void {
    this.#syncPages();
  }

  protected override render() {
    return html`<div class="strip" role="tablist" @keydown=${this.#onKeyDown}>
        ${this.labels.map(
          (label, index) =>
            html`<button
              class="tab"
              role="tab"
              aria-selected=${index === this.selected ? 'true' : 'false'}
              tabindex=${index === this.selected ? 0 : -1}
              @click=${() => this.#pick(index)}
            >
              ${label}
            </button>`,
        )}
      </div>
      <slot></slot>`;
  }

  #pick(index: number, focus = false): void {
    if (index !== this.selected) {
      this.select(index);
      this.dispatchEvent(
        new CustomEvent('tweak-select', { detail: { index }, bubbles: true, composed: true }),
      );
    }
    if (focus)
      void this.updateComplete.then(() =>
        this.renderRoot.querySelector<HTMLElement>(`.tab:nth-child(${index + 1})`)?.focus(),
      );
  }

  #onKeyDown = (event: KeyboardEvent): void => {
    const count = this.labels.length;
    if (count === 0) return;
    const rtl = getComputedStyle(this).direction === 'rtl';
    let next: number;
    if (event.key === 'ArrowRight') next = this.selected + (rtl ? -1 : 1);
    else if (event.key === 'ArrowLeft') next = this.selected + (rtl ? 1 : -1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else return;
    event.preventDefault();
    this.#pick((next + count) % count, true);
  };
}
