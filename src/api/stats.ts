import type { PaneContext } from './context.js';
import { SearchableRow } from './rows.js';
import type { SearchMetadata } from '../core/search.js';
import { StatsBlock, type Group, type Stat } from '../stats/block.js';
import type { StatValue } from '../stats/format.js';
import type { StatParams, StatsGroupParams, StatsParams } from '../stats/types.js';

/** Default milliseconds between reads: a glance needs a few a second, not one a frame. */
const DEFAULT_INTERVAL = 250;

function intervalOf(interval: StatsParams['interval'], paneInterval: number): number {
  if (interval === 'frame') return 0;
  if (interval === 'manual') return -1;
  if (typeof interval === 'number') return Math.max(0, interval);
  return paneInterval < 0 ? -1 : DEFAULT_INTERVAL;
}

/** A block of stats in a container: one search item, sampled only while visible. */
export class StatsRow extends SearchableRow {
  readonly metadata: SearchMetadata;

  constructor(
    readonly block: StatsBlock,
    name: string,
  ) {
    super(block.element);
    this.element.classList.add('stats-item');
    const groups = block.groups;
    this.metadata = {
      name,
      get label() {
        return name;
      },
      get terms() {
        const terms: string[] = [];
        for (const group of groups) {
          if (group.title) terms.push(group.title);
          for (const stat of group.stats) terms.push(stat.labelText);
        }
        return terms;
      },
    };
  }

  protected override syncVisibility(visible: boolean): void {
    this.block.setVisible(visible);
  }

  override dispose(): void {
    this.block.dispose();
    super.dispose();
  }
}

export function createStats(context: PaneContext, params: StatsParams): StatsRow {
  const groups: StatsGroupParams[] = params.groups ?? [{ stats: params.stats ?? [] }];
  const columns = params.columns;
  const range =
    typeof columns === 'number'
      ? { min: columns, max: columns }
      : { min: columns?.min ?? 1, max: columns?.max };
  const name = params.title ?? params.id ?? '';
  const block = new StatsBlock(groups, {
    scheduler: context.scheduler,
    interval: intervalOf(params.interval, context.interval),
    layout: params.layout ?? 'groups',
    min: range.min,
    max: range.max,
    labels: params.labels ?? 'auto',
    guides: params.guides ?? true,
    name,
  });
  const row = new StatsRow(block, name || 'stats');
  if (params.hidden) row.setHidden(true);
  return row;
}

/** What the handles of one block share: the block, search refresh and one handle per stat. */
interface StatsOwner {
  readonly block: StatsBlock;
  /** Labels or titles changed: search terms changed too. */
  changed(): void;
  statApi(stat: Stat): StatApi;
}

/** The handle of one stat, from `StatsApi.stat()` or `StatsGroupApi.stats`. */
export class StatApi {
  private readonly block: StatsBlock;

  constructor(
    private readonly stat: Stat,
    private readonly owner: StatsOwner,
  ) {
    this.block = owner.block;
  }

  /** The stat's name in paths: its `id`, else its label. */
  get id(): string {
    return this.stat.key;
  }

  /** The label beside the value. */
  get label(): string {
    return this.stat.labelText;
  }
  set label(label: string) {
    this.stat.setLabel(label);
    this.block.structureChanged(true);
    this.owner.changed();
  }

  /** Whether the stat is hidden; the others close up. */
  get hidden(): boolean {
    return this.stat.hidden;
  }
  set hidden(hidden: boolean) {
    if (hidden === this.stat.hidden) return;
    this.stat.hidden = hidden;
    this.block.structureChanged(false);
  }

  /** The last value read or set; an array, one per part, for a stat with `parts`. */
  get value(): StatValue | StatValue[] {
    const values = this.stat.parts.map((part) => part.raw);
    return this.stat.parts.length === 1 ? values[0] : values;
  }

  /** The value as shown, with its separators. */
  get text(): string {
    return this.stat.text;
  }

  /**
   * Shows a value now: one value, or one per part for a stat with `parts`. A part read from a
   * function shows its own value again at the next read.
   */
  set(value: StatValue | readonly StatValue[]): void {
    this.block.set(
      this.stat,
      Array.isArray(value) && this.stat.parts.length > 1 ? value : [value as StatValue],
    );
  }

  /** Reads the block's values now, whatever its interval. */
  refresh(): void {
    this.block.refresh();
  }

  /** Clears the change chevrons; the next change is measured from the current value. */
  resetTrend(): void {
    this.block.resetTrend(this.stat);
  }

  /** Removes the stat. */
  dispose(): void {
    this.block.removeStat(this.stat);
    this.owner.changed();
  }
}

