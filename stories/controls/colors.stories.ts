import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { devkitDocs } from '../docs.js';

const meta = {
  title: 'Controls/Colors',
  parameters: { docs: devkitDocs('controls/colors') },
  render: () => html``,
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The page's hero: a pane in the page with two color string bindings. */
export const Default: Story = {};
