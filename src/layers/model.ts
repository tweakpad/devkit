// The parts of a layer stack that need no DOM: its stored structure, how a stored structure and
// the declared layers merge into the stack a session starts with, and ids for added layers.

/** One layer of a structure: its id and the type that can re-create it (null when declared only). */
export type StructureEntry = readonly [id: string, type: string | null];

/**
 * A layer stack as the history stores it, as one JSON string: the layers top first, the ids the
 * code declared at the time, and the counter that numbers added layers.
 */
export interface Structure {
  /** The layers, top first. */
  readonly l: readonly StructureEntry[];
  /** Ids of the declared layers when it was stored, so a layer declared since then is new. */
  readonly d: readonly string[];
  /** The next number for an added layer's id. */
  readonly n: number;
}

export function encodeStructure(structure: Structure): string {
  return JSON.stringify({ l: structure.l, d: structure.d, n: structure.n });
}

/** The structure a stored string holds, or undefined when it is not one. */
export function decodeStructure(text: unknown): Structure | undefined {
  if (typeof text !== 'string') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const { l, d, n } = parsed as Record<string, unknown>;
  if (!Array.isArray(l) || !Array.isArray(d) || typeof n !== 'number' || !Number.isInteger(n))
    return undefined;
  const ids = new Set<string>();
  for (const entry of l) {
    if (!Array.isArray(entry) || entry.length !== 2) return undefined;
    const [id, type] = entry as unknown[];
    if (typeof id !== 'string' || ids.has(id)) return undefined;
    if (type !== null && typeof type !== 'string') return undefined;
    ids.add(id);
  }
  if (!d.every((id) => typeof id === 'string')) return undefined;
  return { l: l as StructureEntry[], d: d as string[], n: Math.max(1, n) };
}

/**
 * A layer of the starting stack: a declared one by its index (`type` null), or one re-created
 * from its type (`declared` -1).
 */
export interface StartEntry {
  readonly id: string;
  readonly declared: number;
  readonly type: string | null;
}

/**
 * The stack a session starts with. Without a stored structure it is the declared layers. With
 * one, it is the stored order: declared layers by id, other layers re-created from their type
 * when it still exists, the rest dropped. Declared layers the stored structure never knew are new
 * in the code and go in at their declared position; declared layers it knew but no longer holds
 * were removed, and stay removed.
 */
export function startingStack(
  declared: readonly string[],
  stored: Structure | undefined,
  hasType: (type: string) => boolean,
): StartEntry[] {
  if (!stored) return declared.map((id, index) => ({ id, declared: index, type: null }));
  const declaredIndex = new Map(declared.map((id, index) => [id, index]));
  const stack: StartEntry[] = [];
  for (const [id, type] of stored.l) {
    const index = declaredIndex.get(id);
    if (index !== undefined) stack.push({ id, declared: index, type: null });
    else if (type !== null && hasType(type)) stack.push({ id, declared: -1, type });
  }
  const known = new Set(stored.d);
  declared.forEach((id, index) => {
    if (known.has(id)) return;
    stack.splice(Math.min(index, stack.length), 0, { id, declared: index, type: null });
  });
  return stack;
}

/** Ids of declared layers: `id`, or the name, made unique with `#2`, `#3`… like history paths. */
export function declaredIds(layers: readonly { id?: string; name: string }[]): string[] {
  const taken = new Set<string>();
  return layers.map(({ id, name }) => {
    const base = id ?? name;
    let unique = base;
    for (let n = 2; taken.has(unique); n++) unique = `${base}#${n}`;
    taken.add(unique);
    return unique;
  });
}

/** An id for an added layer, `<type>-<n>` (or `layer-<n>`), never one in `taken`. */
export function nextLayerId(
  type: string | null,
  counter: number,
  taken: ReadonlySet<string>,
): { id: string; counter: number } {
  let n = counter;
  let id = `${type ?? 'layer'}-${n}`;
  while (taken.has(id)) id = `${type ?? 'layer'}-${++n}`;
  return { id, counter: n + 1 };
}

/** `list` with the item at `from` moved to `to`. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
