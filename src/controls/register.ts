import {
  defineElement,
  TpButton,
  TpCheckbox,
  TpColorInput,
  TpDragDropList,
  TpIcon,
  TpMenu,
  TpMenuItem,
  TpToggle,
  TpInput,
  TpKbd,
  TpSelect,
  TpSlider,
  TpSwitch,
  TpTabs,
  TpTooltip,
} from '@tweakpad/ui';
import { TpPlot } from '@tweakpad/ui/widgets';
import { TweakFolder } from '../elements/folder.js';
import { TweakPane } from '../elements/pane.js';
import { TweakTabPage, TweakTabs } from '../elements/tabs.js';
import { TweakLayerRow, TweakLayers, TweakLayerStates } from '../elements/layers.js';

let registered = false;

/**
 * Defines the library controls, tabs and keyboard hint devkit uses (and what they render),
 * plus the pane's own elements. Nothing else from the library is registered.
 */
export function registerElements(): void {
  if (registered) return;
  registered = true;
  for (const control of [
    TpSlider,
    TpInput,
    TpSelect,
    TpCheckbox,
    TpSwitch,
    TpColorInput,
    TpKbd,
    TpButton,
    TpTabs,
    TpIcon,
    TpTooltip,
    TpPlot,
    TpDragDropList,
    TpMenu,
    TpMenuItem,
    TpToggle,
  ])
    defineElement((control as unknown as { tagName: string }).tagName, control);
  for (const element of [
    TweakPane,
    TweakFolder,
    TweakTabs,
    TweakTabPage,
    TweakLayers,
    TweakLayerRow,
    TweakLayerStates,
  ])
    if (!customElements.get(element.tagName)) customElements.define(element.tagName, element);
}
