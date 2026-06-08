import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGraph, topoRank, descendantCount, adjacency,
  effectiveGraph, membersOf, groupList, groupTag,
} from '../src/index.js';
import { dcfSpecs, groupOf } from '../examples/dcf-graph.js';

test('buildGraph normalises ids/deps and derives unique edges', () => {
  const g = buildGraph([
    { name: 'a', deps: [] },
    { id: 'b', deps: ['a', 'a', 'ghost'] }, // dup + unknown dep
  ]);
  assert.equal(g.nodes.length, 2);
  assert.equal(g.byId.get('b').deps.length, 3);     // deps preserved verbatim
  assert.deepEqual(g.edges, [{ source: 'a', target: 'b' }]); // dedup + ghost dropped
});

test('topoRank is longest-path and detects cycles', () => {
  const g = buildGraph([
    { id: 'a', deps: [] },
    { id: 'b', deps: ['a'] },
    { id: 'c', deps: ['a', 'b'] }, // longest path a->b->c = rank 2
  ]);
  const r = topoRank(g);
  assert.equal(r.get('a'), 0);
  assert.equal(r.get('b'), 1);
  assert.equal(r.get('c'), 2);

  const cyclic = buildGraph([{ id: 'x', deps: ['y'] }, { id: 'y', deps: ['x'] }]);
  assert.throws(() => topoRank(cyclic), /cycle/);
});

test('descendantCount counts transitive reach', () => {
  const g = buildGraph([
    { id: 'a', deps: [] }, { id: 'b', deps: ['a'] }, { id: 'c', deps: ['b'] },
  ]);
  assert.equal(descendantCount(g, 'a'), 2);
  assert.equal(descendantCount(g, 'c'), 0);
});

test('effectiveGraph folds collapsed groups into one node each', () => {
  const g = buildGraph(dcfSpecs());
  const collapsed = effectiveGraph(g, { groupOf, expanded: new Set() });
  // 3 sample groups collapse to 3 group nodes; ungrouped nodes stay.
  const ungrouped = g.nodes.filter((n) => groupOf(n.id) == null).length;
  assert.equal(collapsed.nodes.length, ungrouped + 3);
  const groupNode = collapsed.byId.get(groupTag('1'));
  assert.ok(groupNode);
  assert.equal(groupNode.members.length, membersOf(g, groupOf, '1').length);

  // Expanding #1 restores its 6 members as individual nodes.
  const one = effectiveGraph(g, { groupOf, expanded: new Set(['1']) });
  assert.equal(one.nodes.length, ungrouped + 2 /* still-collapsed groups */ + 6 /* members */);
});

test('groupList returns sorted distinct groups', () => {
  const g = buildGraph(dcfSpecs());
  assert.deepEqual(groupList(g, groupOf), ['1', '2', '3']);
});

test('adjacency reflects edges in both directions', () => {
  const g = buildGraph([{ id: 'a', deps: [] }, { id: 'b', deps: ['a'] }]);
  const { out, inn } = adjacency(g);
  assert.deepEqual(out.get('a'), ['b']);
  assert.deepEqual(inn.get('b'), ['a']);
});
