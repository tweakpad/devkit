import {
  defineElement,
  TpButton,
  TpCheckbox,
  TpColorInput,
  TpIcon,
  TpMenu,
  TpMenuItem,
  TpInput,
  TpKbd,
  TpSelect,
  TpSeparator,
  TpSlider,
  TpSwitch,
  TpTabs,
  TpTooltip,
} from '@tweakpad/ui';
import { TpLayers, TpPlot } from '@tweakpad/ui/widgets';
import { TweakFolder } from '../elements/folder.js';
import { TweakPane } from '../elements/pane.js';
import { TweakTabPage, TweakTabs } from '../elements/tabs.js';
import { TweakLayers } from '../elements/layers.js';

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
    TpLayers,
    TpMenu,
    TpMenuItem,
    TpSeparator,
  ])
    defineElement((control as unknown as { tagName: string }).tagName, control);
  for (const element of [TweakPane, TweakFolder, TweakTabs, TweakTabPage, TweakLayers])
    if (!customElements.get(element.tagName)) customElements.define(element.tagName, element);
}
