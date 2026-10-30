/**
 * The rules no edit may break (G1, docs/expansion.md, "Content rules no edit may break"). Each is checked on the life as it
 * would be after the edit, so one record can fix a problem and use the fix. The invariants are the safety net behind them;
 * these give the player a precise reason, and cover rules the invariants don't see (presence, and who may be a partner).
 */
import { produce } from 'immer';
import type { ContentBundle } from '../../content/schemas';
import { activeJob, meetsJobRequirements, searchBlock } from '../career';
import { sameCountry } from '../country';
import { isIncarcerated, onProbation } from '../legal';
import { meetsLanguageJob } from '../languages';
import { isJailed } from '../lives/model';
import { onTemporaryStay } from '../migration/query';
import { attachedDebtIds, hasVehicle } from '../possessions/query';
import { jobRequiresVehicle } from '../possessions/jobs';
import { whereabouts } from '../presence';
import {
  ageOf,
  currentPartner,
  FAMILY_KINDS,
  isCurrentPartner,
  isFamilyKind,
  isPartnerKind,
  isRomanticKind,
  kindSince,
  mutualAttraction,
} from '../relationships';
import { isIndependent } from '../finance';
import { hasRomanticTie } from '../web/query';
import type { LifeState, Person } from '../types';
import { ageBounds } from './ageBounds';
import { fieldCount, targetPersonId, type EditArea, type EditPayload } from './payload';
import { refusal, type EditRefusal } from './refusal';

const WORK_PLACE_KINDS = ['coworker', 'boss', 'classmate'];
/** Areas that stay open for someone who has died: the words their name and gender are written in. */
const DEAD_OK: readonly EditArea[] = ['name', 'identity'];
const DEAD_IDENTITY_KEYS = ['genderCategory', 'genderIdentity', 'genderExpression', 'pronouns'];

const SELF_ONLY: readonly EditArea[] = ['appearance', 'conditions', 'money', 'career'];
const PERSON_ONLY: readonly EditArea[] = ['relationship', 'troubles', 'neuro'];

/** Every reason this edit can't be made: `before` is the life now, `after` the life with the edit applied. */
export function editRefusals(before: LifeState, after: LifeState, payload: EditPayload, content: ContentBundle): EditRefusal[] {
  const out: EditRefusal[] = [];
  const add = (r: EditRefusal) => out.push(r);
  const id = targetPersonId(payload);
  const person = id === null ? null : (before.people[id] ?? null);
  const areas = (Object.keys(payload) as (keyof EditPayload)[]).filter((k): k is EditArea => k !== 'target');

  if (id !== null && !person) return [refusal('unknown_id', 'target', { facts: { id } })];

  if (fieldCount(payload) > content.balance.godmode.edit.maxFields) add(refusal('too_many_fields', 'target', { facts: { max: content.balance.godmode.edit.maxFields } }));

  // Someone who has died: only the words of their name and gender.
  if (person && !person.alive) {
    for (const area of areas) {
      if (!DEAD_OK.includes(area)) add(refusal('dead_person', area, { person: person.id }));
      else if (area === 'identity') {
        for (const key of Object.keys(payload.identity ?? {})) if (!DEAD_IDENTITY_KEYS.includes(key)) add(refusal('dead_person', 'identity', { field: key, person: person.id }));
      }
    }
    return out;
  }

  for (const area of areas) {
    if (id === null && PERSON_ONLY.includes(area)) add(refusal('field_unavailable', area, { facts: { who: 'self' } }));
    if (id !== null && SELF_ONLY.includes(area)) add(refusal('field_unavailable', area, { person: id, facts: { who: 'person' } }));
  }
  if (id === null && payload.personality && Object.values(payload.personality).some((v) => v === null)) add(refusal('field_unavailable', 'personality', { facts: { who: 'self' } }));
  if (person?.child && payload.personality) {
    for (const [key, value] of Object.entries(payload.personality)) if (value === null) add(refusal('child_traits', 'personality', { field: key, person: person.id }));
  }
  if (id === null && payload.birthYear !== undefined) add(refusal('age_fixed', 'birthYear', { facts: { reason: 'self' } }));
  if (id === null && payload.stats && (payload.stats.mood !== undefined || payload.stats.moodBase !== undefined)) add(refusal('field_unavailable', 'stats', { facts: { who: 'self' } }));
  if (id !== null && person) {
    if (!person.child) {
      for (const key of ['health', 'happiness', 'fitness', 'stress'] as const) if (payload.stats?.[key] !== undefined) add(refusal('field_unavailable', 'stats', { field: key, person: id, facts: { who: 'person' } }));
      if (payload.latent) add(refusal('field_unavailable', 'latent', { person: id, facts: { who: 'person' } }));
      if (payload.values) add(refusal('field_unavailable', 'values', { person: id, facts: { who: 'person' } }));
    } else if (payload.values) {
      for (const key of Object.keys(payload.values)) if (key !== 'geneticRisk' && key !== 'talent') add(refusal('field_unavailable', 'values', { field: key, person: id, facts: { who: 'person' } }));
    }
  }

  identityRules(before, after, payload, person, content, add);
  appearanceRules(payload, content, add);
  valuesRules(after, payload, content, add);
  if (id === null) conditionRules(before, payload, content, add);
  else if (person) troubleRules(person, payload, content, add);
  languageRules(payload, content, id, add);
  citizenshipRules(before, person, payload, content, id, add);
  if (payload.faith) faithRules(payload, content, id, add);
  if (id === null) {
    if (payload.identity !== undefined) partnerRules(before, after, add);
    jobStillFitsRules(before, after, payload, content, add);
    moneyRules(before, payload, content, add);
    selfCityRules(before, payload, content, add);
    selfWorkRules(before, after, payload, content, add);
    if (payload.career) careerRules(before, payload, content, add);
  } else if (person) {
    relationshipRules(before, after, person, payload, content, add);
    ageRules(before, person, payload, content, add);
    personCityRules(before, after, person, payload, content, add);
    personWorkRules(before, after, person, payload, content, add);
  }
  return out;
}

