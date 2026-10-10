/**
 * A death you see coming (L1). Some deaths come with warning: a serious
 * condition that has run its course, or a long decline in old age. When one
 * begins, a diagnosis event tells you, and you can prepare: where to spend
 * your last months (hospice, home or hospital), the service you want, who
 * you want with you, letters to write, who you want to speak, and a will
 * that is up to date. The death itself follows the usual rolls plus a
 * chance that rises with each year since the warning, and is put down to the
 * cause behind it. What you chose is kept for the funeral, the eulogy and
 * who attends (src/engine/eulogy).
 */
import type { ContentBundle } from '../../content/schemas';
import { HOSPICE_CHOICES, SERVICE_STYLES } from '../../content/schemas';
import { curveAt } from '../curve';
import { queueFamilyEvent } from '../family/step';
import { wholeDollars } from '../finance';
import { clampInt } from '../random';
import { ageOf } from '../relationships';
import { chance, type RngState } from '../rng';
import { pickCause } from '../systems/mortality';
import { writeFromGroup } from '../systems/history';
import type { HospiceChoice, Id, LastVisit, LifeState, ServiceStyle, Terminal } from '../types';
import { offerOnce } from './grandchildren';
import { willOutOfDate } from './query';

const byId = (a: Id, b: Id) => a.localeCompare(b, 'en', { numeric: true });

/** The pseudo condition id the death check uses for a foreseen death. */
export const TERMINAL_ID = 'terminal';

/** The chance of dying this year because of the warning you were given (0 without one). */
export function terminalDeathChance(state: LifeState, content: ContentBundle): number {
  const t = state.later.terminal;
  if (t === null) return 0;
  const chances = content.balance.later.terminal.deathChance;
  return chances[Math.min(chances.length - 1, Math.max(0, state.currentYear - t.since))] ?? 0;
}

/** The yearly cost of where you spend your last months, in your city (0 before you choose, and in prison). */
export function hospiceCost(state: LifeState, content: ContentBundle): number {
  const t = state.later.terminal;
  if (t === null || t.hospice === null || state.housing.kind === 'incarcerated') return 0;
  return wholeDollars(content.balance.later.terminal.hospice[t.hospice].cost * (content.cities[state.character.cityId]?.costOfLiving ?? 1));
}

/** Rolls whether a warning begins this year, and why. Draws only when something could. */
function rollTerminal(state: LifeState, content: ContentBundle): { causeId: Id; conditionId?: Id } | null {
  const b = content.balance.later.terminal;
  const c = state.character;
  if (c.age < b.minAge || state.later.terminal !== null) return null;
  for (const had of [...state.health.conditions].sort((x, y) => (x.conditionId < y.conditionId ? -1 : 1))) {
    const def = content.conditions[had.conditionId];
    if (!def || def.kind === 'addiction' || def.mortality < b.conditionMortality || had.severity < b.condition.minSeverity) continue;
    if (chance(state.rng, curveAt(b.condition.chance, had.severity))) return { causeId: def.cause ?? pickCause(state.rng, c.age, content), conditionId: had.conditionId };
  }
  if (c.age >= b.decline.minAge && c.stats.health < b.decline.healthBelow && chance(state.rng, curveAt(b.decline.chance, c.age))) {
    return { causeId: pickCause(state.rng, c.age, content) };
  }
  return null;
}

/** The diagnosis event ids for the condition behind a warning (or the decline). */
export function diagnosisEvents(content: ContentBundle, conditionId: Id | undefined): readonly Id[] {
  const reg = content.registries.later.terminal.diagnosis;
  return (conditionId !== undefined ? reg[conditionId] : undefined) ?? (conditionId === undefined ? reg.decline : undefined) ?? reg.other ?? [];
}

/** Step part: a warning may begin; each year after it, the hospice does its work and your visitors come. */
export function runTerminal(state: LifeState, content: ContentBundle): void {
  if (state.housing.kind === 'incarcerated') return;
  const b = content.balance.later.terminal;
  let t = state.later.terminal;
  if (t === null) {
    const start = rollTerminal(state, content);
    if (start === null) return;
    t = {
      since: state.currentYear,
      causeId: start.causeId,
      ...(start.conditionId !== undefined ? { conditionId: start.conditionId } : {}),
      hospice: null,
      service: null,
      letters: [],
      visitors: [],
      visits: [],
    };
    state.later.terminal = t;
    writeFromGroup(state, content.text.later.history.terminal, ['milestone', 'terminal'], {}, content);
    queueFamilyEvent(state, diagnosisEvents(content, start.conditionId), {}, content);
    if (willOutOfDate(state)) {
      t.willPrompted = true;
      queueFamilyEvent(state, content.registries.later.terminal.will, {}, content);
    }
    return;
  }
  const years = state.currentYear - t.since;
  if (t.hospice !== null) {
    const stats = state.character.stats;
    const deltas = b.hospice[t.hospice].deltas;
    for (const key of Object.keys(deltas).sort() as (keyof typeof deltas)[]) stats[key] = clampInt(stats[key] + (deltas[key] ?? 0), 0, 100);
  }
  // A late will prompt, for someone whose will went out of date after the warning (a new grandchild, a death).
  if (!t.willPrompted && years <= b.willPromptYears && willOutOfDate(state)) {
    t.willPrompted = true;
    queueFamilyEvent(state, content.registries.later.terminal.will, {}, content);
  }
  // The people who came are with you again, and grow closer.
  const came = t.visits.filter((v) => v.came && state.people[v.id]?.alive === true);
  for (const visit of came) {
    const rel = state.relationships[visit.id];
    if (!rel || rel.status === 'ended') continue;
    rel.affection = clampInt(rel.affection + b.visit.affection, 0, 100);
    rel.trust = clampInt(rel.trust + b.visit.trust, 0, 100);
  }
  if (came.length > 0 && offerOnce(state, 'terminalvisit', 1)) {
    const visitor = came[(state.currentYear - t.since) % came.length]!;
    queueFamilyEvent(state, content.registries.later.terminal.visit, { visitor: visitor.id }, content);
  }
}

