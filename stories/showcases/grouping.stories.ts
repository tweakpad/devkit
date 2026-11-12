import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { anchor, showcase } from '../runtime.js';
import { grouping, type GroupingArgs } from './grouping.js';

/** Folders and tabs nested in each other, and stacked tab groups at the pane root. */
const meta = {
  title: 'Showcases/Grouping',
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { anchor: 'top-right' },
  argTypes: { anchor },
  render: showcase(grouping),
} satisfies Meta<GroupingArgs>;
export default meta;

export const Grouping: StoryObj<GroupingArgs> = { name: 'Grouping' };