function identityRules(before: LifeState, after: LifeState, payload: EditPayload, person: Person | null, content: ContentBundle, add: (r: EditRefusal) => void): void {
  if (payload.identity?.canCarry === false) {
    const f = before.family;
    const who = person?.id;
    const carrying = who === undefined ? f.pregnancy?.carrier === 'you' || f.process?.carrier === 'you' : f.pregnancy?.carrier === who || f.process?.carrier === who;
    if (carrying) add(refusal('carrying', 'identity', { field: 'canCarry', ...(who !== undefined ? { person: who } : {}) }));
  }
  if (payload.latent?.faith && payload.latent.faith.id !== null && !content.registries.belonging.faiths[payload.latent.faith.id]) {
    add(refusal('unknown_id', 'latent', { field: 'faith', ...(person ? { person: person.id } : {}), facts: { id: payload.latent.faith.id } }));
  }
  if (!person) {
    const latent = after.character.latent.faith;
    if (latent && latent.id === after.belonging.faith.id && payload.faith !== undefined) add(refusal('latent_faith_same', 'faith'));
    if (latent && latent.id === after.belonging.faith.id && payload.latent?.faith !== undefined && payload.latent.faith !== null) add(refusal('latent_faith_same', 'latent', { field: 'faith' }));
  }
}

function appearanceRules(payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  if (!payload.appearance) return;
  const { groups } = content.character.appearance;
  const taken = new Set<string>();
  let free = 0;
  for (const word of payload.appearance.descriptors) {
    const group = groups.find((g) => g.options.includes(word));
    if (group) {
      if (taken.has(group.id)) add(refusal('appearance', 'appearance', { facts: { group: group.label } }));
      taken.add(group.id);
    } else free++;
  }
  if (free > 1) add(refusal('appearance', 'appearance', { facts: { group: '' } }));
}

function valuesRules(after: LifeState, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  const v = payload.values;
  if (!v) return;
  if (typeof v.talent === 'string' && !content.talents[v.talent]) add(refusal('unknown_id', 'values', { field: 'talent', facts: { id: v.talent } }));
  if (v.talentDiscovered === true && targetPersonId(payload) === null && after.character.hidden.talent === null) add(refusal('talent_missing', 'values', { field: 'talentDiscovered' }));
}

