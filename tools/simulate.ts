/**
 * `npm run simulate -- [--lives 1000] [--seed sim] [--player both|all|careful|careless|spammer] [--json report.json]`:
 * plays random lives headless and prints a report: the careful player's in
 * full, then (with both, the default) a careful vs careless comparison on
 * the same seeds, and (E1) the careless player's interactions beside it. `all`
 * W6 reports emigration by route and country, approvals and refusals, time to citizenship, undocumented outcomes (regularized, removed, went home, still without papers), pay with and without papers, remittances through the ledger, the people you know who emigrated and children's citizenship, with the rules that must always hold.
 * W5 reports trips, destinations, encounters, temporary study/work and their effects.
 * W4b reports native and learned languages, learning/fading rates, local-job language gates and shared-language social contacts.
 * adds the spammer, who repeats one interaction with one person over and
 * over (it is slower: use fewer lives). Exits with code 1 if any invariant
 * fails in any run.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { setAutoFreeze } from 'immer';
import compiled from '../src/content/compiled/content.json';
import type { ContentBundle, CountryId } from '../src/content/schemas';
import { formatInteractions } from './simulate/interactions';
import { continueAsHeirs, startChains } from './simulate/generations';
import { formatHeirs, heirTargets } from './simulate/heirs';
import { measureFullCircle } from './simulate/people';
import { formatComparison, formatReport, interactionTargets, runSimulation, type SimulatedPlayer } from './simulate/run';
import { crimeTargets, formatCrime } from './simulate/crime';
import { fameTargets, formatFame } from './simulate/fame';
import { formatSports, sportsTargets } from './simulate/sports';
import { withCountryTargets } from './simulate/countries';

// The compiled JSON directly: src/content/index.ts relies on Vite's import.meta.env.
const bundle = compiled as ContentBundle;

const { values } = parseArgs({
  options: {
    lives: { type: 'string', default: '1000' },
    seed: { type: 'string', default: 'sim' },
    json: { type: 'string' },
    player: { type: 'string', default: 'both' },
    generations: { type: 'string', default: '3' },
    country: { type: 'string' },
  },
});

const lives = Number(values.lives);
if (!Number.isInteger(lives) || lives < 1) {
  console.error('--lives must be a positive whole number');
  process.exit(2);
}

// Immer freezes every new state to catch accidental mutation. The app and the
// unit tests keep that on; a headless run of thousands of lives skips it for
// speed (about a third faster).
setAutoFreeze(false);

const started = Date.now();
const players: SimulatedPlayer[] =
  values.player === 'all' ? ['careful', 'careless', 'spammer', 'criminal', 'star', 'athlete'] : values.player === 'both' ? ['careful', 'careless'] : [values.player as SimulatedPlayer];
if (!players.every((p) => p === 'careful' || p === 'careless' || p === 'spammer' || p === 'criminal' || p === 'star' || p === 'athlete')) {
  console.error('--player must be all, both, careful, careless, spammer, criminal, star or athlete');
  process.exit(2);
}
const generations = Number(values.generations);
if (!Number.isInteger(generations) || generations < 1) {
  console.error('--generations must be a positive whole number');
  process.exit(2);
}
// W4a: --country us|ca|uk|mx plays every life in that country (left out: random starts across countries), judged on that
// country's own targets (src/content/balance/countries.yaml targets) in place of the shared money and lifespan ones.
const country = values.country as CountryId | undefined;
if (country !== undefined && !bundle.countries[country]) {
  console.error(`--country must be one of ${Object.keys(bundle.countries).sort().join(', ')}`);
  process.exit(2);
}
const content = country ? withCountryTargets(bundle, country) : bundle;
// E2b: the careful player's lives that end with a living child continue as heirs, for `generations` generations.
const chains = startChains(content);
const reports = players.map((player) =>
  runSimulation(content, { lives, seedPrefix: values.seed, player, ...(country ? { country } : {}), ...(player === 'careful' && generations > 1 ? { onLife: chains.onLife } : {}) }),
);
// E3: how long a year takes to begin with a full circle of people simulated.
for (const r of reports) if (r.player === 'careful') r.people.fullCircle = measureFullCircle(content, 60, 20);
console.log(formatReport(reports[0]!, content));
if (reports.length >= 2 && reports[0]!.player === 'careful' && reports[1]!.player === 'careless') {
  console.log('');
  console.log(formatComparison(reports[0]!, reports[1]!, content));
}
// E2b: heirs, generation after generation.
const careful = reports.find((r) => r.player === 'careful');
const heirRun =
  careful && generations > 1
    ? continueAsHeirs(content, generations, { report: careful, collector: chains.collector, chains: chains.chains }, { seedPrefix: values.seed, player: 'careful' })
    : null;
if (heirRun) {
  heirRun.reports.forEach((r, i) => {
    if (r.failureMessages.length > 0) console.log(`\nGeneration ${i + 2} invariant failures (first ${r.failureMessages.length} of ${r.invariantFailures}):\n  ${r.failureMessages.join('\n  ')}`);
  });
  console.log('');
  console.log(
    [
      ...formatHeirs(heirRun.report),
      '  targets (src/content/balance/targets.yaml):',
      ...heirTargets(heirRun.report, content).map((r) => `  ${r.met ? 'MET    ' : 'NOT MET'} ${r.label}: ${r.value} (target ${r.goal})`),
    ].join('\n'),
  );
}
// E1: the other players' interactions, beside the careful player's.
for (const report of reports.slice(1)) {
  console.log('');
  console.log(
    [
      ...formatInteractions(report.interactions, content),
      '  targets (the spammer and the careless player are reported, not tuned for):',
      ...interactionTargets(report, content).map((r) => `  ${r.met ? 'MET    ' : 'NOT MET'} ${r.label}: ${r.value} (target ${r.goal})`),
      // E6a: every other player's crime career, too (the criminal player's is judged).
      ...formatCrime(report.crime, content),
      '  targets (src/content/balance/targets.yaml):',
      ...crimeTargets(report, content).map((r) => `  ${r.met ? 'MET    ' : 'NOT MET'} ${r.label}: ${r.value} (target ${r.goal})`),
      // E6b: every other player's fame, too (the star player's is judged).
      ...formatFame(report.fame, content),
      '  targets (src/content/balance/targets.yaml):',
      ...fameTargets(report, content).map((r) => `  ${r.met ? 'MET    ' : 'NOT MET'} ${r.label}: ${r.value} (target ${r.goal})`),
      // E6c: every other player's sports, too (the athlete player's are judged).
      ...formatSports(report.sports, content),
      '  targets (src/content/balance/targets.yaml):',
      ...sportsTargets(report, content).map((r) => `  ${r.met ? 'MET    ' : 'NOT MET'} ${r.label}: ${r.value} (target ${r.goal})`),
    ].join('\n'),
  );
}
console.log(`Finished in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
if (values.json) {
  const body = reports.length > 1 ? Object.fromEntries(reports.map((r) => [r.player, r])) : reports[0];
  await writeFile(values.json, `${JSON.stringify(heirRun ? { ...body, heirs: heirRun.report } : body, null, 2)}\n`);
}
if (reports.some((r) => r.invariantFailures > 0) || (heirRun?.reports ?? []).some((r) => r.invariantFailures > 0)) process.exit(1);
