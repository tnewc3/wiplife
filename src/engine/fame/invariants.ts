/**
 * Invariants for fame (E6b): the state is well formed (a main path that exists,
 * a rung on its ladder, scores in range, people and companies that are real), a
 * contract signed for anyone under 18 was signed by a parent and never binds them
 * exclusively, nobody under 18 goes all in or is stalked, a retired star has no
 * plan or contract, and a stalker is one of your superfans.
 */
import type { ContentBundle } from '../../content/schemas';
import type { LifeState } from '../types';

export function fameFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const f = state.fame;
  const b = content.balance.fame;
  const score = (label: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) fail(`${label} must be an integer from 0 to 100 (got ${String(value)})`);
  };
  const { adultAge } = content.balance.relationships;
  const independence = content.balance.economy.independenceAge;
  const age = state.character.age;
  score('fame.image', f.image);
  score('fame.mood', f.mood);
  score('fame.burnout', f.burnout);
  if (!Number.isSafeInteger(f.fans) || f.fans < 0) fail(`fame.fans must be a whole number of at least 0 (got ${String(f.fans)})`);
  if (!['back', 'steady', 'all'].includes(f.commitment)) fail(`fame: unknown commitment "${String(f.commitment)}"`);
  if (!['low', 'social', 'entourage', 'lavish'].includes(f.scene)) fail(`fame: unknown scene "${String(f.scene)}"`);
  if (f.active && age < independence && f.commitment === 'all') fail('fame: someone under 18 is all in');
  if (f.active) {
    if (f.main === null || !f.paths[f.main]) fail('fame: a career without a main path');
    if (f.retired !== undefined) fail('fame: active and retired at once');
  } else {
    if (f.plan !== null || f.contract !== null || f.agent !== null) fail('fame: a plan, contract or agent without a career');
  }
  const main = f.main === null ? undefined : content.famePaths[f.main];
  if (f.main !== null && !main) fail(`fame: unknown path "${f.main}"`);
  if (f.second !== null) {
    if (!content.famePaths[f.second]) fail(`fame: unknown second path "${f.second}"`);
    if (f.second === f.main) fail('fame: the second path is the main path');
    if (!f.paths[f.second]) fail('fame: a second path without a place on it');
  }
  for (const [id, p] of Object.entries(f.paths)) {
    const def = content.famePaths[id];
    if (!def) {
      fail(`fame: a place on unknown path "${id}"`);
      continue;
    }
    if (!Number.isInteger(p.rung) || p.rung < 1 || p.rung > def.rungs.length) fail(`fame: rung ${String(p.rung)} is off the ${id} ladder`);
    if (p.peak < p.rung || p.peak > def.rungs.length) fail(`fame: the highest rung in ${id} is below the current one`);
    if (typeof p.fame !== 'number' || p.fame < 0 || p.fame > 100) fail(`fame: fame in ${id} is out of range`);
    if (typeof p.craft !== 'number' || p.craft < 0 || p.craft > 100) fail(`fame: craft in ${id} is out of range`);
    if (p.recent.length > 3 || p.recent.some((q) => q < 0 || q > 100)) fail(`fame: recent quality in ${id} is malformed`);
    if (p.since > state.currentYear || p.last > state.currentYear) fail(`fame: ${id} begins or ends in the future`);
  }
  const c = f.contract;
  if (c) {
    if (!content.fameCompanies[c.company]) fail(`fame: contract with unknown company "${c.company}"`);
    if (!f.paths[c.path]) fail('fame: a contract in a path you are not in');
    if (c.until < c.since || c.share < 0 || c.share > 1 || c.advance < 0) fail('fame: a malformed contract');
    if (c.byParent && c.exclusive) fail('fame: a contract signed by a parent binds a minor exclusively');
    if (c.since - state.birthYear < independence && !c.byParent) fail('fame: a contract signed under 18 was not signed by a parent');
  }
  if (f.agent && !content.fameAgents[f.agent.agentId]) fail(`fame: unknown agent "${f.agent.agentId}"`);
  for (const type of ['super', 'hater', 'critic'] as const) {
    if (new Set(f.people[type]).size !== f.people[type].length) fail(`fame: a ${type} appears twice`);
    for (const id of f.people[type]) if (!state.people[id]) fail(`fame: fan person ${id} does not exist`);
    if (f.people[type].length > b.people.max + 1) fail(`fame: ${f.people[type].length} ${type} people (at most ${b.people.max})`);
  }
  if (f.stalker) {
    if (!f.people.super.includes(f.stalker.id)) fail('fame: the stalker is not one of your superfans');
    if (age < adultAge) fail(`fame: you are under ${adultAge} and have a stalker`);
  }
  if (f.headlines.length > b.tabloids.keep) fail('fame: too many headlines kept');
  for (const award of f.awards) if (!content.fameAwards[award.awardId]) fail(`fame: unknown award "${award.awardId}"`);
  if (f.nominated && !content.fameAwards[f.nominated.awardId]) fail('fame: nominated for an unknown award');
  for (const [k, v] of Object.entries(f.income)) if (!Number.isSafeInteger(v) || v < 0) fail(`fame.income.${k} must be a whole number of at least 0`);
  for (const [k, v] of Object.entries(f.totals)) if (!Number.isSafeInteger(v) || v < 0) fail(`fame.totals.${k} must be a whole number of at least 0`);
  return failures;
}
