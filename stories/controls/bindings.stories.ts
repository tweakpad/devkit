import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { devkitDocs } from '../docs.js';

const meta = {
  title: 'Controls/Bindings',
  parameters: { docs: devkitDocs('controls/bindings') },
  render: () => html``,
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The page's hero: a pane in the page with a slider, a checkbox, a color and a select. */
export const Default: Story = {};
