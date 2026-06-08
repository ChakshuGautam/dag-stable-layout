// The real DCF build DAG (run 658) used by the original playground: a set of upstream
// inputs, three repeated per-scenario "sample" sub-chains (#1/#2/#3), and downstream
// projections/final-model. Each sample is a collapsible group.

export function dcfSpecs() {
  const specs = [
    { id: 'load_historical', deps: [] },
    { id: 'net_debt', deps: [] },
    { id: 'cost_structure', deps: ['load_historical'] },
    { id: 'historical_expense_notes', deps: ['load_historical'] },
    { id: 'valuation_method', deps: ['load_historical'] },
    { id: 'historical_changes', deps: ['load_historical'] },
    { id: 'wacc', deps: ['load_historical'] },
    { id: 'inputs', deps: ['load_historical', 'valuation_method', 'net_debt', 'historical_changes', 'wacc'] },
  ];
  for (const s of [1, 2, 3]) {
    specs.push({ id: `revenue#${s}`, deps: ['inputs'] });
    specs.push({ id: `expenses#${s}`, deps: ['inputs', `revenue#${s}`, 'cost_structure', 'historical_expense_notes'] });
    specs.push({ id: `capex#${s}`, deps: ['inputs'] });
    specs.push({ id: `d_and_a#${s}`, deps: ['inputs'] });
    specs.push({ id: `price#${s}`, deps: ['inputs'] });
    specs.push({ id: `run_assemble#${s}`, deps: ['inputs', `revenue#${s}`, `expenses#${s}`, `capex#${s}`, `d_and_a#${s}`, `price#${s}`] });
  }
  specs.push({ id: 'projections', deps: ['inputs', 'run_assemble#1', 'run_assemble#2', 'run_assemble#3'] });
  specs.push({ id: 'final-model', deps: ['inputs', 'projections'] });
  return specs;
}

// Group = the scenario number in a `name#N` id; everything else is ungrouped.
export const groupOf = (id) => {
  const m = /#(\d+)$/.exec(id);
  return m ? m[1] : null;
};

// Downstream nodes legitimately shift right when a group expands.
export const isDownstream = (id) => id === 'projections' || id === 'final-model';
