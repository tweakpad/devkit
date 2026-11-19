// The type cards of devkit's documentation, read from the TypeScript compiler, never written by
// hand. The same data as @tweakpad/ui's `api-types.json`, so the same helpers
// (`@tweakpad/ui/docs`: `typeTokens`, `typeRefs`, `symbolCard`, `proseParts`) render both.
//
// For every declaration a page's API Reference lists it resolves each project type its rows name
// (their types, method signatures and the code spans of their descriptions), and for each such
// type it keeps a card: the declaration as the compiler prints it, the doc comment an editor's
// hover shows, the import that gives it, and the project types the declaration names (each with
// its own card). The renderers draw a signature's type names as tokens a click opens.
//
// It reports a problem when a reached project type is not exported from the package or has no
// doc comment, so the docs never show a type a developer cannot import or understand. Types of
// other packages (`@tweakpad/ui`'s included) stay plain names.
import { relative, resolve } from 'node:path';
import ts from 'typescript';

/** The type names a text writes as a code span (`BindingParams`), which the docs link too. */
const codeSpans = (text) => [...(text ?? '').matchAll(/`([A-Z]\w*)`/gu)].map((match) => match[1]);

/** A built-in type with more members than this shows only its header, as an editor's hover does. */
const PLATFORM_MEMBERS = 12;

const TYPE_DECLARATION = (node) =>
  ts.isInterfaceDeclaration(node) ||
  ts.isTypeAliasDeclaration(node) ||
  ts.isClassDeclaration(node) ||
  ts.isEnumDeclaration(node);

/**
 * @typedef {import('@tweakpad/ui/docs').ApiTypes} ApiTypes
 * @typedef {import('./api.mjs').ApiEntry} ApiEntry
 */

/**
 * Builds the type cards of `api` (the declarations the pages list, by name) plus the problems
 * found. `elements` holds, per declaration, the type names its rows mention by card id: the key
 * @tweakpad/ui uses for an element's tag, so its helpers apply as they are.
 * @param {{ root: string, reader: ReturnType<typeof import('./api.mjs').createApiReader>,
 *   api: Record<string, ApiEntry>, packageName: string }} options
 * @returns {{ types: ApiTypes, problems: string[] }}
 */
