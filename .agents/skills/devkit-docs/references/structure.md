# Page structure

## The file

```
---
title: Stats                       the API's name, as the website names its page
description: One sentence: what it is and what it is for.
symbol: pane.addStats(params)      the entry point in code, shown under the description
api: [StatsParams, StatsApi]       exported declarations of the API Reference, in reading order
---
<Preview … />                      1. main use case (hero): before any heading, minimal
## Usage                           2. the first heading, always
                                      optional prose on what it is for and when to pick it
<Preview … />                         previews may sit directly under Usage
### <Section>                      3. one use case per section: a familiar scenario showing a
### <Section>                         feature, simple to complex; short prose + small preview(s)
## Keyboard                        only when the API handles keys beyond native behavior
                                   The API Reference is generated from `api`
```

Rules the checks enforce (`scripts/docs/parse.mjs`, `scripts/docs/docs.test.mjs`,
`scripts/docs/build.mjs`):

- **Frontmatter.** It has `title`, `description`, `symbol` and `api` (a list). Nothing else is
  allowed.
- **Hero.** The first preview comes before the first heading.
- **Headings.**
  - `## Usage` is the first heading.
  - The only `##` headings are `## Usage` and `## Keyboard`.
  - Everything else is `###`; nothing is deeper.
  - No heading is named API, API Reference, Reference, Options, Properties, Methods, Type or
    Related. Those sections are generated.
- **Elements.** Only `<Preview />`, `<Code />` and `<Keys />`, all self-closing. No `import` or
  `export` lines: each rendering supplies the elements.
- **Literals.** Multi-line attribute values are template literals (`code={`…`}`). They escape
  only `` \` ``, `\$` and `\\`, and never interpolate.
- **API.** Every name in `api` is exported from the package and every row it generates is
  described. Every export is listed by some page or in `scripts/docs/pending.json`.

## Elements

`<Preview title="…" code={`…`} script={`…`} />` is a live example. Its `code` is the markup the
script builds into, and `code` plus `script` is what a reader copies. The script:

- runs as a module after the markup;
- imports only from `@tweakpad/devkit`, `lit` and `@tweakpad/ui/icons/<name>`, with named or
  namespace imports;
- selects its elements by ids that are in its own `code` and unique on the page;
- builds every `Pane` into a `container` of its markup, never floating over the page.

Optional attributes: `align` (`center` by default for one pane, `start` or `stretch` for a
composition), `language`, and `codeOnly` when the preview has nothing visual.

`<Code code={`…`} language="ts" label="…" />` is a standalone sample with no live preview, such as
an install command or a storage adapter.

`<Keys keys="mod+z" />` draws a shortcut inside a Keyboard Markdown table (`| Key | Action |`).

## How each system renders each section

| Section       | Storybook (Storybook blocks, no `tp-*` chrome)                        | Website (library components)                    | Source                        |
| ------------- | --------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------- |
| Header        | `Title`, `Description`, the `symbol` as code                          | `h1`, description, the `symbol`                 | frontmatter                   |
| Main use case | `Primary` (the Default story, source = hero code)                     | the hero preview                                | hero `<Preview>`              |
| Usage         | the page through `DevkitDoc`: `Canvas` per preview, `Source` per Code | the page with the site's Preview, Code and Keys | the page                      |
| API Reference | Storybook args tables, signatures as type tokens, one `TypeCard`      | `DevkitApiTable`                                | `docs.json`, `api-types.json` |

## API Reference and type cards

`scripts/docs/api.mjs` reads each declaration a page lists from the TypeScript sources:

- **Options:** the members of an interface or object type (`PaneOptions`, `BindingParams`).
- **Properties:** the public fields and accessors of a class, read-only ones badged.
- **Events:** the names its `on(type, listener)` accepts, each described by an
  `@event name - description` tag on `on`.
- **Methods:** its public methods, the constructor first when it is documented public API.
- **Type:** a type alias that is not an object type, with its definition.

Members tagged `@internal`, private and protected members and `#private` fields are left out.
Rows come from JSDoc: one line per member saying what it does (never restating its values or
default, which the row shows), and `@default` for a default. The build fails on an undescribed
row.

**Type** shows the signature exactly as TypeScript declares it, on one line: a choice list as its
values (`'auto' | 'show' | 'hide'`), a callback as its signature, otherwise the named type. Each
devkit or platform type name in it is a token a click opens:

- **A click opens the type's card**, as an editor's hover does: a popover at the name with the
  type's declaration (pretty-printed, highlighted), its doc comment and the import that gives it
  (`import type { StatsParams } from '@tweakpad/devkit'`). Type names in the card open their own
  cards, with a back step. Platform types (`HTMLElement`, `KeyboardEvent`) open cards too, marked
  as needing no import; a large one shows its header only. Other packages' types, @tweakpad/ui's
  included, stay plain names.
- **Generated, never authored; linking is automatic.** `scripts/docs/api-types.mjs` reads the cards
  from the compiler when `npm run docs:build` runs, in @tweakpad/ui's format, so the same helpers
  (`@tweakpad/ui/docs`: `typeTokens`, `typeRefs`, `symbolCard`, `proseParts`) render both. A row's
  signature, a method's parameters, a declaration in a card, and a code span naming a type
  (`` `StatsGroupParams` ``) in a description or doc comment all link. Nothing is written a special
  way for it. The build fails when a reached type is not exported from the package or has no doc
  comment: fix the source (export it, or add one JSDoc line), never the docs. A type exported only
  so its card can name its import goes in `pending.json`.

## Vocabulary

- **Entry point:** the call a page documents (`pane.addStats(params)`), its `symbol`.
- **Params** (`StatsParams`): the options object an entry point takes; **Api** (`StatsApi`): the
  handle it returns.
- **Option:** a member of a params object. Its API row explains it; a Usage section shows it only
  as part of a feature's use case.
