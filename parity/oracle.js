// Reference oracle: the ORIGINAL playground layout algorithm (from the scraped
// graph-playground.aisloppy.com inline script), with all DOM/animation/wiring removed and
// `dagre` injected. The layout math below is kept VERBATIM from the source so it can serve as
// ground truth for the pixel-parity harness. Do not "clean it up" — fidelity is the point.

export function createOracle(dagre) {
  const NODE_W = 112, NODE_H = 40;

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

  const SHORT = { load_historical: 'Load hist', net_debt: 'Net debt', cost_structure: 'Cost struct', historical_expense_notes: 'Hist exp notes', valuation_method: 'Val method', historical_changes: 'Hist changes', wacc: 'WACC', inputs: 'Inputs', revenue: 'revenue', expenses: 'expenses', capex: 'capex', d_and_a: 'D&A', price: 'price', run_assemble: 'assemble', projections: 'Projections', 'final-model': 'Final model', final: 'Final model' };
  const sampleNum = (id) => { const m = /#(\d+)$/.exec(id); return m ? m[1] : null; };
  const baseOf = (id) => id.replace(/#\d+$/, '');
  const prettify = (id) => SHORT[baseOf(id)] || baseOf(id).replace(/[_-]/g, ' ');
  const DOWN = new Set(['projections', 'final-model', 'final']);

  let FULL, FULL_BY_ID, SAMPLES;
  let _fl = null, _rh = null, _skel = null, _base = null;

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
    FULL_BY_ID = Object.fromEntries(FULL.nodes.map((n) => [n.id, n]));
    SAMPLES = [...new Set(FULL.nodes.map((n) => sampleNum(n.id)).filter(Boolean))].sort();
    _fl = null; _rh = null; _skel = null; _base = null;
  }

  const isExpanded = (set, s) => set.has('sample#' + s);
  const collapsedId = (set, id) => { const s = sampleNum(id); return (s && !isExpanded(set, s)) ? 'sample#' + s : id; };
  const groupLabel = (s) => 'Sample ' + s + ' ×' + (FULL ? FULL.nodes.filter((n) => sampleNum(n.id) === s).length : 6);

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

  function dagre1(graph, heightOf) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 22, ranksep: 62, marginx: 8, marginy: 8 });
    g.setDefaultEdgeLabel(() => ({}));
    graph.nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: (heightOf && heightOf(n)) || NODE_H }));
    graph.edges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    const pos = {}; graph.nodes.forEach((n) => { const d = g.node(n.id); pos[n.id] = { cx: d.x, cy: d.y }; });
    return pos;
  }
  function fullPos() { if (!_fl) _fl = dagre1(FULL); return _fl; }
  function membersOf(s) { return FULL.nodes.filter((n) => n.id.endsWith('#' + s)); }
  function memberBox(pos, s, pad) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    membersOf(s).forEach((n) => { const p = pos[n.id]; if (!p) return; x0 = Math.min(x0, p.cx - NODE_W / 2); y0 = Math.min(y0, p.cy - NODE_H / 2); x1 = Math.max(x1, p.cx + NODE_W / 2); y1 = Math.max(y1, p.cy + NODE_H / 2); });
    pad = pad == null ? 16 : pad;
    return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + 2 * pad, h: (y1 - y0) + 2 * pad };
  }
  function reservedHeight() { if (_rh == null) _rh = memberBox(fullPos(), SAMPLES[0], 6).h; return _rh; }
  function boxesFor(set, pos) {
    const boxes = [];
    SAMPLES.forEach((s) => { if (!isExpanded(set, s)) return; const b = memberBox(pos, s, 14); if (isFinite(b.w)) boxes.push({ id: 'box#' + s, label: 'Sample ' + s + ' · 6 steps', ...b }); });
    return boxes;
  }

  function viewBaseline(set) { const eff = effectiveGraph(set); const pos = dagre1(eff); return { pos, nodes: eff.nodes, edges: eff.edges, boxes: boxesFor(set, pos) }; }

  function skeleton() { if (_skel) return _skel; const rh = reservedHeight(); const pos = dagre1(effectiveGraph(new Set()), (n) => n.id.startsWith('sample#') ? rh : NODE_H); _skel = { pos, sampleX: pos['sample#1'].cx }; return _skel; }
  function sampleInternal(s) {
    const nodes = membersOf(s).map((n) => ({ id: n.id, kind: 'metric' })), edges = [];
    FULL.edges.forEach((e) => { if (e.source.endsWith('#' + s) && e.target.endsWith('#' + s)) edges.push({ id: e.id, source: e.source, target: e.target }); });
    return { nodes, edges };
  }
  function viewE(set) {
    const sk = skeleton(); const eff = effectiveGraph(set); const pos = {};
    let shift = 0; const sub = {};
    SAMPLES.forEach((s) => {
      if (!isExpanded(set, s)) return;
      const sp = dagre1(sampleInternal(s));
      let x0 = 1e9, x1 = -1e9, ymid = 0, k = 0; Object.values(sp).forEach((p) => { x0 = Math.min(x0, p.cx); x1 = Math.max(x1, p.cx); ymid += p.cy; k++; });
      sub[s] = { sp, x0, ymid: ymid / k }; shift = Math.max(shift, (x1 - x0));
    });
    eff.nodes.forEach((n) => {
      if (n.id.startsWith('sample#')) { pos[n.id] = { ...sk.pos[n.id] }; return; }
      const s = sampleNum(n.id);
      if (s) { const d = sub[s], slot = sk.pos['sample#' + s], p = d.sp[n.id]; pos[n.id] = { cx: slot.cx + (p.cx - d.x0), cy: slot.cy + (p.cy - d.ymid) }; }
      else { const base = sk.pos[n.id]; pos[n.id] = { cx: base.cx + (base.cx > sk.sampleX + 1 ? shift : 0), cy: base.cy }; }
    });
    return { pos, nodes: eff.nodes, edges: eff.edges, boxes: boxesFor(set, pos) };
  }

  function baseLayout() { if (!_base) _base = dagre1(effectiveGraph(new Set())); return _base; }
  function viewInflate(set) {
    const base = baseLayout();
    const clusters = {};
    SAMPLES.forEach((s) => {
      if (!isExpanded(set, s)) return;
      const C = base['sample#' + s]; if (!C) return;
      const sp = dagre1(sampleInternal(s));
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      Object.values(sp).forEach((p) => { x0 = Math.min(x0, p.cx); y0 = Math.min(y0, p.cy); x1 = Math.max(x1, p.cx); y1 = Math.max(y1, p.cy); });
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, scale = 0.85;
      const cpos = {}; Object.keys(sp).forEach((id) => { cpos[id] = { cx: C.cx + (sp[id].cx - mx) * scale, cy: C.cy + (sp[id].cy - my) * scale }; });
      clusters[s] = { C, cpos, halfW: (x1 - x0) * scale / 2 + 18, halfH: (y1 - y0) * scale / 2 + 16 };
    });
    const TOL = 28;
    const displaced = (q, excludeS) => {
      let dx = 0, dy = 0;
      Object.keys(clusters).forEach((s) => {
        if (s === excludeS) return;
        const cl = clusters[s], ex = q.cx - cl.C.cx, ey = q.cy - cl.C.cy;
        if (Math.abs(ex) > TOL) dx += Math.sign(ex) * cl.halfW;
        else if (Math.abs(ey) > 1) dy += Math.sign(ey) * cl.halfH;
      });
      return { cx: q.cx + dx, cy: q.cy + dy };
    };
    const eff = effectiveGraph(set), pos = {};
    eff.nodes.forEach((n) => {
      const s = sampleNum(n.id);
      if (s && isExpanded(set, s) && clusters[s]) pos[n.id] = displaced(clusters[s].cpos[n.id], s);
      else pos[n.id] = displaced(base[n.id], null);
    });
    return { pos, nodes: eff.nodes, edges: eff.edges, boxes: boxesFor(set, pos) };
  }

  function viewFor(strat, set) {
    switch (strat) {
      case 'E': return viewE(set);
      case 'inflate': return viewInflate(set);
      default: return viewBaseline(set);
    }
  }

  // sibling/down drift between cold-collapsed and warm (sample s0 expanded), per original.
  function measureStrategy(strat) {
    const s0 = SAMPLES[0];
    if (!s0) return { sib: 0, down: 0 };
    const a = viewFor(strat, new Set());
    const b = viewFor(strat, new Set(['sample#' + s0]));
    let sib = 0, down = 0;
    Object.keys(b.pos).forEach((id) => {
      if (id === 'sample#' + s0 || sampleNum(id) === s0) return;
      const p = a.pos[id]; if (!p) return;
      const d = Math.hypot(b.pos[id].cx - p.cx, b.pos[id].cy - p.cy);
      if ((FULL_BY_ID[id] || {}).kind === 'down') down = Math.max(down, d); else sib = Math.max(sib, d);
    });
    return { sib: Math.round(sib), down: Math.round(down) };
  }

  return {
    EMBEDDED, sampleNum, setTopology, effectiveGraph, viewFor, measureStrategy,
    get SAMPLES() { return SAMPLES; },
  };
}
