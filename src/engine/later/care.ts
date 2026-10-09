/**
 * Care near the end (L1). Late in life, health and age can make you need
 * looking after. The need is rolled each year (balance/later.yaml care); it
 * is answered by an event that offers what fits: a relative who steps up
 * (family), a paid carer through the ledger (finance), or assisted living
 * (housing). Who steps up depends on the ties: the closest of the relatives
 * who can, in the order the balance lists; an estranged relative who still
 * cares may come back, or stay away. If you leave it unsettled, your family
 * (or paid care) steps in after a couple of years.
 */
import type { ContentBundle } from '../../content/schemas';
import { curveAt } from '../curve';
import { canMoveToAssisted, moveToAssisted } from '../housing';
import { isJailed } from '../lives/model';
import { clampInt } from '../random';
import { ageOf } from '../relationships';
import { chance, type RngState } from '../rng';
import { queueFamilyEvent } from '../family/step';
import { writeFromGroup } from '../systems/history';
import { wholeDollars } from '../finance';
import type { CareOption, Id, LifeState, Person } from '../types';
import { offerOnce } from './grandchildren';

const byId = (a: Id, b: Id) => a.localeCompare(b, 'en', { numeric: true });

/** The chance (0–1) that you start needing care this year: by age, health and the conditions you have. */
export function careChance(state: LifeState, content: ContentBundle): number {
  const b = content.balance.later.care;
  const c = state.character;
  if (c.age < b.minAge || state.later.care !== null || state.housing.kind === 'incarcerated') return 0;
  let factor = 1;
  for (const had of state.health.conditions) factor = Math.max(factor, b.conditions[had.conditionId] ?? 1);
  return Math.min(0.9, curveAt(b.chance, c.age) * curveAt(b.healthFactor, c.stats.health) * factor);
}

export interface Provider {
  id: Id;
  /** They were estranged and would be coming back. */
  returning: boolean;
}

/** Whether this person could look after you now (alive, grown, free, and not in need of care themselves), apart from how they feel. */
function ableToCare(state: LifeState, person: Person, kind: string, content: ContentBundle): boolean {
  const b = content.balance.later.care.family;
  const age = ageOf(state, person);
  const partner = kind === 'spouse' || kind === 'partner' || kind === 'fiance';
  if (!person.alive || age < b.minAge || (!partner && age > b.maxAge)) return false;
  const life = person.life;
  if (life && (isJailed(life) || life.care === 'needed' || life.care === 'paid' || life.care === 'home')) return false;
  return !(life && life.troubles.some((t) => t.kind !== 'crime' && t.severity >= content.balance.people.trouble.serious));
}

/**
 * Everyone who could look after you, in the order they would be asked: by the
 * kinds the balance lists, then whoever feels closest, then by id. Someone who
 * is estranged is on the list only if they still feel enough (they may come
 * back); people who already said no are not.
 */
export function careProviders(state: LifeState, content: ContentBundle): Provider[] {
  const b = content.balance.later.care.family;
  const declined = new Set(state.later.care?.declined ?? []);
  const out: (Provider & { rank: number; combined: number })[] = [];
  for (const id of Object.keys(state.relationships).sort(byId)) {
    const rel = state.relationships[id]!;
    const person = state.people[id];
    const rank = b.kinds.indexOf(rel.kind);
    if (rank < 0 || !person || rel.status === 'ended' || declined.has(id) || !ableToCare(state, person, rel.kind, content)) continue;
    // A grandchild this young does not look after you.
    if (rel.kind === 'grandchild' && ageOf(state, person) < 25) continue;
    const combined = rel.affection + rel.trust;
    if (rel.status === 'estranged') {
      if (rel.affection < b.estranged.minAffection) continue;
      out.push({ id, returning: true, rank, combined });
    } else if (combined >= b.minCombined) {
      out.push({ id, returning: false, rank, combined });
    }
  }
  out.sort((x, y) => x.rank - y.rank || y.combined - x.combined || byId(x.id, y.id));
  return out.map(({ id, returning }) => ({ id, returning }));
}

/**
 * Who steps up: the first of the people who could, in order. Someone coming back from an
 * estrangement does so with the balance's chance (one draw each); one who doesn't is not
 * asked again.
 */
export function chooseProvider(state: LifeState, rng: RngState, content: ContentBundle): Provider | null {
  const b = content.balance.later.care.family;
  for (const candidate of careProviders(state, content)) {
    if (!candidate.returning || chance(rng, b.estranged.chance)) return candidate;
    state.later.care?.declined.push(candidate.id);
  }
  return null;
}

/** Whether this relative can look after you now (for choosing family care). */
export function canProvide(state: LifeState, id: Id, content: ContentBundle): boolean {
  return careProviders(state, content).some((p) => p.id === id);
}

function history(state: LifeState, key: 'careNeeded' | 'careFamily' | 'carePaid' | 'careAssisted', content: ContentBundle, provider?: Person): void {
  writeFromGroup(
    state,
    content.text.later.history[key],
    ['milestone', 'care', key],
    { roles: provider ? { npc: { name: provider.name, pronouns: provider.identity.pronouns } } : {} },
    content,
  );
}

/** Whether this way of providing care is possible now. */
export function canChooseCare(state: LifeState, option: CareOption, providerId: Id | undefined, content: ContentBundle): boolean {
  if (state.later.care === null) return false;
  if (option === 'family') return providerId !== undefined && canProvide(state, providerId, content);
  if (option === 'assisted') return canMoveToAssisted(state, content);
  return true;
}

