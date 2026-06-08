// Pixel-parity harness: run the original algorithm (oracle) and this library side-by-side over
// every (graph × strategy × expand-set), using the SAME dagre engine, and report the worst
// per-node coordinate delta. Zero delta ⇒ the library is pixel-perfect against the original.
//
//   node parity/run.mjs

import dagre from 'dagre';
import { createOracle } from './oracle.js';
import { GRAPHS, groupOf, groupsOf } from './graphs.js';
import { buildGraph, stableLayout } from '../src/index.js';
import { makeDagreLayout } from '../src/adapters/dagre.js';

const oracle = createOracle(dagre);
const layout = makeDagreLayout(dagre);

// oracle strategy name <-> library strategy name
const STRAT = [
  { o: 'baseline', l: 'baseline' },
  { o: 'inflate', l: 'inflate' },
  { o: 'E', l: 'skeleton' },
];

// oracle keys group nodes as `sample#N`; library keys them as `group::N`. Normalise to compare.
const norm = (id) => id.replace(/^group::/, 'sample#');

function subsets(items) {
  const out = [];
  for (let m = 0; m < (1 << items.length); m++) out.push(items.filter((_, i) => m & (1 << i)));
  return out;
}

function compare(oPos, lPos) {
  const oByNorm = Object.fromEntries(Object.entries(oPos).map(([k, v]) => [norm(k), v]));
  const lByNorm = Object.fromEntries(Object.entries(lPos).map(([k, v]) => [norm(k), v]));
  const ids = new Set([...Object.keys(oByNorm), ...Object.keys(lByNorm)]);
  let worst = 0, who = null, onlyO = [], onlyL = [];
  for (const id of ids) {
    const a = oByNorm[id], b = lByNorm[id];
    if (!a) { onlyL.push(id); continue; }
    if (!b) { onlyO.push(id); continue; }
    const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    if (d > worst) { worst = d; who = id; }
  }
  return { worst, who, onlyO, onlyL };
}

let globalWorst = 0, totalChecks = 0, mismatches = 0;
const rows = [];

for (const [gname, specs] of Object.entries(GRAPHS)) {
  oracle.setTopology(specs);
  const graph = buildGraph(specs);
  const groups = groupsOf(specs);
  const scenes = subsets(groups);

  for (const { o, l } of STRAT) {
    let worst = 0, who = null, scene = null, mm = 0;
    for (const sc of scenes) {
      const oView = oracle.viewFor(o, new Set(sc.map((s) => 'sample#' + s)));
      const lView = stableLayout(graph, { groupOf, expanded: new Set(sc), strategy: l, layout });
      const r = compare(oView.pos, lView.pos);
      totalChecks++;
      if (r.onlyO.length || r.onlyL.length) {
        mm++; mismatches++;
        console.log(`  [${gname}/${l}] {${sc.join(',') || '∅'}} NODE-SET MISMATCH onlyOracle=${r.onlyO} onlyLib=${r.onlyL}`);
      }
      if (r.worst > worst) { worst = r.worst; who = r.who; scene = sc.join(',') || '∅'; }
    }
    globalWorst = Math.max(globalWorst, worst);
    rows.push({ key: `${gname}  ${o}/${l}`, worst, who, scene, mm });
  }
}

console.log('\nPixel-parity: oracle vs library (same dagre) — worst per-node delta\n');
console.log('graph  strategy           worst Δ(px)   worst node @ scenario');
console.log('---------------------     ----------    ---------------------');
for (const r of rows) {
  const flag = r.mm ? '  ⚠ NODE-SET MISMATCH' : '';
  console.log(`${r.key.padEnd(24)}  ${r.worst.toExponential(2).padEnd(11)}   ${r.who} @ {${r.scene}}${flag}`);
}

const EPS = 1e-6;
console.log(`\nchecked ${totalChecks} (graph × strategy × expand-set) combinations; node-set mismatches: ${mismatches}`);
console.log(`global worst delta = ${globalWorst}`);
if (globalWorst < EPS && mismatches === 0) {
  console.log('✅ PIXEL-PERFECT — every node matches the original within ' + EPS + 'px, across all graphs');
  process.exit(0);
} else {
  console.log('❌ NOT pixel-perfect — largest divergence ' + globalWorst.toFixed(3) + 'px');
  process.exit(1);
}
