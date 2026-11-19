// Builds `dist/docs.json`: every documentation page under `docs/<section>/` with the API Reference
// its `api` field names, generated from the TypeScript sources, and `dist/api-types.json`: the
// type cards a type name in that reference opens (see `api-types.mjs`). The renderings (Storybook here,
// the website from the published package) read pages and API rows from it, as they read
// @tweakpad/ui's `docs.json`.
//
// The build fails when a page does not parse, names an API the package does not export, or
// documents a declaration with an undescribed row, when an exported declaration has no page and is
// not listed in `pending.json`, and when a type the reference reaches is not exported or has no
// doc comment.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createApiReader, undescribed } from './api.mjs';
import { buildApiTypes } from './api-types.mjs';
import { DOC_SECTIONS, docId, parseDoc } from './parse.mjs';

const root = resolve(import.meta.dirname, '../..');

/** Every page file under `docs/<section>/`, in section order then by name. */
export function pageFiles() {
  return DOC_SECTIONS.flatMap((section) => {
    const folder = join(root, 'docs', section);
    if (!existsSync(folder)) return [];
    return readdirSync(folder)
      .filter((name) => name.endsWith('.mdx'))
      .sort()
      .map((name) => join(root, 'docs', section, name));
  });
}

/** Builds the index, or throws with every problem found. */
export function buildIndex() {
  const problems = [];
  const reader = createApiReader(join(root, 'src/index.ts'), join(root, 'tsconfig.json'));
  const pages = [];
  for (const file of pageFiles()) {
    const path = relative(root, file);
    try {
      const page = parseDoc(readFileSync(file, 'utf8'), docId(path));
      pages.push({ ...page, file: path });
    } catch (error) {
      problems.push(error.message);
    }
  }
  const api = {};
  for (const page of pages)
    for (const name of page.api) {
      if (api[name]) continue;
      try {
        api[name] = reader.read(name);
        for (const missing of undescribed(api[name]))
          problems.push(`${page.id}: ${missing} has no description`);
      } catch (error) {
        problems.push(`${page.id}: ${error.message}`);
      }
    }
  const pending = new Set(
    JSON.parse(readFileSync(join(import.meta.dirname, 'pending.json'), 'utf8')).exports,
  );
  for (const name of reader.exported())
    if (!api[name] && !pending.has(name))
      problems.push(`${name} is exported but no page lists it in api (or pending.json)`);
  for (const name of pending)
    if (api[name]) problems.push(`${name} has a page now: remove it from pending.json`);
  const { name: packageName, version } = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );
  const { types, problems: typeProblems } = buildApiTypes({ root, reader, api, packageName });
  problems.push(...typeProblems);
  if (problems.length) throw new Error(`docs:\n  ${problems.join('\n  ')}`);
  return { index: { version, pages, api }, types };
}

if (process.argv[1] === import.meta.filename) {
  try {
    const { index, types } = buildIndex();
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist/docs.json'), `${JSON.stringify(index)}\n`);
    writeFileSync(join(root, 'dist/api-types.json'), `${JSON.stringify(types)}\n`);
    console.log(
      `docs: ${index.pages.length} pages, ${Object.keys(index.api).length} API entries → dist/docs.json; ${Object.keys(types.symbols).length} type cards → dist/api-types.json`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
