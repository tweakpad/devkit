import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { devkitDocs } from '../docs.js';

const meta = {
  title: 'Monitoring/Graphs',
  parameters: { docs: devkitDocs('monitoring/graphs') },
  render: () => html``,
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The page's hero: a sampled sine wave in a pane in the page. */
export const Default: Story = {};
