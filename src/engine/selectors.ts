/** Read-only helpers the UI uses to show a life. */
import type { ContentBundle, Tone } from '../content/schemas';
import { evaluate } from './conditions';
import { textContext } from './events/text';
import { CONTINUE_CHOICE } from './life';
import { renderText } from './text';
import type { HistoryEntry, LifeStage, LifeState, Person, Relationship, StatKey } from './types';

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
}

export function getCharacterSummary(state: LifeState, content: ContentBundle): CharacterSummary {
  const c = state.character;
  return {
    fullName: `${c.name.first} ${c.name.last}`,
    age: c.age,
    lifeStage: c.lifeStage,
    cityName: content.cities[c.cityId]?.name ?? c.cityId,
    pronounLabel: `${c.identity.pronouns.subject}/${c.identity.pronouns.object}`,
    housing: state.housing.kind,
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
      if (m.year === recap.year) memories.push({ name, text: content.registries.memories.tags[m.tag] ?? m.tag });
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
