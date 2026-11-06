import { BindingApi, Pane, Scheduler } from '../src/index.js';

/** Monitoring is a binding view; no separate factory, item type, API or sampler. */
export async function checkMonitorBindings(): Promise<string[]> {
  const scheduler = new Scheduler();
  const pane = new Pane({ title: 'Monitor binding checks', refresh: 'manual', scheduler });
  const checks: string[] = [];
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  try {
    let reads = 0;
    const state = { amount: 60 };
    const source = {
      get amount() {
        reads++;
        return state.amount;
      },
      set amount(value: number) {
        state.amount = value;
      },
    };
    const text = pane.addBinding(source, 'amount', {
      label: 'Amount text',
      view: 'monitor',
      interval: 0,
      precision: 1,
    });
    const graph = pane.addBinding(source, 'amount', {
      label: 'Amount history',
      view: 'monitor',
      monitor: { view: 'graph', bufferSize: 8 },
      interval: 0,
      min: 0,
      max: 100,
    });
    const mixed = pane.addRow({
      name: 'composed-history',
      items: [
        {
          type: 'binding',
          target: source,
          key: 'amount',
          label: 'Inline history',
          view: 'monitor',
          monitor: { view: 'graph' },
          interval: 0,
        },
        {
          type: 'button',
          title: 'Set amount',
          width: 'auto',
          onClick: () => {
            state.amount = 40;
          },
        },
      ],
    });
    await pane.element.updateComplete;
    for (let i = 0; i < 60 && !mixed.element.querySelector('canvas'); i++) await frame();
    await frame();
    await frame();
    check(!('addMonitor' in pane), 'there is no separate monitor creation API');
    check(
      text instanceof BindingApi &&
        graph instanceof BindingApi &&
        mixed.items[0] instanceof BindingApi,
      'all monitor declarations return normal binding handles',
    );
    check(
      text.kind === 'monitor' && graph.kind === 'monitor',
      'monitor is a regular control view kind',
    );
    check(
      text.element.querySelector('.value')?.textContent === '60.0',
      'text monitor uses the binding value and precision',
    );
    check(scheduler.activeCount === 3, 'only the three normal bindings own sampling');
    const canvas = graph.element.querySelector('canvas')!;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    check(
      pixels.some((channel, index) => index % 4 === 3 && channel > 0),
      'unchanged values still produce a sampled history line',
    );
    const finished: number[] = [];
    text.on('finish', (event) => finished.push(event.value));
    text.value = 25;
    await frame();
    check(
      state.amount === 25 && text.value === 25 && finished.at(-1) === 25,
      'monitor handles preserve normal programmatic value writes and finish events',
    );
    check(
      !text.element.querySelector('input') && !graph.element.querySelector('input'),
      'passive display views expose no user editor',
    );
    check(
      pane.filter('inline history') === 1 && !mixed.element.hidden,
      'monitor metadata participates in composed row search',
    );
    check(
      text.element.hidden === true && graph.element.hidden === true,
      'unmatched monitor controls hide through normal row ownership',
    );
    pane.filter('missing');
    await frame();
    await frame();
    const stoppedReads = reads;
    await frame();
    await frame();
    check(
      reads === stoppedReads && scheduler.activeCount === 0,
      'hidden monitor controls use the same sampling suspension as other bindings',
    );
    pane.filter('');
    state.amount = 77;
    for (let i = 0; i < 6; i++) await frame();
    check(
      text.element.querySelector('.value')?.textContent === '77.0',
      'revealed monitors resume normal binding refresh',
    );
    const beforeRefresh = reads;
    graph.refresh();
    check(reads > beforeRefresh, 'monitor refresh uses the regular binding handle');
    text.dispose();
    graph.dispose();
    mixed.dispose();
    await frame();
    check(
      scheduler.activeCount === 0 && pane.filter('amount') === 0,
      'normal binding and row disposal release monitor sampling and search ownership',
    );
    return checks;
  } finally {
    pane.dispose();
  }
}
