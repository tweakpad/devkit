import { Pane, type StatsApi } from '../src/index.js';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Lets the block measure, observe its width and fit (a job, a resize callback, a write). */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await frame();
}

function root(stats: StatsApi): HTMLElement {
  return stats.element.querySelector<HTMLElement>('.stats')!;
}

/**
 * Whether the CSS shows each group column's labels as the block's layout says: a hidden column's
 * label slots have no width, a shown column's do, and a column never mixes the two.
 */
function cssAgrees(stats: StatsApi): boolean {
  const labels = stats.layout?.labels ?? [];
  const sections = [...stats.element.querySelectorAll<HTMLElement>('.stats-group')];
  return sections.every((section, i) => {
    const widths = [...section.querySelectorAll<HTMLElement>('.stat > dt')].map(
      (dt) => dt.getBoundingClientRect().width,
    );
    return labels[i] === 'hidden' ? widths.every((w) => w < 0.5) : widths.every((w) => w > 0.5);
  });
}

function chevrons(stats: StatsApi): SVGElement[] {
  return [...stats.element.querySelectorAll<SVGElement>('.trend')];
}

/** Stats: grouped live values that fit their width, labels giving way before columns. */
export async function checkStats(): Promise<string[]> {
  const checks: string[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;opacity:0.01';
  document.body.append(host);
  const pane = new Pane({ container: host, title: 'Stats checks' });
  const width = (px: number) => pane.element.style.setProperty('--tweak-pane-width', `${px}px`);
  try {
    width(600);
    const memory = { textures: 1019 * 1024 * 1024, count: 97 };
    const frameStats = { calls: 277, triangles: 1_832_510 };
    const stats = pane.addStats({
      title: 'Renderer',
      interval: 'frame',
      groups: [
        {
          title: 'GPU memory',
          id: 'gpu',
          stats: [
            {
              label: 'textures',
              parts: [
                { value: () => memory.textures, format: 'bytes' },
                { value: () => memory.count, muted: true },
              ],
            },
            { label: 'targets', value: 60 },
          ],
        },
        {
          title: 'Frame',
          stats: [
            { label: 'draw calls', id: 'calls', value: () => frameStats.calls },
            { label: 'triangles', value: () => frameStats.triangles },
          ],
        },
      ],
    });
    check(stats.layout === null, 'a block has no layout before it is first shown');
    await settle();

    // Values: formatted, several parts joined by the separator.
    check(stats.stat('gpu/textures')!.text === '1019 MB / 97', 'parts join with the separator');
    check(stats.stat('triangles')!.text === '1,832,510', 'integers print grouped');
    check(stats.stat('calls')!.label === 'draw calls', 'a stat is found by its id');
    check(
      JSON.stringify(stats.stat('textures')!.value) === JSON.stringify([memory.textures, 97]),
      'value holds one raw value per part',
    );

    // Fit: the layout that shows the most labels whose values fit; of equals, the most columns.
    // Each column decides its labels in CSS, as the layout says.
    check(
      stats.layout?.columns === 2 && stats.layout.labels.every((mode) => mode === 'shown'),
      'a wide pane shows the groups side by side with labels',
    );
    check(cssAgrees(stats), "each column's CSS shows its labels as the layout says");
    check(!root(stats).hasAttribute('tabindex'), 'with labels shown the block is no tab stop');
    width(230);
    await settle();
    check(
      stats.layout?.columns === 1 &&
        stats.layout.labels.every((mode) => mode === 'shown') &&
        cssAgrees(stats),
      'narrower, the groups stack when that keeps their labels',
    );
    width(130);
    await settle();
    check(
      stats.layout?.columns === 1 && stats.layout.labels.every((mode) => mode === 'hidden'),
      'narrower still, the stacked column hides its labels, every group of it',
    );
    check(cssAgrees(stats), 'and the CSS hides them');
    const firstList = stats.element.querySelector<HTMLElement>('.stats-list')!;
    const listStart =
      firstList.getBoundingClientRect().left +
      parseFloat(getComputedStyle(firstList).paddingInlineStart);
    check(
      Math.abs(
        stats.element.querySelector('.stat-value')!.getBoundingClientRect().left - listStart,
      ) < 0.5,
      'with its labels hidden, a column moves its values to its start',
    );
    const term = stats.element.querySelector('dt')!;
    check(
      term.querySelector('.stat-label')!.textContent === 'textures' &&
        getComputedStyle(term).display !== 'none',
      'a hidden label stays in the page for screen readers',
    );
    check(term.getBoundingClientRect().width < 0.5, 'a hidden label takes no room');
    width(170);
    await settle();
    check(
      stats.layout?.columns === 1 &&
        stats.layout.labels.every((mode) => mode === 'shown') &&
        cssAgrees(stats),
      'stacked groups show their labels again when they fit',
    );

    // Each column keeps room for the widest value it has shown.
    width(600);
    await settle();
    const before = root(stats).style.gridTemplateColumns;
    frameStats.triangles = 1;
    await settle();
    check(stats.stat('triangles')!.text === '1', 'a value updates every frame with interval frame');
    check(
      root(stats).style.gridTemplateColumns === before,
      'a narrower value keeps its column, so the layout does not jitter',
    );
    frameStats.triangles = 123_456_789_012;
    await settle();
    check(
      root(stats).style.gridTemplateColumns !== before,
      'a value wider than its room refits the block',
    );

    // With its label shown, a stat has no tooltip.
    const shownCell = stats.element.querySelector<HTMLElement>('[data-stat]')!;
    shownCell.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }),
    );
    await wait(400);
    check(
      !(stats.element.querySelector('tp-tooltip') as (HTMLElement & { open: boolean }) | null)
        ?.open,
      'a stat whose label shows has no tooltip',
    );
    root(stats).dispatchEvent(new PointerEvent('pointerleave'));

    // Hidden labels show on hover, with the group: two columns, labels hidden.
    const bare = pane.addStats({
      labels: 'hide',
      interval: 'frame',
      groups: [
        {
          title: 'GPU memory',
          stats: [
            {
              label: 'textures',
              parts: [
                { value: () => memory.textures, format: 'bytes' },
                { value: () => memory.count, muted: true },
              ],
            },
            { label: 'targets', value: 60 },
          ],
        },
        {
          title: 'Frame',
          stats: [
            { label: 'draw calls', value: () => frameStats.calls },
            { label: 'triangles', value: () => frameStats.triangles },
          ],
        },
      ],
    });
    await settle();
    check(
      bare.layout?.columns === 2 && bare.layout.labels.every((mode) => mode === 'hidden'),
      "with labels: 'hide' the groups keep their columns, labels hidden",
    );
    check(
      [...bare.element.querySelectorAll('.stats-group')].every((group) => {
        const start = group.querySelector('.stats-list')!.getBoundingClientRect().left;
        const guide =
          parseFloat(getComputedStyle(group.querySelector('.stats-list')!).paddingInlineStart) || 0;
        return [...group.querySelectorAll('.stat-value')].every(
          (value) =>
            Math.abs(value.firstElementChild!.getBoundingClientRect().left - start - guide) < 1,
        );
      }),
      'without labels, every value starts at the start of its column',
    );
    const cell = bare.element.querySelector<HTMLElement>('[data-stat]')!;
    cell.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    await wait(400);
    const tooltip = bare.element.querySelector('tp-tooltip') as
      (HTMLElement & { open: boolean }) | null;
    const lines = [...(tooltip?.querySelectorAll('.stats-tip > div') ?? [])].map(
      (d) => d.textContent,
    );
    check(tooltip?.open === true, 'hovering a value without its label opens a tooltip');
    check(
      lines.length === 1 && lines[0] === 'GPU memory · textures',
      'the tooltip names the stat with its group, and shows no value',
    );
    root(bare).dispatchEvent(new PointerEvent('pointerleave'));
    check(!tooltip!.open, 'leaving the block closes the tooltip');

    // Keyboard: one tab stop while labels hide; arrows move by column and row.
    check(root(bare).tabIndex === 0, 'with labels hidden the block is one tab stop');
    root(bare).focus();
    const key = (name: string) =>
      root(bare).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    const focused = () => bare.element.querySelector('[data-focused] .stat-value')?.textContent;
    check(
      focused() === '1019 MB / 97' && tooltip!.open,
      'focus lands on the first value, with its tooltip',
    );
    key('ArrowDown');
    check(focused() === '60', 'ArrowDown moves down the group');
    key('ArrowRight');
    check(focused() === '123,456,789,012', 'ArrowRight moves to the next group at the same row');
    key('ArrowUp');
    check(focused() === '277', 'ArrowUp moves up');
    root(bare).blur();
    check(
      !tooltip!.open && !bare.element.querySelector('[data-focused]'),
      'blur clears focus and tooltip',
    );
    bare.dispose();

    // Search: the block is one item, found by its title, groups and labels.
    const search = pane as unknown as { filter(query: string): number };
    search.filter('triangles');
    check(!stats.element.hidden, 'a search for a stat label finds the block');
    search.filter('gpu memory');
    check(!stats.element.hidden, 'a search for a group title finds the block');
    search.filter('nothing like it');
    check(stats.element.hidden === true, 'a search for anything else hides the block');
    search.filter('');

    // Changing the block.
    width(600);
    await settle();
    stats.group('Frame')!.hidden = true;
    await settle();
    check(
      stats.element.querySelectorAll('.stats-group').length === 1 && stats.layout?.columns === 1,
      'a hidden group leaves the layout',
    );
    stats.group('Frame')!.hidden = false;
    const added = stats.group('gpu')!.addStat({ label: 'geometry', value: 21 }, 1);
    await settle();
    check(
      [...stats.element.querySelectorAll('dt .stat-label')].map((dt) => dt.textContent).join() ===
        'textures,geometry,targets,draw calls,triangles',
      'addStat inserts a stat at its index',
    );
    added.hidden = true;
    check(!stats.element.textContent!.includes('geometry'), 'a hidden stat leaves the block');
    added.dispose();
    check(stats.groups[0]!.stats.length === 2, 'dispose removes a stat');
    const extra = stats.addGroup({ title: 'Extra', stats: [{ label: 'x', value: 1 }] });
    check(stats.groups.length === 3, 'addGroup adds a group');
    extra.dispose();
    check(stats.groups.length === 2, 'a group disposes');
    stats.stat('targets')!.label = 'render targets';
    search.filter('render targets');
    check(!stats.element.hidden, 'a renamed label is searchable');
    search.filter('');

    // Guides: a titled group's stats hang from a line, as a folder's controls do.
    const guided = (block: StatsApi) =>
      [...block.element.querySelectorAll<HTMLElement>('.stats-group')].map((group) =>
        group.hasAttribute('data-guide'),
      );
    const list = stats.element.querySelector<HTMLElement>(
      '.stats-group[data-guide] > .stats-list',
    )!;
    const line = getComputedStyle(list, '::before');
    const listLeft = list.getBoundingClientRect().left;
    const dotsLevel = [...list.querySelectorAll<HTMLElement>('.stat')].every((row) => {
      const dot = getComputedStyle(row, '::before');
      const box = row.getBoundingClientRect();
      const label = document.createRange();
      label.selectNodeContents(row.querySelector('.stat-label')!);
      const text = label.getBoundingClientRect();
      return (
        dot.inlineSize === '1px' &&
        Math.abs(box.top + parseFloat(dot.top) + 0.5 - (text.top + text.bottom) / 2) < 0.75 &&
        Math.abs(box.left + parseFloat(dot.left) - listLeft) < 0.75
      );
    });
    check(
      guided(stats).every(Boolean) &&
        line.borderInlineStartStyle === 'solid' &&
        parseFloat(getComputedStyle(list).paddingInlineStart) > 0,
      "a titled group's stats hang from a guide line, as a folder's",
    );
    check(dotsLevel, 'the guide has a dot on its line level with each label');
    const rowsOf = [...list.querySelectorAll<HTMLElement>('.stat')];
    const firstDot =
      rowsOf[0]!.getBoundingClientRect().top +
      parseFloat(getComputedStyle(rowsOf[0]!, '::before').top);
    const lastRow = rowsOf.at(-1)!;
    const lastDot =
      lastRow.getBoundingClientRect().top + parseFloat(getComputedStyle(lastRow, '::before').top);
    const listBox = list.getBoundingClientRect();
    check(
      Math.abs(listBox.top + parseFloat(line.top) - firstDot) < 0.5 &&
        Math.abs(listBox.bottom - parseFloat(line.bottom) - (lastDot + 1)) < 0.5,
      'the guide line joins the dots, from the first to the last and no further',
    );
    const plainList = pane.addStats({ stats: [{ label: 'loose', value: 1 }] });
    const unguided = pane.addStats({
      guides: false,
      groups: [{ title: 'Group', stats: [{ label: 'item', value: 1 }] }],
    });
    await settle();
    check(
      !guided(plainList).some(Boolean) && !guided(unguided).some(Boolean),
      'stats outside a titled group, or with guides: false, have no guide',
    );
    plainList.dispose();
    unguided.dispose();

    // Long labels: one among short ones fades; most of a column long, the column hides them; and a
    // short column beside a long one keeps its labels.
    width(200);
    const columns = pane.addStats({
      interval: 'manual',
      // Two columns, so each decides its own labels (stacked, they would share them).
      columns: 2,
      groups: [
        {
          title: 'Mostly short',
          stats: [
            { label: 'fps', value: 60 },
            { label: 'calls', value: 277 },
            { label: 'tris', value: 1832 },
            { label: 'progs', value: 272 },
            { label: 'textures streamed in from the network', value: 12 },
          ],
        },
        {
          title: 'Mostly long',
          stats: [
            { label: 'rigid bodies awake in the world', value: 128 },
            { label: 'contact pairs resolved per step', value: 3412 },
            { label: 'constraints solved this frame', value: 96 },
            { label: 'ids', value: 4 },
          ],
        },
      ],
    });
    await settle();
    check(
      columns.layout?.labels[0] === 'shown' &&
        columns.layout.labels[1] === 'hidden' &&
        cssAgrees(columns),
      'a column of short labels keeps them beside a column whose long labels hide',
    );
    const outlier = [...columns.element.querySelectorAll<HTMLElement>('.stat > dt')][4]!;
    check(
      outlier.scrollWidth > outlier.clientWidth && outlier.clientWidth > 0,
      'one long label among short ones fades into its value instead of hiding the column',
    );
    outlier.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    await wait(400);
    const fadedTip = columns.element.querySelector('tp-tooltip') as
      (HTMLElement & { open: boolean; textContent: string }) | null;
    check(
      fadedTip?.open === true && fadedTip.textContent.includes('textures streamed in'),
      'a faded label shows in full on hover',
    );
    columns.element.querySelector('.stats')!.dispatchEvent(new PointerEvent('pointerleave'));
    columns.dispose();

    // Change chevrons: each set() is one sample.
    const trend = pane.addStats({
      interval: 'manual',
      stats: [
        { label: 'better up', value: 10, trend: 'ticker' },
        { label: 'better down', value: 10, trend: { better: 'lower' } },
        { label: 'direction', value: 10, trend: 'ticker' },
        { label: 'coarse', value: 0, trend: { better: 'higher', threshold: 10 } },
        { label: 'share', value: 100, trend: { threshold: '10%' } },
        { label: 'steady', value: 60, trend: { better: 'higher', samples: 2 } },
        { label: 'plain', value: 1.001 },
      ],
    });
    await settle();
    const marks = chevrons(trend);
    check(marks.length === 6, 'only stats with trend get a chevron');
    check(
      marks.every((mark) => !mark.dataset.trend),
      'no chevron shows before the first change',
    );
    trend.stat('better up')!.set(12);
    trend.stat('better down')!.set(12);
    trend.stat('direction')!.set(8);
    await frame();
    check(marks[0]!.dataset.trend === 'up-better', "trend 'higher': a rise is better");
    check(marks[1]!.dataset.trend === 'up-worse', "trend 'lower': a rise is worse");
    check(marks[2]!.dataset.trend === 'down-worse', "trend true: a fall is red, as with 'higher'");
    const style = getComputedStyle(marks[0]!);
    check(
      style.visibility === 'visible' && style.transitionDuration === '0s',
      'a turned chevron shows at once, with no transition',
    );
    check(
      getComputedStyle(marks[0]!).color !== getComputedStyle(marks[1]!).color,
      'better and worse chevrons differ in color',
    );
    trend.stat('better up')!.set(12);
    await frame();
    check(
      !marks[0]!.dataset.trend && getComputedStyle(marks[0]!).visibility === 'hidden',
      'a sample without a change hides the chevron at once',
    );
    trend.stat('better up')!.set(11);
    await frame();
    check(marks[0]!.dataset.trend === 'down-worse', 'the next change turns it');
    trend.stat('coarse')!.set(5);
    await frame();
    check(
      trend.stat('coarse')!.text === '5' && !marks[3]!.dataset.trend,
      'a change within the threshold updates the text, not the chevron',
    );
    trend.stat('coarse')!.set(16);
    await frame();
    check(marks[3]!.dataset.trend === 'up-better', 'a change beyond the threshold shows it');
    trend.stat('share')!.set(105);
    await frame();
    const quietShare = !marks[4]!.dataset.trend;
    trend.stat('share')!.set(120);
    await frame();
    check(
      quietShare && marks[4]!.dataset.trend === 'up-better',
      'a percentage threshold is a share of the earlier value',
    );
    // Steady, two a side: 60 60 | 60 60, then noise, then a clear rise.
    const steady = trend.stat('steady')!;
    for (const value of [60, 60]) steady.set(value);
    await frame();
    check(!marks[5]!.dataset.trend, 'a steady trend shows nothing until both averages are full');
    steady.set(60);
    for (const value of [61, 59]) steady.set(value);
    await frame();
    check(
      steady.text === '59' && !marks[5]!.dataset.trend,
      'noise turns no steady chevron, and the value shows at once',
    );
    for (const value of [70, 70]) steady.set(value);
    await frame();
    check(
      marks[5]!.dataset.trend === 'up-better',
      'a rise that stands out from the noise turns a steady chevron',
    );
    trend.stat('better up')!.resetTrend();
    await frame();
    check(!marks[0]!.dataset.trend, 'resetTrend clears the chevron');

    const sides = pane.addStats({
      interval: 'manual',
      stats: [
        { label: 'after', value: 1, trend: 'ticker' },
        { label: 'before', value: 1, trend: { side: 'start' } },
        { label: 'plain', value: 1 },
      ],
    });
    await settle();
    const [endMark, startMark] = chevrons(sides);
    check(
      endMark!.previousSibling?.nodeType === Node.TEXT_NODE &&
        startMark!.nextSibling?.nodeType === Node.TEXT_NODE &&
        endMark!.getBoundingClientRect().left > startMark!.getBoundingClientRect().left,
      "the chevron follows its value by default, and leads it with side: 'start'",
    );
    const textEnd = (node: Node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect().right;
    };
    const plainText = [...sides.element.querySelectorAll('.stat-part')].at(-1)!.lastChild!;
    check(
      Math.abs(textEnd(endMark!.previousSibling!) - textEnd(plainText)) < 0.5 &&
        Math.abs(textEnd(startMark!.nextSibling!) - textEnd(plainText)) < 0.5,
      'values without an end chevron keep its slot, so a group lines up at the end',
    );
    check(
      endMark!.dataset.icon === 'arrow' && endMark!.querySelectorAll('path').length === 2,
      'the trend mark is an arrow by default',
    );
    const icons = pane.addStats({
      interval: 'manual',
      stats: (['arrow', 'arrow-diagonal', 'chevron', 'triangle'] as const).map((icon) => ({
        label: icon,
        value: 1_234_567,
        trend: { icon },
      })),
    });
    await settle();
    check(
      chevrons(icons).every((mark) => {
        const box = mark.closest('.stat-value')!.getBoundingClientRect();
        const own = mark.getBoundingClientRect();
        return own.left >= box.left - 0.01 && own.right <= box.right + 0.01;
      }),
      'every trend icon lies inside its value box, which would clip it',
    );
    icons.dispose();

    // How a trend shows: the icon, the value's color, or both.
    const modes = pane.addStats({
      interval: 'manual',
      stats: [
        { label: 'icon', value: 10, trend: 'ticker' },
        { label: 'color', value: 10, trend: { icon: false, color: true } },
        { label: 'both', value: 10, trend: { color: true } },
      ],
    });
    await settle();
    for (const label of ['icon', 'color', 'both']) modes.stat(label)!.set(12);
    await frame();
    const part = (label: string) =>
      modes.element.querySelectorAll<HTMLElement>('.stat-part')[
        ['icon', 'color', 'both'].indexOf(label)
      ]!;
    const green = getComputedStyle(part('icon').querySelector('.trend')!).color;
    const plainColor = getComputedStyle(part('icon')).color;
    check(
      !part('color').querySelector('.trend') &&
        part('color').dataset.trend === 'up-better' &&
        getComputedStyle(part('color')).color === green,
      'color without an icon: the value alone turns green, and no icon is drawn',
    );
    check(
      part('both').querySelector<SVGElement>('.trend')?.dataset.trend === 'up-better' &&
        getComputedStyle(part('both')).color === green &&
        plainColor !== green,
      'both: the icon shows and the value is colored; by default only the icon is',
    );
    modes.stat('color')!.set(12);
    await frame();
    check(
      !part('color').dataset.trend && getComputedStyle(part('color')).color === plainColor,
      'a colored value returns to its own color when the trend clears',
    );
    modes.dispose();

    // Flash: the value takes the tone on each change, then its own color again.
    const flashes = pane.addStats({
      interval: 'manual',
      stats: [
        { label: 'flash', value: 10, trend: { icon: false, color: 'flash' } },
        { label: 'faded', value: 10, trend: { fade: true } },
      ],
    });
    await settle();
    const flashPart = flashes.element.querySelector<HTMLElement>('.stat-part')!;
    const ownColor = getComputedStyle(flashPart).color;
    flashes.stat('flash')!.set(12);
    await frame();
    const first = flashPart.dataset.flash;
    check(
      Boolean(first) && getComputedStyle(flashPart).color === green,
      'a flash colors the value at once',
    );
    await wait(700);
    check(
      getComputedStyle(flashPart).color === ownColor,
      'and gives it back its own color once the flash ends',
    );
    flashes.stat('flash')!.set(14);
    await frame();
    check(
      flashPart.dataset.flash !== first && getComputedStyle(flashPart).color === green,
      'each change of the value flashes again',
    );
    const faded = chevrons(flashes)[0]!;
    flashes.stat('faded')!.set(8);
    await frame();
    flashes.stat('faded')!.set(8);
    await frame();
    check(
      !faded.dataset.trend &&
        faded.dataset.was === 'down-worse' &&
        getComputedStyle(faded).transitionDuration === '0.3s',
      'with fade, a cleared icon fades out as it was',
    );
    flashes.dispose();
    sides.dispose();

    // Writes: nothing when the shown text is unchanged.
    const plain = { value: 1.001 };
    const quiet = pane.addStats({
      interval: 'frame',
      stats: [{ label: 'quiet', value: () => plain.value, trend: 'ticker' }],
    });
    await settle();
    let mutations = 0;
    const observer = new MutationObserver((records) => (mutations += records.length));
    observer.observe(root(quiet), {
      subtree: true,
      characterData: true,
      attributes: true,
      childList: true,
    });
    plain.value = 1.002;
    await settle();
    observer.disconnect();
    check(
      mutations === 0 && !chevrons(quiet)[0]!.dataset.trend,
      'a change below the display precision writes nothing and turns no chevron',
    );

    // Sleeping: a closed folder's stats are not read.
    let reads = 0;
    const folder = pane.addFolder({ title: 'Closed', expanded: false });
    folder.addStats({ interval: 'frame', stats: [{ label: 'read', value: () => ++reads }] });
    await settle();
    check(reads === 0, 'stats in a closed folder are not read');
    folder.expanded = true;
    await settle();
    await settle();
    check(reads > 0, 'they are read once the folder opens');

    // Matrix: labels once, a column per group, empty cells where a group lacks a stat.
    const caches = {
      a: { hits: 7, misses: 0 },
      b: { hits: 666, misses: 1556, bytes: 123_456_789 },
    };
    const matrix = pane.addStats({
      layout: 'matrix',
      groups: [
        {
          title: 'Persistent',
          stats: [
            { label: 'hits', value: () => caches.a.hits },
            { label: 'misses', value: () => caches.a.misses },
          ],
        },
        {
          title: 'Session',
          stats: [
            { label: 'hits', value: () => caches.b.hits },
            { label: 'misses', value: () => caches.b.misses },
            { label: 'bytes', value: () => caches.b.bytes },
          ],
        },
      ],
    });
    await settle();
    const rows = [...matrix.element.querySelectorAll('tbody tr')];
    check(
      matrix.layout?.layout === 'matrix' &&
        rows.map((row) => row.querySelector('th')!.textContent).join() === 'hits,misses,bytes',
      'a matrix writes each label once, as a row',
    );
    check(!matrix.element.querySelector('[data-guide]'), 'a matrix has no guide lines');
    check(
      [...matrix.element.querySelectorAll('thead th')].map((th) => th.textContent).join() ===
        'Persistent,Session',
      'the groups head the columns',
    );
    check(
      rows[2]!.querySelectorAll('td')[0]!.textContent === '' &&
        rows[2]!.querySelectorAll('td')[1]!.textContent === '123,456,789',
      'a group without a stat leaves its cell empty',
    );
    const cells = [...rows[0]!.querySelectorAll('td')].map((td) => td.getBoundingClientRect());
    const below = [...rows[1]!.querySelectorAll('td')].map((td) => td.getBoundingClientRect());
    check(
      cells.every((rect, i) => Math.abs(rect.right - below[i]!.right) < 0.5),
      'matrix columns line up across rows',
    );
    // Row labels and values need about 133 px, values alone about 91.
    width(140);
    await settle();
    check(matrix.layout?.labels[0] === 'hidden', 'a narrow matrix hides its row labels first');
    width(90);
    await settle();
    check(
      matrix.layout?.layout === 'groups',
      'a matrix too narrow for its values falls back to groups',
    );

    // A long row label: with room it shows in full; short of room it fades, the others shown.
    width(600);
    const rowLabels = pane.addStats({
      interval: 'manual',
      layout: 'matrix',
      groups: ['A', 'B'].map((title) => ({
        title,
        stats: [
          { label: 'hits', value: 7 },
          { label: 'misses that went to the network', value: 1556 },
          { label: 'bytes', value: 24 },
          { label: 'q', value: 2 },
        ],
      })),
    });
    await settle();
    const longRow = () =>
      [...rowLabels.element.querySelectorAll<HTMLElement>('th[scope="row"]')].find((th) =>
        th.textContent!.startsWith('misses'),
      )!;
    check(
      rowLabels.layout?.labels[0] === 'shown' && longRow().scrollWidth <= longRow().clientWidth,
      'with room to spare, a long row label shows in full',
    );
    width(200);
    await settle();
    check(
      rowLabels.layout?.labels[0] === 'shown' && longRow().scrollWidth > longRow().clientWidth,
      'short of room, the long row label fades while the others still show',
    );
    rowLabels.dispose();
    // Back to the width the matrix fallback above left, which the next checks build on.
    width(90);

    // Overflow: labels kept with 'show' and no room, values cut, and one warning.
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      const tight = pane.addStats({
        title: 'Tight',
        labels: 'show',
        stats: [{ label: 'a very long label indeed', value: 123_456_789 }],
      });
      await settle();
      check(tight.layout?.overflow === true, "labels: 'show' without room overflows");
      check(cssAgrees(tight), 'an overflowing block hides every label in CSS too');
      check(warnings.length === 1 && warnings[0]!.includes('"Tight"'), 'an overflow warns once');
      tight.dispose();
    } finally {
      console.warn = warn;
    }

    // Hidden and disposed blocks.
    stats.hidden = true;
    check(stats.element.hidden === true, 'hidden hides the block');
    const element = stats.element;
    stats.dispose();
    check(!element.isConnected, 'dispose removes the block');
  } finally {
    pane.dispose();
    host.remove();
  }
  return checks;
}
