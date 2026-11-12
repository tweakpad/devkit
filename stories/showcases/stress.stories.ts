import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { anchor, showcase } from '../runtime.js';
import { stress, type StressArgs } from './stress.js';

/** 1000 bindings while the application changes 30 values every frame, with a meter pane. */
const meta = {
  title: 'Showcases/Stress',
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { anchor: 'top-right' },
  argTypes: { anchor },
  render: showcase(stress),
} satisfies Meta<StressArgs>;
export default meta;

export const Stress: StoryObj<StressArgs> = { name: 'Stress' };
