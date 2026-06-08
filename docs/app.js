// Wired to the published `dag-stable-layout` library: the layout strategies and dagre engine
// used below come from the library, not a private copy. Rendering/animation is unchanged.
import { buildGraph, stableLayout } from './lib/index.js';
import { makeDagreLayout } from './lib/adapters/dagre.js';
const dagreLayout = makeDagreLayout(window.dagre);
const STRAT_TO_LIB = { E: 'skeleton', inflate: 'inflate', baseline: 'baseline' };

"use strict";

const NODE_W = 112, NODE_H = 40, STAGE_PAD = 48;
const state = { durMs: 520, bezier: [0.4, 0, 0.2, 1], strategy: 'inflate', graph: 'real', expanded: new Set() };

// One animation loop owns everything. `cur` is the *live* rendered position of every
// node (center + scale + opacity); edges are redrawn from `cur` every frame so they stay
// attached mid-flight. `lastViewPos` is the previous committed layout (graph coords) —
// used to MEASURE sibling drift, the whole point of this lab.
let cur = {};            // id -> {cx, cy, s, o}
let lastEdges = [];      // edge list from the last committed layout
let lastViewPos = {};    // id -> {cx,cy} from the last committed layout (drift baseline)
let generation = 0;      // bumped per transition; a stale rAF/await bails on the bump

// ===== topology: the REAL build DAG ==========================================
// We do NOT hand-simplify the graph. The lab loads an actual run's nodes/deps from the
// API (see loadLiveRun) so it can't drift from production. EMBEDDED is run 658 verbatim —
// every node, every dep — used only if the API is unreachable (e.g. headless QA).
const EMBEDDED = [
  { name: 'load_historical', deps: [] },
  { name: 'net_debt', deps: [] },
  { name: 'cost_structure', deps: ['load_historical'] },
  { name: 'historical_expense_notes', deps: ['load_historical'] },
  { name: 'valuation_method', deps: ['load_historical'] },
  { name: 'historical_changes', deps: ['load_historical'] },
  { name: 'wacc', deps: ['load_historical'] },
  { name: 'inputs', deps: ['load_historical', 'valuation_method', 'net_debt', 'historical_changes', 'wacc'] },
];
[1, 2, 3].forEach((s) => {
  EMBEDDED.push({ name: 'revenue#' + s, deps: ['inputs'] });
  EMBEDDED.push({ name: 'expenses#' + s, deps: ['inputs', 'revenue#' + s, 'cost_structure', 'historical_expense_notes'] });
  EMBEDDED.push({ name: 'capex#' + s, deps: ['inputs'] });
  EMBEDDED.push({ name: 'd_and_a#' + s, deps: ['inputs'] });
  EMBEDDED.push({ name: 'price#' + s, deps: ['inputs'] });
  EMBEDDED.push({ name: 'run_assemble#' + s, deps: ['inputs', 'revenue#' + s, 'expenses#' + s, 'capex#' + s, 'd_and_a#' + s, 'price#' + s] });
});
EMBEDDED.push({ name: 'projections', deps: ['inputs', 'run_assemble#1', 'run_assemble#2', 'run_assemble#3'] });
EMBEDDED.push({ name: 'final-model', deps: ['inputs', 'projections'] });

