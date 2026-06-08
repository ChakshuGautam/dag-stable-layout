# dag-stable-layout

A small, **zero-dependency** toolkit for laying out collapsible DAGs — and, crucially, for
keeping the layout *stable* when a node is expanded or collapsed. When you expand one cluster,
the unrelated parts of the graph shouldn't jump around. This library makes that property
measurable and gives you three strategies with different stability/compactness trade-offs.

Distilled from the **Graph Playground · Layout-Stability Lab**
([graph-playground.aisloppy.com](https://graph-playground.aisloppy.com)) into a reusable,
framework-agnostic core with a test suite.

## Why

In an expand/collapse graph view, the natural thing — re-running the layout on every toggle —
makes sibling and upstream nodes drift, which is disorienting. The fix is to lay out the
collapsed graph **once** and slot expanded children into reserved space. This library packages
that idea, plus a drift metric so you can prove it works:

```
Expand scenario #1 of the DCF build DAG — drift of every OTHER node:

strategy   sibling drift   downstream drift
--------   -------------   ----------------
baseline   93px            348px →     full re-layout: everything reshuffles
inflate    166px           166px →     blooms children, parts neighbours by design
skeleton   0px (frozen)    348px →     siblings pinned; only downstream shifts to make room
```

(`node examples/compare.js` reproduces this.)

## Install

```bash
npm install dag-stable-layout      # or: copy src/ — it has no dependencies
```

Requires Node ≥ 18 (ESM). The core is pure JS with no DOM; the optional force-graph component
is browser-only and needs d3 v7.

## Quick start

```js
import { buildGraph, stableLayout, compareStrategies } from 'dag-stable-layout';

// 1. Build a DAG from `{ id, deps }` specs.
const graph = buildGraph([
  { id: 'inputs', deps: [] },
  { id: 'revenue#1', deps: ['inputs'] },
  { id: 'expenses#1', deps: ['inputs', 'revenue#1'] },
  { id: 'revenue#2', deps: ['inputs'] },
  { id: 'expenses#2', deps: ['inputs', 'revenue#2'] },
  { id: 'projections', deps: ['expenses#1', 'expenses#2'] },
]);

// 2. Decide what a "group" is — here, the `#N` scenario suffix.
const groupOf = (id) => (/#(\d+)$/.exec(id)?.[1]) ?? null;

// 3. Lay it out for a given expand-set, with a stability strategy.
const { pos, graph: eff } = stableLayout(graph, {
  groupOf,
  expanded: new Set(['1']),   // scenario #1 open, #2 collapsed to one node
  strategy: 'skeleton',        // 'baseline' | 'inflate' | 'skeleton'
});
// pos === { 'inputs': { cx, cy }, 'revenue#1': {…}, …, 'group::2': {…} }

// 4. Quantify stability.
console.log(compareStrategies(graph, { groupOf }));
```

`pos` maps node id → **centre** coordinates `{ cx, cy }`. Collapsed groups appear as a single
node id `group::<groupId>` (see `groupTag`/`isGroup`).

## The three strategies

| strategy | what it does | sibling drift | use when |
| --- | --- | --- | --- |
| `baseline` | Re-runs the layered layout on the effective graph every time. | high | you don't care about stability, or the graph is tiny |
| `inflate` | Keeps a tight collapsed base; an expanded group blooms its children at the group node's centre and pushes other columns apart. | moderate (by design) | compactness matters more than holding neighbours still |
| `skeleton` | Lays out the collapsed graph **once** with height reserved per group; expanding drops children into their slot and shifts only downstream columns. | **zero** | you want neighbours to stay put (recommended default) |

All three return `{ pos, graph }` and accept the same context object.

## API

Core (pure JS):

- `buildGraph(specs)` → `{ nodes, edges, byId }`. Specs are `{ id|name, deps: [] }`; extra
  fields (e.g. `label`) are preserved. Unknown/duplicate deps are dropped.
- `topoRank(graph)` → `Map<id, number>` longest-path layer; throws on a cycle.
- `descendantCount(graph, id)` / `adjacency(graph)`.
- `effectiveGraph(graph, { groupOf, expanded })` → the displayed graph with collapsed groups
  folded into single nodes.
- `membersOf` / `groupList` / `internalGraph` and the `groupTag` / `isGroup` / `groupIdOf` helpers.
- `layeredLayout(graph, opts)` → `{ id: {cx, cy} }`. A Sugiyama-lite LR layout (longest-path
  ranks + barycenter crossing reduction). `bbox(pos)` for the bounding box.
- `stableLayout(graph, ctx)` and the named `baselineLayout` / `inflateLayout` / `skeletonLayout`.
- `measureDrift(before, after, { toggledGroup, groupOf, downstream })` → `{ max, sibling,
  downstream, … }`. Splits movement of unrelated nodes (sibling) from nodes that legitimately
  shift (downstream).
- `compareStrategies(graph, { groupOf, group?, downstream? })` → per-strategy drift scores.

### Bring your own layout engine

The strategies only assume a function `graph → { id: {cx, cy} }`. Pass `layout` (and
`layoutOpts`) in the context to swap the built-in `layeredLayout` for, say, a dagre wrapper:

```js
stableLayout(graph, { groupOf, expanded, strategy: 'skeleton', layout: myDagreLayout });
```

### Browser force-graph (optional)

A d3-based weighted force graph (nodes sized by score, weighted arrowed edges, zoom/drag/
hover/select) is available as a separate browser-only module:

```js
import { priorityForceGraph } from 'dag-stable-layout/web/priority-force-graph';
const handle = priorityForceGraph(containerEl, tooltipEl, data, { d3, layout: 'rankx', rankOf });
// handle: { reheat(), reset(), destroy(), positions() }
```

## Development

```bash
npm test               # node --test — 11 tests, no dependencies
node examples/compare.js
```

## Credits

The layout-stability strategies, drift metric, and force component are distilled from the
Graph Playground layout-stability lab. This package reorganises that work into a tested,
dependency-free library.

## License

MIT © Chakshu Gautam
