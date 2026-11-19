import '@tweakpad/ui/styles.css';
import { Pane, type StatsApi, type StatsParams } from '../../src/index.js';

const host = document.getElementById('panes')!;
const widthInput = document.getElementById('width') as HTMLInputElement;
const widthValue = document.getElementById('width-value') as HTMLOutputElement;
const labelsInput = document.getElementById('labels') as HTMLSelectElement;

const MB = 1024 * 1024;

/** Values that move, so reserved room and refits show; two jump between short and long. */
const live = { calls: 277, bodies: 128, queue: 3, backlog: 12, tick: 0 };
setInterval(() => {
  live.tick++;
  live.calls = 260 + Math.round(Math.random() * 40);
  live.bodies = 100 + Math.round(Math.random() * 60);
  // Short most of the time, long now and then: the block keeps room for the longest seen.
  live.queue = live.tick % 8 === 0 ? 12_345_678 : Math.round(Math.random() * 9);
  live.backlog = live.tick % 11 === 0 ? 9_876_543_210 : 12 + Math.round(Math.random() * 20);
}, 400);

type Case = { title: string; params: Omit<StatsParams, 'labels'> };

const cases: Case[] = [
  {
    title: 'Long labels',
    params: {
      groups: [
        {
          title: 'Renderer',
          stats: [
            {
              label: 'texture memory allocated on the GPU',
              value: 12 * MB,
              format: 'bytes',
            },
            {
              label: 'draw calls issued this frame',
              value: () => live.calls,
            },
            { label: 'shader programs compiled since startup', value: 272 },
          ],
        },
        {
          title: 'Physics simulation',
          stats: [
            { label: 'rigid bodies awake in the world', value: () => live.bodies },
            { label: 'contact pairs resolved per step', value: 3412 },
          ],
        },
      ],
    },
  },
  {
    title: 'Long values',
    params: {
      groups: [
        {
          title: 'Asset',
          stats: [
            { label: 'id', value: 'f3a9c2e1-7b44-4d0e-9a51-2c8e6b1d0f77' },
            { label: 'path', value: '/assets/textures/terrain/rock_albedo_4k.ktx2' },
            { label: 'bytes', value: 9_876_543_210_123 },
          ],
        },
        {
          title: 'State',
          stats: [
            { label: 'seed', value: 123456789012345678901234567890n },
            {
              label: 'pos',
              parts: [
                { value: -1234.5678, precision: 4 },
                { value: 987.6543, precision: 4 },
                { value: -0.0012, precision: 4 },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    title: 'Both long',
    params: {
      groups: [
        {
          title: 'Streaming',
          stats: [
            {
              label: 'currently streaming texture',
              value: 'terrain/rock_albedo_4k.ktx2',
            },
            {
              label: 'total bytes requested from the network',
              value: 9_876_543_210_123,
            },
          ],
        },
        {
          title: 'Scene graph',
          stats: [
            {
              label: 'world position of the active camera',
              parts: [
                { value: -1234.5678, precision: 3 },
                { value: 987.6543, precision: 3 },
                { value: -12.5, precision: 3 },
              ],
            },
            { label: 'nodes visited during the last traversal', value: 1_832_510 },
          ],
        },
      ],
    },
  },
  {
    title: 'Mixed',
    params: {
      groups: [
        {
          title: 'Frame',
          stats: [
            { label: 'fps', value: 60 },
            { label: 'draw calls issued this frame', value: () => live.calls },
            { label: 'q', value: () => live.queue },
            { label: 'path', value: '/assets/textures/terrain/rock_albedo_4k.ktx2' },
          ],
        },
        {
          title: 'Workers',
          stats: [
            { label: 'backlog of jobs waiting for a worker', value: () => live.backlog },
            { label: 'busy', value: 3 },
            { label: 'id', value: 'f3a9c2e1-7b44-4d0e-9a51-2c8e6b1d0f77' },
          ],
        },
        { title: 'X', stats: [{ label: 'n', value: 1 }] },
      ],
    },
  },
  {
    title: 'Mixed, matrix',
    params: {
      layout: 'matrix',
      groups: ['Persistent', 'Session', 'Material cache for streamed assets'].map((title, i) => ({
        title,
        stats: [
          { label: 'hits', value: [7, 666, 30][i]! },
          { label: 'misses that went to the network', value: [0, 1556, 2][i]! },
          { label: 'bytes', value: [23.9, 5.4, 118_765.4][i]! * MB, format: 'bytes' as const },
          { label: 'q', value: () => (i === 1 ? live.queue : i) },
        ],
      })),
    },
  },
];

let panes: Pane[] = [];
let blocks: { stats: StatsApi; output: HTMLOutputElement }[] = [];

/** Builds every case for the current label mode; the width alone just resizes them. */
function build(): void {
  for (const pane of panes) pane.dispose();
  host.replaceChildren();
  const labels = labelsInput.value as 'auto' | 'show' | 'hide';
  panes = [];
  blocks = cases.map(({ title, params }) => {
    const wrap = document.createElement('div');
    wrap.className = 'case';
    const container = document.createElement('div');
    const output = document.createElement('output');
    wrap.append(container, output);
    host.append(wrap);
    const pane = new Pane({ container, title });
    panes.push(pane);
    const stats = pane.addStats({ ...params, labels } as StatsParams);
    return { stats, output };
  });
  resize();
}

function resize(): void {
  widthValue.value = `${widthInput.value}px`;
  for (const pane of panes)
    pane.element.style.setProperty('--tweak-pane-width', `${widthInput.value}px`);
}

/** Each block's layout now, under its pane. */
function report(): void {
  for (const { stats, output } of blocks) {
    const layout = stats.layout;
    output.value = layout
      ? `${layout.layout} · ${layout.columns} column${layout.columns === 1 ? '' : 's'} · labels ${layout.labels}${layout.overflow ? ' · overflow: values cut' : ''}`
      : '…';
  }
  requestAnimationFrame(report);
}

widthInput.addEventListener('input', resize);
labelsInput.addEventListener('change', build);
build();
report();
