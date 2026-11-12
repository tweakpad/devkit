import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { devkitDocs } from '../docs.js';

const meta = {
  title: 'Monitoring/Performance monitor',
  parameters: { docs: devkitDocs('monitoring/performance') },
  render: () => html``,
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The page's hero: the default performance monitor in a pane in the page. */
export const Default: Story = {};
