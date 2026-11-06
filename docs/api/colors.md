# Color picker configuration

Color bindings support the browser's native picker and Tweakpad's Color picker popup.
The choice is declarative and works with `addBinding` and binding items in `addRow`, on
panes, folders and tab pages.

## Pane default and binding overrides

```ts
const pane = new Pane({ title: 'Appearance', colorPicker: 'tweakpad' });

// Inherits the pane's Tweakpad picker.
pane.addBinding(params, 'tint', { color: { type: 'float' } });

// Overrides the pane default for this control.
pane.addBinding(params, 'background', {
  color: { picker: 'native', format: 'hex' },
});

pane.addRow({
  items: [
    { type: 'binding', target: params, key: 'accent', color: { picker: 'tweakpad' } },
    { type: 'button', title: 'Reset', width: 'auto', onClick: () => { params.accent = '#38bdf8'; } },
  ],
});
```

`PaneOptions.colorPicker` is `'native' | 'tweakpad'`, defaulting to `'native'`. Each binding's
`color.picker` overrides it. The choice is fixed when the binding is created. Bindings without
these options retain the native behavior.

## Color options

| `color` property | Type | Behavior |
| --- | --- | --- |
| `picker` | `'native' \| 'tweakpad'` | Per-binding override of the pane default. |
| `type` | `'int' \| 'float'` | `{r,g,b}` channel scale: `0–255` integers (default) or `0–1` floats. |
| `format` | `'hex' \| 'rgb' \| 'hsl' \| 'oklch'` | CSS string serialization and editable value notation. Default `'hex'`. |
| `alpha` | `boolean` | Keep transparency for CSS string bindings. Default `false`. |

For `{r,g,b}` objects, both picker paths use opaque hex internally and preserve the original
object reference when writing channels. `type` controls the scale. `format` and `alpha` apply
to CSS string bindings; this existing object shape has no alpha channel.

## Picker behavior

Both choices retain the standard inline label, editable color text and swatch. Native mode
uses `tp-color-input` with its browser color input. Tweakpad mode composes `tp-color-picker`
in popup mode with that inline input in its supported trigger slot, with the native picker
disabled. The library owns trigger interaction and value synchronization; the application
needs no extra event wiring, custom styling or DOM construction. The custom picker respects
the binding's fixed format and alpha setting.

Both paths preserve the binding's value updates, external refresh, `change`/`finish`
notifications, disabled state, search ownership and disposal. Native dialog capabilities are
provided by the browser/platform. Hiding or disabling a Tweakpad control closes its popup;
unmounting or disposing removes the entire composed picker. The widget is registered only
when a Tweakpad picker binding first mounts.

Exported API types are `ColorPickerMode`, `ColorBindingParams`, `ColorObjectType` and
`ColorFormat` from `@tweakpad/devkit`. The playground's Style tab shows a native Orb color
control and a Tweakpad Glow control.