/** The handle of one group, from `StatsApi.groups` or `group()`. */
export class StatsGroupApi {
  private readonly block: StatsBlock;

  constructor(
    private readonly group: Group,
    private readonly owner: StatsOwner,
  ) {
    this.block = owner.block;
  }

  /** The group's name in paths: its `id`, else its title. */
  get id(): string {
    return this.group.key;
  }

  /** The heading above the group. */
  get title(): string {
    return this.group.title;
  }
  set title(title: string) {
    this.group.title = title;
    // Its width counts in the fit: measured again.
    this.block.structureChanged(true);
    this.owner.changed();
  }

  /** Whether the group is hidden; the others close up. */
  get hidden(): boolean {
    return this.group.hidden;
  }
  set hidden(hidden: boolean) {
    if (hidden === this.group.hidden) return;
    this.group.hidden = hidden;
    this.block.structureChanged(false);
  }

  /** The group's stats, top first. */
  get stats(): readonly StatApi[] {
    return this.group.stats.map((stat) => this.owner.statApi(stat));
  }

  /** Adds a stat, at the end or at `index`. */
  addStat(params: StatParams, index?: number): StatApi {
    const stat = this.block.addStat(this.group, params, index);
    this.owner.changed();
    return this.owner.statApi(stat);
  }

  /** Removes the group. */
  dispose(): void {
    this.block.removeGroup(this.group);
    this.owner.changed();
  }
}

/** The handle `addStats` returns. */
export class StatsApi {
  readonly #groups = new WeakMap<Group, StatsGroupApi>();
  readonly #stats = new WeakMap<Stat, StatApi>();
  readonly #owner: StatsOwner;

  constructor(
    private readonly row: StatsRow,
    private readonly context: PaneContext,
  ) {
    this.#owner = {
      block: row.block,
      changed: () => this.context.refreshSearch?.(),
      statApi: (stat) => {
        let api = this.#stats.get(stat);
        if (!api) this.#stats.set(stat, (api = new StatApi(stat, this.#owner)));
        return api;
      },
    };
  }

  /** The block's name in search. */
  get title(): string {
    return this.row.metadata.name;
  }

  /** The stable visibility shell containing the block. */
  get element(): HTMLElement {
    return this.row.element;
  }

  /** Whether the block is hidden. A hidden block is not read. */
  get hidden(): boolean {
    return this.row.hidden;
  }
  set hidden(hidden: boolean) {
    this.row.setHidden(hidden);
    this.context.refreshSearch?.();
  }

  /** Milliseconds between reads; 0 reads every frame, -1 only on `refresh()`. */
  get interval(): number {
    return this.row.block.interval;
  }
  set interval(interval: number) {
    this.row.block.interval = interval < 0 ? -1 : interval;
  }

  /**
   * How the block is laid out at its current width: `'groups'` or `'matrix'`, the group columns,
   * whether values are cut, and whether labels show (`'shown'`) or not (`'hidden'`): one entry per
   * group in the groups layout (each column decides its own), or one for the matrix's label
   * column. Null until the block is first shown.
   */
  get layout(): {
    readonly layout: 'groups' | 'matrix';
    readonly columns: number;
    readonly labels: readonly ('shown' | 'hidden')[];
    readonly overflow: boolean;
  } | null {
    const fit = this.row.block.fit;
    return fit
      ? { layout: fit.layout, columns: fit.columns, labels: fit.labels, overflow: fit.overflow }
      : null;
  }

  /** The groups, in order. */
  get groups(): readonly StatsGroupApi[] {
    return this.row.block.groups.map((group) => this.#api(group));
  }

  /** The group with this `id` (or title). */
  group(id: string): StatsGroupApi | undefined {
    const group = this.row.block.groups.find((each) => each.key === id);
    return group && this.#api(group);
  }

  /** The stat at `'group/stat'`, or the first with this `id` (or label) in any group. */
  stat(path: string): StatApi | undefined {
    const stat = this.row.block.find(path);
    return stat && this.#owner.statApi(stat);
  }

  /** Adds a group, at the end or at `index`. */
  addGroup(params: StatsGroupParams, index?: number): StatsGroupApi {
    const group = this.row.block.addGroup(params, index);
    this.context.refreshSearch?.();
    return this.#api(group);
  }

  /** Reads every value now, whatever the interval. */
  refresh(): void {
    this.row.block.refresh();
  }

  /** Removes the block. */
  dispose(): void {
    this.row.dispose();
    this.context.refreshSearch?.();
  }

  #api(group: Group): StatsGroupApi {
    let api = this.#groups.get(group);
    if (!api) this.#groups.set(group, (api = new StatsGroupApi(group, this.#owner)));
    return api;
  }
}
