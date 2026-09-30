/** Read-only helpers the UI uses to show a life. */
import type { ContentBundle, RomanceStatus, Tone } from '../content/schemas';
import { availableActions, type AvailableAction } from './actions';
import { evaluate } from './conditions';
import { textContext } from './events/text';
import { CONTINUE_CHOICE } from './life';
import { currentPartner, FAMILY_KINDS, isCurrentPartner, romanceStatus, ROMANTIC_KINDS, WORK_KINDS } from './relationships';
import { renderText } from './text';
import type { GenderCategory, HistoryEntry, Id, LifeStage, LifeState, Person, Relationship, RelationshipKind, StatKey } from './types';

export interface FamilyMember {
  person: Person;
  relationship: Relationship;
  /** Age this year, or at death. */
  age: number;
}

export function personAge(person: Person, currentYear: number): number {
  return (person.deathYear ?? currentYear) - person.birthYear;
}

const FAMILY_ORDER: Partial<Record<Relationship['kind'], number>> = {
  parent: 0,
  stepparent: 1,
  grandparent: 2,
  sibling: 3,
};

/** Your spouses, current and late (not exes), longest married first. */
export function getSpouses(state: LifeState): FamilyMember[] {
  return Object.values(state.relationships)
    .filter((r) => r.kind === 'spouse')
    .flatMap((relationship) => {
      const person = state.people[relationship.personId];
      return person ? [{ person, relationship, age: personAge(person, state.currentYear) }] : [];
    })
    .sort((a, b) => (a.relationship.kindSince ?? 0) - (b.relationship.kindSince ?? 0));
}

/** Parents first, then siblings; oldest first within each group. */
export function getFamily(state: LifeState): FamilyMember[] {
  return Object.values(state.relationships)
    .filter((r) => r.kind in FAMILY_ORDER)
    .flatMap((relationship) => {
      const person = state.people[relationship.personId];
      return person ? [{ person, relationship, age: personAge(person, state.currentYear) }] : [];
    })
    .sort(
      (a, b) =>
        FAMILY_ORDER[a.relationship.kind]! - FAMILY_ORDER[b.relationship.kind]! || a.person.birthYear - b.person.birthYear,
    );
}

export interface CharacterSummary {
  fullName: string;
  age: number;
  lifeStage: LifeStage;
  cityName: string;
  /** e.g. "she/her" or "xe/xem". */
  pronounLabel: string;
  housing: LifeState['housing']['kind'];
  /** Single, dating, engaged or married, and to whom. */
  romance: { status: RomanceStatus; partnerName: string | null };
}

export function getCharacterSummary(state: LifeState, content: ContentBundle): CharacterSummary {
  const c = state.character;
  const partner = currentPartner(state);
  const person = partner ? state.people[partner.personId] : undefined;
  return {
    fullName: `${c.name.first} ${c.name.last}`,
    age: c.age,
    lifeStage: c.lifeStage,
    cityName: content.cities[c.cityId]?.name ?? c.cityId,
    pronounLabel: `${c.identity.pronouns.subject}/${c.identity.pronouns.object}`,
    housing: state.housing.kind,
    romance: { status: romanceStatus(state), partnerName: person ? `${person.name.first} ${person.name.last}` : null },
  };
}

/** Groups on the People screen (docs/design.md, section L). */
export type PeopleGroupId = 'family' | 'romance' | 'friends' | 'work';
export const PEOPLE_GROUPS: readonly PeopleGroupId[] = ['family', 'romance', 'friends', 'work'];

export interface PersonRow {
  id: Id;
  fullName: string;
  kind: RelationshipKind;
  genderCategory: GenderCategory;
  /** Age this year, or at death. */
  age: number;
  alive: boolean;
  status: Relationship['status'];
  affection: number;
  trust: number;
  /** Your current partner, fiancé or spouse. */
  current: boolean;
  /** Has been your spouse (an ex-spouse, once divorced). */
  wasSpouse: boolean;
}

function groupOf(kind: RelationshipKind): PeopleGroupId {
  if (FAMILY_KINDS.includes(kind)) return 'family';
  if (ROMANTIC_KINDS.includes(kind)) return 'romance';
  if (WORK_KINDS.includes(kind)) return 'work';
  return 'friends';
}

