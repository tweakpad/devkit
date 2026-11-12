import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { devkitDocs } from '../docs.js';

const meta = {
  title: 'Monitoring/Monitors',
  parameters: { docs: devkitDocs('monitoring/monitors') },
  render: () => html``,
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The page's hero: a graph monitor and a text monitor of live frame stats. */
export const Default: Story = {};
