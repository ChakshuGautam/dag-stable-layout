import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGraph, stableLayout, compareStrategies, measureDrift, groupTag,
} from '../src/index.js';
import { dcfSpecs, groupOf, isDownstream } from '../examples/dcf-graph.js';

const graph = buildGraph(dcfSpecs());

test('every strategy positions every visible node', () => {
  for (const strategy of ['baseline', 'inflate', 'skeleton']) {
    const { pos, graph: eff } = stableLayout(graph, { groupOf, expanded: new Set(['1']), strategy });
    for (const n of eff.nodes) {
      assert.ok(pos[n.id], `${strategy} missing position for ${n.id}`);
      assert.equal(typeof pos[n.id].cx, 'number');
      assert.equal(typeof pos[n.id].cy, 'number');
    }
  }
});

test('skeleton holds siblings perfectly still; baseline does not', () => {
  const scores = compareStrategies(graph, { groupOf, group: '1', downstream: isDownstream });

  // The headline guarantee: expanding one scenario moves no sibling/upstream node.
  assert.equal(scores.skeleton.sibling, 0, 'skeleton sibling drift must be 0');

  // The baseline re-layout reshuffles unrelated nodes.
  assert.ok(scores.baseline.sibling > 0, 'baseline should drift siblings');

  // inflate intentionally parts neighbours to make room.
  assert.ok(scores.inflate.sibling > 0, 'inflate moves neighbours by design');
});

test('skeleton keeps sibling GROUP nodes pinned across a toggle', () => {
  const cold = stableLayout(graph, { groupOf, expanded: new Set(), strategy: 'skeleton' });
  const warm = stableLayout(graph, { groupOf, expanded: new Set(['1']), strategy: 'skeleton' });
  for (const s of ['2', '3']) {
    const a = cold.pos[groupTag(s)];
    const b = warm.pos[groupTag(s)];
    assert.deepEqual(b, a, `group ${s} should not move`);
  }
});

test('measureDrift separates sibling from downstream movement', () => {
  const before = { a: { cx: 0, cy: 0 }, down: { cx: 0, cy: 0 } };
  const after = { a: { cx: 0, cy: 0 }, down: { cx: 50, cy: 0 } };
  const d = measureDrift(before, after, { downstream: (id) => id === 'down' });
  assert.equal(d.sibling, 0);
  assert.equal(d.downstream, 50);
  assert.equal(d.max, 50);
});

test('measureDrift ignores the toggled group and its members', () => {
  const before = { 'x#1': { cx: 0, cy: 0 }, other: { cx: 0, cy: 0 } };
  const after = { 'x#1': { cx: 99, cy: 99 }, other: { cx: 0, cy: 0 } };
  const d = measureDrift(before, after, { toggledGroup: '1', groupOf });
  assert.equal(d.max, 0, 'movement of the toggled group itself is not drift');
});