function conditionRules(before: LifeState, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  if (!payload.conditions) return;
  const seen = new Set<string>();
  for (const w of payload.conditions) {
    const def = content.conditions[w.conditionId];
    const had = before.health.conditions.some((c) => c.conditionId === w.conditionId);
    if (!def || (def.retired && !had)) add(refusal('unknown_id', 'conditions', { field: w.conditionId, facts: { id: w.conditionId } }));
    if (seen.has(w.conditionId)) add(refusal('condition_duplicate', 'conditions', { field: w.conditionId, facts: { id: w.conditionId } }));
    seen.add(w.conditionId);
    if (def && w.named === true && (def.kind === 'mental' || def.kind === 'neuro') && before.character.age < (def.diagnosableFrom ?? 0)) {
      add(refusal('condition_age', 'conditions', { field: w.conditionId, facts: { id: w.conditionId, age: def.diagnosableFrom ?? 0 } }));
    }
    if (def && w.named !== undefined && def.kind !== 'mental' && def.kind !== 'neuro') add(refusal('field_unavailable', 'conditions', { field: w.conditionId, facts: { who: 'named' } }));
  }
}

function troubleRules(person: Person, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  if (payload.troubles) {
    const seen = new Set<string>();
    for (const t of payload.troubles) {
      const def = content.conditions[t.refId];
      if (!def || def.kind === 'neuro') add(refusal('unknown_id', 'troubles', { field: t.refId, person: person.id, facts: { id: t.refId } }));
      else if ((def.kind === 'addiction') !== (t.kind === 'addiction')) add(refusal('invalid_value', 'troubles', { field: t.refId, person: person.id, facts: { message: def.kind } }));
      const key = `${t.kind}:${t.refId}`;
      if (seen.has(key)) add(refusal('condition_duplicate', 'troubles', { field: t.refId, person: person.id, facts: { id: t.refId } }));
      seen.add(key);
    }
    if (payload.troubles.length > content.balance.people.trouble.maxTroubles) add(refusal('trouble_limit', 'troubles', { person: person.id, facts: { max: content.balance.people.trouble.maxTroubles } }));
  }
  if (payload.neuro) {
    const seen = new Set<string>();
    for (const n of payload.neuro) {
      if (content.conditions[n]?.kind !== 'neuro') add(refusal('unknown_id', 'neuro', { field: n, person: person.id, facts: { id: n } }));
      if (seen.has(n)) add(refusal('condition_duplicate', 'neuro', { field: n, person: person.id, facts: { id: n } }));
      seen.add(n);
    }
  }
}

function languageRules(payload: EditPayload, content: ContentBundle, personId: string | null, add: (r: EditRefusal) => void): void {
  const list = payload.languages;
  if (!list) return;
  const who = personId === null ? {} : { person: personId };
  const seen = new Set<string>();
  for (const l of list) {
    if (!content.languages[l.id]) add(refusal('unknown_id', 'languages', { field: l.id, ...who, facts: { id: l.id } }));
    if (seen.has(l.id)) add(refusal('language_duplicate', 'languages', { field: l.id, ...who, facts: { id: l.id } }));
    seen.add(l.id);
  }
  if (!list.some((l) => l.native)) add(refusal('no_native_language', 'languages', who));
}

function citizenshipRules(before: LifeState, person: Person | null, payload: EditPayload, content: ContentBundle, personId: string | null, add: (r: EditRefusal) => void): void {
  const list = payload.citizenships;
  if (!list) return;
  const who = personId === null ? {} : { person: personId };
  if (list.length === 0) {
    add(refusal('citizenship_empty', 'citizenships', who));
    return;
  }
  if (new Set(list).size !== list.length) add(refusal('citizenship_duplicate', 'citizenships', who));
  const current = person ? person.citizenships : before.character.citizenships;
  if (list[0] !== current[0] && !list.includes(current[0]!)) add(refusal('citizenship_first', 'citizenships', { ...who, facts: { country: current[0] ?? '' } }));
  for (const country of list) {
    const def = content.countries[country];
    if (!def || def.retired) add(refusal('unknown_id', 'citizenships', { field: country, ...who, facts: { id: country } }));
    else if (list.length > 1 && content.balance.immigration.countries[country].dual === false) add(refusal('citizenship_dual', 'citizenships', { field: country, ...who, facts: { country: def.name } }));
  }
}

function faithRules(payload: EditPayload, content: ContentBundle, personId: string | null, add: (r: EditRefusal) => void): void {
  const faith = payload.faith!;
  const who = personId === null ? {} : { person: personId };
  if (faith.id !== null && !content.registries.belonging.faiths[faith.id]) add(refusal('unknown_id', 'faith', { field: 'id', ...who, facts: { id: faith.id } }));
  if ((faith.id !== null && faith.strength < 1) || (faith.id === null && faith.strength !== 0)) add(refusal('faith_strength', 'faith', who));
}

