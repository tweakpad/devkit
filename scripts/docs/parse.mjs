// Reader of devkit's documentation pages (`docs/<section>/<slug>.mdx`). The pages use the page
// grammar of @tweakpad/ui's documentation (frontmatter, a hero `<Preview>`, `## Usage` with `###`
// sections, and only the `<Preview>`, `<Code>` and `<Keys>` elements), so the same renderings can
// show both packages. The grammar itself is ui's (`parseFrontmatter`, `readBody`); what differs is
// the identity of a page: devkit documents a JavaScript API, not a `tp-` element, so a page names
// its entry point (`symbol`) and the exported declarations of its API Reference (`api`).
import { DocParseError, parseFrontmatter, readBody } from '@tweakpad/ui/docs';

/** @typedef {import('@tweakpad/ui/docs').DocHeading} DocHeading */
/** @typedef {import('@tweakpad/ui/docs').DocPreview} DocPreview */
/** @typedef {import('@tweakpad/ui/docs').DocElement} DocElement */

/**
 * @typedef {object} DevkitDoc
 * @property {string} id `controls/bindings`
 * @property {DocSection} section
 * @property {string} slug
 * @property {string} title
 * @property {string} description
 * @property {string} symbol The page's entry point in code, shown under its description.
 * @property {readonly string[]} api Exported declarations whose generated tables form the API Reference.
 * @property {readonly DocHeading[]} headings
 * @property {DocPreview | null} hero The first preview, when it comes before any heading.
 * @property {readonly DocPreview[]} previews Every preview in document order, hero included.
 * @property {boolean} keyboard
 * @property {readonly DocElement[]} elements
 * @property {readonly number[]} moduleStatements Lines that start with `import` or `export`.
 * @property {string} prose The prose and headings without code, element tags and attributes.
 */

/** The documentation sections under `docs/`, in reading order. */
export const DOC_SECTIONS = /** @type {const} */ (['pane', 'controls', 'monitoring', 'history']);
/** @typedef {(typeof DOC_SECTIONS)[number]} DocSection */

/** The sidebar and website section names of each folder. */
export const SECTION_TITLES = /** @type {const} */ ({
  pane: 'Pane',
  controls: 'Controls',
  monitoring: 'Monitoring',
  history: 'History',
});

const FIELDS = ['title', 'description', 'symbol', 'api'];

/** A page id (`controls/bindings`) from its file path under `docs/`. */
export function docId(file) {
  const match = new RegExp(`(?:^|/)docs/(${DOC_SECTIONS.join('|')})/([^/]+)\\.mdx$`).exec(file);
  if (!match) throw new Error(`${file} is not a documentation page path`);
  return `${match[1]}/${match[2]}`;
}

/**
 * Reads one documentation page. `id` is its page id, `controls/bindings`.
 * @param {string} source
 * @param {string} id
 * @returns {DevkitDoc}
 */
export function parseDoc(source, id) {
  const section = id.slice(0, id.lastIndexOf('/'));
  const slug = id.slice(id.lastIndexOf('/') + 1);
  if (!DOC_SECTIONS.includes(/** @type {DocSection} */ (section)) || !slug)
    throw new Error(`${id} is not a page id`);
  const text = source.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const frontmatter = parseFrontmatter(lines, id);
  for (const key of Object.keys(frontmatter.fields))
    if (!FIELDS.includes(key)) throw new DocParseError(id, 1, `unknown frontmatter field: ${key}`);
  /** @param {string} name */
  const field = (name) => {
    const value = frontmatter.fields[name];
    if (typeof value !== 'string' || !value)
      throw new DocParseError(id, 1, `frontmatter needs a ${name}`);
    return value;
  };
  const api = frontmatter.fields.api ?? [];
  if (!Array.isArray(api)) throw new DocParseError(id, 1, 'api must be a list');

  const { headings, previews, elements, moduleStatements, prose } = readBody(
    text,
    lines,
    frontmatter.end,
    id,
  );
  return {
    id,
    section: /** @type {DocSection} */ (section),
    slug,
    title: field('title'),
    description: field('description'),
    symbol: field('symbol'),
    api,
    headings,
    hero: previews[0]?.afterHeading === null ? previews[0] : null,
    previews,
    keyboard: headings.some((heading) => heading.depth === 2 && heading.slug === 'keyboard'),
    elements,
    moduleStatements,
    prose,
  };
}
