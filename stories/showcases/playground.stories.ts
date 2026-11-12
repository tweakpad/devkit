import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { anchor, showcase } from '../runtime.js';
import { playground, type PlaygroundArgs } from './playground.js';

/** An orbit study on a canvas, tuned from tabs, folders, rows, colors and the performance monitor. */
const meta = {
  title: 'Showcases/Playground',
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { anchor: 'top-right' },
  argTypes: { anchor },
  render: showcase(playground),
} satisfies Meta<PlaygroundArgs>;
export default meta;

export const Playground: StoryObj<PlaygroundArgs> = { name: 'Playground' };