function personRow(state: LifeState, person: Person, rel: Relationship): PersonRow {
  return {
    id: person.id,
    fullName: `${person.name.first} ${person.name.last}`,
    kind: rel.kind,
    genderCategory: person.identity.genderCategory,
    age: personAge(person, state.currentYear),
    alive: person.alive,
    status: rel.status,
    affection: rel.affection,
    trust: rel.trust,
    current: isCurrentPartner(state, rel),
    wasSpouse: rel.wasSpouse === true,
  };
}

const KIND_ORDER: RelationshipKind[] = [
  'parent',
  'stepparent',
  'grandparent',
  'sibling',
  'spouse',
  'fiance',
  'partner',
  'ex',
  'friend',
  'classmate',
  'acquaintance',
  'boss',
  'coworker',
];

/**
 * Everyone in your life, grouped into family, romance, friends and work.
 * Family is always listed; anyone else who has faded out of your life
 * (status 'ended') is left out. Within a group: the living first, then by
 * kind, then (family) oldest first or (others) closest first.
 */
export function getPeople(state: LifeState): Record<PeopleGroupId, PersonRow[]> {
  const groups: Record<PeopleGroupId, PersonRow[]> = { family: [], romance: [], friends: [], work: [] };
  for (const id of Object.keys(state.relationships).sort()) {
    const rel = state.relationships[id]!;
    const person = state.people[id];
    if (!person) continue;
    const group = groupOf(rel.kind);
    if (group !== 'family' && rel.status === 'ended') continue;
    groups[group].push(personRow(state, person, rel));
  }
  const birthYear = (row: PersonRow) => state.people[row.id]!.birthYear;
  for (const group of PEOPLE_GROUPS) {
    groups[group].sort(
      (a, b) =>
        Number(b.alive) - Number(a.alive) ||
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        (group === 'family' ? birthYear(a) - birthYear(b) : b.affection - a.affection),
    );
  }
  return groups;
}

export interface MemoryView {
  year: number;
  age: number;
  text: string;
}

export interface PersonDetail {
  row: PersonRow;
  /** e.g. "she/her". */
  pronounLabel: string;
  /** Shared memories as readable lines, newest first. */
  memories: MemoryView[];
  /** Management actions available now (none for the dead). */
  actions: AvailableAction[];
}

/** A memory's readable text for this person (registries/memories.yaml). */
export function memoryText(tag: string, person: Person, content: ContentBundle): string {
  const template = content.registries.memories.tags[tag];
  if (template === undefined) return tag;
  return renderText(template, { roles: { npc: { name: person.name, pronouns: person.identity.pronouns } } });
}

/** One person's page: who they are to you, your shared memories and what you can do. Null for someone you don't know. */
export function getPersonDetail(state: LifeState, personId: Id, content: ContentBundle): PersonDetail | null {
  const person = state.people[personId];
  const rel = state.relationships[personId];
  if (!person || !rel) return null;
  const memories = rel.memories
    .map((m) => ({ year: m.year, age: m.year - state.birthYear, text: memoryText(m.tag, person, content) }))
    .reverse();
  return {
    row: personRow(state, person, rel),
    pronounLabel: `${person.identity.pronouns.subject}/${person.identity.pronouns.object}`,
    memories,
    actions: availableActions(state, personId, content),
  };
}