export function buildApiTypes({ root, reader, api, packageName }) {
  const { program, checker, exports } = reader;
  const source = resolve(root, 'src');
  const projectFile = (file) =>
    !!file && resolve(file.fileName).startsWith(source) && !file.isDeclarationFile;
  /** The platform's own types (the DOM, the language), which need no import. */
  const platformFile = (file) => !!file && program.isSourceFileDefaultLibrary(file);
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

  /** A symbol through its import aliases. */
  const target = (symbol) =>
    symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declarationOf = (symbol) => symbol?.declarations?.find(TYPE_DECLARATION);
  const idOf = (symbol, declaration) =>
    platformFile(declaration.getSourceFile())
      ? `lib#${symbol.name}`
      : `${relative(root, declaration.getSourceFile().fileName).split('\\').join('/')}#${symbol.name}`;

  // The package has one entry: every project type it exports imports from the package name.
  const importFrom = new Map();
  /** Exported project types by name: a name used out of scope resolves when it is unique. */
  const exportedByName = new Map();
  for (const [name, exported] of exports) {
    const symbol = target(exported);
    const declaration = declarationOf(symbol);
    if (!declaration || !projectFile(declaration.getSourceFile())) continue;
    const id = idOf(symbol, declaration);
    if (!importFrom.has(id)) importFrom.set(id, { name, from: packageName });
    exportedByName.set(
      symbol.name,
      new Map([...(exportedByName.get(symbol.name) ?? []), [id, symbol]]),
    );
  }

  // The type names in scope in a file, imports included, resolved once per file.
  const scopes = new Map();
  const scopeOf = (node) => {
    const file = node.getSourceFile();
    let scope = scopes.get(file);
    if (!scope) {
      scope = new Map();
      for (const symbol of checker.getSymbolsInScope(
        file,
        ts.SymbolFlags.Type | ts.SymbolFlags.Alias | ts.SymbolFlags.Namespace,
      ))
        scope.set(symbol.name, symbol);
      scopes.set(file, scope);
    }
    return scope;
  };

  const symbols = {};
  const pending = [];
  const problems = new Set();
  /**
   * The card id of a project or platform type symbol, queuing its card; undefined for any other
   * symbol (a value, a type parameter, another package's type).
   */
  const reach = (symbol, via) => {
    const resolved = target(symbol);
    const declaration = declarationOf(resolved);
    const file = declaration?.getSourceFile();
    if (!declaration || !(projectFile(file) || platformFile(file))) return undefined;
    const id = idOf(resolved, declaration);
    if (!(id in symbols)) {
      symbols[id] = null;
      pending.push({ id, symbol: resolved, declaration, via });
    }
    return id;
  };
  /**
   * Project type names, resolved in the scope of `node`: every capitalized name of a type text,
   * or the given names (a description's code spans).
   */
  const namesIn = (
    text,
    node,
    via,
    names = [...text.matchAll(/\b[A-Z]\w*\b/gu)].map(([n]) => n),
  ) => {
    const refs = {};
    const scope = scopeOf(node);
    for (const name of names) {
      if (name in refs) continue;
      const unique = exportedByName.get(name);
      const symbol = scope.get(name) ?? (unique?.size === 1 ? [...unique.values()][0] : undefined);
      const id = symbol && reach(symbol, via);
      if (id) refs[name] = id;
    }
    return refs;
  };

  // Every listed declaration's rows, resolved where the declaration is written.
  const elements = {};
  for (const [name, entry] of Object.entries(api)) {
    const symbol = target(exports.get(name));
    const node = symbol?.declarations?.[0];
    if (!node) continue;
    const refs = {};
    const add = (text, label) => Object.assign(refs, namesIn(text ?? '', node, label));
    const prose = (text, label) => Object.assign(refs, namesIn('', node, label, codeSpans(text)));
    prose(entry.description, name);
    for (const group of ['options', 'properties', 'events', 'methods', 'type'])
      for (const row of entry[group]) {
        const label = `${name}.${row.name.replace(/\(.*$/su, '')}`;
        add(row.type, label);
        // A method's name is its signature: its parameters name types too.
        if (group === 'methods') add(row.name, label);
        prose(row.description, label);
      }
    // A declaration never links to itself from its own rows' heading.
    elements[name] = refs;
  }

  // Cards, followed through every project type a declaration names.
  while (pending.length) {
    const { id, symbol, declaration, via } = pending.shift();
    const refs = {};
    const visit = (node) => {
      if (ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)) {
        const name = ts.isTypeReferenceNode(node) ? node.typeName : node.expression;
        const referenced = checker.getSymbolAtLocation(
          ts.isQualifiedName(name) ? name.right : name,
        );
        const ref = referenced && reach(referenced, `${symbol.name} (from ${via})`);
        if (ref) refs[(ts.isQualifiedName(name) ? name.right : name).getText()] = ref;
      }
      ts.forEachChild(node, visit);
    };
    const platform = platformFile(declaration.getSourceFile());
    const members = declaration.members?.length ?? 0;
    const header = (keyword) => {
      const heritage = (declaration.heritageClauses ?? [])
        .map((clause) => clause.getText())
        .join(' ');
      const parameters = declaration.typeParameters
        ? `<${declaration.typeParameters.map((parameter) => parameter.getText()).join(', ')}>`
        : '';
      return `${keyword} ${symbol.name}${parameters}${heritage ? ` ${heritage}` : ''}`;
    };
    let text;
    if (platform && (ts.isClassDeclaration(declaration) || members > PLATFORM_MEMBERS)) {
      // A large built-in type (`HTMLElement`): its header, its doc comment says the rest.
      text = `${header(ts.isClassDeclaration(declaration) ? 'class' : 'interface')} { … }`;
      for (const clause of declaration.heritageClauses ?? []) visit(clause);
    } else if (ts.isClassDeclaration(declaration)) {
      // A class used as a type: its header, not its body (its page lists its members).
      text = header('class');
      // Its bases link only when a developer can import them; internal bases stay plain names.
      for (const clause of declaration.heritageClauses ?? [])
        for (const type of clause.types) {
          const base = target(checker.getSymbolAtLocation(type.expression));
          const baseDeclaration = declarationOf(base);
          if (!baseDeclaration || !projectFile(baseDeclaration.getSourceFile())) continue;
          if (importFrom.has(idOf(base, baseDeclaration))) visit(type);
        }
    } else {
      text = printer
        .printNode(ts.EmitHint.Unspecified, declaration, declaration.getSourceFile())
        .replace(/^(?: {4})+/gmu, (indent) => '  '.repeat(indent.length / 4))
        .replace(/^export\s+(?:declare\s+)?/u, '')
        .trim();
      visit(declaration);
    }
    const documentation = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
    // The types its doc comment writes as code spans open their cards too.
    Object.assign(
      refs,
      namesIn('', declaration, `${symbol.name} (from ${via})`, codeSpans(documentation)),
      refs,
    );
    delete refs[symbol.name];
    const exported = importFrom.get(id);
    symbols[id] = {
      name: symbol.name,
      kind: ts.isInterfaceDeclaration(declaration)
        ? 'interface'
        : ts.isTypeAliasDeclaration(declaration)
          ? 'type'
          : ts.isEnumDeclaration(declaration)
            ? 'enum'
            : 'class',
      declaration: text,
      documentation,
      ...(exported ? { importFrom: exported.from } : {}),
      ...(platform ? { platform: true } : {}),
      refs,
    };
    // The platform's types are documented by the platform; only the package's are checked.
    if (platform) continue;
    const file = id.split('#')[0];
    if (!exported)
      problems.add(
        `${symbol.name} (${file}) is not exported from the package; reached from ${via}`,
      );
    if (!documentation)
      problems.add(`${symbol.name} (${file}) has no doc comment; reached from ${via}`);
  }
  // Every card by its name, when no other card shares it: renderers link any code naming it.
  const byName = new Map();
  for (const [id, symbol] of Object.entries(symbols))
    byName.set(symbol.name, byName.has(symbol.name) ? null : id);
  const names = Object.fromEntries([...byName].filter(([, id]) => id).sort());
  return { types: { elements, symbols, names }, problems: [...problems].sort() };
}
