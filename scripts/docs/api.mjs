// The API Reference of devkit's documentation pages, generated from the package's TypeScript
// sources: one entry per exported declaration a page lists in its `api` field. As in
// @tweakpad/ui, the reference is never written by hand: every row comes from a declaration and
// its JSDoc, and an undescribed row fails the documentation build.
//
// Groups, in @tweakpad/ui's order:
// - Options: the members of an interface or object type (`PaneOptions`, `BindingParams`).
// - Properties: the public fields and accessors of a class (`BindingApi.value`).
// - Events: the event names its `on(type, listener)` method accepts, each described by an
//   `@event name - description` tag on that method.
// - Methods: its public methods, the constructor first when it is public API.
// - Type: a type alias that is not an object type (`PaneAnchor`), with its definition.
// Members tagged `@internal`, private and protected members, and `#private` fields are left out.
import ts from 'typescript';

/**
 * @typedef {object} ApiRow
 * @property {string} name
 * @property {string} [type]
 * @property {string} [default]
 * @property {string} description
 * @property {boolean} [optional]
 * @property {boolean} [readonly]
 */
/**
 * @typedef {object} ApiEntry
 * @property {string} name The exported name.
 * @property {'class' | 'interface' | 'type'} kind
 * @property {string} description
 * @property {ApiRow[]} options
 * @property {ApiRow[]} properties
 * @property {ApiRow[]} events
 * @property {ApiRow[]} methods
 * @property {ApiRow[]} type
 */

