import type { HubState } from '../types';

export const emptyHub = (): HubState => ({
  skills: {},
  marks: {},
  commit: {},
  load: 0,
  shares: {},
  burnout: 0,
  gave: null,
  overYears: 0,
  peakLoad: 0,
  enhancers: { on: false, since: 0, years: 0, tests: 0, positives: 0 },
  pool: null,
  rehearsals: { year: 0, count: 0 },
  totals: { rehearsals: 0, auditions: 0, hired: 0, sportSwitches: 0, relieved: 0 },
});