function moneyRules(before: LifeState, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  const money = payload.money;
  if (!money) return;
  const bal = content.balance.godmode.money;
  if (money.savings !== undefined && (money.savings < 0 || money.savings > bal.savingsMax)) add(refusal('money_range', 'money', { field: 'savings', facts: { min: 0, max: bal.savingsMax } }));
  if (!money.debts) return;
  const independent = isIndependent(before, content);
  if (!independent && money.debts.length > 0) add(refusal('child_debt', 'money'));
  const attached = attachedDebtIds(before);
  for (const [i, w] of money.debts.entries()) {
    const field = `debts.${i}`;
    if (!bal.debtKinds.includes(w.kind)) add(refusal('debt_kind', 'money', { field, facts: { kind: w.kind } }));
    if (w.balance < 1 || w.balance > bal.debtMax) add(refusal('money_range', 'money', { field, facts: { min: 1, max: bal.debtMax } }));
    if (w.id !== undefined) {
      const existing = before.finances.debts.find((d) => d.id === w.id);
      if (!existing) add(refusal('unknown_id', 'money', { field, facts: { id: w.id } }));
      else if (!bal.debtKinds.includes(existing.kind) || attached.has(existing.id)) add(refusal('debt_locked', 'money', { field, facts: { kind: existing.kind } }));
      else if (existing.kind !== w.kind) add(refusal('debt_kind', 'money', { field, facts: { kind: w.kind } }));
    }
  }
  // A debt that belongs to a home, a vehicle or a business can't be forgiven by leaving it off the list: it was never on it.
}

function selfCityRules(before: LifeState, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  const cityId = payload.cityId;
  if (cityId === undefined || cityId === before.character.cityId) return;
  const city = content.cities[cityId];
  if (!city || city.retired) {
    add(refusal('unknown_id', 'cityId', { facts: { id: cityId } }));
    return;
  }
  if (!isIndependent(before, content)) add(refusal('move_minor', 'cityId'));
  if (before.housing.kind === 'owned') add(refusal('move_owned_home', 'cityId'));
  if (isIncarcerated(before)) add(refusal('move_prison', 'cityId'));
  if (onProbation(before)) add(refusal('move_probation', 'cityId'));
  if (onTemporaryStay(before)) add(refusal('move_abroad', 'cityId'));
  if (!sameCountry(before.character.cityId, cityId, content)) add(refusal('move_other_country', 'cityId'));
}

/** An edit to your languages can't leave you in a job whose language you no longer speak (the game would have ended the job). */
function jobStillFitsRules(before: LifeState, after: LifeState, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  if (payload.languages === undefined && payload.citizenships === undefined) return;
  const job = after.career.job;
  const def = job && content.jobs[job.jobId];
  if (!job || !def || before.career.job?.jobId !== job.jobId) return;
  const area = payload.languages !== undefined ? 'languages' : 'citizenships';
  if (!meetsJobRequirements(after, def, content) && meetsJobRequirements(before, def, content)) add(refusal('job_requirements', area, { facts: { job: def.name } }));
}

function selfWorkRules(before: LifeState, after: LifeState, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  const work = payload.work;
  if (!work || work.jobId === null) return;
  const def = activeJob(content, work.jobId);
  if (!def) {
    add(refusal('unknown_id', 'work', { facts: { id: work.jobId } }));
    return;
  }
  if (work.level > def.levels.length) add(refusal('invalid_value', 'work', { field: 'level', facts: { message: `at most ${def.levels.length}` , max: def.levels.length } }));
  if (before.career.job?.jobId === work.jobId && before.career.job.level === Math.min(def.levels.length, work.level)) return;
  const block = searchBlock(after, content);
  if (block === 'age') add(refusal('job_age', 'work', { facts: { age: content.balance.careers.minAge } }));
  else if (block === 'school') add(refusal('job_school', 'work'));
  else if (block === 'away') add(refusal('job_prison', 'work'));
  else if (block === 'status') add(refusal('job_status', 'work'));
  if (before.career.retired) add(refusal('job_retired', 'work'));
  if (block === null && !meetsJobRequirements(after, def, content)) add(refusal('job_requirements', 'work', { facts: { job: def.name } }));
  if (jobRequiresVehicle(work.jobId, after.character.cityId, content) && !hasVehicle(after)) add(refusal('job_vehicle', 'work', { facts: { job: def.name } }));
}

