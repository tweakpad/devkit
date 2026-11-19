import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { anchor, showcase } from '../runtime.js';
import { stats, type StatsArgs } from './stats.js';

/** A renderer's debug overview in stats blocks, at any pane width. */
const meta = {
  title: 'Showcases/Stats',
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { anchor: 'top-right', width: 480, icon: 'arrow', color: 'off', fade: false },
  argTypes: {
    anchor,
    width: { control: { type: 'range', min: 160, max: 720, step: 10 } },
    icon: {
      description: 'The mark beside a changing value',
      control: 'inline-radio',
      options: ['arrow', 'arrow-diagonal', 'chevron', 'triangle', 'none'],
    },
    color: {
      description: 'How changing values are colored',
      control: 'inline-radio',
      options: ['off', 'sustain', 'flash'],
    },
    fade: { description: 'Fades icons and colors in and out', control: 'boolean' },
  },
  render: showcase(stats),
} satisfies Meta<StatsArgs>;
export default meta;

export const Stats: StoryObj<StatsArgs> = { name: 'Stats' };
