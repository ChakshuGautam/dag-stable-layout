// The four sample graphs the playground ships (the graph selector): the real DCF build DAG,
// plus flat / chain / toy. Node specs are `{ name, deps }` — accepted by both the oracle
// (setTopology) and this library's buildGraph. Builders copied verbatim from the source.

function buildReal() {
  const ns = [
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
    ns.push({ name: 'revenue#' + s, deps: ['inputs'] });
    ns.push({ name: 'expenses#' + s, deps: ['inputs', 'revenue#' + s, 'cost_structure', 'historical_expense_notes'] });
    ns.push({ name: 'capex#' + s, deps: ['inputs'] });
    ns.push({ name: 'd_and_a#' + s, deps: ['inputs'] });
    ns.push({ name: 'price#' + s, deps: ['inputs'] });
    ns.push({ name: 'run_assemble#' + s, deps: ['inputs', 'revenue#' + s, 'expenses#' + s, 'capex#' + s, 'd_and_a#' + s, 'price#' + s] });
  });
  ns.push({ name: 'projections', deps: ['inputs', 'run_assemble#1', 'run_assemble#2', 'run_assemble#3'] });
  ns.push({ name: 'final-model', deps: ['inputs', 'projections'] });
  return ns;
}

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

export const GRAPHS = {
  real: buildReal(),
  flat: buildFlat(),
  chain: buildChain(),
  toy: buildToy(),
};

export const groupOf = (id) => (/#(\d+)$/.exec(id)?.[1]) ?? null;

/** Distinct, sorted group ids present in a spec list. */
export function groupsOf(specs) {
  return [...new Set(specs.map((n) => groupOf(n.name ?? n.id)).filter(Boolean))].sort();
}
