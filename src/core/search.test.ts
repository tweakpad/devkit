import { describe, expect, it } from 'vitest';
import {
  filterSearchTree,
  type SearchControlNode,
  type SearchGroupNode,
  type SearchNode,
  type SearchTarget,
} from './search.js';

class Target implements SearchTarget {
  hidden = false;
  disposed = false;
  filtered = false;
  setFiltered(filtered: boolean): void {
    this.filtered = filtered;
  }
}

function control(name: string, label = name) {
  const target = new Target();
  const node: SearchControlNode = { kind: 'control', metadata: { name, label }, target };
  return { target, node };
}

function group(children: SearchNode[], hideWhenEmpty: 'always' | 'searching' = 'searching') {
  const state = { filtered: false };
  const node: SearchGroupNode = {
    kind: 'group',
    children,
    hideWhenEmpty,
    setFiltered: (filtered) => {
      state.filtered = filtered;
    },
  };
  return { state, node };
}

describe('search ownership contract', () => {
  it('matches additional authored terms on one atomic mixed composition', () => {
    const field = control('motion', '');
    const node: SearchControlNode = {
      ...field.node,
      metadata: { name: 'motion', label: '', terms: ['Speed', 'Reset'] },
    };
    expect(filterSearchTree(node, 'reset')).toBe(1);
    expect(filterSearchTree(node, 'speed')).toBe(1);
    expect(filterSearchTree(node, 'speed reset')).toBe(0);
  });
  it('matches authored property names and labels, with trimmed case-insensitive queries', () => {
    const { node, target } = control('fieldOfView', 'Focal length');
    expect(filterSearchTree(node, ' FIELDofVIEW ')).toBe(1);
    expect(filterSearchTree(node, 'focal')).toBe(1);
    expect(target.filtered).toBe(false);
    expect(filterSearchTree(node, 'missing')).toBe(0);
    expect(target.filtered).toBe(true);
  });

  it('counts a composed control once and applies one decision to its complete owner', () => {
    const composed = control('position', 'Position X / Y / Z');
    expect(filterSearchTree(composed.node, 'Y')).toBe(1);
    expect(composed.target.filtered).toBe(false);
    expect(filterSearchTree(composed.node, 'scale')).toBe(0);
    expect(composed.target.filtered).toBe(true);
  });

  it('does not create matches by joining separate metadata terms', () => {
    const { node } = control('near', 'Plane');
    expect(filterSearchTree(node, 'near plane')).toBe(0);
  });

  it('keeps explicit hidden state independent and excludes it from group counts', () => {
    const field = control('gain');
    field.target.hidden = true;
    const panel = group([field.node]);
    expect(filterSearchTree(panel.node, 'gain')).toBe(0);
    expect(panel.state.filtered).toBe(true);
    expect(field.target.filtered).toBe(false);
    filterSearchTree(panel.node, '');
    expect(field.target.hidden).toBe(true);
    expect(panel.state.filtered).toBe(false);
  });

  it('propagates eligible counts through nested groups without matching their chrome', () => {
    const field = control('gain');
    const child = group([field.node]);
    const parent = group([child.node]);
    expect(filterSearchTree(parent.node, 'gain')).toBe(1);
    expect([parent.state.filtered, child.state.filtered]).toEqual([false, false]);
    expect(filterSearchTree(parent.node, 'missing')).toBe(0);
    expect([parent.state.filtered, child.state.filtered]).toEqual([true, true]);
  });

  it('keeps root and navigation scopes transparent across every page', () => {
    const first = control('gain');
    const second = control('speed');
    const navigation: SearchNode = { kind: 'scope', children: [first.node, second.node] };
    expect(filterSearchTree(navigation, 'speed')).toBe(1);
    expect(first.target.filtered).toBe(true);
    expect(second.target.filtered).toBe(false);
    expect(filterSearchTree(navigation, 'absent')).toBe(0);
    expect(navigation.kind).toBe('scope');
  });

  it('evaluates unmounted controls using metadata without requiring DOM or viewport state', () => {
    const unmounted = control('color', 'Surface tint');
    expect(filterSearchTree(unmounted.node, 'tint')).toBe(1);
    expect(unmounted.target.filtered).toBe(false);
  });

  it('clears filtering through every nested owner without changing hidden state', () => {
    const field = control('gain');
    const panel = group([field.node]);
    filterSearchTree(panel.node, 'missing');
    expect(filterSearchTree(panel.node, '  ')).toBe(1);
    expect([field.target.filtered, panel.state.filtered, field.target.hidden]).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('excludes disposed controls and accounts for newly registered and removed children', () => {
    const field = control('gain');
    const children = new Set<SearchNode>([field.node]);
    const root: SearchNode = { kind: 'scope', children };
    expect(filterSearchTree(root, 'gain')).toBe(1);
    field.target.disposed = true;
    expect(filterSearchTree(root, 'gain')).toBe(0);
    const added = control('gain');
    children.add(added.node);
    expect(filterSearchTree(root, 'gain')).toBe(1);
    children.delete(added.node);
    expect(filterSearchTree(root, 'gain')).toBe(0);
  });

  it('hides empty layout chunks even when search is cleared', () => {
    const field = control('gain');
    field.target.hidden = true;
    const chunk = group([field.node], 'always');
    expect(filterSearchTree(chunk.node, '')).toBe(0);
    expect(chunk.state.filtered).toBe(true);
  });
});
