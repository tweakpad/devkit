import { css, html, LitElement, type TemplateResult } from 'lit';
import type { TpLayers } from '@tweakpad/ui/widgets';
import { containerStyles } from './styles.js';

/**
 * A layer stack: the library's Layers widget, with the stack's header and footer rows in its bars,
 * and below it the panels of the layers, the active layer's shown. The API layer owns the
 * widget's records and the bars' contents.
 */
export class TweakLayers extends LitElement {
  static readonly tagName = 'tweak-layers';

  static override styles = [
    containerStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--tweak-section-gap);
      }

      /* The bars' lines and the panel's are the pane's dimmed lines. */
      tp-layers::part(layers-header),
      tp-layers::part(layers-footer) {
        border-color: var(--tweak-border-color);
      }

      /* A bar's row takes the bar's width, as a row of the pane does. */
      tp-layers > .chunk {
        flex: 1;
        min-inline-size: 0;
      }

      .panels {
        padding-block-start: var(--tweak-section-gap);
        border-block-start: 1px solid var(--tweak-border-color);
      }

      .panels[hidden] {
        display: none;
      }
    `,
  ];

  /** The library's Layers widget. */
  readonly layers: TpLayers;
  /** The layers' panels, one `tweak-tab-page` each; only the active layer's shows. */
  readonly panels: HTMLDivElement;

  constructor() {
    super();
    this.layers = document.createElement('tp-layers') as TpLayers;
    this.layers.size = 'sm';
    this.panels = document.createElement('div');
    this.panels.className = 'panels';
    this.panels.hidden = true;
  }

  /** Puts a bar's row in the widget's header or footer. */
  setBar(slot: 'header' | 'footer', element: HTMLElement): void {
    element.slot = slot;
    this.layers.append(element);
  }

  protected override render(): TemplateResult {
    return html`${this.layers}${this.panels}`;
  }
}