function personWorkRules(before: LifeState, after: LifeState, person: Person, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  const work = payload.work;
  if (!work || work.jobId === null) return;
  const def = activeJob(content, work.jobId);
  if (!def) {
    add(refusal('unknown_id', 'work', { person: person.id, facts: { id: work.jobId } }));
    return;
  }
  if (work.level > def.levels.length) add(refusal('invalid_value', 'work', { field: 'level', person: person.id, facts: { message: `at most ${def.levels.length}`, max: def.levels.length } }));
  if (person.occupation === work.jobId && (person.life?.level ?? 0) === Math.min(def.levels.length, work.level)) return;
  if (ageOf(before, person) < content.balance.careers.minAge) add(refusal('job_age', 'work', { person: person.id, facts: { age: content.balance.careers.minAge } }));
  if (person.life?.retired) add(refusal('job_retired', 'work', { person: person.id }));
  if (isJailed(person.life)) add(refusal('job_prison', 'work', { person: person.id }));
  const there = after.people[person.id];
  if (there && !meetsLanguageJob(there.languages, def, there.cityId, content)) add(refusal('job_language', 'work', { person: person.id, facts: { job: def.name } }));
}

function personCityRules(before: LifeState, after: LifeState, person: Person, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  const cityId = payload.cityId;
  if (cityId === undefined || cityId === person.cityId) return;
  const city = content.cities[cityId];
  if (!city || city.retired) {
    add(refusal('unknown_id', 'cityId', { person: person.id, facts: { id: cityId } }));
    return;
  }
  if (!sameCountry(person.cityId, cityId, content)) add(refusal('move_other_country', 'cityId', { person: person.id }));
  // Where they would be if only the rest of the edit (a relationship that ends, say) had been made: someone who lives with you stays.
  const staying = produce(after, (d) => {
    d.people[person.id]!.cityId = person.cityId;
  });
  if (whereabouts(staying, person.id, content) === 'household' && cityId !== before.character.cityId) add(refusal('lives_with_you', 'cityId', { person: person.id }));
  const kind = after.relationships[person.id]?.kind;
  if (kind !== undefined && (WORK_PLACE_KINDS.includes(kind) || kind === 'teacher') && cityId !== before.character.cityId) add(refusal('works_with_you', 'cityId', { person: person.id }));
}

function ageRules(before: LifeState, person: Person, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  const born = payload.birthYear;
  if (born === undefined || born === person.birthYear) return;
  const bounds = ageBounds(before, person.id, content);
  if (!bounds.editable) {
    add(refusal('age_fixed', 'birthYear', { person: person.id, facts: { reason: bounds.reason ?? 'unknown' } }));
    return;
  }
  // A birth year that makes them a minor when the romance began is reported by the romance rule (relationshipRules).
  if (born > bounds.romanceMaxBirthYear) return;
  if (born < bounds.minBirthYear || born > bounds.maxBirthYear) {
    add(refusal('age_bounds', 'birthYear', { person: person.id, facts: { minAge: before.currentYear - bounds.maxBirthYear, maxAge: before.currentYear - bounds.minBirthYear } }));
  }
}

