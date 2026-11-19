# Writing style

Every page is written in the same register as @tweakpad/ui's pages. This governs **new pages and
new sections**. It is never a reason to reword existing text (see "Existing sections are not
churned" in SKILL.md).

## The register: between a tutorial and a technical reference

- The page teaches the API through its **most common, familiar scenarios**, each a small example
  with a few sentences on when and why. Its full surface lives in the generated API Reference, not
  in one section per option.
- It is **not a tutorial**:
  - no step-by-step walkthroughs, no "first we…, then we…";
  - no multi-step flows;
  - no whole tools built around the API.

  Full compositions are showcases.

- It is **not a technical reference** either:
  - no prose that walks API rows, lists values with their defaults, restates a default or
    enumerates what the API lacks;
  - if a sentence could be an API row, it belongs in the declaration's JSDoc, which the generated
    API Reference prints.
- **Less is better.** A small API (Buttons, Separators) gets a hero and a few short sections; a
  rich one (Graphs, Layers, Version history) gets one section per scenario a developer will meet,
  not one per option. Never pad a page.
- **Showcase features, not options.** A section shows several options working together in a real
  scenario. A single option gets its own section only when it changes behavior substantially (a
  mode, a layout, a storage model); otherwise its API row is enough.
- **One feature, one place, simple to complex.** Each capability appears once. A section never
  re-introduces what the hero or an earlier section shows, and never depends on a feature no
  earlier section has shown.

## Sections and examples

- A section heading names what it shows: "Folders", "Ranges", "Pushed values", "Disabled and
  hidden", "Events", "Storage".
- A preview is the smallest pane that makes the feature real:
  - realistic labels and data from a real tool (a renderer's draw calls, a camera's position, a
    material's color), never `foo` or `value1`;
  - never a whole application.
- One preview per section is the norm. Use two when a contrast matters, such as sampled versus
  pushed values.
- Icons are library icons, set from a script that imports `@tweakpad/ui/icons/<name>`, never
  inline SVG.
- Sample content is original. Never copy names, labels or domains from reference screenshots or
  other products.

## Prose

- Prose explains intent and choice: when to use the API, what to prefer over what, and what an
  option changes. "`interval` sets how often values are read; a glance needs no more than a few
  reads a second" is the register.
- Write plainly, in present tense, addressed to a developer using the package.
- Prose never mentions:
  - Storybook, "this example" or "the story";
  - specifications;
  - other tweak-panel libraries the API resembles;
  - class names, `data-*` markers or private custom properties;
  - design rationale ("we built it this way because…").
- Keep every inline code span on one line, because a wrapped span breaks Storybook's Markdown.
