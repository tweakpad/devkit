# devkit agent instructions

For any documentation work — the `docs/<section>/*.mdx` pages, their previews, story pairing, the
JSDoc and exported types behind the generated API Reference and its type cards, or the Storybook
and website renderings — read and follow the
[devkit-docs skill](.agents/skills/devkit-docs/SKILL.md). Its structure and style rules are
mandatory, and `npm run docs:build` and `npm test` must pass.

The pages follow @tweakpad/ui's documentation rules (its `tweakpad-docs` skill); the devkit skill
adapts them to an API documented by declarations instead of elements.
