import { css, html, nothing, LitElement, type PropertyValues, type TemplateResult } from 'lit';
import type { TpTabs, TpTooltip, IconDefinition, TpValueChangeEvent } from '@tweakpad/ui';
import { containerStyles } from './styles.js';

// Outside columns belong to the pane's scrollable area, rather than escaping it.
const paneColumns = new WeakMap<HTMLElement, Map<TweakTabs, { left: number; right: number }>>();
function updateGutters(pane: HTMLElement): void {
  const columns = [...(paneColumns.get(pane)?.values() ?? [])];
  pane.style.setProperty(
    '--tweak-tabs-outside-left',
    `${Math.max(0, ...columns.map((c) => c.left))}px`,
  );
  pane.style.setProperty(
    '--tweak-tabs-outside-right',
    `${Math.max(0, ...columns.map((c) => c.right))}px`,
  );
}

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

  protected override render(): TemplateResult {
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
    orientation: { reflect: true },
    side: {},
    placement: { reflect: true },
    pageOptions: { attribute: false },
  };

  static override styles = css`
    :host {
      position: relative;
      display: block;
      padding-block-end: var(--tweak-section-gap);
    }

    :host([orientation='vertical']) {
      padding-block-end: 0;
    }

    .page-frame {
      padding-inline: var(--tp-space-2);
      padding-block-end: var(--tweak-section-gap);
    }

    :host([orientation='vertical']) .page-frame {
      position: relative;
      z-index: 2;
      box-sizing: border-box;
      min-block-size: var(--rail-height, 0);
      margin-inline: var(--rail-inset-left, 0) var(--rail-inset-right, 0);
      padding: var(--tp-space-3);
      border-radius: var(--rail-surface-radius);
      background: transparent;
    }

    .rail-backdrop {
      position: absolute;
      z-index: 0;
      background: var(--tp-card);
      pointer-events: none;
    }

    .group-outline {
      position: absolute;
      border-radius: var(--tp-radius-lg);
      overflow: visible;
      pointer-events: none;
      z-index: 1;
      fill: var(--tp-card);
      stroke: var(--tp-border);
      stroke-width: var(--tp-border-width);
      filter: drop-shadow(var(--tp-shadow-md));
    }

    .page-heading {
      margin-block-end: var(--tp-space-3);
      font-size: var(--tp-text-sm);
      font-weight: var(--tp-font-medium);
      color: var(--tp-foreground);
    }

    :host([orientation='vertical']) button[slot='tab'] {
      border: 0;
      border-radius: 0;
      inline-size: 100%;
    }

    :host([orientation='vertical']) button[data-selected] {
      border-radius: var(--rail-selected-radius);
      background: transparent;
      box-shadow: none;
    }

    tp-icon {
      color: var(--tp-muted-foreground);
      transition: color calc(var(--tp-duration-fast) * var(--tp-motion-scale, 1))
        var(--tp-easing-standard);
    }

    button:hover tp-icon,
    button:focus-visible tp-icon,
    button[data-selected] tp-icon {
      color: var(--tab-icon-color, var(--tp-foreground));
    }
  `;

  orientation: 'horizontal' | 'vertical' = 'horizontal';
  side: 'auto' | 'left' | 'right' = 'auto';
  placement: 'inside' | 'outside' = 'outside';
  pageOptions: { icon?: IconDefinition; color?: string; hint?: string }[] = [];
  #frame = 0;
  #pane: HTMLElement | undefined;
  #onScroll = (): void => {
    this.shadowRoot?.querySelectorAll<TpTooltip>('tp-tooltip').forEach((tip) => tip.close());
  };
  #resize: ResizeObserver | undefined;
  #visibility: MutationObserver | undefined;
  #scroll: HTMLElement | undefined;
  #schedule = (): void => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(this.#position);
  };
  #tooltipReleases: (() => void)[] = [];
  #geometry = '';

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.orientation === 'vertical') this.#frame = requestAnimationFrame(this.#position);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    cancelAnimationFrame(this.#frame);
    this.#visibility?.disconnect();
    this.#resize?.disconnect();
    this.#resize = undefined;
    this.#scroll?.removeEventListener('scroll', this.#onScroll);
    if (this.#pane) {
      paneColumns.get(this.#pane)?.delete(this);
      updateGutters(this.#pane);
    }
    window.removeEventListener('resize', this.#schedule);
    this.#tooltipReleases.splice(0).forEach((release) => release());
    this.#geometry = '';
  }

  protected override updated(): void {
    this.#tooltipReleases.splice(0).forEach((release) => release());
    if (this.orientation !== 'vertical') return;
    this.#schedule();
    const buttons = this.shadowRoot!.querySelectorAll<HTMLElement>('button[slot=tab]');
    this.shadowRoot!.querySelectorAll<TpTooltip>('tp-tooltip').forEach((tooltip, i) => {
      this.#tooltipReleases.push(tooltip.registerTrigger(buttons[i]!));
    });
  }

  #position = (): void => {
    if (!this.isConnected) return;
    const ancestors: HTMLElement[] = [this];
    let node: Node | null = this.parentNode;
    while (node) {
      if (node instanceof HTMLElement) ancestors.push(node);
      node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
    }
    const pane = ancestors.find((el) => el.localName === 'tweak-pane');
    const lib = this.shadowRoot?.querySelector<TpTabs>('tp-tabs');
    const list = lib?.shadowRoot?.querySelector<HTMLElement>('[part=tabs-list]');
    if (pane && list) {
      const right =
        this.side === 'right' ||
        (this.side === 'auto' && pane.getAttribute('anchor')?.endsWith('left'));
      const p = pane.getBoundingClientRect();
      const group = this.getBoundingClientRect();
      const listStyle = getComputedStyle(list);
      const width =
        (lib!.querySelector<HTMLElement>('button[slot=tab]')?.getBoundingClientRect().width ?? 0) +
        parseFloat(listStyle.paddingLeft) +
        parseFloat(listStyle.paddingRight);
      const height = list.getBoundingClientRect().height;
      const buttons = lib!.querySelectorAll<HTMLElement>('button[slot=tab]');
      const visible = !ancestors.some(
        (el) => el.hidden || (el.localName === 'tweak-pane' && !el.hasAttribute('expanded')),
      );
      // Computed CSS resolves rem/calc/theme overrides to the same pixel radius as controls.
      const radius = parseFloat(
        getComputedStyle(this.shadowRoot!.querySelector('.group-outline')!).borderTopLeftRadius,
      );
      const geometry = [
        radius,
        right,
        this.selected,
        group.height,
        this.placement,
        p.width,
        width,
        height,
        visible,
        group.left - p.left,
        group.right - p.left,
      ].join(',');
      if (geometry !== this.#geometry) {
        this.#geometry = geometry;
        Object.assign(list.style, {
          position: 'absolute',
          top: '0',
          left: `${this.placement === 'outside' ? (right ? p.right - group.left : p.left - group.left - width) : right ? group.width - width : 0}px`,
          width: `${width}px`,
          maxWidth: 'none',
          zIndex: '2',
          visibility: visible ? 'visible' : 'hidden',
        });
        this.#pane = pane;
        if (!paneColumns.has(pane)) paneColumns.set(pane, new Map());
        paneColumns.get(pane)!.set(this, {
          left: this.placement === 'outside' && !right ? width : 0,
          right: this.placement === 'outside' && right ? width : 0,
        });
        updateGutters(pane);
        this.style.minHeight = `${height}px`;
        const inside = this.placement === 'inside';
        this.style.setProperty('--rail-height', `${height}px`);
        const selectedRect = buttons[this.selected]?.getBoundingClientRect();
        this.style.setProperty(
          '--rail-selected-radius',
          right
            ? '0 var(--tp-radius-lg) var(--tp-radius-lg) 0'
            : 'var(--tp-radius-lg) 0 0 var(--tp-radius-lg)',
        );
        this.style.setProperty(
          '--rail-inset-left',
          `${!right ? (inside ? width : p.left - group.left) : 0}px`,
        );
        this.style.setProperty(
          '--rail-inset-right',
          `${right ? (inside ? width : group.right - p.right) : 0}px`,
        );
        const surface = this.shadowRoot!.querySelector<HTMLElement>('.page-frame:not([hidden])')!;
        const topRadius = this.selected === 0 ? '0' : 'var(--tp-radius-lg)';
        const bottomRadius =
          selectedRect && selectedRect.bottom >= surface.getBoundingClientRect().bottom - 0.5
            ? '0'
            : 'var(--tp-radius-lg)';
        this.style.setProperty(
          '--rail-surface-radius',
          right
            ? `var(--tp-radius-lg) ${topRadius} ${bottomRadius} var(--tp-radius-lg)`
            : `${topRadius} var(--tp-radius-lg) var(--tp-radius-lg) ${bottomRadius}`,
        );
        const outline = this.shadowRoot!.querySelector<SVGSVGElement>('.group-outline')!;
        const surfaceRect = surface.getBoundingClientRect();
        const h = surfaceRect.height;
        const outlineWidth = width + surfaceRect.width;
        const t = (selectedRect?.top ?? group.top) - group.top;
        const b = (selectedRect?.bottom ?? group.top) - group.top;
        const outer = parseFloat(getComputedStyle(outline).strokeWidth) / 2;
        const r = Math.min(
          Math.max(0, radius - outer),
          (width - 2 * outer) / 2,
          (b - t - 2 * outer) / 2,
        );
        const edge = width;
        const top = t + outer;
        const bottom = b - outer;
        const far = outlineWidth - outer;
        const base = h - outer;
        // CSS radii describe the outer edge; the SVG stroke follows its inset centerline.
        const start =
          t < r
            ? `M ${edge} ${outer}`
            : `M ${edge + r} ${outer} A ${r} ${r} 0 0 0 ${edge} ${outer + r} L ${edge} ${top - r} A ${r} ${r} 0 0 1 ${edge - r} ${top}`;
        const end =
          b + r >= h
            ? `L ${edge} ${base}`
            : `L ${edge - r} ${bottom} A ${r} ${r} 0 0 1 ${edge} ${bottom + r} L ${edge} ${base - r} A ${r} ${r} 0 0 0 ${edge + r} ${base}`;
        const perimeter = `L ${far - r} ${base} A ${r} ${r} 0 0 0 ${far} ${base - r} L ${far} ${outer + r} A ${r} ${r} 0 0 0 ${far - r} ${outer} Z`;
        const path = `${start} L ${outer + r} ${top} A ${r} ${r} 0 0 0 ${outer} ${top + r} L ${outer} ${bottom - r} A ${r} ${r} 0 0 0 ${outer + r} ${bottom} ${end} ${perimeter}`;
        outline.querySelector('path')!.setAttribute('d', path);
        outline
          .querySelector('path')!
          .setAttribute('transform', right ? `translate(${outlineWidth} 0) scale(-1 1)` : '');
        Object.assign(outline.style, {
          left: `${right ? surfaceRect.left - group.left : inside ? 0 : p.left - group.left - width}px`,
          top: '0',
          width: `${outlineWidth}px`,
          height: `${h}px`,
          visibility: visible ? 'visible' : 'hidden',
        });
        list.style.borderRadius = right
          ? '0 var(--tp-radius-lg) var(--tp-radius-lg) 0'
          : 'var(--tp-radius-lg) 0 0 var(--tp-radius-lg)';
        const backdrop = this.shadowRoot!.querySelector<HTMLElement>('.rail-backdrop')!;
        Object.assign(backdrop.style, {
          left: list.style.left,
          top: list.style.top,
          width: list.style.width,
          height: `${height}px`,
          borderRadius: list.style.borderRadius,
          visibility: list.style.visibility,
        });
        this.shadowRoot!.querySelectorAll<TpTooltip>('tp-tooltip').forEach((tooltip) => {
          tooltip.side = right ? 'left' : 'right';
          if (!visible) tooltip.close();
        });
        if (!visible) list.setAttribute('inert', '');
        else list.removeAttribute('inert');
      }
    }
    if (pane && list && !this.#resize) {
      this.#resize = new ResizeObserver(this.#schedule);
      ancestors.forEach((el) => this.#resize!.observe(el));
      this.#scroll = pane.shadowRoot!.querySelector<HTMLElement>('.scroll')!;
      this.#scroll.addEventListener('scroll', this.#onScroll);
      window.addEventListener('resize', this.#schedule);
      // Pane collapse and anchor changes can leave the group size unchanged.
      this.#visibility = new MutationObserver(this.#schedule);
      ancestors.forEach((el) =>
        this.#visibility!.observe(el, {
          attributes: true,
          attributeFilter: ['hidden', 'expanded', 'anchor'],
        }),
      );
    }
    if (!list) this.#frame = requestAnimationFrame(this.#position);
  };

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

  protected override render(): TemplateResult {
    return html`<tp-tabs
        .orientation=${this.orientation}
        .value=${String(this.selected)}
        .partPresentation=${{
          // Preview full-width tabs before moving this layout option into the library.
          'tabs-list': {
            styleHook:
              this.orientation === 'vertical'
                ? {
                    'max-inline-size': 'none',
                    padding: '0',
                    gap: '0',
                    background: 'transparent',
                    overflow: 'visible',
                  }
                : { 'inline-size': '100%' },
          },
          'tabs-indicator': {
            styleHook: this.orientation === 'vertical' ? { display: 'none' } : {},
          },
          'tabs-trigger': {
            styleHook:
              this.orientation === 'vertical'
                ? {
                    'inline-size': 'var(--tp-control-height-lg)',
                    'block-size': 'var(--tp-control-height-lg)',
                    padding: '0',
                    'box-sizing': 'border-box',
                  }
                : { flex: '1 1 0' },
          },
        }}
        @tp-value-change=${this.#onSelect}
      >
        ${this.labels.map(
          (label, index) => html`
            <button slot="tab" value=${String(index)} aria-label=${label}>
              ${
                this.orientation === 'vertical'
                  ? html`<tp-icon
                      .icon=${this.pageOptions[index]?.icon}
                      style=${`--tab-icon-color: ${this.pageOptions[index]?.color ?? 'var(--tp-foreground)'}`}
                    ></tp-icon>`
                  : label
              }
            </button>
            ${
              this.orientation === 'vertical'
                ? html`<tp-tooltip
                    .collisionAvoidance=${{ side: 'none', align: 'shift' }}
                    .partPresentation=${{ 'tooltip-content': { styleHook: { 'max-inline-size': 'min(16rem, var(--tp-available-width))', 'white-space': 'normal', 'overflow-wrap': 'anywhere' } } }}
                    describes="none"
                    >${this.pageOptions[index]?.hint ?? label}</tp-tooltip
                  >`
                : nothing
            }
            <div class="page-frame" slot="panel" value=${String(index)} keep-mounted>
              ${this.orientation === 'vertical' ? html`<div class="page-heading">${label}</div>` : nothing}
              <slot name=${`page-${index}`}></slot>
            </div>
          `,
        )} </tp-tabs
      >${
        this.orientation === 'vertical'
          ? html`<div class="rail-backdrop" aria-hidden="true"></div>
              <svg class="group-outline" aria-hidden="true"><path></path></svg>`
          : nothing
      }`;
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
