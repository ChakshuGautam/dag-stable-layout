// Three layout strategies for expand/collapse, differing only in how much the *rest* of the
// graph moves when one group is expanded. This stability — "sibling drift" — is the whole
// point: see drift.js and compareStrategies().
//
//   baseline  Full re-layout on every expand. The global-reshuffle reference: everything moves.
//   inflate   Keep a tight collapsed base; an expanded group blooms its children at the group
//             node's centre and pushes other columns apart to make room. Neighbours move by design.
//   skeleton  Lay out the collapsed graph ONCE with height reserved for each group's slot. On
//             expand, the group's children drop into their reserved slot and only downstream
//             columns shift right. Sibling groups do not move at all (0px sibling drift).
//
// Each strategy returns `{ pos: { id: {cx,cy} }, graph: effectiveGraph }`.

import { effectiveGraph, internalGraph, groupList, groupTag, isGroup } from './groups.js';
import { layeredLayout, DEFAULTS, bbox } from './layout.js';

const mergeOpts = (ctx) => ({ ...DEFAULTS, ...(ctx.layoutOpts || {}) });

// Allow callers to swap in a different layout engine (e.g. dagre). Defaults to layeredLayout.
const layoutOf = (ctx) => ctx.layout || layeredLayout;

function spanOf(pos) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, sy = 0, k = 0;
  for (const p of Object.values(pos)) {
    x0 = Math.min(x0, p.cx); x1 = Math.max(x1, p.cx);
    y0 = Math.min(y0, p.cy); y1 = Math.max(y1, p.cy);
    sy += p.cy; k++;
  }
  return { x0, x1, y0, y1, ymid: k ? sy / k : 0, w: x1 - x0, h: y1 - y0 };
}

// ---- baseline: re-layout the effective graph from scratch -------------------
export function baselineLayout(graph, ctx) {
  const eff = effectiveGraph(graph, ctx);
  const pos = layoutOf(ctx)(eff, mergeOpts(ctx));
  return { pos, graph: eff };
}

// ---- skeleton: stable slots, reserved once ----------------------------------
function reservedHeight(graph, ctx, groups, o) {
  const layout = layoutOf(ctx);
  let h = o.nodeHeight;
  for (const g of groups) {
    const sp = layout(internalGraph(graph, ctx.groupOf, g), o);
    if (!Object.keys(sp).length) continue;
    const s = spanOf(sp);
    h = Math.max(h, s.h + o.nodeHeight + 12); // span is centre-to-centre; pad to box height
  }
  return h;
}

export function skeletonLayout(graph, ctx) {
  const o = mergeOpts(ctx);
  const layout = layoutOf(ctx);
  const groupOf = ctx.groupOf;
  const expanded = ctx.expanded || new Set();
  const groups = groupList(graph, groupOf);
  const rh = reservedHeight(graph, ctx, groups, o);

  // Skeleton positions are ALWAYS computed from the fully-collapsed graph — that is what
  // makes them stable. Group slots are given the reserved height so children fit later.
  const skPos = layout(
    effectiveGraph(graph, { groupOf, expanded: new Set() }),
    { ...o, heightOf: (n) => (n && n.group != null ? rh : o.nodeHeight) }
  );

  const sub = {};
  let shift = 0, refX = Infinity;
  for (const g of groups) {
    if (!expanded.has(g)) continue;
    const sp = layout(internalGraph(graph, groupOf, g), o);
    const s = spanOf(sp);
    sub[g] = { sp, x0: s.x0, ymid: s.ymid };
    shift = Math.max(shift, s.w);
    const slot = skPos[groupTag(g)];
    if (slot) refX = Math.min(refX, slot.cx);
  }

  const eff = effectiveGraph(graph, { groupOf, expanded });
  const pos = {};
  for (const n of eff.nodes) {
    if (isGroup(n.id)) { pos[n.id] = { ...skPos[n.id] }; continue; }
    const g = groupOf(n.id);
    if (g != null && expanded.has(String(g))) {
      const d = sub[String(g)];
      const slot = skPos[groupTag(g)];
      const p = d.sp[n.id];
      pos[n.id] = { cx: slot.cx + (p.cx - d.x0), cy: slot.cy + (p.cy - d.ymid) };
    } else {
      const base = skPos[n.id];
      pos[n.id] = { cx: base.cx + (base.cx > refX + 1 ? shift : 0), cy: base.cy };
    }
  }
  return { pos, graph: eff };
}

// ---- inflate: bloom at centre, push columns apart ---------------------------
export function inflateLayout(graph, ctx) {
  const o = mergeOpts(ctx);
  const layout = layoutOf(ctx);
  const groupOf = ctx.groupOf;
  const expanded = ctx.expanded || new Set();
  const groups = groupList(graph, groupOf);
  const base = layout(effectiveGraph(graph, { groupOf, expanded: new Set() }), o);

  const clusters = {};
  for (const g of groups) {
    if (!expanded.has(g)) continue;
    const C = base[groupTag(g)];
    if (!C) continue;
    const sp = layout(internalGraph(graph, groupOf, g), o);
    const s = spanOf(sp);
    const mx = (s.x0 + s.x1) / 2, my = (s.y0 + s.y1) / 2, scale = 0.85;
    const cpos = {};
    for (const id of Object.keys(sp)) {
      cpos[id] = { cx: C.cx + (sp[id].cx - mx) * scale, cy: C.cy + (sp[id].cy - my) * scale };
    }
    clusters[g] = { C, cpos, halfW: s.w * scale / 2 + 18, halfH: s.h * scale / 2 + 16 };
  }

  // Rank-aware displacement: clear other columns horizontally by an expanded group's
  // half-width; same-column nodes are cleared vertically by its half-height.
  const TOL = 28;
  const displaced = (q, excludeG) => {
    let dx = 0, dy = 0;
    for (const g of Object.keys(clusters)) {
      if (g === excludeG) continue;
      const cl = clusters[g];
      const ex = q.cx - cl.C.cx, ey = q.cy - cl.C.cy;
      if (Math.abs(ex) > TOL) dx += Math.sign(ex) * cl.halfW;
      else if (Math.abs(ey) > 1) dy += Math.sign(ey) * cl.halfH;
    }
    return { cx: q.cx + dx, cy: q.cy + dy };
  };

  const eff = effectiveGraph(graph, { groupOf, expanded });
  const pos = {};
  for (const n of eff.nodes) {
    const g = groupOf(n.id);
    if (g != null && expanded.has(String(g)) && clusters[String(g)]) {
      pos[n.id] = displaced(clusters[String(g)].cpos[n.id], String(g));
    } else {
      pos[n.id] = displaced(base[n.id], null);
    }
  }
  return { pos, graph: eff };
}

export const STRATEGIES = { baseline: baselineLayout, inflate: inflateLayout, skeleton: skeletonLayout };

/**
 * Lay out `graph` for the current expand-set using the chosen strategy.
 * @param {import('./graph.js').Graph} graph
 * @param {{ groupOf:(id:string)=>string|null, expanded?:Set<string>, strategy?:'baseline'|'inflate'|'skeleton', layoutOpts?:object, layout?:Function }} ctx
 */
export function stableLayout(graph, ctx = {}) {
  const fn = STRATEGIES[ctx.strategy || 'skeleton'];
  if (!fn) throw new Error('unknown strategy: ' + ctx.strategy);
  return fn(graph, ctx);
}

export { bbox };
