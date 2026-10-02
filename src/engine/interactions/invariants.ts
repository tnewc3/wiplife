/**
 * Invariants for interactions (E1): moods and wealth are valid, counters
 * respect the yearly caps, the outcome card points at something real, and
 * no romance interaction in the input log ever involved a minor or family.
 */
import type { ContentBundle } from '../../content/schemas';
import { isFamilyKind } from '../relationships';
import type { LifeState } from '../types';
import { WEALTH_LEVELS } from './wealth';

export function interactionFailures(state: LifeState, content: ContentBundle): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const balance = content.balance.interactions;
  const score = (label: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) fail(`${label} must be an integer from 0 to 100 (got ${String(value)})`);
  };

  for (const [id, person] of Object.entries(state.people)) {
    score(`person ${id}.mood`, person.mood);
    score(`person ${id}.moodBase`, person.moodBase);
    if (!WEALTH_LEVELS.includes(person.wealthLevel)) fail(`person ${id} has an unknown wealth level "${String(person.wealthLevel)}"`);
    if (person.occupation !== undefined && !content.jobs[person.occupation]) fail(`person ${id} works in an unknown job "${person.occupation}"`);
  }

  for (const [id, rel] of Object.entries(state.relationships)) {
    const c = rel.interactions;
    if (!c) continue;
    const label = `relationship ${id}.interactions`;
    if (!Number.isInteger(c.year) || c.year > state.currentYear) fail(`${label} is from a year that hasn't happened`);
    for (const [interactionId, n] of Object.entries(c.counts)) {
      if (!content.interactions[interactionId]) fail(`${label} counts an unknown interaction "${interactionId}"`);
      if (!Number.isInteger(n) || n < 1) fail(`${label} has a bad count for "${interactionId}"`);
    }
    const cap = balance.returns.yearlyCap;
    if (c.gained.affection < 0 || c.gained.affection > cap.affection) fail(`${label} gained ${c.gained.affection} affection (cap ${cap.affection})`);
    if (c.gained.trust < 0 || c.gained.trust > cap.trust) fail(`${label} gained ${c.gained.trust} trust (cap ${cap.trust})`);
  }

  const pending = state.pendingInteraction;
  if (pending) {
    if (state.phase !== 'yearStart') fail(`an interaction outcome card in the "${state.phase}" phase`);
    if (!state.people[pending.personId]) fail('the interaction outcome card is about someone missing');
    const def = content.interactions[pending.interactionId];
    if (!def) fail(`the interaction outcome card is for an unknown interaction "${pending.interactionId}"`);
    else {
      const tier = def.outcomes[pending.tier];
      if (!tier) fail(`the outcome card's tier "${pending.tier}" doesn't exist for "${def.id}"`);
      else if (pending.choice && !tier.choice) fail('the outcome card has a choice its interaction does not');
      if (pending.choice?.chosen !== undefined && !pending.choice.options.some((o) => o.id === pending.choice!.chosen)) fail('the outcome card chose an option it does not have');
      if ((def.gift === true) !== (pending.giftTier !== undefined)) fail('the outcome card and its interaction disagree about a gift');
    }
  }

  // The adults-only rule, checked against everything the player ever did.
  const { adultAge } = content.balance.relationships;
  for (const record of state.inputLog) {
    if (record.kind !== 'interact') continue;
    const def = content.interactions[String(record.payload.interactionId)];
    if (!def?.romance) continue;
    const personId = String(record.payload.personId);
    const person = state.people[personId];
    const rel = state.relationships[personId];
    if (!person || !rel) continue;
    if (record.year - state.birthYear < adultAge) fail(`a romance interaction "${def.id}" in ${record.year}: you were under ${adultAge}`);
    if (record.year - person.birthYear < adultAge) fail(`a romance interaction "${def.id}" in ${record.year}: ${personId} was under ${adultAge}`);
    if (isFamilyKind(rel.kind)) fail(`a romance interaction "${def.id}" with family (${personId})`);
  }
  return failures;
}