/** Active cities for pickers, sorted by name. */
export function getCityOptions(content: ContentBundle): { id: string; name: string; blurb: string }[] {
  return Object.values(content.cities)
    .filter((c) => !c.retired)
    .map((c) => ({ id: c.id, name: c.name, blurb: c.blurb }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Active pronoun presets for pickers, most commonly used first (by creation weights). */
export function getPronounPresets(content: ContentBundle) {
  const usage = (id: string) =>
    Object.values(content.balance.creation.pronouns).reduce((sum, weights) => sum + (weights[id] ?? 0), 0);
  return Object.values(content.pronouns)
    .filter((p) => !p.retired)
    .sort((a, b) => usage(b.id) - usage(a.id) || (a.id < b.id ? -1 : 1));
}

/** History entries, newest first; `limit` keeps only the most recent. */
export function getHistoryFeed(state: LifeState, limit?: number): HistoryEntry[] {
  const newestFirst = [...state.history].reverse();
  return limit === undefined ? newestFirst : newestFirst.slice(0, limit);
}

/** History grouped by year, oldest first, for the Life history screen. */
export function getTimeline(history: readonly HistoryEntry[]): { year: number; age: number; entries: HistoryEntry[] }[] {
  const groups: { year: number; age: number; entries: HistoryEntry[] }[] = [];
  for (const entry of history) {
    const last = groups[groups.length - 1];
    if (last && last.year === entry.year) last.entries.push(entry);
    else groups.push({ year: entry.year, age: entry.age, entries: [entry] });
  }
  return groups;
}

export interface YearRecapView {
  year: number;
  age: number;
  /** Stats that changed, with their change (never zero). */
  statChanges: { stat: StatKey; change: number }[];
  /** This year's history entries. */
  entries: HistoryEntry[];
  /** Memories made this year, with the person and the memory's readable text. */
  memories: { name: string; text: string }[];
  /** People met this year. */
  newPeople: { name: string; kind: Relationship['kind'] }[];
}

/** The last finished year's recap, or null before the first age-up or mid-year. */
export function getYearRecap(state: LifeState, content: ContentBundle): YearRecapView | null {
  const recap = state.recap;
  if (!recap || !recap.statsAfter) return null;
  const after = recap.statsAfter;
  const statChanges = (Object.keys(after) as StatKey[])
    .map((stat) => ({ stat, change: after[stat] - recap.statsBefore[stat] }))
    .filter((c) => c.change !== 0);
  const memories: YearRecapView['memories'] = [];
  const newPeople: YearRecapView['newPeople'] = [];
  for (const id of Object.keys(state.relationships).sort()) {
    const rel = state.relationships[id]!;
    const person = state.people[id];
    if (!person) continue;
    const name = `${person.name.first} ${person.name.last}`;
    for (const m of rel.memories) {
      if (m.year === recap.year) memories.push({ name, text: memoryText(m.tag, person, content) });
    }
    if (rel.since === recap.year && rel.since !== state.birthYear) newPeople.push({ name, kind: rel.kind });
  }
  return {
    year: recap.year,
    age: recap.age,
    statChanges,
    entries: state.history.filter((e) => e.year === recap.year),
    memories,
    newPeople,
  };
}

export interface EventCardView {
  instanceId: string;
  title: string;
  text: string;
  tone: Tone;
  /** Choices the player can see now; an event without choices offers Continue. */
  choices: { id: string; label: string }[];
  resolved: boolean;
  outcomeText: string | null;
}

/** One pending event as a card, with its text rendered for the cast. Null past the end. */
export function getEventCard(state: LifeState, index: number, content: ContentBundle): EventCardView | null {
  const instance = state.pending[index];
  if (!instance) return null;
  const def = content.events[instance.eventId];
  const base = {
    instanceId: instance.instanceId,
    resolved: instance.resolvedChoiceId !== undefined,
    outcomeText: instance.outcomeText ?? null,
  };
  // A definition removed by a content update: a card the player can dismiss.
  if (!def) return { ...base, title: '…', text: '', tone: 'neutral', choices: [{ id: CONTINUE_CHOICE, label: 'Continue' }] };
  const ctx = textContext(state, instance.cast);
  const choices = def.choices
    ? def.choices
        .filter((c) => evaluate(c.visibleIf, state, { cast: instance.cast, roles: 'strict' }))
        .map((c) => ({ id: c.id, label: renderText(c.label, ctx) }))
    : [{ id: CONTINUE_CHOICE, label: 'Continue' }];
  return { ...base, title: renderText(def.title, ctx), text: renderText(def.text, ctx), tone: def.tone, choices };
}

/** Index of the first pending event still waiting for the player, or null. */
export function firstUnresolvedEvent(state: LifeState): number | null {
  const i = state.pending.findIndex((p) => p.resolvedChoiceId === undefined);
  return i < 0 ? null : i;
}

/** True when the player can age up right now. */
export function canAgeUp(state: LifeState): boolean {
  return state.phase === 'yearStart';
}
