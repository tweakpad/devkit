import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { anchor, showcase } from '../runtime.js';
import { verticalTabs, type VerticalTabsArgs } from './vertical-tabs.js';

/** Stacked vertical tab groups with horizontal tabs inside, in a pane short enough to scroll. */
const meta = {
  title: 'Showcases/Vertical tabs',
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { anchor: 'top-right', side: 'auto' },
  argTypes: {
    anchor,
    side: {
      description: 'The edge of each group the icon column takes; auto faces the page',
      control: 'inline-radio',
      options: ['auto', 'left', 'right'],
    },
  },
  render: showcase(verticalTabs),
} satisfies Meta<VerticalTabsArgs>;
export default meta;

export const VerticalTabs: StoryObj<VerticalTabsArgs> = { name: 'Vertical tabs' };
