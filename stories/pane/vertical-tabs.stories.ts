import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { devkitDocs } from '../docs.js';

const meta = {
  title: 'Pane/Vertical tabs',
  parameters: { docs: devkitDocs('pane/vertical-tabs') },
  render: () => html``,
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The page's hero: a pane in the page with three icon tabs. */
export const Default: Story = {};
