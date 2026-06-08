"use strict";
// Priority-node's weighted force-graph strategy, distilled into a reusable vanilla-d3
// component (from priority-node/.../components/ForceGraph.tsx). Shared by every playground
// page: split benefit(top)/cost(bottom) arc nodes sized by score, weighted colour+width
// arrowed edges, zoom/drag/hover-tooltip/click-select + selection ring.
//
// data = { nodes: [{ name, benefit, cost, score, private?, label?, group? }], edges: [{ source, target, normalizedValue? }] }
//   name — unique id (edges reference it); label — optional display; group — draw a dashed
//   ring (a collapsed container the caller can expand on click).
// opts: { onSelect, scoreLabel, benefitLabel, costLabel, charge, linkDistance, collideGap,
//         layout: 'center'|'rankx'|'radial', rankOf(name)->n, ringGap, seed: {name:{x,y}} }
// Returns { reheat(), reset(), destroy(), positions() }.
(function () {
  const _fmt = (n) => (n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString());
  const _obscure = (name, priv) => (priv ? name.slice(0, 3) + (name.length > 3 ? '…' : '') : name);
  const _disp = (d) => d.label || d.name;

  function PriorityForceGraph(container, tooltip, data, opts) {
    opts = opts || {};
    container.innerHTML = '';
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height) return { reheat() {}, reset() {}, destroy() {}, positions() { return {}; } };

    const nodes = data.nodes.map((n) => ({ ...n }));
    if (opts.seed) nodes.forEach((n) => { const s = opts.seed[n.name]; if (s) { n.x = s.x; n.y = s.y; } });
    const nodeByName = new Map(nodes.map((n) => [n.name, n]));
    const links = data.edges
      .map((e) => ({ source: nodeByName.get(e.source), target: nodeByName.get(e.target), normalizedValue: e.normalizedValue }))
      .filter((l) => l.source && l.target);

    const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead').attr('viewBox', '-0 -5 10 10').attr('refX', 20).attr('refY', 0)
      .attr('orient', 'auto').attr('markerWidth', 6).attr('markerHeight', 6)
      .append('path').attr('d', 'M 0,-5 L 10,0 L 0,5').attr('fill', '#888');

    const g = svg.append('g');
    const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', (ev) => g.attr('transform', ev.transform.toString()));
    svg.call(zoom);

    const maxScore = d3.max(nodes, (d) => d.score ?? 0) || 1000;
    const sizeScale = d3.scaleSqrt().domain([0, maxScore]).range([6, 22]);
    const maxBenefit = d3.max(nodes, (d) => d.benefit ?? 0) || 1;
    const maxCost = d3.max(nodes, (d) => d.cost ?? 0) || 1;
    const benefitColor = d3.scaleSequential(d3.interpolate('#1a3a1a', '#4ade80')).domain([0, maxBenefit]);
    const costColor = d3.scaleSequential(d3.interpolate('#3a1a1a', '#f87171')).domain([0, maxCost]);
    const edgeColor = d3.scaleSequential(d3.interpolate('#333', '#00ccff')).domain([0, 1]);

    // ---- forces: a few selectable layout variants ----
    const collideGap = opts.collideGap == null ? 6 : opts.collideGap;
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.name).distance(opts.linkDistance || 90))
      .force('charge', d3.forceManyBody().strength(opts.charge || -260))
      .force('collision', d3.forceCollide().radius((d) => sizeScale(d.score ?? 0) + collideGap))
      .alphaDecay(0.045).velocityDecay(0.4);
    const rankOf = opts.rankOf || (() => 0);
    if (opts.layout === 'rankx') {
      const maxR = d3.max(nodes, (d) => rankOf(d.name)) || 1;
      simulation
        .force('x', d3.forceX((d) => (rankOf(d.name) / maxR) * (width - 160) + 80).strength(0.6))
        .force('y', d3.forceY(height / 2).strength(0.06));
    } else if (opts.layout === 'radial') {
      simulation.force('r', d3.forceRadial((d) => 30 + rankOf(d.name) * (opts.ringGap || 80), width / 2, height / 2).strength(0.85));
    } else {
      simulation.force('center', d3.forceCenter(width / 2, height / 2));
    }

    const link = g.append('g').selectAll('line').data(links).enter().append('line')
      .attr('class', 'link')
      .attr('stroke', (d) => edgeColor(d.normalizedValue ?? 0))
      .attr('stroke-width', (d) => 1 + (d.normalizedValue ?? 0) * 4)
      .attr('marker-end', 'url(#arrowhead)');

    // Split circle: top arc = benefit, bottom arc = cost.
    const topArc = (r) => d3.arc()({ innerRadius: 0, outerRadius: r, startAngle: -Math.PI / 2, endAngle: Math.PI / 2 }) || '';
    const botArc = (r) => d3.arc()({ innerRadius: 0, outerRadius: r, startAngle: Math.PI / 2, endAngle: (3 * Math.PI) / 2 }) || '';

    const nodeGroup = g.append('g').selectAll('g.node-group').data(nodes).enter().append('g').attr('class', 'node-group');
    if (opts.nodeStyle === 'solid') {
      // Solid circle filled by opts.fill(node) — for non-benefit/cost domains (e.g. a DAG,
      // where the split green/red scheme has no meaning). Size still encodes score.
      const fill = opts.fill || (() => '#60a5fa');
      nodeGroup.append('circle').attr('r', (d) => sizeScale(d.score ?? 0)).attr('fill', (d) => fill(d)).attr('stroke', '#0a0a12').attr('stroke-width', 1.5);
    } else {
      // Priority-node split circle: top arc = benefit (green), bottom = cost (red).
      nodeGroup.append('path').attr('d', (d) => topArc(sizeScale(d.score ?? 0))).attr('fill', (d) => benefitColor(d.benefit)).attr('stroke', '#222').attr('stroke-width', 1);
      nodeGroup.append('path').attr('d', (d) => botArc(sizeScale(d.score ?? 0))).attr('fill', (d) => costColor(d.cost)).attr('stroke', '#222').attr('stroke-width', 1);
    }
    // group (collapsed container) marker: a dashed outer ring
    nodeGroup.filter((d) => d.group).append('circle')
      .attr('r', (d) => sizeScale(d.score ?? 0) + 5).attr('fill', 'none').attr('stroke', '#a78bfa').attr('stroke-dasharray', '3 3').attr('stroke-width', 1.5);

    const label = g.append('g').selectAll('text').data(nodes).enter().append('text')
      .attr('class', (d) => (d.private ? 'node-label private-label' : 'node-label'))
      .attr('dy', (d) => sizeScale(d.score ?? 0) + 13).attr('text-anchor', 'middle')
      .text((d) => { const nm = _disp(d); return d.private ? nm.slice(0, 3) + (nm.length > 3 ? '…' : '') : (nm.length > 16 ? nm.slice(0, 14) + '…' : nm); });

    let selected = null, ringSel = null;
    nodeGroup
      .on('mouseover', (event, d) => {
        tooltip.innerHTML = '<div class="name">' + _obscure(_disp(d), d.private) + (d.group ? ' <span style="color:#a78bfa">(group — click to expand)</span>' : '') + '</div>' +
          '<div class="score">' + (opts.scoreLabel || 'Score') + ': ' + _fmt(d.score) + '</div>' +
          '<div class="meta">' + (opts.benefitLabel || 'Benefit') + ': ' + _fmt(d.benefit) + ' | ' + (opts.costLabel || 'Cost') + ': ' + _fmt(d.cost) + '</div>';
        tooltip.style.display = 'block'; tooltip.style.left = (event.pageX + 10) + 'px'; tooltip.style.top = (event.pageY - 10) + 'px';
      })
      .on('mousemove', (event) => { tooltip.style.left = (event.pageX + 10) + 'px'; tooltip.style.top = (event.pageY - 10) + 'px'; })
      .on('mouseout', () => { tooltip.style.display = 'none'; })
      .on('click', (_event, d) => { tooltip.style.display = 'none'; selected = d.name; if (opts.onSelect) opts.onSelect(d); });

    nodeGroup.call(d3.drag()
      .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    simulation.on('tick', () => {
      link.attr('x1', (d) => d.source.x ?? 0).attr('y1', (d) => d.source.y ?? 0).attr('x2', (d) => d.target.x ?? 0).attr('y2', (d) => d.target.y ?? 0);
      nodeGroup.attr('transform', (d) => 'translate(' + (d.x ?? 0) + ',' + (d.y ?? 0) + ')');
      label.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0);
      if (selected) {
        const n = nodeByName.get(selected);
        if (n) {
          if (!ringSel) ringSel = g.append('circle').attr('fill', 'none').attr('stroke', '#4ade80').attr('stroke-width', 2).attr('r', sizeScale(n.score ?? 0) + 4);
          ringSel.attr('cx', n.x ?? 0).attr('cy', n.y ?? 0);
        }
      } else if (ringSel) { ringSel.remove(); ringSel = null; }
    });

    return {
      reheat() { simulation.alpha(0.8).restart(); },
      reset() { svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity); },
      destroy() { simulation.stop(); svg.remove(); tooltip.style.display = 'none'; },
      positions() { const p = {}; nodes.forEach((n) => { p[n.name] = { x: n.x, y: n.y }; }); return p; },
    };
  }

  window.PriorityForceGraph = PriorityForceGraph;
  window.pgFmt = _fmt;
  window.pgObscure = _obscure;
})();
