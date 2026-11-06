import { css, html, LitElement, type PropertyValues } from 'lit';
import type { TpTabs, TpValueChangeEvent } from '@tweakpad/ui';
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

  protected override render() {
    return html`${this.body}`;
  }
}

/**
 * Library tabs with retained devkit pages, so inactive bindings sleep without losing state.
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
      padding-block-end: var(--tweak-section-gap);
    }

    .page-frame {
      padding-inline: var(--tp-space-2);
      padding-block-end: var(--tweak-section-gap);
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
    if (changed.has('selected') || changed.has('labels')) this.syncPages();
  }

  /** Assigns each retained page to its library panel and keeps binding visibility in sync. */
  syncPages(): void {
    this.pages.forEach((page, index) => {
      page.slot = `page-${index}`;
      page.hidden = index !== this.selected;
    });
  }

  protected override render() {
    return html`<tp-tabs
      .value=${String(this.selected)}
      .partPresentation=${{
        // Preview full-width tabs before moving this layout option into the library.
        'tabs-list': { styleHook: { 'inline-size': '100%' } },
        'tabs-trigger': { styleHook: { flex: '1 1 0' } },
      }}
      @tp-value-change=${this.#onSelect}
    >
      ${this.labels.map(
        (label, index) => html`
          <button slot="tab" value=${String(index)}>${label}</button>
          <div class="page-frame" slot="panel" value=${String(index)} keep-mounted>
            <slot name=${`page-${index}`}></slot>
          </div>
        `,
      )}
    </tp-tabs>`;
  }

  #onSelect = (event: TpValueChangeEvent<unknown>): void => {
    if (event.target !== event.currentTarget) return;
    const index = Number(event.detail.value);
    // Echo the controlled value immediately, as required by the library's value contract.
    (event.currentTarget as TpTabs).value = String(index);
    if (index === this.selected) return;
    this.select(index);
    this.dispatchEvent(
      new CustomEvent('tweak-select', { detail: { index }, bubbles: true, composed: true }),
    );
  };
}
