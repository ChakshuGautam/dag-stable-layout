// dag-stable-layout — a small, dependency-free toolkit for laying out collapsible DAGs
// with measurable layout stability. Distilled from the Graph Playground · Layout-Stability Lab.

export { buildGraph, adjacency, topoRank, descendantCount } from './graph.js';
export {
  effectiveGraph, internalGraph, membersOf, groupList,
  GROUP_PREFIX, groupTag, isGroup, groupIdOf,
} from './groups.js';
export { layeredLayout, bbox, DEFAULTS } from './layout.js';
export {
  stableLayout, baselineLayout, inflateLayout, skeletonLayout, STRATEGIES,
} from './strategies.js';
export { measureDrift } from './drift.js';

import { groupList } from './groups.js';
import { stableLayout, STRATEGIES } from './strategies.js';
import { measureDrift } from './drift.js';

/**
 * Score each strategy by the drift it produces when one group is expanded from cold.
 * @param {import('./graph.js').Graph} graph
 * @param {{ groupOf:(id:string)=>string|null, group?:string, strategies?:string[], layoutOpts?:object, layout?:Function, downstream?:(id:string)=>boolean }} opts
 * @returns {{ [strategy:string]: ReturnType<typeof measureDrift> }}
 */
export function compareStrategies(graph, opts = {}) {
  const { groupOf, downstream, layoutOpts, layout } = opts;
  const group = opts.group ?? groupList(graph, groupOf)[0];
  const names = opts.strategies || Object.keys(STRATEGIES);
  const out = {};
  for (const name of names) {
    const cold = stableLayout(graph, { groupOf, expanded: new Set(), strategy: name, layoutOpts, layout });
    const warm = stableLayout(graph, { groupOf, expanded: new Set([group]), strategy: name, layoutOpts, layout });
    out[name] = measureDrift(cold.pos, warm.pos, { toggledGroup: group, groupOf, downstream });
  }
  return out;
}
