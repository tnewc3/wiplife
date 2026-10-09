/**
 * Making amends (L1). Later years bring chances to put right what you left
 * unfinished, and every one is built from your real history: a tie that
 * went cold or was cut (a relationship that is estranged, or whose affection
 * or trust has fallen low), a memory you would not be proud of (cheating, a
 * broken confidence, leaving someone to cope alone), or a goal you gave up
 * (a degree you left, a dream you walked away from). The sources are listed
 * in registries/later.yaml, each with the events that can answer it; the
 * events themselves check what they are about. Nothing comes up for a life
 * without that history.
 */
import type { AmendsSource, ContentBundle } from '../../content/schemas';
import { evaluate } from '../conditions';
import { queueFamilyEvent } from '../family/step';
import { weightedPick } from '../random';
import { fittingResults } from '../actions/result';
import { chance } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { AmendsRecord, Id, LifeState } from '../types';

const byId = (a: Id, b: Id) => a.localeCompare(b, 'en', { numeric: true });

export interface AmendsCandidate {
  source: string;
  def: AmendsSource;
  personId?: Id;
}

/** The key one chance is remembered by: its source, and the person if it is about one. */
export const amendsKey = (source: string, personId?: Id) => `amends:${source}:${personId ?? ''}`;

/** Whether this person fits a tie source: their relationship to you and what is unresolved between you. */
function tieFits(state: LifeState, id: Id, def: AmendsSource): boolean {
  const rel = state.relationships[id];
  const person = state.people[id];
  if (!rel || !person?.alive || rel.status === 'ended' || !def.kinds?.includes(rel.kind)) return false;
  if (def.status && !def.status.includes(rel.status)) return false;
  if (def.wasSpouse !== undefined && (rel.wasSpouse === true) !== def.wasSpouse) return false;
  if (def.below) {
    const coldAffection = def.below.affection !== undefined && rel.affection < def.below.affection;
    const coldTrust = def.below.trust !== undefined && rel.trust < def.below.trust;
    if (!coldAffection && !coldTrust) return false;
  }
  if (def.memories && !rel.memories.some((m) => def.memories!.includes(m.tag))) return false;
  return true;
}

/** Every chance to make amends your history calls for now, before the cooldown and the events that fit are applied. */
export function amendsCandidates(state: LifeState, content: ContentBundle): AmendsCandidate[] {
  const out: AmendsCandidate[] = [];
  const sources = content.registries.later.amends.sources;
  for (const source of Object.keys(sources).sort()) {
    const def = sources[source]!;
    if (def.kind === 'goal') {
      if (def.when && evaluate(def.when, state, { roles: 'strict', content })) out.push({ source, def });
      continue;
    }
    for (const id of Object.keys(state.relationships).sort(byId)) if (tieFits(state, id, def)) out.push({ source, def, personId: id });
  }
  return out;
}

/** Whether you have already made amends for this source and person. */
function madeAlready(state: LifeState, c: AmendsCandidate): boolean {
  return state.later.amends.some((a) => a.source === c.source && a.personId === c.personId && a.result === 'made');
}

/** Step part: now and then, history calls for amends and one chance comes. */
export function runAmends(state: LifeState, content: ContentBundle): void {
  const b = content.balance.later.amends;
  if (state.character.age < b.minAge || state.housing.kind === 'incarcerated') return;
  const offeredBefore = Object.keys(state.later.offered).filter((k) => k.startsWith('amends:')).length;
  const lastAny = state.later.offered.amends;
  if (offeredBefore >= b.maxPerLife || (lastAny !== undefined && state.currentYear - lastAny < b.gapYears)) return;
  const options: (readonly [AmendsCandidate, number])[] = [];
  for (const c of amendsCandidates(state, content)) {
    const last = state.later.offered[amendsKey(c.source, c.personId)];
    if ((last !== undefined && state.currentYear - last < b.cooldownYears) || madeAlready(state, c)) continue;
    const cast = c.personId === undefined ? {} : { npc: c.personId };
    if (fittingResults(state, c.def.events, cast, content).length === 0) continue;
    options.push([c, c.def.weight] as const);
  }
  if (options.length === 0 || !chance(state.rng, b.yearlyChance)) return;
  const picked = weightedPick(state.rng, options);
  state.later.offered[amendsKey(picked.source, picked.personId)] = state.currentYear;
  state.later.offered.amends = state.currentYear;
  queueFamilyEvent(state, picked.def.events, picked.personId === undefined ? {} : { npc: picked.personId }, content);
}

/** Records what came of an amends chance (an effect of the event that offered it). */
export function recordAmends(state: LifeState, source: string, personId: Id | undefined, result: AmendsRecord['result'], content: ContentBundle): void {
  state.later.amends.push({ year: state.currentYear, source, ...(personId !== undefined ? { personId } : {}), result });
  const rel = personId === undefined ? undefined : state.relationships[personId];
  if (rel) rel.memories.push({ tag: result === 'made' ? 'amends_made' : result === 'refused' ? 'amends_refused' : 'amends_put_off', year: state.currentYear });
  if (result === 'made') {
    const person = personId === undefined ? undefined : state.people[personId];
    writeFromGroup(state, content.text.later.history.amends, ['milestone', 'amends', `source:${source}`], { roles: person ? { npc: { name: person.name, pronouns: person.identity.pronouns } } : {} }, content);
  }
}
