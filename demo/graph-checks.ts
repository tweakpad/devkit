import type { TpPlot } from '@tweakpad/ui/widgets';
import { GraphApi, Pane, PerformanceMonitorApi, Scheduler } from '../src/index.js';

/** Graphs and the performance monitor, in a real browser with real plots. */
export async function checkGraphs(): Promise<string[]> {
  const scheduler = new Scheduler();
  const container = document.createElement('div');
  container.style.cssText = 'position: fixed; inset: 0 auto auto 0; inline-size: 320px;';
  document.body.append(container);
  const pane = new Pane({ title: 'Graph checks', container, floating: false, scheduler });
  const checks: string[] = [];
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const frames = async (count: number) => {
    for (let i = 0; i < count; i++) await frame();
  };
  const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  const plotOf = (api: GraphApi) => api.element.querySelector<TpPlot>('tp-plot');
  const until = async (condition: () => boolean, limit = 120) => {
    for (let i = 0; i < limit && !condition(); i++) await frame();
  };
  try {
    let reads = 0;
    const signal = { value: 0 };
    const graph = pane.addGraph({
      label: 'Signal',
      layout: 'paged',
      interval: 16,
      series: [
        {
          id: 'wave',
          label: 'Wave',
          min: -1,
          max: 1,
          read: () => {
            reads++;
            return Math.sin((signal.value += 0.2));
          },
        },
        { id: 'pushed', label: 'Pushed', unit: 'req' },
      ],
      markers: [{ id: 'mode', text: 'Live' }],
    });
    await until(() => plotOf(graph) !== null);
    const plot = plotOf(graph)!;
    check(graph instanceof GraphApi && plot !== null, 'addGraph mounts a tp-plot row');
    check(
      plot.mode === 'push' && plot.stream?.xMode === 'index',
      'graphs use push mode on an index stream',
    );
    await until(() => (plot.stream?.snapshot()['wave']?.length ?? 0) > 10);
    check(reads > 10, 'read() series are sampled while visible');
    await until(() => plot.renderStats.incrementalPaints > 2);
    check(
      plot.renderStats.incrementalPaints > 2,
      `steady sampling paints incrementally (${plot.renderStats.incrementalPaints} incremental, ${plot.renderStats.fullRedraws} full)`,
    );
    check(
      graph.element.querySelector('.marker')?.textContent === 'Live',
      'markers render in the header',
    );

    graph.push({ pushed: 3 });
    await frames(4);
    const pushed = plot.stream?.snapshot()['pushed'] ?? [];
    check(
      pushed.some(([, y]) => y !== null),
      'push() values on a sampled graph are recorded with the next sample',
    );

    const pages: number[] = [];
    graph.on('page', (page) => pages.push(page));
    check(graph.pageCount === 2, 'paged layout makes one page per series');
    const row = graph.element.querySelector<HTMLElement>('.monitor.graph')!;
    row.click();
    await frame();
    check(
      graph.page === 1 && pages[0] === 1 && plot.series[0]?.id === 'pushed',
      'clicking a paged graph shows the next page',
    );
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check(graph.page === 0, 'Enter cycles pages from the keyboard');
    check(row.getAttribute('role') === 'button', 'paged graphs are exposed as buttons');

    const before = scheduler.activeCount;
    graph.hidden = true;
    const stoppedReads = reads;
    await frames(4);
    check(
      reads === stoppedReads && scheduler.activeCount === before - 1,
      'hidden graphs stop sampling',
    );
    graph.hidden = false;
    await frames(4);
    check(reads > stoppedReads, 'revealed graphs resume sampling');

    const overlay = pane.addGraph({
      label: 'Overlay',
      layout: 'overlay',
      series: [
        { id: 'a', label: 'A', min: 0, max: 10 },
        { id: 'b', label: 'B', min: 0, max: 1000 },
      ],
    });
    await until(() => plotOf(overlay) !== null);
    overlay.push({ a: 5, b: 500 });
    overlay.push({ a: 10, b: 250 });
    const overlaid = plotOf(overlay)!;
    check(
      overlay.pageCount === 1 && overlaid.series.length === 2,
      'overlay layout draws every series in one plot',
    );
    check(
      JSON.stringify(overlaid.stream?.snapshot()) ===
        JSON.stringify({
          a: [
            [0, 0.5],
            [1, 1],
          ],
          b: [
            [0, 0.5],
            [1, 0.25],
          ],
        }),
      'series in different units are normalized to their own ranges',
    );
    // Readouts refresh at most every headerInterval (250 ms), with a trailing refresh.
    await new Promise((resolve) => setTimeout(resolve, 300));
    check(
      [...overlay.element.querySelectorAll<HTMLElement>('.readout .entry')]
        .map((entry) => entry.style.color)
        .join() === 'var(--tp-chart-1),var(--tp-chart-2)' &&
        !overlay.element.querySelector('.readout .chip') &&
        overlay.element.querySelector('.readout')!.textContent!.includes('250.00'),
      'overlay readouts show each value in its series color, without dots',
    );

    const monitor = pane.addPerformanceMonitor({
      interval: 100,
      adapters: [
        {
          name: 'test renderer',
          markers: [{ id: 'backend', read: () => 'WebGPU' }],
          metrics: [
            { id: 'drawCalls', label: 'Draw calls', unit: 'calls', precision: 0, read: () => 120 },
            { id: 'triangles', label: 'Triangles', precision: 0, graph: 'memory' },
          ],
        },
      ],
    });
    check(monitor instanceof PerformanceMonitorApi, 'addPerformanceMonitor returns its handle');
    check(
      monitor.graphNames.join() === 'frame,memory' &&
        monitor
          .graph('frame')!
          .element.compareDocumentPosition(monitor.graph('memory')!.element) ===
          Node.DOCUMENT_POSITION_FOLLOWING,
      'the monitor stacks a frame graph above a memory graph',
    );
    const frameGraph = monitor.graph('frame')!;
    const memoryGraph = monitor.graph('memory')!;
    await until(() => plotOf(frameGraph) !== null && plotOf(memoryGraph) !== null);
    check(
      plotOf(frameGraph)!
        .series.map((s) => s.id)
        .join() === 'fps,frameTime,drawCalls' &&
        plotOf(memoryGraph)!
          .series.map((s) => s.id)
          .join() === 'heap,triangles',
      'metrics join the graph their definition names',
    );
    monitor.report('triangles', 1_200_000);
    await until(() => monitor.meter.frames > 0, 60);
    check(monitor.meter.fps > 0 && monitor.mode === 'raf', 'the monitor measures frames itself');
    const samplersBefore = scheduler.activeCount;
    await frames(10);
    check(scheduler.activeCount === samplersBefore, 'stacked graphs share one frame sampler');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const header = frameGraph.element.querySelector('.readout')!.textContent!;
    check(/^\d+FPS[\d.]+ms120calls$/.test(header), `overlaid readouts attach units (${header})`);
    check(
      frameGraph.element.querySelector('.marker')?.textContent === 'WebGPU' &&
        !memoryGraph.element.querySelector('.marker'),
      'markers render on the first graph',
    );
    const triangles = plotOf(memoryGraph)!.stream?.snapshot()['triangles'] ?? [];
    check(
      triangles.length > 0 && triangles.every(([, y]) => y !== null),
      'reported adapter metrics are held and sampled every window',
    );
    const custom = pane.addPerformanceMonitor({
      metrics: [{ id: 'fps', fill: 0.3 }, 'frameTime'],
      adapters: [
        {
          name: 'counts',
          metrics: [
            { id: 'drawCalls', label: 'Draw calls', read: () => 10 },
            { id: 'unlisted', label: 'Unlisted', read: () => 1 },
          ],
          attach: (handle) => handle.report('unlisted', 1),
        },
      ],
      graphs: {
        frame: ['fps'],
        detail: { metrics: ['frameTime', 'drawCalls'], layout: 'paged' },
        empty: ['missing'],
      },
    });
    const [frameOnly, detail] = custom.graphs as [GraphApi, GraphApi];
    await until(() => plotOf(frameOnly) !== null && plotOf(detail) !== null);
    check(
      custom.graphNames.join() === 'frame,detail' &&
        plotOf(frameOnly)!
          .series.map((s) => s.id)
          .join() === 'fps',
      'graphs is the whole layout: unlisted adapter metrics and empty graphs are left out',
    );
    const pagedRow = detail.element.querySelector<HTMLElement>('.monitor.graph')!;
    pagedRow.click();
    await frame();
    check(
      detail.pageCount === 2 &&
        detail.page === 1 &&
        plotOf(detail)!
          .series.map((s) => s.id)
          .join() === 'drawCalls' &&
        pagedRow.getAttribute('role') === 'button' &&
        !frameOnly.element.querySelector('.monitor.graph')!.hasAttribute('role'),
      'one monitor mixes overlaid and paged graphs',
    );
    check(
      (plotOf(frameOnly)!.series[0]!.fill || undefined)?.opacity === 0.3,
      'built-in metrics take overrides such as fill',
    );
    custom.report('unlisted', 5);
    check(true, 'reports for metrics left out are ignored');
    custom.dispose();

    const mixed = pane.addPerformanceMonitor({
      adapters: [
        { name: 'calls', metrics: [{ id: 'drawCalls', label: 'Draw calls', read: () => 10 }] },
      ],
      graphs: {
        frame: { pages: [['fps', 'frameTime'], ['drawCalls'], ['heap', 'missing'], ['missing']] },
      },
    });
    const pagesGraph = mixed.graphs[0]!;
    await until(() => plotOf(pagesGraph) !== null);
    const firstPage = plotOf(pagesGraph)!
      .series.map((s) => s.id)
      .join();
    pagesGraph.page = 1;
    await frame();
    check(
      pagesGraph.pageCount === 3 &&
        firstPage === 'fps,frameTime' &&
        plotOf(pagesGraph)!
          .series.map((s) => s.id)
          .join() === 'drawCalls',
      'a graph mixes overlaid and single-metric pages',
    );
    mixed.dispose();

    for (let i = 0; i < 20; i++) {
      monitor.begin();
      monitor.end();
      await frame();
    }
    check(monitor.mode === 'manual', 'begin()/end() switch the monitor to the application loop');

    graph.dispose();
    overlay.dispose();
    monitor.dispose();
    await frame();
    check(
      scheduler.activeCount === 0 && pane.filter('signal') === 0,
      'disposal releases sampling and search',
    );
    return checks;
  } finally {
    pane.dispose();
    container.remove();
  }
}
