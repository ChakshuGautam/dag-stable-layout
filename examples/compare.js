// Run: `node examples/compare.js`
// Builds the DCF run-658 DAG and prints the sibling/downstream drift each strategy produces
// when scenario #1 is expanded.

import { buildGraph, compareStrategies } from '../src/index.js';
import { dcfSpecs, groupOf, isDownstream } from './dcf-graph.js';

const graph = buildGraph(dcfSpecs());

const scores = compareStrategies(graph, { groupOf, group: '1', downstream: isDownstream });

console.log('Expand scenario #1 — drift of every OTHER node:\n');
console.log('strategy   sibling drift   downstream drift');
console.log('--------   -------------   ----------------');
for (const [name, d] of Object.entries(scores)) {
  const sib = d.sibling === 0 ? '0px (frozen)' : `${d.sibling}px`;
  const down = d.downstream === 0 ? '0px' : `${d.downstream}px →`;
  console.log(`${name.padEnd(10)} ${sib.padEnd(15)} ${down}`);
}
console.log('\nLower sibling drift = more stable. `skeleton` keeps siblings at 0px by design.');
