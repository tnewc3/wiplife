/**
 * The family step of the year pipeline (E2a). As each year begins: a child
 * may die; the children grow (./growth.ts); a pregnancy begun last year ends
 * in a birth, a placement for adoption or a miscarriage; an adoption, IVF
 * cycle or surrogacy that has waited long enough comes to an answer; a
 * custody hearing is queued for children whose parents are no longer
 * together; and child support is dropped once no child needs it. The state
 * changes here; each result also queues an event from registries/family.yaml
 * (cast with the people in it) that tells the story and offers what the
 * player can do about it.
 */
import type { ContentBundle, EventDef } from '../../content/schemas';
import { fittingResults } from '../actions/result';
import { curveAt } from '../curve';
import { currentPartner } from '../relationships';
import { chance } from '../rng';
import { weightedPick } from '../random';
import { npcDeathChance } from '../systems/mortality';
import type { Id, LifeState, Pregnancy } from '../types';
import { createChild, livingChildren, type Parents } from './children';
import { custodyHearings, undecidedChildren } from './custody';
import { growChildren } from './growth';
import { miscarriageChance } from './pregnancy';
import { ivfSuccessChance, processOther } from './process';

/**
 * Queues the first of these events that fits now (by weight), due this year:
 * the pacing step shows it with the year's other events. Roles the event
 * doesn't cast are left out. Does nothing when none fits.
 */
export function queueFamilyEvent(state: LifeState, eventIds: readonly Id[], cast: Record<string, Id>, content: ContentBundle): EventDef | null {
  const options = fittingResults(state, eventIds, cast, content);
  if (options.length === 0) return null;
  const def = weightedPick(state.rng, options);
  const own: Record<string, Id> = {};
  for (const [role, id] of Object.entries(cast)) if (def.cast && role in def.cast) own[role] = id;
  if (!state.scheduled.some((s) => s.eventId === def.id && s.dueYear <= state.currentYear && JSON.stringify(s.cast) === JSON.stringify(own))) {
    state.scheduled.push({ eventId: def.id, dueYear: state.currentYear, cast: own });
  }
  return def;
}

function aliveId(state: LifeState, id: Id | undefined): Id | undefined {
  return id !== undefined && state.people[id]?.alive ? id : undefined;
}

/** The ids of the roles to pass an event: only people still alive. */
function roles(state: LifeState, named: Record<string, Id | undefined>): Record<string, Id> {
  const out: Record<string, Id> = {};
  for (const [role, id] of Object.entries(named)) {
    const alive = aliveId(state, id);
    if (alive !== undefined) out[role] = alive;
  }
  return out;
}

/** Who a child's biological parents are for a pregnancy that began this way (surrogacy and gametes are simplified: see docs/technical.md, E2a). */
function biologicalParents(state: LifeState, p: Pregnancy): Parents {
  const other = aliveId(state, p.otherParentId);
  if (p.how === 'trying' || p.how === 'unplanned' || p.how === 'surrogacy') return { you: true, ...(other !== undefined ? { other } : {}) };
  // IVF: the carrier, and the partner who can't carry (a carrier partner of a carrier needs a donor).
  if (p.carrier === 'you') return { you: true, ...(other !== undefined && !state.people[other]!.canCarry ? { other } : {}) };
  const carrierId = aliveId(state, p.carrier);
  return { you: !state.character.canCarry, ...(carrierId !== undefined ? { other: carrierId } : {}) };
}

function resolvePregnancy(state: LifeState, content: ContentBundle): void {
  const p = state.family.pregnancy;
  if (!p || p.startYear >= state.currentYear) return;
  const reg = content.registries.family;
  const carrierId = p.carrier !== 'you' && p.carrier !== 'surrogate' ? p.carrier : undefined;
  // Someone who carried a pregnancy and has died leaves nothing to resolve.
  if (carrierId !== undefined && !state.people[carrierId]?.alive) {
    state.family.pregnancy = null;
    return;
  }
  const other = aliveId(state, p.otherParentId);
  const carrierPartner = carrierId !== undefined && currentPartner(state)?.personId === carrierId;
  const remember = (tag: string) => {
    for (const id of new Set([other, carrierId])) if (id !== undefined) state.relationships[id]?.memories.push({ tag, year: state.currentYear });
  };

  if (chance(state.rng, miscarriageChance(state, p.carrier, content))) {
    state.family.pregnancy = null;
    state.family.miscarriages += 1;
    remember('lost_a_pregnancy');
    if (p.carrier === 'you') queueFamilyEvent(state, reg.miscarriage.you, roles(state, { other }), content);
    else if (p.carrier === 'surrogate') queueFamilyEvent(state, reg.miscarriage.surrogate, roles(state, { other }), content);
    else queueFamilyEvent(state, reg.miscarriage.carried, roles(state, { carrier: carrierId }), content);
    return;
  }

  if (p.decision === 'adoption') {
    state.family.pregnancy = null;
    remember('placed_a_baby');
    if (p.carrier === 'you') queueFamilyEvent(state, reg.birth.placedYou, roles(state, { other }), content);
    else queueFamilyEvent(state, reg.birth.placedOther, roles(state, { carrier: carrierId }), content);
    return;
  }

  // A birth. A baby carried by someone who isn't your partner lives with them.
  const custody = carrierId !== undefined && !carrierPartner ? 'other' : 'you';
  const otherParentId = carrierId ?? other;
  const origin = p.how === 'ivf' ? 'ivf' : p.how === 'surrogacy' ? 'surrogacy' : 'birth';
  const babyId = createChild(
    state,
    state.rng,
    { origin, age: 0, parents: biologicalParents(state, p), ...(otherParentId !== undefined ? { otherParentId } : {}), custody },
    content,
  );
  state.family.pregnancy = null;
  state.family.attempts = 0;
  if (custody === 'other' && carrierId !== undefined && state.family.support === null) state.family.support = { direction: 'pay', personId: carrierId };
  if (p.carrier === 'you') queueFamilyEvent(state, reg.birth.you, roles(state, { baby: babyId, other }), content);
  else if (p.carrier === 'surrogate') queueFamilyEvent(state, reg.birth.surrogate, roles(state, { baby: babyId, other }), content);
  else if (carrierPartner) queueFamilyEvent(state, reg.birth.partner, roles(state, { baby: babyId, carrier: carrierId }), content);
  else queueFamilyEvent(state, reg.birth.coparent, roles(state, { baby: babyId, carrier: carrierId }), content);
}