/** Reads the exported declarations of `entry` (the package's `src/index.ts`). */
export function createApiReader(entry, tsconfig) {
  const config = ts.getParsedCommandLineOfConfigFile(
    tsconfig,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    },
  );
  const program = ts.createProgram([entry], { ...config.options, noEmit: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  if (!source) throw new Error(`cannot read ${entry}`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  /** @type {Map<string, ts.Symbol>} */
  const exports = new Map(
    checker.getExportsOfModule(moduleSymbol).map((symbol) => [symbol.getName(), symbol]),
  );

  const resolve = (symbol) =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const docs = (symbol) => ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  const tags = (symbol) => symbol.getJsDocTags(checker);
  const tagText = (tag) => ts.displayPartsToString(tag.text ?? []).trim();
  const isInternal = (symbol) => tags(symbol).some((tag) => tag.name === 'internal');
  const declaredDefault = (symbol) => {
    const tag = tags(symbol).find((entry) => entry.name === 'default');
    return tag ? tagText(tag) : undefined;
  };
  /** The written type of a member when it has one, so aliases stay readable. */
  const typeText = (symbol, declaration) => {
    if (declaration && 'type' in declaration && declaration.type)
      return declaration.type.getText().replace(/\s+/g, ' ');
    return checker.typeToString(
      checker.getTypeOfSymbolAtLocation(symbol, declaration ?? source),
      undefined,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
    );
  };
  const hidden = (declaration) => {
    if (!declaration) return false;
    if (declaration.name && ts.isPrivateIdentifier(declaration.name)) return true;
    const flags = ts.getCombinedModifierFlags(declaration);
    return Boolean(flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected));
  };
  const signatureText = (name, declaration) => {
    const parameters = declaration.parameters
      .map((parameter) => {
        const optional = parameter.questionToken || parameter.initializer ? '?' : '';
        const rest = parameter.dotDotDotToken ? '...' : '';
        const type = parameter.type
          ? parameter.type.getText()
          : checker.typeToString(checker.getTypeAtLocation(parameter));
        return `${rest}${parameter.name.getText()}${optional}: ${type}`.replace(/\s+/g, ' ');
      })
      .join(', ');
    const generics = declaration.typeParameters
      ? `<${declaration.typeParameters.map((parameter) => parameter.getText()).join(', ')}>`
      : '';
    return `${name}${generics}(${parameters})`;
  };
  const returnText = (declaration) => {
    if (declaration.type) return declaration.type.getText().replace(/\s+/g, ' ');
    const signature = checker.getSignatureFromDeclaration(declaration);
    return signature ? checker.typeToString(checker.getReturnTypeOfSignature(signature)) : 'void';
  };

  /** @returns {ApiEntry} */
  function read(name) {
    const exported = exports.get(name);
    if (!exported) throw new Error(`${name} is not exported from the package`);
    const symbol = resolve(exported);
    const declaration = symbol.declarations?.[0];
    /** @type {ApiEntry} */
    const entry = {
      name,
      kind: 'type',
      description: docs(symbol),
      options: [],
      properties: [],
      events: [],
      methods: [],
      type: [],
    };
    if (symbol.flags & ts.SymbolFlags.Class) {
      entry.kind = 'class';
      const instance = checker.getDeclaredTypeOfSymbol(symbol);
      // A constructor is public API only when it is documented: the handles the pane returns
      // (`BindingApi`, `HistoryApi`) are never constructed by an application.
      const constructor = declaration?.members?.find(
        (member) => ts.isConstructorDeclaration(member) && member.body,
      );
      const constructorDocs = constructor
        ? ts
            .getJSDocCommentsAndTags(constructor)
            .filter(ts.isJSDoc)
            .map((doc) => ts.getTextOfJSDocComment(doc.comment) ?? '')
            .join('\n')
            .trim()
        : '';
      if (constructor && constructorDocs && !hidden(constructor))
        entry.methods.push({
          name: signatureText(`new ${name}`, constructor),
          type: name,
          description: constructorDocs,
        });
      for (const member of checker.getPropertiesOfType(instance)) {
        const memberDeclaration = member.declarations?.[0];
        if (hidden(memberDeclaration) || isInternal(member)) continue;
        if (member.flags & ts.SymbolFlags.Method) {
          const signatures = (member.declarations ?? []).filter(
            (candidate) => ts.isMethodDeclaration(candidate) || ts.isMethodSignature(candidate),
          );
          // Overloads document themselves; the implementation signature is not callable.
          const callable = signatures.length > 1 ? signatures.filter((s) => !s.body) : signatures;
          if (member.getName() === 'on') entry.events.push(...eventsOf(member, callable));
          for (const signature of callable)
            entry.methods.push({
              name: signatureText(member.getName(), signature),
              type: returnText(signature),
              description: docs(member),
            });
          continue;
        }
        const accessor = member.flags & ts.SymbolFlags.Accessor;
        const readonly =
          (accessor && !(member.flags & ts.SymbolFlags.SetAccessor)) ||
          Boolean(
            memberDeclaration &&
            ts.getCombinedModifierFlags(memberDeclaration) & ts.ModifierFlags.Readonly,
          );
        entry.properties.push(
          withoutUndefined({
            name: member.getName(),
            type: typeText(member, memberDeclaration),
            default: declaredDefault(member),
            description: docs(member),
            readonly: readonly || undefined,
          }),
        );
      }
      return entry;
    }
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    // Arrays, tuples and function types are definitions to show, not members to list.
    const isObject = (candidate) => {
      if (candidate.isUnionOrIntersection()) return candidate.types.every(isObject);
      if (!(candidate.flags & ts.TypeFlags.Object)) return false;
      if (checker.isArrayType(candidate) || checker.isTupleType(candidate)) return false;
      return !(candidate.getCallSignatures().length && !candidate.getProperties().length);
    };
    const objectLike = symbol.flags & ts.SymbolFlags.Interface || isObject(type);
    if (!objectLike) {
      entry.type.push({
        name,
        type:
          declaration && 'type' in declaration
            ? declaration.type
                .getText()
                .replace(/\s+/g, ' ')
                .replace(/^\|\s*/, '')
            : '',
        description: entry.description,
      });
      return entry;
    }
    entry.kind = symbol.flags & ts.SymbolFlags.Interface ? 'interface' : 'type';
    // A union of object types (`TabsParams`) lists every member any of its forms accepts.
    const members = type.isUnion()
      ? checker.getAllPossiblePropertiesOfTypes(type.types)
      : checker.getPropertiesOfType(type);
    for (const member of members) {
      const memberDeclaration = member.declarations?.[0];
      if (isInternal(member)) continue;
      const written = [
        ...new Set((member.declarations ?? []).map((candidate) => typeText(member, candidate))),
      ].join(' | ');
      entry.options.push(
        withoutUndefined({
          name: member.getName(),
          type: written || typeText(member, memberDeclaration),
          default: declaredDefault(member),
          description: docs(member),
          optional: Boolean(member.flags & ts.SymbolFlags.Optional) || undefined,
        }),
      );
    }
    return entry;
  }

  /** One row per event name an `on(type, …)` overload accepts, described by `@event` tags. */
  function eventsOf(member, signatures) {
    /** @type {Map<string, string>} */
    const described = new Map();
    for (const tag of tags(member)) {
      if (tag.name !== 'event') continue;
      const match = /^([\w-]+)\s+-\s+([\s\S]+)$/.exec(tagText(tag));
      if (match) described.set(match[1], match[2].trim());
    }
    /** @type {ApiRow[]} */
    const rows = [];
    for (const signature of signatures) {
      const [typeParameter, listener] = signature.parameters;
      const typeNode = typeParameter?.type;
      if (!typeNode) continue;
      const names = ts.isUnionTypeNode(typeNode) ? typeNode.types : [typeNode];
      for (const literal of names) {
        if (!ts.isLiteralTypeNode(literal) || !ts.isStringLiteral(literal.literal)) continue;
        const name = literal.literal.text;
        if (rows.some((row) => row.name === name)) continue;
        rows.push({
          name,
          type: listener?.type?.getText().replace(/\s+/g, ' ') ?? '',
          description: described.get(name) ?? '',
        });
      }
    }
    return rows;
  }

  return { read, exported: () => [...exports.keys()] };
}

function withoutUndefined(row) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

/** Rows of an entry that have no description, as `Entry.member` names. */
export function undescribed(entry) {
  const missing = [];
  if (!entry.description) missing.push(entry.name);
  for (const group of ['options', 'properties', 'events', 'methods'])
    for (const row of entry[group])
      if (!row.description) missing.push(`${entry.name}.${row.name.replace(/\(.*$/, '')}`);
  return [...new Set(missing)];
}
