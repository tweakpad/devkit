import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { anchor, showcase } from '../runtime.js';
import { graphs, type GraphsArgs } from './graphs.js';

/** Generic graphs, the performance monitor and a renderer adapter. */
const meta = {
  title: 'Showcases/Graphs',
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { anchor: 'top-right' },
  argTypes: { anchor },
  render: showcase(graphs),
} satisfies Meta<GraphsArgs>;
export default meta;

export const Graphs: StoryObj<GraphsArgs> = { name: 'Graphs' };
