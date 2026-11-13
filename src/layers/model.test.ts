import { describe, expect, it } from 'vitest';
import {
  declaredIds,
  decodeStructure,
  encodeStructure,
  moved,
  nextLayerId,
  startingStack,
} from './model.js';

describe('layer stack model', () => {
  it('stores a structure as a string and rejects anything else', () => {
    const structure = {
      l: [
        ['moon', 'moon'],
        ['sky', null],
      ] as const,
      d: ['sky'],
      n: 3,
    };
    const text = encodeStructure(structure);
    expect(decodeStructure(text)).toEqual(structure);
    for (const bad of [
      42,
      'not json',
      '{}',
      '{"l":[["a"]],"d":[],"n":1}',
      '{"l":[["a",null],["a",null]],"d":[],"n":1}',
      '{"l":[[1,null]],"d":[],"n":1}',
      '{"l":[],"d":[1],"n":1}',
      '{"l":[],"d":[],"n":1.5}',
    ])
      expect(decodeStructure(bad), String(bad)).toBeUndefined();
    expect(decodeStructure('{"l":[],"d":[],"n":0}')?.n).toBe(1);
  });

  it('starts from the declared layers without a stored structure', () => {
    expect(startingStack(['a', 'b'], undefined, () => true)).toEqual([
      { id: 'a', declared: 0, type: null },
      { id: 'b', declared: 1, type: null },
    ]);
  });

  it('starts from a stored structure: order, added layers, removals and new declarations', () => {
    const stored = {
      l: [
        ['sun-2', 'sun'],
        ['b', null],
        ['gone-1', 'gone'],
        ['stray', null],
      ] as const,
      d: ['a', 'b'],
      n: 3,
    };
    // `a` was declared and removed by the user; `c` is declared since; `gone` is no longer a type.
    expect(startingStack(['a', 'b', 'c'], stored, (type) => type === 'sun')).toEqual([
      { id: 'sun-2', declared: -1, type: 'sun' },
      { id: 'b', declared: 1, type: null },
      { id: 'c', declared: 2, type: null },
    ]);
  });

  it('names declared layers by id or name, uniquely, and added layers by type', () => {
    expect(declaredIds([{ name: 'Sun' }, { name: 'Sun' }, { id: 'x', name: 'Sun' }])).toEqual([
      'Sun',
      'Sun#2',
      'x',
    ]);
    expect(nextLayerId('sun', 1, new Set())).toEqual({ id: 'sun-1', counter: 2 });
    expect(nextLayerId('sun', 1, new Set(['sun-1', 'sun-2']))).toEqual({
      id: 'sun-3',
      counter: 4,
    });
    expect(nextLayerId(null, 7, new Set())).toEqual({ id: 'layer-7', counter: 8 });
  });

  it('moves an item', () => {
    expect(moved(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moved(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });
});
