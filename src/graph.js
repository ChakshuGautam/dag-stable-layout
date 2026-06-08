// Core DAG model.
//
// A graph is built from a flat list of node specs `{ id (or name), deps: [...] }`.
// We keep the node objects (so extra fields like `label`/`kind` survive) but normalise
// `id` and `deps`, and derive a de-duplicated edge list. Edges to unknown ids are dropped.

/**
 * @typedef {{ id: string, deps: string[], [k: string]: any }} Node
 * @typedef {{ source: string, target: string, [k: string]: any }} Edge
 * @typedef {{ nodes: Node[], edges: Edge[], byId: Map<string, Node> }} Graph
 */

/** Build a {@link Graph} from `[{ id|name, deps }]` specs. */
export function buildGraph(specs) {
  if (!Array.isArray(specs)) throw new TypeError('buildGraph(specs): specs must be an array');
  const nodes = specs.map((s) => {
    const id = s.id ?? s.name;
    if (id == null) throw new Error('every node needs an `id` (or `name`)');
    return { ...s, id: String(id), deps: (s.deps || []).map(String) };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];
  const seen = new Set();
  for (const n of nodes) {
    for (const d of n.deps) {
      if (!byId.has(d)) continue; // edge to an unknown node — drop it
      const key = d + '>' + n.id;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: d, target: n.id });
    }
  }
  return { nodes, edges, byId };
}

/** out/in adjacency maps keyed by node id. */
export function adjacency(graph) {
  const out = new Map(graph.nodes.map((n) => [n.id, []]));
  const inn = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) {
    if (out.has(e.source)) out.get(e.source).push(e.target);
    if (inn.has(e.target)) inn.get(e.target).push(e.source);
  }
  return { out, inn };
}

/**
 * Longest-path topological rank (a.k.a. layer) of every node, via Kahn's algorithm.
 * Sources are rank 0; each node sits one past its deepest predecessor.
 * @returns {Map<string, number>}
 * @throws if the graph contains a cycle.
 */
export function topoRank(graph) {
  const { out, inn } = adjacency(graph);
  const indeg = new Map(graph.nodes.map((n) => [n.id, inn.get(n.id).length]));
  const rank = new Map();
  const queue = [];
  for (const n of graph.nodes) {
    if (indeg.get(n.id) === 0) { rank.set(n.id, 0); queue.push(n.id); }
  }
  let processed = 0;
  while (queue.length) {
    const u = queue.shift();
    processed++;
    for (const v of out.get(u)) {
      rank.set(v, Math.max(rank.get(v) ?? 0, (rank.get(u) ?? 0) + 1));
      indeg.set(v, indeg.get(v) - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }
  if (processed < graph.nodes.length) throw new Error('graph has a cycle; a DAG is required');
  return rank;
}

/** Number of (transitive) descendants reachable from `id`. */
export function descendantCount(graph, id) {
  const { out } = adjacency(graph);
  const seen = new Set();
  const stack = [...(out.get(id) || [])];
  while (stack.length) {
    const x = stack.pop();
    if (seen.has(x)) continue;
    seen.add(x);
    for (const y of out.get(x) || []) stack.push(y);
  }
  return seen.size;
}