// ---- alternate graphs to experiment with (the simple one worked; the real one is harder) ----
// FLAT: each sample is 6 metrics that ALL depend only on inputs (no internal chain) — the
// "simple" graph that laid out cleanly. CHAIN: adds the real intra-sample chain
// (revenue→expenses→assemble) but strips the extra upstream/cross-edges, to isolate what the
// chain alone does. TOY: one tiny sample. Compare against REAL to see what makes it hard.
function buildFlat() {
  const ns = [{ name: 'load_historical', deps: [] }, { name: 'net_debt', deps: [] }, { name: 'wacc', deps: ['load_historical'] }, { name: 'inputs', deps: ['load_historical', 'wacc', 'net_debt'] }];
  [1, 2, 3].forEach((s) => { ['revenue', 'expenses', 'capex', 'd_and_a', 'price'].forEach((m) => ns.push({ name: m + '#' + s, deps: ['inputs'] })); ns.push({ name: 'run_assemble#' + s, deps: ['inputs', 'revenue#' + s, 'expenses#' + s, 'capex#' + s, 'd_and_a#' + s, 'price#' + s] }); });
  ns.push({ name: 'projections', deps: ['inputs', 'run_assemble#1', 'run_assemble#2', 'run_assemble#3'] });
  ns.push({ name: 'final-model', deps: ['projections'] });
  return ns;
}
function buildChain() {
  const ns = [{ name: 'inputs', deps: [] }];
  [1, 2, 3].forEach((s) => {
    ns.push({ name: 'revenue#' + s, deps: ['inputs'] });
    ns.push({ name: 'expenses#' + s, deps: ['inputs', 'revenue#' + s] });
    ns.push({ name: 'capex#' + s, deps: ['inputs'] });
    ns.push({ name: 'd_and_a#' + s, deps: ['inputs'] });
    ns.push({ name: 'price#' + s, deps: ['inputs'] });
    ns.push({ name: 'run_assemble#' + s, deps: ['inputs', 'revenue#' + s, 'expenses#' + s, 'capex#' + s, 'd_and_a#' + s, 'price#' + s] });
  });
  ns.push({ name: 'projections', deps: ['inputs', 'run_assemble#1', 'run_assemble#2', 'run_assemble#3'] });
  ns.push({ name: 'final-model', deps: ['projections'] });
  return ns;
}
function buildToy() {
  const ns = [{ name: 'data', deps: [] }, { name: 'inputs', deps: ['data'] }];
  ['revenue', 'expenses', 'capex', 'd_and_a'].forEach((m) => ns.push({ name: m + '#1', deps: ['inputs'] }));
  ns.push({ name: 'run_assemble#1', deps: ['revenue#1', 'expenses#1', 'capex#1', 'd_and_a#1'] });
  ns.push({ name: 'projections', deps: ['run_assemble#1'] });
  return ns;
}
const GRAPHS = { flat: buildFlat, chain: buildChain, toy: buildToy };