function resolveProcess(state: LifeState, content: ContentBundle): void {
  const process = state.family.process;
  if (!process || process.dueYear > state.currentYear) return;
  state.family.process = null;
  const f = content.balance.family;
  const reg = content.registries.family;
  const other = processOther(state, process);

  if (process.kind === 'adoption') {
    if (chance(state.rng, f.adoption.declineChance)) {
      queueFamilyEvent(state, reg.adoption.declined, {}, content);
      return;
    }
    const age = weightedPick(state.rng, f.adoption.childAgeWeights.map((w, i) => [i, w] as const));
    const childId = createChild(
      state,
      state.rng,
      { origin: 'adopted', age, parents: { you: false }, ...(other !== undefined ? { otherParentId: other } : {}), custody: 'you' },
      content,
    );
    queueFamilyEvent(state, reg.adoption.match, { child: childId }, content);
    return;
  }

  if (process.kind === 'ivf') {
    const carrier = process.carrier ?? 'you';
    const carrierAlive = carrier === 'you' || state.people[carrier]?.alive === true;
    if (carrierAlive && chance(state.rng, ivfSuccessChance(state, carrier, content))) {
      state.family.pregnancy = { startYear: state.currentYear, how: 'ivf', carrier, ...(other !== undefined ? { otherParentId: other } : {}), decision: 'keep' };
      state.family.attempts = 0;
      queueFamilyEvent(state, reg.ivf.success, roles(state, { other }), content);
    } else {
      queueFamilyEvent(state, reg.ivf.failed, roles(state, { other }), content);
    }
    return;
  }

  if (chance(state.rng, f.surrogacy.success)) {
    state.family.pregnancy = { startYear: state.currentYear, how: 'surrogacy', carrier: 'surrogate', ...(other !== undefined ? { otherParentId: other } : {}), decision: 'keep' };
    state.family.attempts = 0;
    queueFamilyEvent(state, reg.surrogacy.match, roles(state, { other }), content);
  } else {
    queueFamilyEvent(state, reg.surrogacy.fellThrough, roles(state, { other }), content);
  }
}

/** A child may die (rarely): the grief chain starts with the event queued here. */
function childDeaths(state: LifeState, content: ContentBundle): void {
  const { death } = content.balance.family.children;
  const reg = content.registries.family.childDeath;
  for (const person of livingChildren(state, true)) {
    const age = state.currentYear - person.birthYear;
    const rel = state.relationships[person.id];
    if (!rel || rel.status === 'ended') continue;
    const p = age < death.usualFrom ? curveAt(death.byAge, age) : npcDeathChance(age, content);
    if (!chance(state.rng, p)) continue;
    person.alive = false;
    person.deathYear = state.currentYear;
    state.family.lostChildren += 1;
    const stage = age < 2 ? 'infant' : age < 13 ? 'young' : age < content.balance.relationships.adultAge ? 'teen' : 'adult';
    queueFamilyEvent(state, reg[stage], { child: person.id }, content);
  }
}

/**
 * Children whose other parent has died stay with you; a stepchild whose
 * parent is now your ex leaves your life; a custody hearing is queued for
 * the exes with children whose custody is undecided.
 */
function separations(state: LifeState, content: ContentBundle): void {
  for (const person of livingChildren(state, true)) {
    const d = person.child;
    const otherId = d.otherParentId;
    const rel = state.relationships[person.id]!;
    if (rel.kind === 'stepchild') {
      if (rel.status !== 'ended' && otherId !== undefined && state.relationships[otherId]?.kind === 'ex') rel.status = 'ended';
      continue;
    }
    if (otherId !== undefined && !d.custodyDecided && state.people[otherId]?.alive !== true) {
      d.custodyDecided = true;
      d.custody = 'you';
      person.cityId = state.character.cityId;
    }
  }
  for (const exId of custodyHearings(state, content)) {
    if (undecidedChildren(state, exId, content).length === 0) continue;
    if (state.scheduled.some((s) => content.events[s.eventId] && content.registries.family.custody.includes(s.eventId) && s.cast.other === exId)) continue;
    queueFamilyEvent(state, content.registries.family.custody, roles(state, { other: exId }), content);
  }
  // Support ends when no child it covers is left.
  const support = state.family.support;
  if (support) {
    const { untilAge } = content.balance.family.support;
    const covered = livingChildren(state).some(
      (p) => p.child.otherParentId === support.personId && state.currentYear - p.birthYear < untilAge && p.child.custody === (support.direction === 'pay' ? 'other' : 'you'),
    );
    if (!covered) state.family.support = null;
  }
}

/** Year pipeline step: children, pregnancy, processes, custody and support. */
export function runFamily(state: LifeState, content: ContentBundle): void {
  childDeaths(state, content);
  growChildren(state, content);
  resolvePregnancy(state, content);
  resolveProcess(state, content);
  separations(state, content);
}
