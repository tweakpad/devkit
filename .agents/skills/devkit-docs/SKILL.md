---
name: devkit-docs
description: 'Write, change or review a devkit documentation page: the single page in docs/<section>/<slug>.mdx that Storybook and tweakpad.com/devkit both render, its previews, its story pairing, the JSDoc and exported types behind its generated API Reference and type cards, and both renderings of it. Enforces the page purpose, the fixed structure, the writing style shared with @tweakpad/ui, and the checks that fail a non-conforming page.'
---

# devkit documentation pages

devkit documents a JavaScript API (a pane and what it adds), not `tp-` elements, but its pages
follow @tweakpad/ui's documentation rules (its `tweakpad-docs` skill): the same purpose, page
grammar, elements, writing style and type cards. What differs is a page's identity: it names its
entry point in code (`symbol`) and the exported declarations of its API Reference (`api`).

## Purpose: a guide and a reference, never a dump

A page is what a developer reads while building a tool panel: it teaches the API through the
scenarios they will actually meet, and it is the reference they come back to. Every addition must
make the page easier to learn from or to look things up in, or it does not go in.

- **The page is not a garbage bin.** Adding an option or a method never adds a use case by itself:
  it gets one JSDoc line, which becomes its row in the generated API Reference. A new section is
  justified only by a prominent capability that changes behavior substantially, or when the user
  asks for one.
- **Existing sections are not churned.** Never reword, re-illustrate or reorder a section because
  something new was added. A page changes only where it is wrong, broken or bloated.
- **Use cases are familiar scenarios,** the most common ones a developer needs, ordered from simple
  to complex. Each showcases a feature, several options working together, never one option at a
  time like a machine. A section never re-introduces what the hero or an earlier section shows.

## One page, two renderings

Every documented API has exactly one page, written once here:

- **Storybook** renders it with Storybook's own blocks.
- **The website** (site repo, tweakpad.com/devkit) renders it with library components, from the
  installed package (`docs/**/*.mdx`, `@tweakpad/devkit/docs.json`,
  `@tweakpad/devkit/api-types.json`).

The page is the single source of truth for content; rendering is never shared. A page that breaks
a rule below fails `npm test` or `npm run docs:build`, and a failing page is an unfinished task.

| What                                  | Where                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| The page (authored)                   | `docs/<section>/<slug>.mdx`, sections `pane`, `controls`, `monitoring`, `history`                                           |
| API Reference (generated)             | TypeScript declarations + JSDoc → `scripts/docs/api.mjs` → `dist/docs.json`                                                 |
| Type signatures and cards (generated) | TypeScript compiler → `scripts/docs/api-types.mjs` → `dist/api-types.json`                                                  |
| Exports without a page                | `scripts/docs/pending.json`                                                                                                 |
| Storybook rendering                   | `.storybook/docs-page.mdx`, `.storybook/docs-devkit.mdx`, `.storybook/docs-types.ts`, `stories/<section>/<slug>.stories.ts` |
| Website rendering                     | site repo `src/pages/devkit/[...slug].astro`, `src/components/DevkitApiTable.astro`                                         |

## The structure (both systems)

1. **Header:** frontmatter `title`, `description`, `symbol` (the entry point, shown under the
   description) and `api` (the exported declarations the API Reference lists, in reading order).
2. **Main use case:** the hero `<Preview>`, before any heading.
3. **Usage:** `## Usage` and its `###` use cases. `## Keyboard` only when the API handles keys
   beyond native behavior.
4. **API Reference** (generated): for each declaration in `api`, its description, then Options,
   Properties, Events, Methods and, for a type alias, its Type, each only when it has rows.

[references/structure.md](references/structure.md) has the grammar, the elements, the API and
type-card rules, and how each system renders each section.

## Writing

Follow [references/writing-style.md](references/writing-style.md): the register sits between a
tutorial and a reference, prose explains intent and choice, and a sentence that could be an API
row belongs in JSDoc.

## Workflow

1. **Read first:** the page, the API's source and JSDoc, and the declarations its `api` lists.
2. **Write the least change.** Prefer a JSDoc line over prose, prose over a new section, and an
   existing section over a new one. Fill missing JSDoc instead of writing API prose.
3. **Pair the story:** `stories/<section>/<slug>.stories.ts` declares
   `parameters: { docs: devkitDocs('<section>/<slug>') }`, its title is
   `<Section title>/<page title>`, it has one `Default` story that renders the hero, and every
   other story is tagged `!autodocs`.
4. **Check:**
   ```sh
   npm run docs:build   # pages, API Reference and type cards; fails on any problem
   npm test             # page structure, previews, prose and the build (scripts/docs/docs.test.mjs)
   ```
5. **Read it rendered** in Chrome through the `chrome-devtools` MCP server (never headless):
   Storybook (`npm run storybook`, port 6007), and the website through `npm link` and the site's
   dev server. Read it as a developer would: sections in order, previews run, every API row has a
   description and its signature, type names open their cards (and the names inside them) without
   widening the table. Use one tab and close the tabs you opened.

**Done** means `npm run docs:build` and `npm test` pass and both renderings were read.

## Never

- Add a use case, a preview or a paragraph just because an option or method was added.
- Reword, reorder or trim existing text that is not wrong, broken or bloated.
- Restate an API row in prose, or author a section the API Reference generates (API, Options,
  Properties, Methods, Type, Related).
- Print a type declaration inside an API table, or rewrite one by hand: types are the compiler's
  signatures with clickable cards. When the build reports a reached type that is not exported or
  has no doc comment, fix the source (export it, or add one JSDoc line), never the docs.
- Author a page or an API section in the website repo.
- Use library elements in Storybook's docs chrome, or share a rendering between the two systems.
- Name other tweak-panel libraries, specifications, Storybook or design rationale in a page.
