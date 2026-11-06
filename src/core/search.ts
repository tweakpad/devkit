/** Authored search identity of one complete control, independent of its rendered contents. */
export interface SearchMetadata {
  readonly name: string;
  readonly label: string;
}

/** The owner of an atomic control's visibility, including every part of a composed control. */
export interface SearchTarget {
  readonly hidden: boolean;
  readonly disposed: boolean;
  setFiltered(filtered: boolean): void;
}

export interface SearchControlNode {
  readonly kind: 'control';
  readonly metadata: SearchMetadata;
  readonly target: SearchTarget;
}

/** Root panes and tab navigation recurse without changing their own visibility or selection. */
export interface SearchScopeNode {
  readonly kind: 'scope';
  readonly children: Iterable<SearchNode>;
}

/** A structural group is visible only when its independently searchable children warrant it. */
export interface SearchGroupNode {
  readonly kind: 'group';
  readonly children: Iterable<SearchNode>;
  readonly hideWhenEmpty: 'always' | 'searching';
  readonly setFiltered: (filtered: boolean) => void;
}

export type SearchNode = SearchControlNode | SearchScopeNode | SearchGroupNode;

/**
 * Applies one query to the logical ownership tree. A control is one result even when composed
 * of several editors, labels or visualizations. Groups count eligible controls, never DOM nodes.
 */
export function filterSearchTree(root: SearchNode, query: string): number {
  const normalized = query.trim().toLocaleLowerCase();

  function visit(node: SearchNode): number {
    if (node.kind === 'control') {
      if (node.target.disposed) return 0;
      const matches = [node.metadata.name, node.metadata.label].some((term) =>
        term.toLocaleLowerCase().includes(normalized),
      );
      node.target.setFiltered(!matches);
      return matches && !node.target.hidden ? 1 : 0;
    }

    let matches = 0;
    for (const child of node.children) matches += visit(child);
    if (node.kind === 'group')
      node.setFiltered(matches === 0 && (node.hideWhenEmpty === 'always' || normalized !== ''));
    return matches;
  }

  return visit(root);
}
