import type { TpButton } from '@tweakpad/ui';
import { Pane } from '../src/index.js';

/** Exercises button cases through the public declarative configuration API. */
export async function checkButtonApi(): Promise<string[]> {
  const pane = new Pane({ title: 'Button API checks', refresh: 'manual' });
  const checks: string[] = [];
  const events: string[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };
  try {
    const folder = pane.addFolder({ title: 'Actions' });
    const single = folder.addButton({
      title: 'Reset',
      name: 'reset-state',
      onClick: () => {
        events.push('reset');
      },
    });
    const pair = folder.addButtons({
      name: 'playback',
      label: 'Transport',
      buttons: [
        {
          title: 'Start',
          onClick: () => {
            events.push('start');
          },
        },
        {
          title: 'Stop',
          disabled: true,
          onClick: () => {
            events.push('stop');
          },
        },
      ],
    });
    await pane.element.updateComplete;
    await folder.element.updateComplete;
    const singleButton = single.element.querySelector<TpButton>('tp-button')!;
    const pairButtons = [...pair.element.querySelectorAll<TpButton>('tp-button')];
    await Promise.all([singleButton, ...pairButtons].map((button) => button.updateComplete));
    singleButton.click();
    pairButtons[0]!.click();
    pairButtons[1]!.click();
    check(
      events.join(',') === 'reset,start',
      'single and inline actions activate; disabled action does not',
    );
    check(
      singleButton.type === 'button' && pairButtons.every((button) => button.type === 'button'),
      'actions never submit forms',
    );
    const first = pairButtons[0]!.getBoundingClientRect();
    const second = pairButtons[1]!.getBoundingClientRect();
    check(
      first.width > 0 &&
        Math.abs(first.width - second.width) < 1 &&
        Math.abs(first.top - second.top) < 1,
      'API lays out equal-width inline actions',
    );
    check(
      pane.filter('stop') === 1 && !pair.element.hidden && single.element.hidden,
      'either action title keeps exactly one complete composed row',
    );
    check(
      pairButtons.every((button) => button.getClientRects().length > 0),
      'matching composition retains both buttons',
    );
    singleButton.click();
    check(events.length === 2, 'filtered single action does not activate');
    check(
      pane.filter('reset-state') === 1 && pair.element.hidden,
      'stable action name participates in search',
    );
    check(
      pairButtons.every((button) => button.getClientRects().length === 0),
      'nonmatching inline composition leaves no visible parts',
    );
    check(pane.filter('transport') === 1, 'inline row label participates in search');
    pane.filter('');
    pair.disabled = true;
    pairButtons[0]!.click();
    check(events.length === 2, 'row-level disabling blocks every action');
    pair.disabled = false;
    check(
      !pairButtons[0]!.disabled && pairButtons[1]!.disabled,
      'row re-enable preserves individually disabled actions',
    );
    pair.buttons[1]!.disabled = false;
    pairButtons[1]!.click();
    check(events.at(-1) === 'stop', 'individual actions can be enabled through the API');
    single.disabled = true;
    singleButton.click();
    check(events.length === 3, 'single-button disabled handle blocks activation');
    single.disabled = false;
    single.title = 'Restart';
    pair.buttons[0]!.title = 'Play';
    check(
      pane.filter('restart') === 1 && single.title === 'Restart',
      'single-button title updates its search identity',
    );
    check(
      pane.filter('play') === 1 && pair.buttons[0]!.title === 'Play',
      'inline action title updates composed search identity',
    );
    pair.hidden = true;
    check(
      pane.filter('play') === 0 && folder.element.hidden,
      'hidden composed actions cannot keep parents visible',
    );
    pane.filter('');
    check(pair.hidden && pair.element.hidden, 'clear preserves authored button-row hiding');
    pair.hidden = false;
    pair.dispose();
    pairButtons[0]!.click();
    check(
      events.length === 3 && pane.filter('playback') === 0,
      'disposing a composition releases callbacks and search eligibility',
    );
    single.dispose();
    singleButton.click();
    check(
      events.length === 3 && pane.filter('restart') === 0,
      'disposing a single button releases callbacks and search eligibility',
    );
    return checks;
  } finally {
    pane.dispose();
  }
}
