import {
  defineElement,
  TpCheckbox,
  TpColorInput,
  TpInput,
  TpSelect,
  TpSlider,
  TpSwitch,
} from '@tweakpad/ui';
import { TweakFolder } from '../elements/folder.js';
import { TweakPane } from '../elements/pane.js';
import { TweakTabPage, TweakTabs } from '../elements/tabs.js';

let registered = false;

/**
 * Defines the six library inline controls devkit uses (and what they render) plus the pane's
 * own elements. Nothing else from the library is registered.
 */
export function registerElements(): void {
  if (registered) return;
  registered = true;
  for (const control of [TpSlider, TpInput, TpSelect, TpCheckbox, TpSwitch, TpColorInput])
    defineElement((control as unknown as { tagName: string }).tagName, control);
  for (const element of [TweakPane, TweakFolder, TweakTabs, TweakTabPage])
    if (!customElements.get(element.tagName)) customElements.define(element.tagName, element);
}
