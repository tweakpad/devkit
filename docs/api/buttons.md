# Button API

`Pane`, `FolderApi`, and `TabPageApi` support `addButton(params)`. To place a button next to
any other control, use the general [inline row API](rows.md). Button composition and layout
are owned by `addRow`, with the same declarations used for bindings and monitors.

```ts
const reset = pane.addButton({
  name: 'reset-scene',
  title: 'Reset scene',
  onClick: () => { params.speed = 0.6; },
});
reset.title = 'Reset animation';
reset.disabled = true;
reset.hidden = true;
reset.dispose();
```

| `ButtonParams` property | Type | Behavior |
| --- | --- | --- |
| `title` | `string` | Required visible and accessible title. |
| `onClick` | `(event: MouseEvent) => void` | Required callback for pointer or keyboard activation. |
| `name` | `string` | Stable search name; defaults to the initial title. |
| `disabled` | `boolean` | Defaults to `false`. Blocks activation. |
| `hidden` | `boolean` | Defaults to `false`. Hides the complete control and excludes it from search. |

`ButtonApi` has writable `title`, `disabled`, and `hidden`, readonly `element` (the complete
visibility shell), and `dispose()`. Changing the title updates its search label and reapplies
an active search. The stable search name remains unchanged. Disabled buttons remain searchable.

Buttons use the Tweakpad Button with `type="button"` and inherit pane appearance and density.
They do not submit surrounding forms. Hidden, filtered, disabled and disposed controls do not
invoke callbacks. `dispose()` releases the click listener and removes search eligibility;
container disposal also disposes its buttons. No DOM construction or custom styling is needed.

`ButtonParams` and `ButtonApi` are exported from `@tweakpad/devkit`.
