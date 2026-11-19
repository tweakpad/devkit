import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { devkitDocs } from '../docs.js';

const meta = {
  title: 'Monitoring/Stats',
  parameters: { docs: devkitDocs('monitoring/stats') },
  render: () => html``,
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The page's hero: GPU memory and frame counters, side by side. */
export const Default: Story = {};