const SHORT = { load_historical: 'Load hist', net_debt: 'Net debt', cost_structure: 'Cost struct', historical_expense_notes: 'Hist exp notes', valuation_method: 'Val method', historical_changes: 'Hist changes', wacc: 'WACC', inputs: 'Inputs', revenue: 'revenue', expenses: 'expenses', capex: 'capex', d_and_a: 'D&A', price: 'price', run_assemble: 'assemble', projections: 'Projections', 'final-model': 'Final model', final: 'Final model' };
const sampleNum = (id) => { const m = /#(\d+)$/.exec(id); return m ? m[1] : null; };
const baseOf = (id) => id.replace(/#\d+$/, '');
const prettify = (id) => SHORT[baseOf(id)] || baseOf(id).replace(/[_-]/g, ' ');
const DOWN = new Set(['projections', 'final-model', 'final']);

let FULL, FULL_BY_ID, SAMPLES, LIB_GRAPH;
function buildFromRun(runNodes) {
  const nodes = [], edges = [], eseen = new Set();
  runNodes.forEach((n) => { const id = n.name, member = /#\d+$/.test(id); nodes.push({ id, kind: member ? 'metric' : (DOWN.has(id) ? 'down' : 'up'), label: prettify(id) }); });
  const have = new Set(nodes.map((n) => n.id));
  runNodes.forEach((n) => (n.deps || []).forEach((d) => {
    if (!have.has(d)) return; const id = d + '>' + n.name; if (eseen.has(id)) return; eseen.add(id);
    const intra = sampleNum(d) && sampleNum(n.name) && sampleNum(d) === sampleNum(n.name);
    edges.push({ id, source: d, target: n.name, intra });
  }));
  return { nodes, edges };
}
function setTopology(runNodes) {
  FULL = buildFromRun(runNodes);
  LIB_GRAPH = buildGraph(runNodes.map((n) => ({ name: n.name, deps: n.deps || [] })));
  FULL_BY_ID = Object.fromEntries(FULL.nodes.map((n) => [n.id, n]));
  SAMPLES = [...new Set(FULL.nodes.map((n) => sampleNum(n.id)).filter(Boolean))].sort();
  cur = {}; lastViewPos = {}; lastEdges = [];
}
const isExpanded = (set, s) => set.has('sample#' + s);
const collapsedId = (set, id) => { const s = sampleNum(id); return (s && !isExpanded(set, s)) ? 'sample#' + s : id; };
const groupLabel = (s) => 'Sample ' + s + ' ×' + (FULL ? FULL.nodes.filter((n) => sampleNum(n.id) === s).length : 6);

// The displayed (effective) graph for an expand-set: collapsed samples fold to one group node.
function effectiveGraph(set) {
  const nmap = new Map();
  FULL.nodes.forEach((n) => { const c = collapsedId(set, n.id); if (!nmap.has(c)) nmap.set(c, c.startsWith('sample#') ? { id: c, kind: 'group', label: groupLabel(c.slice(7)) } : n); });
  const eseen = new Set(), edges = [];
  FULL.edges.forEach((e) => {
    const u = collapsedId(set, e.source), v = collapsedId(set, e.target);
    if (u === v) return; const id = u + '>' + v; if (eseen.has(id)) return; eseen.add(id);
    edges.push({ id, source: u, target: v, intra: e.intra });
  });
  return { nodes: [...nmap.values()], edges };
}

function membersOf(s) { return FULL.nodes.filter((n) => n.id.endsWith('#' + s)); }
function memberBox(pos, s, pad) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  membersOf(s).forEach((n) => { const p = pos[n.id]; if (!p) return; x0 = Math.min(x0, p.cx - NODE_W / 2); y0 = Math.min(y0, p.cy - NODE_H / 2); x1 = Math.max(x1, p.cx + NODE_W / 2); y1 = Math.max(y1, p.cy + NODE_H / 2); });
  pad = pad == null ? 16 : pad;
  return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + 2 * pad, h: (y1 - y0) + 2 * pad };
}
function boxesFor(set, pos) {
  const boxes = [];
  SAMPLES.forEach((s) => { if (!isExpanded(set, s)) return; const b = memberBox(pos, s, 14); if (isFinite(b.w)) boxes.push({ id: 'box#' + s, label: 'Sample ' + s + ' · 6 steps', ...b }); });
  return boxes;
}

// ===== layout: delegated to the dag-stable-layout library ====================
// baseline / inflate / skeleton(≡"E") now come from the library, driven by the same dagre
// engine the lab always used — coordinates are pixel-identical to the original (repo parity
// test). We only reshape the library output back into this renderer's view (sample#N ids).
function viewFor(strat, set) {
  const expanded = new Set([...set].map((id) => id.slice(7))); // 'sample#2' -> '2'
  const { pos: lpos } = stableLayout(LIB_GRAPH, {
    groupOf: sampleNum,
    expanded,
    strategy: STRAT_TO_LIB[strat] || 'baseline',
    layout: dagreLayout,
  });
  const pos = {};
  for (const k in lpos) pos[k.startsWith('group::') ? 'sample#' + k.slice(7) : k] = lpos[k];
  const eff = effectiveGraph(set);
  return { pos, nodes: eff.nodes, edges: eff.edges, boxes: boxesFor(set, pos) };
}
function computeView(set) { return viewFor(state.strategy, set); }

// ----- score each strategy on the CURRENT graph (sibling drift = the score) -------
async function measureStrategy(strat) {
  const s0 = SAMPLES[0];
  if (!s0) return { sib: 0, down: 0 };
  const a = await viewFor(strat, new Set(), {});                 // cold collapsed
  const seed = {}; Object.keys(a.pos).forEach((id) => { seed[id] = { cx: a.pos[id].cx, cy: a.pos[id].cy }; });
  const b = await viewFor(strat, new Set(['sample#' + s0]), seed); // warm: expand sample 1
  let sib = 0, down = 0;
  Object.keys(b.pos).forEach((id) => {
    if (id === 'sample#' + s0 || sampleNum(id) === s0) return;   // skip the toggled sample's own nodes
    const p = a.pos[id]; if (!p) return;
    const d = Math.hypot(b.pos[id].cx - p.cx, b.pos[id].cy - p.cy);
    if ((FULL_BY_ID[id] || {}).kind === 'down') down = Math.max(down, d); else sib = Math.max(sib, d);
  });
  return { sib: Math.round(sib), down: Math.round(down) };
}
function sibBadge(px) { const cls = px <= 2 ? 'g' : px < 40 ? 'a' : 'r'; return '<span class="badge ' + cls + '">' + px + 'px</span>'; }
function downBadge(px) { return px <= 2 ? '<span class="badge n">frozen</span>' : '<span class="badge n">' + px + 'px →</span>'; }
async function fillScores() {
  const g = state.graph;
  document.querySelectorAll('#stratTable .sc-sib').forEach((el) => { el.innerHTML = '<span class="badge spin">…</span>'; });
  document.querySelectorAll('#stratTable .sc-down').forEach((el) => { el.innerHTML = ''; });
  for (const s of ['inflate', 'baseline', 'E']) {
    const r = await measureStrategy(s);
    if (state.graph !== g) return;                               // graph switched — drop stale scores
    const row = document.querySelector('#stratTable tr[data-strat="' + s + '"]'); if (!row) continue;
    row.querySelector('.sc-sib').innerHTML = sibBadge(r.sib);
    row.querySelector('.sc-down').innerHTML = downBadge(r.down);
  }
}

// ----- helpers --------------------------------------------------------------
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t, fy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => { let t = x; for (let i = 0; i < 6; i++) { const e = fx(t) - x, d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(e) < 1e-4 || d === 0) break; t -= e / d; } return fy(Math.max(0, Math.min(1, t))); };
}
function lerp(a, b, t) { return a + (b - a) * t; }
function centroid(list) { const l = list.filter(Boolean); if (!l.length) return null; let cx = 0, cy = 0; l.forEach((p) => { cx += p.cx; cy += p.cy; }); return { cx: cx / l.length, cy: cy / l.length }; }
function tween(durMs, easeFn, step, done) {
  const my = generation, t0 = performance.now();
  (function frame(now) { if (my !== generation) return; const raw = Math.min(1, (now - t0) / durMs); step(easeFn(raw)); if (raw < 1) requestAnimationFrame(frame); else if (done) done(); })(t0);
}

