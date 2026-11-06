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

  .row[hidden] {
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
    grid-template-rows: auto 1fr;
    grid-template-columns: minmax(0, 1fr);
    justify-content: stretch;
    align-items: stretch;
    gap: 0;
    padding-block: var(--tp-space-1);
  }

  .monitor.graph .head {
    display: flex;
    justify-content: space-between;
    gap: var(--tp-space-2);
  }

  .monitor canvas {
    display: block;
    inline-size: 100%;
    block-size: calc(var(--tp-control-height-md) * 1.5);
    color: var(--tp-primary);
  }
`;

/** Spacing knobs every container inherits from the pane. */
export const paneTokens = css`
  :host {
    --tweak-row-gap: var(--tp-space-1);
    --tweak-section-gap: var(--tp-space-2);
  }
`;
