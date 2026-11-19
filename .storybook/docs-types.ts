import {
  proseParts,
  signatureTokens,
  symbolCard,
  typeRefs,
  type ApiToken,
  type ApiTypes,
} from '@tweakpad/ui/docs';

/**
 * The type cards the Docs pages open from a type name, read from the TypeScript compiler by
 * `npm run docs:build` (`scripts/docs/api-types.mjs` → `dist/api-types.json`). The same data and
 * helpers as @tweakpad/ui's pages: a type name in a row's signature, or a code span naming a type
 * in a description, opens that type's card. Nothing is authored for it. Read through a glob so the
 * project typechecks without the generated file.
 */
export const types = Object.values(
  import.meta.glob<ApiTypes>('../dist/api-types.json', { eager: true, import: 'default' }),
)[0]!;
if (!types) throw new Error('dist/api-types.json is missing: run `npm run docs:build`');

export { symbolCard, typeRefs };

const escape = (text: string) =>
  text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

/**
 * Tokens as HTML for an args table description (Markdown with inline HTML): each piece colored
 * by its syntax role, each project type name a button that opens its card (`TypeCard`). The
 * Markdown renderer trims leading whitespace, so spaces end the piece before them.
 */
export function tokensHtml(tokens: readonly ApiToken[]): string {
  const pieces: { token: ApiToken; html: string }[] = [];
  for (const token of tokens) {
    const last = pieces.at(-1);
    const lead = /^\s*/u.exec(token.text)![0];
    const rest = escape(token.text.slice(lead.length));
    // Leading whitespace joins the plain piece before it; after a type button it becomes a
    // non-breaking space, the one the renderer keeps.
    if (lead && last && !last.token.ref) last.html += lead;
    const html = lead && last?.token.ref ? `&nbsp;${rest}` : last ? rest : escape(token.text);
    if (html) pieces.push({ token, html });
  }
  return pieces
    .map(({ token, html }) => {
      const color = token.scope ? ` style="color: var(--tp-syntax-${token.scope})"` : '';
      return token.ref
        ? `<button type="button" class="tp-docs-type-ref" data-tp-ref="${token.ref}"${color}>${html}</button>`
        : `<span${color}>${html}</span>`;
    })
    .join('');
}

/** A description (Markdown) whose code spans that name a type become buttons that open its card. */
export function proseHtml(text: string, refs: Readonly<Record<string, string>>): string {
  return proseParts(text, refs)
    .map((part) =>
      part.ref
        ? `<button type="button" class="tp-docs-type-ref tp-docs-type-code" data-tp-ref="${part.ref}">${escape(part.text)}</button>`
        : part.code
          ? `\`${part.text}\``
          : part.text,
    )
    .join('');
}

/** A description of a row of the declaration `name`, its type-naming code spans linked. */
export function rowProseHtml(name: string, text: string): string {
  return proseHtml(text, typeRefs(types, { tag: name }));
}

/** A signature of the declaration `name` as one line of clickable tokens. */
export function signatureHtml(name: string, code: string): string {
  return code
    ? `<span class="tp-docs-signature">${tokensHtml(signatureTokens(types, name, code))}</span>`
    : '';
}

/** The outline `read-only` badge of a property that cannot be set; drawn after the name. */
export const readOnlyBadge = '<span class="tp-docs-flag">read-only</span>';