// ----- DOM ------------------------------------------------------------------
const plane = document.getElementById('plane');
const svg = document.getElementById('edges');
const stage = document.getElementById('stage');
const nodeEls = {}; // id -> div
const edgeEls = {}; // edgeId -> path
const boxEls = {};  // boxId -> div

function nodeClass(n) { return 'node' + (n.kind === 'group' ? ' group' : n.kind === 'metric' ? ' metric' : n.kind === 'up' ? ' up' : n.kind === 'down' ? ' down' : ''); }
function ensureNode(id, n) {
  let el = nodeEls[id];
  if (!el) {
    el = document.createElement('div');
    el.className = nodeClass(n);
    el.style.width = NODE_W + 'px'; el.style.height = NODE_H + 'px'; el.textContent = n.label || id;
    el.addEventListener('click', () => onNodeClick(id, n));
    plane.appendChild(el); nodeEls[id] = el;
  } else { el.className = nodeClass(n); }
  return el;
}
function ensureEdge(id, intra) {
  let el = edgeEls[id];
  if (!el) { el = document.createElementNS('http://www.w3.org/2000/svg', 'path'); el.setAttribute('marker-end', 'url(#arrow)'); svg.appendChild(el); edgeEls[id] = el; }
  el.setAttribute('class', 'edge' + (intra ? ' intra' : ''));
  return el;
}
function renderBoxes(boxes) {
  const live = new Set(boxes.map((b) => b.id));
  Object.keys(boxEls).forEach((id) => { if (!live.has(id)) { boxEls[id].remove(); delete boxEls[id]; } });
  boxes.forEach((b) => {
    let el = boxEls[b.id];
    if (!el) {
      el = document.createElement('div'); el.className = 'box';
      el.innerHTML = '<button class="tag" type="button" title="Collapse this sample"><span class="x">⊟</span><span class="lbl"></span></button>';
      const sid = b.id.slice(4); // 'box#2' -> '2'
      el.querySelector('.tag').addEventListener('click', () => collapseSample(sid));
      plane.insertBefore(el, plane.firstChild.nextSibling); boxEls[b.id] = el;
    }
    el.style.left = b.x + 'px'; el.style.top = b.y + 'px'; el.style.width = b.w + 'px'; el.style.height = b.h + 'px';
    el.querySelector('.lbl').textContent = b.label;
  });
}
function placeNode(el, c) { el.style.left = (c.cx - NODE_W / 2) + 'px'; el.style.top = (c.cy - NODE_H / 2) + 'px'; el.style.transform = `scale(${c.s})`; el.style.opacity = c.o; }
// Point where the ray from a node's center toward (tx,ty) crosses its rectangle border.
function rectBorder(c, tx, ty) {
  const hw = (NODE_W / 2) * (c.s ?? 1), hh = (NODE_H / 2) * (c.s ?? 1);
  const dx = tx - c.cx, dy = ty - c.cy;
  if (!dx && !dy) return { x: c.cx, y: c.cy };
  const k = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: c.cx + dx * k, y: c.cy + dy * k };
}
function drawEdge(el, s, t, opacity) {
  if (state.strategy === 'force') {
    // Organic layout has no left-right flow, so a horizontal-handled bezier looks wrong.
    // Straight line from border to border (terminating where it meets each node).
    const a = rectBorder(s, t.cx, t.cy), b = rectBorder(t, s.cx, s.cy);
    el.setAttribute('d', `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    el.style.opacity = String(opacity);
    return;
  }
  const sx = s.cx + (NODE_W / 2) * (s.s ?? 1), sy = s.cy;
  const tx = t.cx - (NODE_W / 2) * (t.s ?? 1), ty = t.cy;
  const dx = Math.max(16, Math.abs(tx - sx) * 0.4);
  el.setAttribute('d', `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${(sx + dx).toFixed(1)} ${sy.toFixed(1)}, ${(tx - dx).toFixed(1)} ${ty.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}`);
  el.style.opacity = String(opacity);
}
let curView = { k: 1, x: 0, y: 0 };
function bboxOf(view) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  Object.values(view.pos).forEach((p) => { x0 = Math.min(x0, p.cx - NODE_W / 2); y0 = Math.min(y0, p.cy - NODE_H / 2); x1 = Math.max(x1, p.cx + NODE_W / 2); y1 = Math.max(y1, p.cy + NODE_H / 2); });
  view.boxes.forEach((b) => { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
  return { minX: x0, minY: y0, w: x1 - x0, h: y1 - y0 };
}
function computeFit(bbox) {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const k = Math.max(0.3, Math.min(1.4, (sw - 2 * STAGE_PAD) / bbox.w, (sh - 2 * STAGE_PAD) / bbox.h));
  return { k, x: (sw - bbox.w * k) / 2 - bbox.minX * k, y: (sh - bbox.h * k) / 2 - bbox.minY * k };
}
function applyView(v) { curView = v; plane.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`; }
function sizeSvg(bbox) { svg.setAttribute('width', Math.ceil(bbox.minX + bbox.w + NODE_W)); svg.setAttribute('height', Math.ceil(bbox.minY + bbox.h + NODE_H)); }

// ----- drift meter: how far did the NON-toggled nodes move? ------------------
function reportDrift(view, toggled) {
  const valEl = document.getElementById('driftVal'), whoEl = document.getElementById('driftWho');
  Object.values(nodeEls).forEach((el) => el.classList.remove('sib-moved'));
  if (!toggled || !Object.keys(lastViewPos).length) { valEl.textContent = '—'; whoEl.textContent = ''; return; }
  const s = toggled.slice(7); // 'sample#2' -> '2'
  let worst = 0, who = null;
  Object.keys(view.pos).forEach((id) => {
    if (id === toggled || sampleNum(id) === s) return;          // skip the toggled sample's own nodes
    const a = lastViewPos[id]; if (!a) return;
    const d = Math.hypot(view.pos[id].cx - a.cx, view.pos[id].cy - a.cy);
    if (d > worst) { worst = d; who = id; }
  });
  valEl.textContent = Math.round(worst);
  valEl.style.color = worst < 2 ? '#16a34a' : worst < 30 ? '#d97706' : '#dc2626';
  whoEl.textContent = who ? '(worst: ' + (FULL_BY_ID[who] ? FULL_BY_ID[who].label : who) + ')' : '';
  if (who && worst >= 2 && nodeEls[who]) nodeEls[who].classList.add('sib-moved');
}

// ----- the one transition ---------------------------------------------------
async function transition(animate, toggled) {
  const my = ++generation;
  const view = await computeView(state.expanded);
  if (my !== generation) return; // a newer click superseded us
  reportDrift(view, toggled);
  const bbox = bboxOf(view); sizeSvg(bbox); renderBoxes(view.boxes);
  const fromView = { ...curView }, toView = computeFit(bbox);
  const targetIds = Object.keys(view.pos);
  const leavingIds = Object.keys(cur).filter((id) => !(id in view.pos));
  const enteringIds = targetIds.filter((id) => !(id in cur));
  const foldEnter = centroid(leavingIds.map((id) => cur[id]));   // new nodes fan out from here
  const foldLeave = centroid(enteringIds.map((id) => view.pos[id])); // leaving nodes fold into here
  const nodeById = Object.fromEntries(view.nodes.map((n) => [n.id, n]));

  const ntracks = [];
  targetIds.forEach((id) => {
    const el = ensureNode(id, nodeById[id] || FULL_BY_ID[id] || { id, kind: 'metric', label: id });
    const to = { cx: view.pos[id].cx, cy: view.pos[id].cy, s: 1, o: 1 };
    const from = (id in cur) ? { ...cur[id] } : foldEnter ? { cx: foldEnter.cx, cy: foldEnter.cy, s: 0.3, o: 0 } : { ...to, o: 0 };
    ntracks.push({ id, el, from, to });
  });
  leavingIds.forEach((id) => {
    const el = nodeEls[id]; if (!el) return;
    const from = { ...cur[id] };
    const to = foldLeave ? { cx: foldLeave.cx, cy: foldLeave.cy, s: 0.3, o: 0 } : { ...from, o: 0 };
    ntracks.push({ id, el, from, to, remove: true });
  });

  const liveEdges = true; // always Unfold (live edges); technique options removed
  const targetEdgeIds = new Set(view.edges.map((e) => e.id));
  const etracks = [];
  view.edges.forEach((e) => etracks.push({ el: ensureEdge(e.id, e.intra), source: e.source, target: e.target, oFrom: lastEdges.some((p) => p.id === e.id) ? 1 : 0, oTo: 1 }));
  if (liveEdges) {
    lastEdges.forEach((e) => { if (!targetEdgeIds.has(e.id) && edgeEls[e.id]) etracks.push({ el: edgeEls[e.id], source: e.source, target: e.target, oFrom: 1, oTo: 0, remove: e.id }); });
  } else {
    lastEdges.forEach((e) => { if (!targetEdgeIds.has(e.id) && edgeEls[e.id]) { edgeEls[e.id].remove(); delete edgeEls[e.id]; } });
  }

  function nodeAt(id) { return cur[id] || (view.pos[id] ? { cx: view.pos[id].cx, cy: view.pos[id].cy, s: 1 } : null); }
  function paint(t) {
    applyView({ k: lerp(fromView.k, toView.k, t), x: lerp(fromView.x, toView.x, t), y: lerp(fromView.y, toView.y, t) });
    ntracks.forEach((tr) => {
      const c = { cx: lerp(tr.from.cx, tr.to.cx, t), cy: lerp(tr.from.cy, tr.to.cy, t), s: lerp(tr.from.s ?? 1, tr.to.s ?? 1, t), o: lerp(tr.from.o ?? 1, tr.to.o ?? 1, t) };
      placeNode(tr.el, c); cur[tr.id] = c;
    });
    etracks.forEach((tr) => {
      const a = liveEdges ? nodeAt(tr.source) : { cx: view.pos[tr.source].cx, cy: view.pos[tr.source].cy, s: 1 };
      const b = liveEdges ? nodeAt(tr.target) : { cx: view.pos[tr.target].cx, cy: view.pos[tr.target].cy, s: 1 };
      if (a && b) drawEdge(tr.el, a, b, lerp(tr.oFrom, tr.oTo, liveEdges ? t : 1));
    });
  }
  function finalize() {
    ntracks.forEach((tr) => { if (tr.remove) { tr.el.remove(); delete nodeEls[tr.id]; delete cur[tr.id]; } });
    etracks.forEach((tr) => { if (tr.remove) { tr.el.remove(); delete edgeEls[tr.remove]; } });
    lastEdges = view.edges.slice();
    lastViewPos = {}; Object.keys(view.pos).forEach((id) => { lastViewPos[id] = { cx: view.pos[id].cx, cy: view.pos[id].cy }; });
  }
  if (!animate) { paint(1); finalize(); }
  else tween(state.durMs, cubicBezier(...state.bezier), paint, finalize);
}

// ----- interaction ----------------------------------------------------------
function onNodeClick(id, n) {
  const s = n.kind === 'group' ? n.id.slice(7) : sampleNum(id);
  if (!s) return;
  const key = 'sample#' + s;
  if (state.expanded.has(key)) state.expanded.delete(key); else state.expanded.add(key);
  transition(true, key);
}
function collapseSample(s) { const key = 'sample#' + s; if (state.expanded.has(key)) { state.expanded.delete(key); transition(true, key); } }
function clearStage() {
  for (const k in nodeEls) { nodeEls[k].remove(); delete nodeEls[k]; }
  for (const k in edgeEls) { edgeEls[k].remove(); delete edgeEls[k]; }
  for (const k in boxEls) { boxEls[k].remove(); delete boxEls[k]; }
  cur = {}; lastViewPos = {}; lastEdges = [];
}
// Switching strategy is a clean slate: drop every stale node/edge/box element and
// collapse all samples, so the new layout renders from scratch (no ghosts, no carried-over expansion).
function relayoutStatic() { generation++; state.expanded = new Set(); clearStage(); transition(false, null); }

// ----- wiring ---------------------------------------------------------------
// The matrix is one selector: a row picks the layout, a column picks the animation.
function syncCombo() {
  document.querySelectorAll('#stratTable tr[data-strat]').forEach((tr) => tr.classList.toggle('sel', tr.dataset.strat === state.strategy));
}
document.getElementById('stratTable').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-strat]'); if (!tr) return;
  if (state.strategy === tr.dataset.strat) return;
  state.strategy = tr.dataset.strat; syncCombo(); relayoutStatic();
});
document.getElementById('toggle').addEventListener('click', () => onNodeClick('sample#1', { kind: 'group', id: 'sample#1' }));
document.getElementById('allin').addEventListener('click', () => { state.expanded = new Set(); transition(true, null); });
window.addEventListener('resize', () => { computeView(state.expanded).then((v) => { const b = bboxOf(v); sizeSvg(b); applyView(computeFit(b)); }); });

