// A small layered (Sugiyama-lite) layout for left-to-right DAGs.
//
// Zero dependencies. Positions are node *centres* `{ cx, cy }` (matching the conventions of
// the playground this was distilled from). Quality is intentionally modest — ranks by
// longest path, a few barycenter sweeps to reduce crossings, even spacing within a rank.
// If you want production-grade coordinate assignment, pass your own `layout` function (e.g.
// a dagre wrapper) to the strategies; the algorithms here only assume `{ id: {cx, cy} }`.

import { topoRank, adjacency } from './graph.js';

export const DEFAULTS = Object.freeze({
  nodeWidth: 112,
  nodeHeight: 40,
  rankGap: 62,   // horizontal gap between ranks
  nodeSep: 22,   // vertical gap between nodes in a rank
  sweeps: 4,     // barycenter ordering passes
});

function rankGet(rank, id) {
  return (rank instanceof Map ? rank.get(id) : rank[id]) ?? 0;
}

// Reduce edge crossings by repeatedly reordering each rank toward the average position
// of its neighbours in the adjacent rank. Deterministic; ties keep current order.
function barycenterSweep(graph, ranks, order, passes) {
  const { out, inn } = adjacency(graph);
  for (let p = 0; p < passes; p++) {
    const forward = p % 2 === 0;
    const seq = forward ? ranks : [...ranks].reverse();
    const idx = new Map();
    order.forEach((arr) => arr.forEach((id, i) => idx.set(id, i)));
    for (const r of seq) {
      const ids = order.get(r);
      const neigh = forward ? inn : out;
      const bary = new Map();
      ids.forEach((id, i) => {
        const ns = neigh.get(id) || [];
        const vals = ns.map((n) => idx.get(n)).filter((v) => v != null);
        bary.set(id, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : i);
      });
      const sorted = ids.slice().sort((a, b) => (bary.get(a) - bary.get(b)) || (idx.get(a) - idx.get(b)));
      order.set(r, sorted);
      sorted.forEach((id, i) => idx.set(id, i));
    }
  }
  return order;
}

/**
 * Layered LR layout. Returns `{ [id]: { cx, cy } }`.
 * @param {import('./graph.js').Graph} graph
 * @param {Partial<typeof DEFAULTS> & { rank?: Map|object, heightOf?: (node)=>number }} [opts]
 */
export function layeredLayout(graph, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const rank = opts.rank || topoRank(graph);
  const heightOf = opts.heightOf || (() => o.nodeHeight);

  const byRank = new Map();
  for (const n of graph.nodes) {
    const r = rankGet(rank, n.id);
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(n.id);
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  const order = barycenterSweep(graph, ranks, new Map(ranks.map((r) => [r, byRank.get(r).slice()])), o.sweeps);

  const pos = {};
  for (const r of ranks) {
    const ids = order.get(r);
    let total = -o.nodeSep;
    for (const id of ids) total += heightOf(graph.byId.get(id)) + o.nodeSep;
    const cx = r * (o.nodeWidth + o.rankGap);
    let y = -total / 2;
    for (const id of ids) {
      const h = heightOf(graph.byId.get(id));
      pos[id] = { cx, cy: y + h / 2 };
      y += h + o.nodeSep;
    }
  }
  return pos;
}

/** Axis-aligned bounding box of a `{ id: {cx,cy} }` position map. */
export function bbox(pos, { nodeWidth = DEFAULTS.nodeWidth, nodeHeight = DEFAULTS.nodeHeight } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of Object.values(pos)) {
    x0 = Math.min(x0, p.cx - nodeWidth / 2);
    y0 = Math.min(y0, p.cy - nodeHeight / 2);
    x1 = Math.max(x1, p.cx + nodeWidth / 2);
    y1 = Math.max(y1, p.cy + nodeHeight / 2);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
