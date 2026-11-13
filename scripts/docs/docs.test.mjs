// The documentation pages follow @tweakpad/ui's page structure (its `tweakpad-docs` skill,
// `references/structure.md`), with devkit's sections and frontmatter: the checks here are the
// skeleton and the few terms that must stay precise, nothing about how a page is written.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { slugify } from '@tweakpad/ui/docs';
import { describe, expect, it } from 'vitest';
import { buildIndex, pageFiles } from './build.mjs';
import { DOC_SECTIONS, SECTION_TITLES, docId, parseDoc } from './parse.mjs';
import { isPreviewSpecifier, previewImports, unsupportedImports } from './preview-runtime.mjs';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const pages = pageFiles().map((file) => {
  const path = file.slice(root.length + 1);
  return parseDoc(readFileSync(file, 'utf8'), docId(path));
});

/** Section names the API Reference generates; a page never authors them. */
const AUTHORED_NEVER = new Set(
  ['API', 'API reference', 'Related', 'Reference', 'Options', 'Properties', 'Methods', 'Type'].map(
    slugify,
  ),
);
/** Names that never appear in the pages: the docs describe devkit on its own. */
const PROSE_NEVER = /\b(?:Storybook|Tweakpane|lil-gui|dat\.gui|Leva)\b/;

