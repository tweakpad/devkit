import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { devkitDocs } from '../docs.js';

const meta = {
  title: 'Controls/Buttons',
  parameters: { docs: devkitDocs('controls/buttons') },
  render: () => html``,
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The page's hero: a pane in the page with two bindings and a reset button. */
export const Default: Story = {};
