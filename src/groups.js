// Collapsible groups.
//
// Many real DAGs contain repeated sub-clusters (the "samples" in the DCF build graph: a
// repeated revenue→expenses→assemble chain per scenario). A *group* is any set of nodes that
// share a group id, decided by a caller-supplied `groupOf(id) -> groupId | null`.
//
// `effectiveGraph` folds every group that is NOT in the `expanded` set into a single group
// node, rewiring edges accordingly. This is what the layout strategies actually lay out.

import { buildGraph } from './graph.js';

export const GROUP_PREFIX = 'group::';
export const groupTag = (g) => GROUP_PREFIX + g;
export const isGroup = (id) => typeof id === 'string' && id.startsWith(GROUP_PREFIX);
export const groupIdOf = (id) => id.slice(GROUP_PREFIX.length);

/** Member node ids belonging to group `g`. */
export function membersOf(graph, groupOf, g) {
  const want = String(g);
  return graph.nodes.filter((n) => {
    const gi = groupOf(n.id);
    return gi != null && String(gi) === want;
  }).map((n) => n.id);
}

/** Sorted list of distinct group ids present in `graph`. */
export function groupList(graph, groupOf) {
  const set = new Set();
  for (const n of graph.nodes) {
    const g = groupOf(n.id);
    if (g != null) set.add(String(g));
  }
  return [...set].sort();
}

/**
 * The displayed graph for a given expand-set: collapsed groups fold to one node each.
 * @param {import('./graph.js').Graph} graph
 * @param {{ groupOf?: (id:string)=>string|null, expanded?: Set<string> }} ctx
 * @returns {import('./graph.js').Graph & { nodes: Array<any> }}
 */
export function effectiveGraph(graph, { groupOf, expanded = new Set() } = {}) {
  if (!groupOf) return graph; // nothing to collapse

  const collapsedId = (id) => {
    const g = groupOf(id);
    return (g != null && !expanded.has(String(g))) ? groupTag(g) : id;
  };

  const present = new Map();
  for (const n of graph.nodes) {
    const c = collapsedId(n.id);
    if (!present.has(c)) {
      present.set(c, isGroup(c)
        ? { id: c, group: groupIdOf(c), members: [] }
        : n);
    }
    if (isGroup(c)) present.get(c).members.push(n.id);
  }

  const eseen = new Set();
  const edges = [];
  for (const e of graph.edges) {
    const u = collapsedId(e.source);
    const v = collapsedId(e.target);
    if (u === v) continue; // collapsed to a self-loop — skip
    const key = u + ' ' + v;
    if (eseen.has(key)) continue;
    eseen.add(key);
    const sg = groupOf(e.source);
    const tg = groupOf(e.target);
    const intra = sg != null && tg != null && String(sg) === String(tg);
    edges.push({ source: u, target: v, intra });
  }

  const nodes = [...present.values()];
  return { nodes, edges, byId: new Map(nodes.map((n) => [n.id, n])) };
}

/** Sub-graph of one group's internal members (edges between members only). */
export function internalGraph(graph, groupOf, g) {
  const memberIds = new Set(membersOf(graph, groupOf, g));
  const specs = graph.nodes
    .filter((n) => memberIds.has(n.id))
    .map((n) => ({ ...n, deps: n.deps.filter((d) => memberIds.has(d)) }));
  return buildGraph(specs);
}
