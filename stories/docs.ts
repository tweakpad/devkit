import type { ComponentType } from 'react';
import { docId, parseDoc, type DevkitDoc } from '../scripts/docs/parse.mjs';

/**
 * devkit's documentation pages (`docs/<section>/*.mdx`) as Storybook renders them: each page
 * compiled to a component by Storybook's MDX plugin, and read by the page parser from its source,
 * so the Docs page knows the hero, the headings and the API it documents.
 */
const compiled = import.meta.glob<{ default: ComponentType<{ components?: object }> }>(
  '../docs/{pane,controls,monitoring,history}/*.mdx',
  { eager: true },
);
const sources = import.meta.glob<string>('../docs/{pane,controls,monitoring,history}/*.mdx', {
  eager: true,
  query: '?raw',
  import: 'default',
});

export interface DevkitDocPage {
  readonly page: DevkitDoc;
  readonly Content: ComponentType<{ components?: object }>;
}

const byId = new Map<string, DevkitDocPage>();
for (const [file, source] of Object.entries(sources)) {
  const id = docId(file);
  byId.set(id, { page: parseDoc(source, id), Content: compiled[file]!.default });
}

/**
 * The `parameters.docs` of a story file whose Docs page is the devkit page `id`
 * (`controls/bindings`): the page itself for the Docs template, its description for the Title
 * block and its hero as the Default story's copyable source.
 */
export function devkitDocs(id: string) {
  const doc = byId.get(id);
  if (!doc) throw new Error(`no documentation page ${id} under docs/`);
  return {
    devkit: doc,
    description: { component: doc.page.description },
    source: { code: doc.page.hero ? previewCode(doc.page.hero) : '' },
  };
}

/** The copyable source of a preview: its markup, then its script in a module script tag. */
function previewCode(preview: { code: string; script?: string }): string {
  const markup = preview.code.trim();
  const behavior = preview.script?.trim();
  return behavior ? `${markup}\n\n<script type="module">\n${behavior}\n</script>` : markup;
}