describe('documentation pages', () => {
  it('exist, one folder per section', () => {
    expect(pages.length).toBeGreaterThan(0);
    for (const section of DOC_SECTIONS)
      expect(
        pages.some((page) => page.section === section),
        `docs/${section}/ has no page`,
      ).toBe(true);
  });

  it('use only Preview, Code and Keys, with no module statements', () => {
    for (const page of pages) {
      expect(page.moduleStatements, `${page.id}: no import or export`).toEqual([]);
      for (const element of page.elements)
        expect(
          ['Preview', 'Code', 'Keys'],
          `${page.id}:${element.line}: <${element.name}>`,
        ).toContain(element.name);
    }
  });

  it('open with the hero preview, then Usage, and author no generated section', () => {
    for (const page of pages) {
      expect(page.api.length, `${page.id}: api names its declarations`).toBeGreaterThan(0);
      expect(page.hero, `${page.id}: a Preview comes before the first heading`).not.toBeNull();
      const first = page.headings[0];
      expect(
        first && `${first.depth}:${first.slug}`,
        `${page.id}: ## Usage is the first heading`,
      ).toBe('2:usage');
      for (const heading of page.headings) {
        expect(
          heading.depth,
          `${page.id}:${heading.line}: headings are ## or ###`,
        ).toBeLessThanOrEqual(3);
        if (heading.depth === 2)
          expect(['usage', 'keyboard'], `${page.id}:${heading.line}: ## ${heading.text}`).toContain(
            heading.slug,
          );
        expect(
          AUTHORED_NEVER.has(heading.slug),
          `${page.id}:${heading.line}: ${heading.text} is generated, not authored`,
        ).toBe(false);
      }
    }
  });

  it('build panes into their own markup, with scripts that import only what previews may', () => {
    for (const page of pages)
      for (const preview of page.previews) {
        if (!preview.script) continue;
        expect(
          unsupportedImports(preview.script),
          `${page.id}:${preview.line}: scripts use named or namespace imports`,
        ).toBe(0);
        for (const specifier of previewImports(preview.script))
          expect(
            isPreviewSpecifier(specifier),
            `${page.id}:${preview.line}: import of ${specifier}`,
          ).toBe(true);
        for (const [, id] of preview.script.matchAll(/getElementById\('([^']+)'\)/g))
          expect(
            preview.code,
            `${page.id}:${preview.line}: #${id} is in the preview's code`,
          ).toContain(`id="${id}"`);
        // A pane floating over the page would cover the documentation around the preview.
        for (const [call] of preview.script.matchAll(/new Pane\(\{[\s\S]*?\}\)/g))
          expect(call, `${page.id}:${preview.line}: a preview pane takes a container`).toContain(
            'container',
          );
      }
  });

  it('describe devkit on its own terms', () => {
    for (const page of pages) {
      expect(page.prose, `${page.id}: prose`).not.toMatch(PROSE_NEVER);
      for (const preview of page.previews)
        expect(
          `${preview.code}\n${preview.script ?? ''}`,
          `${page.id}:${preview.line}`,
        ).not.toMatch(PROSE_NEVER);
    }
  });

  // Reading the declarations runs the TypeScript compiler: seconds, more on a busy machine.
  it(
    'build into docs.json with a described API Reference for every page',
    { timeout: 30_000 },
    () => {
      const index = buildIndex();
      expect(index.pages.map((page) => page.id)).toEqual(pages.map((page) => page.id));
      for (const page of index.pages)
        for (const name of page.api) expect(index.api[name], `${page.id}: ${name}`).toBeDefined();
    },
  );

  it('render each page from its own story file, and nothing else from it', () => {
    const storyFiles = DOC_SECTIONS.flatMap((section) =>
      existsSync(join(root, 'stories', section))
        ? readdirSync(join(root, 'stories', section))
            .filter((file) => file.endsWith('.stories.ts'))
            .map((file) => `stories/${section}/${file}`)
        : [],
    );
    const declared = new Map();
    for (const file of storyFiles) {
      const source = read(file);
      const [, section, slug] = /^stories\/([^/]+)\/(.+)\.stories\.ts$/.exec(file);
      const id = `${section}/${slug}`;
      const uses = /devkitDocs\('([^']+)'\)/.exec(source)?.[1];
      expect(uses, `${file} must render docs/${id}.mdx through devkitDocs()`).toBe(id);
      declared.set(uses, file);
      const page = pages.find((candidate) => candidate.id === id);
      expect(page, `${file} renders a page that does not exist`).toBeDefined();
      expect(source, `${file}: the title is the section and the page title`).toContain(
        `title: '${SECTION_TITLES[section]}/${page.title}'`,
      );
      expect(source).toContain('export const Default: Story');
      for (const [, name] of source.matchAll(/export const (\w+): Story = \{/g))
        if (name !== 'Default')
          expect(source, `${file}: story ${name} needs tags: ['!autodocs']`).toMatch(
            new RegExp(`export const ${name}: Story = \\{[^}]*tags: \\['!autodocs'\\]`),
          );
    }
    for (const page of pages)
      expect(declared.has(page.id), `no story renders docs/${page.id}.mdx`).toBe(true);
  });
});

describe('page reader', () => {
  const page = (body, frontmatter = 'symbol: new Pane()\napi: [Pane, PaneOptions]') =>
    parseDoc(`---\ntitle: Pane\ndescription: A pane.\n${frontmatter}\n---\n${body}`, 'pane/pane');

  it('reads the devkit frontmatter, headings and the hero', () => {
    const parsed = page(
      '<Preview title="Pane" code={`<div id="a"></div>`} script={`import { Pane } from \'@tweakpad/devkit\';`} />\n\n## Usage\n\n### Folders\n',
    );
    expect(parsed.symbol).toBe('new Pane()');
    expect(parsed.api).toEqual(['Pane', 'PaneOptions']);
    expect(parsed.hero?.code).toBe('<div id="a"></div>');
    expect(parsed.headings.map((heading) => `${heading.depth}:${heading.slug}`)).toEqual([
      '2:usage',
      '3:folders',
    ]);
  });

  it("rejects ui's element frontmatter and unknown fields", () => {
    expect(() => page('', 'symbol: x\napi: [Pane]\ntag: tp-pane')).toThrow(
      'unknown frontmatter field',
    );
    expect(() => page('', 'api: [Pane]')).toThrow('frontmatter needs a symbol');
    expect(() => page('', 'symbol: x\napi: Pane')).toThrow('api must be a list');
  });
});
