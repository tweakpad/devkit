import { css } from 'lit';

/**
 * Rows, chunks and monitors, shared by every container's shadow root (pane, folder, tab page).
 * Containers own their rows' shadow root so the library elements inside stay scoped to it.
 */
export const containerStyles = css`
  :host {
    display: block;
  }

  .body {
    display: grid;
    gap: var(--tweak-row-gap);
    min-inline-size: 0;
  }

  /* Root tab groups and shared controls use one consistent sibling spacing. */
  .body:has(> tweak-tabs[orientation='vertical']) {
    row-gap: var(--tweak-section-gap);
  }

  /* Rows are grouped in chunks: one intersection target each, and skipped by rendering while
     off screen. An intrinsic size keeps the scroll height right while a chunk is skipped. */
  .chunk {
    display: grid;
    gap: var(--tweak-row-gap);
    content-visibility: auto;

    /* The chunk sets its own contain-intrinsic-block-size from its row count. */
  }

  .row {
    display: grid;
    min-inline-size: 0;
    min-block-size: var(--tp-control-height-md);
    contain: layout style;
  }

  /* Only devkit owns this outer boundary. Component layout stays on the surface inside it. */
  .search-item {
    display: grid;
    min-inline-size: 0;
  }

  .search-item[hidden] {
    display: none !important;
  }

  .inline-row {
    display: flex;
    align-items: center;
    gap: var(--tweak-row-gap);
    min-inline-size: 0;
  }

  .search-item > tp-button {
    inline-size: 100%;
    min-inline-size: 0;
  }

  .row[hidden] {
    display: none;
  }

  .chunk[hidden] {
    display: none;
  }

  /* The row before its library control mounts: the inline control surface, label only. */
  .row.placeholder,
  .monitor {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--tp-space-2);
    padding-inline: var(--tp-space-2-5);
    border: var(--tp-border-width) var(--tp-border-style) var(--tp-input);
    border-radius: var(--tp-radius-lg);
    background: var(--tp-control);
    font-size: var(--tp-text-sm);
    line-height: var(--tp-leading-normal);
    color: var(--tp-foreground);
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .value {
    flex: none;
    font-variant-numeric: tabular-nums;
    color: var(--tp-muted-foreground);
    white-space: nowrap;
  }

  .value,
  tp-input > input[data-tp-editor],
  tp-slider::part(slider-output),
  tp-select::part(select-value),
  tp-color-input::part(color-input-value) {
    font-family: var(--tp-font-mono);
  }

  .monitor.graph {
    display: grid;
    grid-template-rows: auto auto;
    grid-template-columns: minmax(0, 1fr);
    justify-content: stretch;
    align-items: stretch;
    gap: var(--tp-space-1);

    /* The plot spans the full width and reaches the bottom edge; only the header is inset. */
    padding: 0;
    overflow: hidden;
    background: var(--tweak-graph-surface);
  }

  .monitor.graph[role='button'] {
    cursor: pointer;
    user-select: none;
  }

  .monitor.graph[role='button']:focus-visible {
    outline: var(--tp-ring-width) var(--tp-border-style) var(--tp-ring);
    outline-offset: 1px;
  }

  .monitor.graph[data-disabled] {
    opacity: 0.5;
  }

  .monitor.graph .head {
    display: flex;
    align-items: baseline;
    gap: var(--tp-space-2);
    min-inline-size: 0;
    padding: var(--tp-space-1-5) var(--tp-space-2-5) 0;
  }

  /* Overlaid series can outgrow one line: entries wrap instead of running under the markers. */
  .monitor.graph .readout {
    display: flex;
    flex: 0 1 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0 var(--tp-space-1-5);
    min-inline-size: 0;
    color: var(--tp-foreground);
  }

  /* With a label the readout sits at the end; without one it leads the header. */
  .monitor.graph .head > .label,
  .monitor.graph .head > .readout:first-child {
    flex: 1;
    min-inline-size: 0;
  }

  .monitor.graph .head > .readout:first-child {
    justify-content: flex-start;
  }

  .readout .entry {
    white-space: nowrap;
  }

  .markers {
    display: flex;
    gap: var(--tp-space-2);
    color: var(--tp-muted-foreground);
    font-family: var(--tp-font-mono);
    white-space: nowrap;
  }

  .marker[hidden],
  .markers:not(:has(> .marker:not([hidden]))) {
    display: none;
  }

  .pages {
    display: flex;
    align-self: center;
    gap: 3px;
  }

  .pages:empty {
    display: none;
  }

  .pages .dot {
    inline-size: 4px;
    block-size: 4px;
    border-radius: 9999px;
    background: var(--tp-muted-foreground);
    opacity: 0.4;
  }

  .pages .dot[data-active] {
    opacity: 1;
  }

  .monitor.graph tp-plot,
  .monitor.graph .plot-placeholder {
    display: block;
    block-size: var(--tweak-graph-height);
    min-inline-size: 0;
  }
`;

/** Spacing knobs every container inherits from the pane. */
export const paneTokens = css`
  :host {
    --tweak-row-gap: var(--tp-space-1);
    --tweak-section-gap: var(--tp-space-2);
    --tweak-graph-height: calc(var(--tp-control-height-md) * 1.5);

    /* One surface for a graph row and its plot. */
    --tweak-graph-surface: var(--tp-muted);
  }
`;
