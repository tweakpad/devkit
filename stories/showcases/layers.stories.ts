import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { anchor, showcase } from '../runtime.js';
import { layers, type LayersArgs } from './layers.js';

/** A sky painted from a stack of layers, each with its own panel. */
const meta = {
  title: 'Showcases/Layers',
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { anchor: 'top-right', rule: 'any type', reorder: 'item' },
  argTypes: {
    anchor,
    rule: { control: 'inline-radio', options: ['any type', 'one type'] },
    reorder: { control: 'inline-radio', options: ['item', 'handle'] },
  },
  render: showcase(layers),
} satisfies Meta<LayersArgs>;
export default meta;

export const Layers: StoryObj<LayersArgs> = { name: 'Layers' };
