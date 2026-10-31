import { css, html, LitElement, type PropertyValues } from 'lit';
import { chevronDownIcon } from '@tweakpad/ui/icons/chevron-down';
import { icon } from './icons.js';
import { containerStyles } from './styles.js';

/**
 * A collapsible group of rows. Its rows live in its own shadow root; once closed, the content is
 * removed from rendering, so its rows stop intersecting and their bindings stop being sampled.
 *
 * @fires tweak-toggle - detail `{ open }`, after a press on the header.
 */
export class TweakFolder extends LitElement {
  static readonly tagName = 'tweak-folder';

  static override properties = {
    heading: { type: String },
    open: { type: Boolean, reflect: true },
  };

  static override styles = [
    containerStyles,
    css`
      :host {
        display: block;
        padding-block-start: var(--tweak-section-gap);
        border-block-start: var(--tp-border-width) var(--tp-border-style) var(--tp-border);
      }

      .header {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: space-between;
        inline-size: 100%;
        min-block-size: var(--tp-control-height-xs);
        padding-inline: var(--tp-space-1);
        border-radius: var(--tp-radius-md);
        font-size: var(--tp-text-xs);
        font-weight: var(--tp-font-medium);
        letter-spacing: var(--tp-tracking-wide);
        color: var(--tp-muted-foreground);
        cursor: pointer;
        user-select: none;
      }

      .header:hover {
        color: var(--tp-foreground);
      }

      .header:focus-visible {
        outline: var(--tp-ring-width) solid var(--tp-ring);
        outline-offset: var(--tp-ring-offset);
      }

      .chevron {
        display: inline-flex;
        transition: rotate calc(var(--tp-duration-fast) * var(--tp-motion-scale, 1))
          var(--tp-easing-standard);
      }

      :host(:not([open])) .chevron {
        rotate: -90deg;
      }

      .content {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows calc(var(--tp-duration-normal) * var(--tp-motion-scale, 1))
          var(--tp-easing-standard);
      }

      :host([open]) .content {
        grid-template-rows: 1fr;
      }

      .inner {
        min-block-size: 0;
        overflow: clip;
      }

      /* Closed content keeps its rendering state (styles, layout) but is skipped: reopening
         does not restyle every library control inside, as display: none would force. Its
         chunks stop intersecting, which puts their bindings to sleep. */
      .inner[hidden] {
        display: block;
        content-visibility: hidden;
      }

      .body {
        padding-block-start: var(--tweak-row-gap);
      }
    `,
  ];

  heading = '';
  open = true;
  /** Where the folder's rows, folders and tabs go. Owned by the API layer, never by the template. */
  readonly body: HTMLDivElement;
  #contentHidden = false;
  #hideTimer = 0;

  constructor() {
    super();
    this.body = document.createElement('div');
    this.body.className = 'body';
  }

  toggle(open = !this.open): void {
    this.open = open;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('open')) return;
    clearTimeout(this.#hideTimer);
    if (this.open) {
      this.#contentHidden = false;
    } else if (changed.get('open') === undefined) {
      // Created closed: nothing to animate.
      this.#contentHidden = true;
    } else {
      // Keep the content rendered while it collapses, then drop it from rendering.
      this.#hideTimer = window.setTimeout(() => {
        if (this.open) return;
        this.#contentHidden = true;
        this.requestUpdate();
      }, 400);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.#hideTimer);
  }

  protected override render() {
    return html`<button
        class="header"
        part="header"
        aria-expanded=${this.open ? 'true' : 'false'}
        aria-controls="content"
        @click=${this.#onHeader}
      >
        <span class="label">${this.heading}</span>
        <span class="chevron">${icon(chevronDownIcon, 14)}</span>
      </button>
      <div
        class="content"
        id="content"
        role="region"
        aria-label=${this.heading}
        @transitionend=${this.#onTransitionEnd}
      >
        <div class="inner" ?hidden=${this.#contentHidden}>${this.body}</div>
      </div>`;
  }

  #onHeader = (): void => {
    this.toggle();
    this.dispatchEvent(
      new CustomEvent('tweak-toggle', {
        detail: { open: this.open },
        bubbles: true,
        composed: true,
      }),
    );
  };

  #onTransitionEnd = (event: TransitionEvent): void => {
    if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') return;
    if (this.open || this.#contentHidden) return;
    clearTimeout(this.#hideTimer);
    this.#contentHidden = true;
    this.requestUpdate();
  };
}
