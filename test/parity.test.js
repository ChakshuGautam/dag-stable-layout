// Pixel-parity regression guard: with dagre injected, this library must reproduce the ORIGINAL
// playground algorithm's node coordinates EXACTLY, for every graph × strategy × expand-set.
// Requires the `dagre` devDependency.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import dagre from 'dagre';
import { createOracle } from '../parity/oracle.js';
import { GRAPHS, groupOf, groupsOf } from '../parity/graphs.js';
import { buildGraph, stableLayout } from '../src/index.js';
import { makeDagreLayout } from '../src/adapters/dagre.js';

const layout = makeDagreLayout(dagre);
const STRAT = [['baseline', 'baseline'], ['inflate', 'inflate'], ['E', 'skeleton']];
const norm = (id) => id.replace(/^group::/, 'sample#');

function subsets(items) {
  const out = [];
  for (let m = 0; m < (1 << items.length); m++) out.push(items.filter((_, i) => m & (1 << i)));
  return out;
}

function worstDelta(oPos, lPos) {
  const o = Object.fromEntries(Object.entries(oPos).map(([k, v]) => [norm(k), v]));
  const l = Object.fromEntries(Object.entries(lPos).map(([k, v]) => [norm(k), v]));
  const ids = new Set([...Object.keys(o), ...Object.keys(l)]);
  let worst = 0, who = null, missing = [];
  for (const id of ids) {
    if (!o[id] || !l[id]) { missing.push(id); continue; }
    const d = Math.hypot(o[id].cx - l[id].cx, o[id].cy - l[id].cy);
    if (d > worst) { worst = d; who = id; }
  }
  return { worst, who, missing };
}

const oracle = createOracle(dagre);

for (const [gname, specs] of Object.entries(GRAPHS)) {
  test(`pixel-perfect parity on "${gname}" graph (all strategies × all expand-sets)`, () => {
    oracle.setTopology(specs);
    const graph = buildGraph(specs);
    const groups = groupsOf(specs);
    for (const [o, l] of STRAT) {
      for (const sc of subsets(groups)) {
        const oView = oracle.viewFor(o, new Set(sc.map((s) => 'sample#' + s)));
        const lView = stableLayout(graph, { groupOf, expanded: new Set(sc), strategy: l, layout });
        const { worst, who, missing } = worstDelta(oView.pos, lView.pos);
        const where = `${gname}/${l} @ {${sc.join(',') || '∅'}}`;
        assert.equal(missing.length, 0, `node-set mismatch in ${where}: ${missing}`);
        assert.ok(worst < 1e-6, `${where}: ${worst.toFixed(4)}px drift at ${who} (must be 0)`);
      }
    }
  });
}
