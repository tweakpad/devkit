import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import { devkitDocs } from '../docs.js';

const meta = {
  title: 'Pane/Layers',
  parameters: { docs: devkitDocs('pane/layers') },
  render: () => html``,
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** The page's hero: a stack of three layers, two with panels. */
export const Default: Story = {};
