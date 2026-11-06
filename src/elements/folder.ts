import { css, html, LitElement, type PropertyValues } from 'lit';
import { chevronDownIcon } from '@tweakpad/ui/icons/chevron-down';
import { icon } from './icons.js';
import { containerStyles } from './styles.js';
import { GroupGuide } from './group-guide.js';

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
        --tweak-folder-chevron-size: 14px;

        display: block;
        padding-block: var(--tp-space-3);
      }

      :host([hidden]) {
        display: none;
      }

      .header {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: var(--tp-space-2);
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
        flex: none;
        inline-size: var(--tweak-folder-chevron-size);
        block-size: var(--tweak-folder-chevron-size);
        transition: rotate calc(var(--tp-duration-fast) * var(--tp-motion-scale, 1))
          var(--tp-easing-standard);
      }

      :host(:not([open])) .chevron {
        rotate: -90deg;
      }

      .content {
        display: grid;
        grid-template-rows: 0fr;
        opacity: 0;
        transition:
          grid-template-rows calc(var(--tp-duration-normal) * var(--tp-motion-scale, 1))
            var(--tp-easing-standard),
          opacity calc(var(--tp-duration-fast) * var(--tp-motion-scale, 1))
            var(--tp-easing-standard);
      }

      :host([open]) .content {
        grid-template-rows: 1fr;
        opacity: 1;
        transition-duration:
          calc(var(--tp-duration-normal) * var(--tp-motion-scale, 1)),
          calc(var(--tp-duration-slow) * var(--tp-motion-scale, 1));
        transition-timing-function: var(--tp-easing-standard), linear;
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
        position: relative;
        padding-block-start: var(--tp-space-3);
        padding-inline-start: calc(
          var(--tp-space-1) + var(--tweak-folder-chevron-size) + var(--tp-space-2)
        );
      }

      /* Trailing nested sections share the last control's bottom edge with their parent. */
      .body > tweak-folder:nth-last-child(1 of :not([hidden])) {
        padding-block-end: 0;
      }

      .body::before {
        content: '';
        position: absolute;
        inset-block: var(--tp-space-3) 5px;
        inset-inline-start: calc(
          var(--tp-space-1) + var(--tweak-folder-chevron-size) / 2 - var(--tp-border-width) / 2
        );
        border-inline-start: var(--tp-border-width) solid var(--tp-border);
        opacity: 0;
        pointer-events: none;
      }

      .body::after {
        content: '';
        position: absolute;
        inset-block-end: 0;
        inset-inline-start: calc(var(--tp-space-1) + var(--tweak-folder-chevron-size) / 2 - 0.5px);
        inline-size: 1px;
        block-size: 1px;
        background: var(--tp-muted-foreground);
        opacity: 0;
        pointer-events: none;
      }

      .body::before,
      .body::after {
        transition: opacity calc(var(--tp-duration-fast) * var(--tp-motion-scale, 1))
          var(--tp-easing-standard);
      }

      :host([data-guide-hover]) .body::before,
      :host([data-guide-focus]) .body::before,
      :host([data-guide-hover]) .body::after,
      :host([data-guide-focus]) .body::after {
        opacity: 1;
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
    new GroupGuide(this);
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
        <span class="chevron">${icon(chevronDownIcon, 14)}</span>
        <span class="label">${this.heading}</span>
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
