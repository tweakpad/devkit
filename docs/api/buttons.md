# Buttons API

`Pane`, `FolderApi`, and `TabPageApi` inherit `addButton(params)` and `addButtons(params)`.
Both methods accept declarative configuration objects and render Tweakpad `tp-button`
components using the pane's appearance, density and spacing. The API owns the layout;
examples need no DOM construction, CSS classes, styling hooks or search registration.

## Single button

```ts
const reset = scene.addButton({
  name: 'reset-scene',
  title: 'Reset scene',
  onClick: () => {
    params.speed = 0.6;
    params.paused = false;
  },
});

reset.title = 'Reset animation';
reset.disabled = true;
reset.hidden = true;
reset.dispose();
```

`addButton` returns `ButtonApi`. `ButtonParams` has these properties:

| Property | Type | Default / behavior |
| --- | --- | --- |
| `title` | `string` | Required visible and accessible button title. |
| `onClick` | `(event: MouseEvent) => void` | Required activation callback. Pointer and keyboard activation use the library Button's behavior. |
| `name` | `string` | Optional stable search name; defaults to the initial title. |
| `disabled` | `boolean` | `false`; disables activation. |
| `hidden` | `boolean` | `false`; hides the complete row and excludes it from search counts. |

The handle exposes writable `title`, `disabled`, and `hidden`, a readonly `element`
(the complete visibility shell), and `dispose()`. Changing `title` updates both the
button's text and its current search label. Its stable search name does not change.

## Inline buttons

```ts
const playback = scene.addButtons({
  name: 'playback',
  label: 'Playback',
  buttons: [
    { title: 'Pause', onClick: () => { params.paused = true; } },
    { title: 'Resume', onClick: () => { params.paused = false; } },
  ],
});

playback.buttons[0].title = 'Pause animation';
playback.buttons[1].disabled = true;
playback.disabled = true;
playback.hidden = true;
playback.dispose();
```

`addButtons` returns `ButtonsApi`. `ButtonsParams` has these properties:

| Property | Type | Default / behavior |
| --- | --- | --- |
| `buttons` | Nonempty readonly array of `ButtonActionParams` | Required. Actions appear in order on one row, with equal widths and pane spacing. |
| `name` | `string` | Optional stable search name; defaults to the initial action titles joined with ` / `. |
| `label` | `string` | Optional additional search label, alongside every action's current title. |
| `disabled` | `boolean` | `false`; disables every action without changing individual disabled flags. |
| `hidden` | `boolean` | `false`; hides the complete row and excludes it from search counts. |

Each `ButtonActionParams` requires `title` and `onClick`, and accepts `disabled` (default
`false`). Their meanings match the single-button options. The array must contain at least
one action; TypeScript requires a nonempty tuple, and an empty array at runtime throws
`RangeError` before creating a row.

The returned handle exposes writable `disabled` and `hidden`, readonly `element`,
`dispose()`, and a readonly `buttons` array of `ButtonActionApi` handles in declaration
order. Each action handle has writable `title` and `disabled`. An action is effectively
disabled when either its own flag or the row's flag is true. Re-enabling the row preserves
individually disabled actions. Disabled actions remain searchable.

## Search and lifecycle

A single button is one atomic search result. An inline row is also one atomic composed
result: searching its name, optional label, or either action's title retains the **whole**
row. A nonmatch removes its entire visibility shell, so a button composition cannot leave
an empty surface behind. To make two actions independently searchable, use two
`addButton` declarations instead of one `addButtons` declaration.

Search works before controls become visible, inside collapsed folders and inactive tabs.
Changing a title or authored hidden state reapplies an active search. Row visibility never
changes the selected tab, folder expansion, or an action's disabled flag.

All actions use `type="button"`; they do not submit surrounding forms. Filtered, explicitly
hidden, disabled and disposed rows do not invoke callbacks. `dispose()` removes the complete
row, releases its click listeners and removes it from search eligibility. Disposing the
containing pane or folder disposes its buttons as well.

The exported types are `ButtonParams`, `ButtonsParams`, `ButtonActionParams`, `ButtonApi`,
`ButtonsApi`, and `ButtonActionApi`, all available from `@tweakpad/devkit`.