// ── Final wishes ─────────────────────────────────────────────────────────

export interface WishesInput {
  hospice: HospiceChoice | null;
  service: ServiceStyle | null;
  speakerId: Id | null;
  letters: Id[];
  visitors: Id[];
}

/** You can set your final wishes: between years, with a death coming. */
export function canSetWishes(state: LifeState): boolean {
  return state.phase === 'yearStart' && state.later.terminal !== null;
}

function personChoosable(state: LifeState, id: Id): boolean {
  const rel = state.relationships[id];
  const person = state.people[id];
  return rel !== undefined && rel.status !== 'ended' && person !== undefined && person.alive;
}

/** Who you can ask to speak: someone alive in your life, old enough, and not an ex. */
export function canSpeak(state: LifeState, id: Id, content: ContentBundle): boolean {
  const person = state.people[id];
  const rel = state.relationships[id];
  return personChoosable(state, id) && rel!.kind !== 'ex' && ageOf(state, person!) >= content.balance.eulogy.speaker.minAge;
}

/** Checks the proposed wishes against the people who exist and the balance limits; null when invalid. */
export function parseWishes(input: unknown, state: LifeState, content: ContentBundle): WishesInput | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  const b = content.balance.later.terminal;
  const hospice = o.hospice ?? null;
  const service = o.service ?? null;
  const speakerId = o.speakerId ?? null;
  if (hospice !== null && !(HOSPICE_CHOICES as readonly unknown[]).includes(hospice)) return null;
  if (service !== null && !(SERVICE_STYLES as readonly unknown[]).includes(service)) return null;
  if (speakerId !== null && (typeof speakerId !== 'string' || !canSpeak(state, speakerId, content))) return null;
  const ids = (value: unknown, max: number): Id[] | null => {
    if (!Array.isArray(value) || value.length > max) return null;
    if (!value.every((v) => typeof v === 'string' && personChoosable(state, v)) || new Set(value).size !== value.length) return null;
    return [...(value as Id[])].sort(byId);
  };
  const letters = ids(o.letters ?? [], b.maxLetters);
  const visitors = ids(o.visitors ?? [], b.maxVisitors);
  if (letters === null || visitors === null) return null;
  return { hospice: hospice as HospiceChoice | null, service: service as ServiceStyle | null, speakerId: speakerId as Id | null, letters, visitors };
}

/** Whether a chosen visitor comes: the chance rises with how they feel, and falls if they are estranged or far away. */
function visitorComes(state: LifeState, id: Id, rng: RngState, content: ContentBundle): boolean {
  const v = content.balance.later.terminal.visit;
  const rel = state.relationships[id]!;
  const person = state.people[id]!;
  let p = ((rel.affection + rel.trust) / 200) * v.scale;
  if (rel.status === 'estranged') p *= v.estranged;
  if (person.cityId !== state.character.cityId) p *= v.far;
  return chance(rng, Math.min(0.97, p));
}

/**
 * Sets your final wishes (the caller checked them with parseWishes). Visitors you add answer at once: they come or they
 * don't (an estranged person who comes has made their peace). Each letter you add reaches its person: they feel closer,
 * and an estranged person may reconcile. Anyone you take off the list no longer counts.
 */
export function setWishes(state: LifeState, wishes: WishesInput, rng: RngState, content: ContentBundle): void {
  const t = state.later.terminal;
  if (t === null) return;
  const b = content.balance.later.terminal;
  const year = state.currentYear;
  t.hospice = wishes.hospice;
  t.service = wishes.service;
  if (wishes.speakerId === null) delete t.speakerId;
  else t.speakerId = wishes.speakerId;
  const before = new Set(t.letters);
  for (const id of wishes.letters) {
    if (before.has(id)) continue;
    const rel = state.relationships[id]!;
    rel.affection = clampInt(rel.affection + b.letter.affection, 0, 100);
    rel.trust = clampInt(rel.trust + b.letter.trust, 0, 100);
    rel.memories.push({ tag: 'got_your_letter', year });
    if (rel.status === 'estranged' && chance(rng, b.letter.reconcile)) {
      rel.status = 'active';
      rel.memories.push({ tag: 'made_peace', year });
    }
  }
  t.letters = wishes.letters;
  const known = new Map<Id, LastVisit>(t.visits.map((v) => [v.id, v]));
  t.visits = wishes.visitors.map((id): LastVisit => {
    const existing = known.get(id);
    if (existing) return existing;
    const came = visitorComes(state, id, rng, content);
    const rel = state.relationships[id]!;
    if (came) {
      rel.memories.push({ tag: 'at_your_bedside', year });
      if (rel.status === 'estranged') {
        rel.status = 'active';
        rel.memories.push({ tag: 'made_peace', year });
      }
    } else {
      rel.memories.push({ tag: 'stayed_away_at_the_end', year });
    }
    return { id, came };
  });
  t.visitors = wishes.visitors;
  t.wishesYear = year;
}

/** Sets only where you spend your last months (an event's choice). */
export function setHospice(state: LifeState, choice: HospiceChoice): void {
  if (state.later.terminal !== null) state.later.terminal.hospice = choice;
}

/** The warning you were given, with how long you have known. */
export function knownFor(state: LifeState): { terminal: Terminal; years: number } | null {
  const terminal = state.later.terminal;
  return terminal === null ? null : { terminal, years: state.currentYear - terminal.since };
}