function relationshipRules(before: LifeState, after: LifeState, person: Person, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  const touches = payload.relationship !== undefined || payload.identity !== undefined || payload.birthYear !== undefined;
  if (!touches) return;
  const rel = before.relationships[person.id];
  const next = after.relationships[person.id];
  const edit = payload.relationship;
  const { adultAge } = content.balance.relationships;
  const pid = person.id;
  if (!rel || !next) return;

  if (edit?.kind !== undefined && edit.kind !== rel.kind) {
    if (isFamilyKind(rel.kind) || rel.kind === 'teacher' || FAMILY_KINDS.includes(edit.kind)) add(refusal('family_kind', 'relationship', { field: 'kind', person: pid }));
    else if (WORK_PLACE_KINDS.includes(edit.kind)) add(refusal('place_kind', 'relationship', { field: 'kind', person: pid }));
  }
  const kindChanged = next.kind !== rel.kind;
  if (kindChanged && isRomanticKind(next.kind)) {
    if (!person.alive) add(refusal('dead_person', 'relationship', { field: 'kind', person: pid }));
    if (isPartnerKind(next.kind) && (person.life?.partner || hasRomanticTie(before.web, pid))) add(refusal('taken', 'relationship', { field: 'kind', person: pid }));
  }
  // No romance involving anyone under 18: now, or when it took its kind.
  if (isRomanticKind(next.kind) && (kindChanged || payload.birthYear !== undefined)) {
    const at = kindSince(next);
    const them = after.people[pid]!;
    if (at - them.birthYear < adultAge || ageOf(after, them) < adultAge) add(refusal('minor_romance', 'relationship', { field: 'kind', person: pid, facts: { age: adultAge, theirAge: ageOf(after, them) } }));
    if (at - after.birthYear < adultAge || after.character.age < adultAge) add(refusal('minor_romance', 'relationship', { field: 'kind', person: pid, facts: { age: adultAge, theirAge: after.character.age, you: 1 } }));
  }
  if (isPartnerKind(next.kind) && next.status !== 'active') add(refusal('partner_status', 'relationship', { field: 'status', person: pid }));
  else if (isFamilyKind(next.kind) && next.status === 'ended' && rel.status !== 'ended') add(refusal('partner_status', 'relationship', { field: 'status', person: pid, facts: { family: 1 } }));
  partnerRules(before, after, add);
}

/** One partner at a time, and attraction both ways, on the life as it would be (not blamed on an edit when it was already so). */
function partnerRules(before: LifeState, after: LifeState, add: (r: EditRefusal) => void): void {
  const partners = Object.values(after.relationships).filter((r) => isCurrentPartner(after, r));
  if (partners.length > 1 && Object.values(before.relationships).filter((r) => isCurrentPartner(before, r)).length < partners.length) {
    add(refusal('second_partner', 'relationship', { field: 'kind', person: partners.find((r) => !isCurrentPartner(before, before.relationships[r.personId]!))?.personId ?? partners[0]!.personId }));
  }
  const partner = currentPartner(after);
  if (!partner) return;
  const them = after.people[partner.personId]!;
  if (mutualAttraction(after, them)) return;
  const was = currentPartner(before);
  if (was?.personId === partner.personId && !mutualAttraction(before, before.people[partner.personId]!)) return;
  add(refusal('no_attraction', 'relationship', { field: 'kind', person: partner.personId }));
}

/** C2: sports, music and fame edits: the career must exist, and what is named must belong to it. */
function careerRules(before: LifeState, payload: EditPayload, content: ContentBundle, add: (r: EditRefusal) => void): void {
  const career = payload.career;
  if (!career) return;
  const f = before.fame;
  const unavailable = (field: string) => add(refusal('field_unavailable', 'career', { field, facts: { who: 'self' } }));
  if (career.sports) {
    const def = f.active && before.sports.sport !== null && f.main === before.sports.sport ? content.famePaths[before.sports.sport] : undefined;
    const sport = def?.sport;
    if (!def || !sport) unavailable('sports');
    else {
      const s = career.sports;
      if (s.position !== undefined && !sport.positions.some((p) => p.id === s.position)) add(refusal('unknown_id', 'career', { field: 'position', facts: { id: s.position } }));
      for (const id of Object.keys(s.skills ?? {})) if (!def.skills?.some((k) => k.id === id)) add(refusal('unknown_id', 'career', { field: 'skills', facts: { id } }));
      if (s.salary !== undefined && before.sports.contract === null) unavailable('salary');
    }
  }
  if (career.music) {
    const m = career.music;
    const path = f.active && f.band !== null ? f.paths[f.band.path] : undefined;
    if (m.buzz !== undefined && !path) unavailable('buzz');
    if ((m.chemistry !== undefined || m.members !== undefined) && f.band === null) unavailable('band');
    for (const member of m.members ?? []) if (!f.band?.members.some((x) => x.id === member.id)) add(refusal('unknown_id', 'career', { field: 'members', person: member.id, facts: { id: member.id } }));
    if (m.releases !== undefined && f.projects.length === 0) add(refusal('nothing_changed', 'career', { field: 'releases' }));
  }
  if (career.fame) {
    const e = career.fame;
    if (!f.active || f.main === null) unavailable('fame');
    else {
      if (e.agent !== undefined && e.agent !== null && !content.fameAgents[e.agent]) add(refusal('unknown_id', 'career', { field: 'agent', facts: { id: e.agent } }));
      if (e.contract !== undefined && f.contract === null) unavailable('contract');
    }
  }
}
