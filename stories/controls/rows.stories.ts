import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { devkitDocs } from '../docs.js';

const meta = {
  title: 'Controls/Rows',
  parameters: { docs: devkitDocs('controls/rows') },
  render: () => html``,
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The page's hero: a slider and its Reset button in one row. */
export const Default: Story = {};