/**
 * Settles how your care is provided (the caller checks it can be). Family: the relative comes to
 * live near you, and an estrangement ends. Paid: a carer comes to your home (through the ledger).
 * Assisted: you move to assisted living (a home you own is sold). Changing from one to another is allowed.
 */
export function chooseCare(state: LifeState, option: CareOption, providerId: Id | undefined, content: ContentBundle): void {
  const care = state.later.care;
  if (care === null || !canChooseCare(state, option, providerId, content)) return;
  // Leaving assisted living for another kind of care means moving out of it.
  if (state.housing.assisted && option !== 'assisted') {
    delete state.housing.assisted;
    state.housing.annualCost = 0;
  }
  care.option = option;
  care.optionSince = state.currentYear;
  delete care.providerId;
  if (option === 'family') {
    const person = state.people[providerId!]!;
    const rel = state.relationships[providerId!]!;
    care.providerId = providerId!;
    person.cityId = state.character.cityId;
    if (rel.status === 'estranged') {
      rel.status = 'active';
      rel.memories.push({ tag: 'made_peace', year: state.currentYear });
    }
    rel.memories.push({ tag: 'looks_after_you', year: state.currentYear });
    history(state, 'careFamily', content, person);
  } else if (option === 'paid') {
    history(state, 'carePaid', content);
  } else {
    moveToAssisted(state, content);
    history(state, 'careAssisted', content);
  }
}

/** The yearly cost of paid care at home, in your city (assisted living is part of your housing cost). */
export function paidCareCost(state: LifeState, content: ContentBundle): number {
  if (state.later.care?.option !== 'paid' || state.housing.kind === 'incarcerated') return 0;
  return wholeDollars(content.balance.later.care.cost.paid * (content.cities[state.character.cityId]?.costOfLiving ?? 1));
}

/** Care is needed and nothing is arranged: queue the event that asks. */
function askAboutCare(state: LifeState, content: ContentBundle): void {
  const reg = content.registries.later.care;
  const provider = chooseProvider(state, state.rng, content);
  if (provider === null) {
    queueFamilyEvent(state, reg.alone, {}, content);
    return;
  }
  queueFamilyEvent(state, provider.returning ? reg.returns : reg.offer, { carer: provider.id }, content);
}

/** The provider can't or won't go on: care is open again. */
function providerGone(state: LifeState, content: ContentBundle): void {
  const care = state.later.care!;
  const id = care.providerId;
  care.option = null;
  delete care.providerId;
  if (id !== undefined) care.declined.push(id);
  care.since = state.currentYear;
  const alive = id !== undefined && state.people[id]?.alive === true;
  queueFamilyEvent(state, content.registries.later.care.providerGone, alive ? { carer: id! } : {}, content);
}

function applyDeltas(state: LifeState, deltas: Partial<Record<'health' | 'happiness' | 'smarts' | 'looks' | 'fitness' | 'stress', number>>): void {
  const stats = state.character.stats;
  for (const key of Object.keys(deltas).sort() as (keyof typeof deltas)[]) stats[key] = clampInt(stats[key] + (deltas[key] ?? 0), 0, 100);
}

/** Step part: the need begins, is answered, and each year of care passes. */
export function runCare(state: LifeState, content: ContentBundle): void {
  const b = content.balance.later.care;
  if (state.housing.kind === 'incarcerated') return;
  const care = state.later.care;
  if (care === null) {
    const p = careChance(state, content);
    if (p > 0 && chance(state.rng, p)) {
      state.later.care = { since: state.currentYear, option: null, declined: [] };
      history(state, 'careNeeded', content);
      state.later.offered.care = state.currentYear;
      askAboutCare(state, content);
    }
    return;
  }

  // Nothing settled: remind you now and then; after a while the family (or paid care) steps in.
  if (care.option === null) {
    if (state.currentYear - care.since >= b.defaultAfterYears) {
      const provider = chooseProvider(state, state.rng, content);
      if (provider) chooseCare(state, 'family', provider.id, content);
      else chooseCare(state, 'paid', undefined, content);
    } else if (offerOnce(state, 'care', b.reminderYears)) {
      queueFamilyEvent(state, content.registries.later.care.reminder, {}, content);
    }
    return;
  }

  // You left assisted living (a move ends it).
  if (care.option === 'assisted' && !state.housing.assisted) {
    care.option = null;
    care.since = state.currentYear;
    queueFamilyEvent(state, content.registries.later.care.reminder, {}, content);
    return;
  }

  if (care.option === 'family') {
    const id = care.providerId;
    const person = id === undefined ? undefined : state.people[id];
    const rel = id === undefined ? undefined : state.relationships[id];
    const able = person !== undefined && rel !== undefined && rel.status === 'active' && ableToCare(state, person, rel.kind, content);
    if (!able || chance(state.rng, b.family.givesOut)) {
      providerGone(state, content);
      return;
    }
    rel.affection = clampInt(rel.affection + b.family.provider.affection, 0, 100);
    rel.trust = clampInt(rel.trust + b.family.provider.trust, 0, 100);
    person.cityId = state.character.cityId;
    if (offerOnce(state, 'carefamilyyear', 3)) queueFamilyEvent(state, content.registries.later.care.year, { carer: id! }, content);
  } else if (care.option === 'assisted' && care.optionSince === state.currentYear - 1) {
    queueFamilyEvent(state, content.registries.later.care.assisted, {}, content);
  }
  applyDeltas(state, b.effects[care.option]);
}
