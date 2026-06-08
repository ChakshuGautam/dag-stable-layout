// Optional dagre layout adapter.
//
// The library's strategies accept any `layout(graph, opts) -> { id: {cx, cy} }` function. The
// built-in `layeredLayout` is dependency-free but is its own engine; if you need coordinates
// that match a dagre-based tool exactly (e.g. the original Graph Playground), inject this
// adapter instead. `dagre` is a peer dependency — pass the imported module in.
//
//   import dagre from 'dagre';
//   import { makeDagreLayout } from 'dag-stable-layout/adapters/dagre';
//   stableLayout(graph, { groupOf, expanded, strategy: 'skeleton', layout: makeDagreLayout(dagre) });

import { DEFAULTS } from '../layout.js';

export function makeDagreLayout(dagre, config = {}) {
  if (!dagre || !dagre.graphlib) throw new Error('makeDagreLayout(dagre): pass the imported `dagre` module');
  const nodeWidth = config.nodeWidth ?? DEFAULTS.nodeWidth;
  const nodeHeight = config.nodeHeight ?? DEFAULTS.nodeHeight;
  // dagre graph options — defaults match the original playground (LR, nodesep 22, ranksep 62).
  const graphOpts = {
    rankdir: config.rankdir ?? 'LR',
    nodesep: config.nodesep ?? 22,
    ranksep: config.ranksep ?? 62,
    marginx: config.marginx ?? 8,
    marginy: config.marginy ?? 8,
  };

  return function dagreLayout(graph, opts = {}) {
    const heightOf = opts.heightOf;
    const g = new dagre.graphlib.Graph();
    g.setGraph(graphOpts);
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of graph.nodes) {
      g.setNode(n.id, { width: nodeWidth, height: (heightOf && heightOf(n)) || nodeHeight });
    }
    for (const e of graph.edges) g.setEdge(e.source, e.target);
    dagre.layout(g);
    const pos = {};
    for (const n of graph.nodes) { const d = g.node(n.id); pos[n.id] = { cx: d.x, cy: d.y }; }
    return pos;
  };
}

export default makeDagreLayout;
