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

  /* A separator between rows parts sections: the gap on each side is the section gap. Its rule
     is dimmer than the library's border, so it groups rows without boxing them. */
  .search-item.separator {
    padding-block: calc(var(--tweak-section-gap) - var(--tweak-row-gap));
  }

  /* The rule spans half the row, centered. The Separator element itself is the painted line. */
  .search-item.separator > tp-separator {
    justify-self: center;
    inline-size: 50%;
    background-color: var(--tweak-separator-color);
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

  /* Stats: a condensed block of live values. The block sets its own columns, label mode
     (data-labels) and layout (data-layout) from measured widths; see src/stats/block.ts. */
  .stats-block {
    min-inline-size: 0;
  }

  .stats {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tweak-section-gap) var(--tweak-stats-column-gap);
    min-inline-size: 0;
    padding-inline: var(--tweak-stats-inset);
    font-size: var(--tweak-stats-font-size);
    line-height: var(--tweak-stats-line-height);
    color: var(--tp-foreground);
  }

  .stats:focus-visible {
    outline: none;
  }

  /* Reads the fonts and gaps the fit is computed from. */
  .stats-probe {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    visibility: hidden;
    overflow: hidden;
    inline-size: 0;
    padding-inline: var(--tweak-stats-label-gap) var(--tweak-stats-column-gap);

    /* Not laid out: read back as the guide's inset and the fade's width. */
    margin-inline: var(--tweak-stats-guide-inset) var(--tweak-stats-fade);
    pointer-events: none;
  }

  /*
   * Each group column decides its own labels, from the width the block sets on it in px: labels
   * from --tweak-stats-full, none below. A container, so the rules below compare its width (cqi)
   * with it: resizing a column needs no script.
   */
  .stats-group {
    container-type: inline-size;
    display: grid;
    align-content: start;
    min-inline-size: 0;
  }

  .stats-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--tweak-stats-title-size);
    font-weight: inherit;
    letter-spacing: var(--tp-tracking-wide);
    text-transform: uppercase;
    color: var(--tweak-stats-label-color);
  }

  .stats-list {
    display: grid;
    margin: 0;
    min-inline-size: 0;
  }

  /*
   * A titled group's guide, drawn as a folder's (see .body::before and ::after in folder.ts): a
   * line in the border color, with a one-pixel dot in the muted foreground level with each label,
   * in the middle of its row. The line joins the dots: it runs from the first to the last, no
   * further. Always shown. The stats sit --tweak-stats-guide-inset after it.
   */
  .stats-group[data-guide] > .stats-list {
    position: relative;
    padding-inline-start: var(--tweak-stats-guide-inset);
  }

  .stats-group[data-guide] > .stats-list::before {
    content: '';
    position: absolute;
    inset-block: calc(var(--tweak-stats-line-height) / 2 - 0.5px);
    inset-inline-start: 0;
    border-inline-start: var(--tp-border-width) solid var(--tweak-border-color);
    pointer-events: none;
  }

  .stats-group[data-guide] .stat::before {
    content: '';
    position: absolute;
    inset-block-start: calc(50% - 0.5px);
    inset-inline-start: calc(var(--tp-border-width) / 2 - 0.5px - var(--tweak-stats-guide-inset));
    inline-size: 1px;
    block-size: 1px;
    background: var(--tp-muted-foreground);
    pointer-events: none;
  }

  /*
   * The label slot takes the room up to the value; the value never gives any up. A label longer
   * than its slot runs into the gap before the value and fades out across it, so a label that
   * fits is never faded. Below the column's label width (--tweak-stats-shown negative) the slot,
   * with its gap, has no width, so the values move to the start of the column, and the label
   * stays in the page for screen readers. The 0.5px absorbs measuring fractions.
   */
  .stat {
    --tweak-stats-shown: calc((100cqi - var(--tweak-stats-full, 0px) + 0.5px) * 1000);

    position: relative;
    display: flex;
    align-items: center;
    min-inline-size: 0;
  }

  .stat > dt {
    flex: 1 1 0;
    min-inline-size: 0;
    max-inline-size: clamp(0px, var(--tweak-stats-shown), 100cqi);
    margin: 0;
    padding-inline-end: clamp(0px, var(--tweak-stats-shown), var(--tweak-stats-label-gap));
    overflow: hidden;
    white-space: nowrap;
    mask-image: linear-gradient(to right, #000 calc(100% - var(--tweak-stats-fade)), transparent);
  }

  .stat > dd {
    flex: none;
    margin: 0;
    white-space: nowrap;
  }

  .stat-label {
    color: var(--tweak-stats-label-color);
  }

  /* A value box is as wide as the widest value it has shown (set by the block, in ch of this
     monospaced font), and contains its layout: a new value relays out this box only. */
  .stat-value {
    box-sizing: border-box;
    display: inline-block;
    contain: strict;
    inline-size: var(--tweak-stat-width);
    block-size: var(--tweak-stats-line-height);
    vertical-align: top;
    font-family: var(--tp-font-mono);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-align: end;
    color: var(--tp-foreground);
  }

  .stats-probe > .stat-value {
    display: inline;
    contain: none;
  }

  [data-focused] > .stat-value,
  [data-focused] > dd > .stat-value {
    border-radius: var(--tp-radius-sm);
    outline: var(--tp-ring-width) var(--tp-border-style) var(--tp-ring);
    outline-offset: 1px;
  }

  .stat-separator,
  .stat-part[data-muted] {
    color: var(--tweak-stats-label-color);
  }

  /* No labels: values align to the start of the column. */
  .stats-group[data-bare] .stat-value {
    text-align: start;
  }

  /* The matrix's label column, laid out by the block: a label without room is clipped, not
     removed, so screen readers still read it. */
  .stats[data-labels='hidden'] .stats-matrix .stat-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Nothing fits even without labels: values give way, cut, and show in full on hover. */
  .stats[data-overflow] .stat > dd {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stats[data-overflow] .stat-value {
    display: inline;
    contain: none;
    inline-size: auto !important;
  }

  .stats-matrix {
    inline-size: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  .stats-matrix th,
  .stats-matrix td {
    padding: 0;
    padding-inline-start: var(--tweak-stats-column-gap);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: end;
    vertical-align: middle;
  }

  .stats-matrix th[scope='row'],
  .stats-matrix thead td {
    padding-inline: 0 var(--tweak-stats-label-gap);
    font-weight: inherit;
    text-align: start;
  }

  /* A row label longer than the column laid out for most labels fades into its value, as in groups. */
  .stats-matrix th[scope='row'] {
    text-overflow: clip;
    mask-image: linear-gradient(to right, #000 calc(100% - var(--tweak-stats-fade)), transparent);
  }

  .stats-matrix tr > :nth-child(2) {
    padding-inline-start: 0;
  }

  .stats[data-labels='hidden'] .stats-matrix th[scope='row'],
  .stats[data-labels='hidden'] .stats-matrix thead td {
    padding: 0;
  }

  /*
   * The change mark of stats and monitors: its slot is always kept, so values never shift. It
   * shows and hides at once (no transition), from one attribute: 'up' or 'down', toned
   * '-better' (green) or '-worse' (red). Every mark's ink fills its box exactly, 0.8ch wide
   * (see frame() in trend.ts): nothing overhangs, so the value box never clips it, and the gap to
   * the value is the same for each. The slot, 0.4ch + 0.8ch, is CHEVRON_CH in trend.ts. Heights
   * follow each drawing, centered 0.6ch above the baseline.
   */
  .trend {
    display: inline-block;
    inline-size: 0.8ch;
    block-size: 0.8ch;
    margin-inline-start: 0.4ch;
    vertical-align: 0.2ch;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    visibility: hidden;
  }

  /* 13.33 × 8.33 with its stroke. */
  .trend[data-icon='chevron'] {
    block-size: 0.5ch;
    vertical-align: 0.35ch;
  }

  /* 14 × 10, filled, sharp. */
  .trend[data-icon='triangle'] {
    block-size: calc(0.8ch * 10 / 14);
    vertical-align: calc(0.6ch - 0.4ch * 10 / 14);
    fill: currentcolor;
    stroke: none;
  }

  .trend[data-side='start'] {
    margin-inline: 0 0.4ch;
  }

  .trend[data-trend] {
    visibility: visible;
  }

  /* fade: true. The icon fades rather than switching, and fades out as it was (data-was). */
  .trend[data-fade] {
    visibility: visible;
    opacity: 0;
    transition: opacity 0.3s;
  }

  .trend[data-fade][data-trend] {
    opacity: 1;
  }

  /* Each mark is drawn pointing up; flipped, it points down (arrow-up-right to arrow-down-right). */
  .trend[data-trend|='down'],
  .trend:not([data-trend])[data-was|='down'] {
    transform: scaleY(-1);
  }

  /* The trend's tone, from the library's tokens: the icon's color, and a colored value's. */
  .trend[data-trend$='-better'],
  .trend:not([data-trend])[data-was$='-better'],
  .trend-value[data-trend$='-better'],
  .trend-value:not([data-trend])[data-was$='-better'] {
    --tweak-trend-tone: var(--tp-success);
  }

  .trend[data-trend$='-worse'],
  .trend:not([data-trend])[data-was$='-worse'],
  .trend-value[data-trend$='-worse'],
  .trend-value:not([data-trend])[data-was$='-worse'] {
    --tweak-trend-tone: var(--tp-destructive);
  }

  .trend[data-trend],
  .trend[data-was] {
    color: var(--tweak-trend-tone, currentcolor);
  }

  /* color: 'sustain'. The value keeps the tone while the trend shows; separators keep theirs. */
  .trend-value[data-color='sustain'][data-trend] {
    color: var(--tweak-trend-tone);
  }

  .trend-value[data-color='sustain'][data-fade] {
    transition: color 0.3s;
  }

  /*
   * color: 'flash'. The value takes the tone for --tweak-trend-flash, then its own color again
   * (with fade, it fades back). Two identical animations, a and b: switching restarts it.
   */
  .trend-value[data-flash='a'] {
    animation: trend-hold-a var(--tweak-trend-flash, 0.5s);
  }

  .trend-value[data-flash='b'] {
    animation: trend-hold-b var(--tweak-trend-flash, 0.5s);
  }

  .trend-value[data-fade][data-flash='a'] {
    animation-name: trend-fade-a;
  }

  .trend-value[data-fade][data-flash='b'] {
    animation-name: trend-fade-b;
  }

  @keyframes trend-hold-a {
    from,
    to {
      color: var(--tweak-trend-tone);
    }
  }

  @keyframes trend-hold-b {
    from,
    to {
      color: var(--tweak-trend-tone);
    }
  }

  @keyframes trend-fade-a {
    from {
      color: var(--tweak-trend-tone);
    }
  }

  @keyframes trend-fade-b {
    from {
      color: var(--tweak-trend-tone);
    }
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

    /* Every line devkit draws (the pane's edge, dividers, guides, outlines, separators): the
       library's border, dimmed so it organizes without boxing in. */
    --tweak-border-color: color-mix(in oklab, var(--tp-border) 25%, transparent);
    --tweak-separator-color: var(--tweak-border-color);

    /* Stats: condensed text, labels muted so values lead, and the chevron colors of a change
       for the better and for the worse. */
    --tweak-stats-font-size: var(--tp-text-xs);
    --tweak-stats-title-size: calc(var(--tp-text-xs) * 0.875);
    --tweak-stats-line-height: calc(var(--tp-spacing) * 5);
    --tweak-stats-inset: var(--tp-space-2-5);
    --tweak-stats-column-gap: var(--tp-space-4);
    --tweak-stats-label-gap: var(--tp-space-2);

    /* How far a label too long for its room fades out, ending at its value. */
    --tweak-stats-fade: calc(var(--tweak-stats-label-gap) * 2);
    --tweak-stats-guide-inset: var(--tp-space-2);
    --tweak-stats-label-color: var(--tp-muted-foreground);
  }
`;