// URL params:  ?strat=A|B|E|elk|baseline  ?tech=...  ?expand=1,2  (samples pre-expanded)
const params = new URLSearchParams(location.search);
if (params.get('graph')) { const sel = document.getElementById('graphSel'); if ([...sel.options].some((o) => o.value === params.get('graph'))) { sel.value = params.get('graph'); state.graph = params.get('graph'); } }
if (['inflate', 'baseline', 'E'].includes(params.get('strat'))) state.strategy = params.get('strat');
// (unused in the playground) legacy live-run loader from the DCF app; graphs here are embedded.
async function loadLiveRun() {
  try {
    const act = await (await fetch('/api/build/activity')).json();
    for (const r of (act.recent || [])) {
      const data = await (await fetch('/api/build/run/' + r.run_id)).json();
      const nodes = (data.nodes || []);
      if (nodes.some((n) => /#\d+$/.test(n.name))) {
        if (state.graph !== 'real') return;   // user switched graphs while we were fetching
        setTopology(nodes.map((n) => ({ name: n.name, deps: n.deps || [] })));
        const tag = document.getElementById('srcTag');
        if (tag) tag.textContent = 'live: ' + (r.ticker || 'run') + ' #' + r.run_id + ' · ' + nodes.length + ' nodes';
        transition(false, null);
        return;
      }
    }
  } catch (e) { /* unreachable API (headless) — stay on EMBEDDED run 658 */ }
}

const GRAPH_TAG = { real: 'DCF build DAG · run 658', flat: 'flat 3×6', chain: 'chain 3×6', toy: 'toy 1×4' };
async function applyGraph() {
  state.expanded = new Set(); clearStage(); generation++;
  setTopology(state.graph === 'real' ? EMBEDDED : GRAPHS[state.graph]());
  document.getElementById('srcTag').textContent = GRAPH_TAG[state.graph];
  transition(false, null);                    // immediate paint
  // playground has no live backend — graphs are embedded (EMBEDDED + GRAPHS)
  fillScores();                               // score every strategy on the final topology
}
document.getElementById('graphSel').addEventListener('change', (e) => { state.graph = e.target.value; applyGraph(); });

syncCombo();
applyGraph().then(() => {
  const pre = (params.get('expand') || '').split(',').filter(Boolean);
  if (pre.length) { pre.forEach((s) => state.expanded.add('sample#' + s)); transition(false, null); }
});
