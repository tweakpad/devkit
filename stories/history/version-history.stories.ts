import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { devkitDocs } from '../docs.js';

const meta = {
  title: 'History/Version history',
  parameters: { docs: devkitDocs('history/version-history') },
  render: () => html``,
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The page's hero: a pane with memory-stored history and buttons that save and restore versions. */
export const Default: Story = {};
