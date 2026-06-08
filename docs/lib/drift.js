// Drift measurement: when one group is toggled, how far did the OTHER nodes move?
//
// "Sibling drift" is movement of unrelated nodes (other groups, upstream) — the thing a
// stable layout should keep at zero. "Downstream drift" is movement of nodes that genuinely
// have to shift to make room (everything topologically after the expanded group); it is
// reported separately because some of it is unavoidable.

import { groupTag } from './groups.js';

/**
 * @param {{ [id:string]: {cx:number, cy:number} }} before  positions before the toggle
 * @param {{ [id:string]: {cx:number, cy:number} }} after   positions after the toggle
 * @param {{ toggledGroup?:string, groupOf?:(id:string)=>string|null, downstream?:(id:string)=>boolean }} [opts]
 * @returns {{ max:number, maxWho:string|null, sibling:number, siblingWho:string|null, downstream:number, downstreamWho:string|null }}
 */
export function measureDrift(before, after, opts = {}) {
  const { toggledGroup, groupOf, downstream } = opts;
  const toggledNode = toggledGroup != null ? groupTag(toggledGroup) : null;
  const tg = toggledGroup != null ? String(toggledGroup) : null;

  let max = 0, maxWho = null;
  let sibling = 0, siblingWho = null;
  let down = 0, downWho = null;

  for (const id of Object.keys(after)) {
    if (id === toggledNode) continue;                                   // the group node itself
    if (groupOf && tg != null && String(groupOf(id)) === tg) continue;  // the toggled group's own members
    const a = before[id];
    if (!a) continue;                                                   // node didn't exist before
    const d = Math.hypot(after[id].cx - a.cx, after[id].cy - a.cy);
    if (d > max) { max = d; maxWho = id; }
    if (downstream && downstream(id)) {
      if (d > down) { down = d; downWho = id; }
    } else if (d > sibling) { sibling = d; siblingWho = id; }
  }

  const round = (n) => Math.round(n);
  return {
    max: round(max), maxWho,
    sibling: round(sibling), siblingWho,
    downstream: round(down), downstreamWho: downWho,
  };
}
