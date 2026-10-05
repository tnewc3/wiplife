/**
 * People's own lives (E3): the summary every person you know carries
 * (`Person.life`), the tier that decides how closely it is followed, and the
 * facts it gives text and conditions (their job, partner, city, relation to
 * you). Nothing here draws a random number, so a save can be upgraded the
 * same way (src/persistence/migrations.ts).
 */
import type { ContentBundle, JobDef } from '../../content/schemas';
import { clampInt } from '../random';
import type { TextRole } from '../text';
import type { FamilyWealth, Id, LifeState, LifeTier, Person, PersonLife, Relationship, Trouble } from '../types';
import { wealthFromSalary, WEALTH_LEVELS } from '../interactions/wealth';

/** A person's age this year (or at death). */
export function ageOfPerson(state: LifeState, person: Person): number {
  return (person.deathYear ?? state.currentYear) - person.birthYear;
}

/** "an electrician", "a junior developer". */
export function withArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

/** Someone's partner who is not on your People list (their `life.partner`). */
export function hasOutsidePartner(person: Person | undefined): boolean {
  return person?.life?.partner != null;
}

/**
 * A person's tier from how they're related to you: family and partners are
 * close, and so are friends who feel enough for you; the rest of your friends,
 * relatives, exes and the people you work with are near; everyone else, and
 * anyone you've cut off, is far.
 */
export function tierFor(rel: Relationship, content: ContentBundle): LifeTier {
  const t = content.balance.people.tiers;
  if (rel.status === 'estranged') return 'far';
  if (t.closeKinds.includes(rel.kind)) return 'close';
  if (rel.kind === 'friend' && rel.affection >= t.closeAffection) return 'close';
  return t.nearKinds.includes(rel.kind) ? 'near' : 'far';
}

/** How likely they are to talk (0–100): sociable and unkind people gossip more. */
export function gossipTendency(person: Pick<Person, 'traits'>, content: ContentBundle): number {
  const g = content.balance.people.gossip;
  const sociability = person.traits.sociability ?? 50;
  const kindness = person.traits.kindness ?? 50;
  return clampInt(Math.round(sociability * g.sociability + (100 - kindness) * g.unkindness + g.base), 0, 100);
}

/** The job tracks people can have, in id order, with the wealth level their starting pay points to. */
const tracksCache = new WeakMap<ContentBundle, { id: Id; def: JobDef; entryWealth: FamilyWealth }[]>();
export function jobTracks(content: ContentBundle) {
  let list = tracksCache.get(content);
  if (!list) {
    list = Object.keys(content.jobs)
      .sort()
      .filter((id) => !content.jobs[id]!.retired)
      .map((id) => ({ id, def: content.jobs[id]!, entryWealth: wealthFromSalary(content.jobs[id]!.levels[0]!.salary, content) }));
    tracksCache.set(content, list);
  }
  return list;
}

/** The level (1-based) of a track that suits a wealth level best: the highest whose pay doesn't point above it. */
export function levelForWealth(def: JobDef, wealth: FamilyWealth, content: ContentBundle): number {
  const cap = WEALTH_LEVELS.indexOf(wealth);
  let level = 1;
  def.levels.forEach((l, i) => {
    if (WEALTH_LEVELS.indexOf(wealthFromSalary(l.salary, content)) <= cap) level = i + 1;
  });
  return level;
}

/**
 * A new life summary for someone who doesn't have one yet (an existing save,
 * or someone created since): no partner or children, no troubles, a level
 * that suits their job and wealth. Their wealth is taken as their background.
 */
export function defaultLife(state: LifeState, person: Person, rel: Relationship | undefined, content: ContentBundle): PersonLife {
  const track = person.occupation !== undefined ? content.jobs[person.occupation] : undefined;
  return {
    tier: rel ? tierFor(rel, content) : 'far',
    background: person.wealthLevel,
    level: track ? levelForWealth(track, person.wealthLevel, content) : 0,
    levelSince: state.currentYear,
    partner: null,
    children: [],
    troubles: [],
    recovered: [],
    gossip: gossipTendency(person, content),
  };
}

/** A copy of a life summary that can be changed without touching the original (which may be frozen). */
export function cloneLife(life: PersonLife): PersonLife {
  return {
    ...life,
    partner: life.partner ? { ...life.partner, name: { ...life.partner.name } } : null,
    ...(life.ended ? { ended: { ...life.ended } } : {}),
    children: life.children.map((c) => ({ ...c })),
    troubles: life.troubles.map((t) => ({ ...t })),
    recovered: life.recovered.map((r) => ({ ...r })),
  };
}

/** The word for what someone is to you ("sister", "friend"); the kind itself for kinds without words. */
export function relationWord(person: Person, rel: Relationship, content: ContentBundle): string {
  const words = content.text.relations as Record<string, Record<string, string> | undefined>;
  return words[rel.kind]?.[person.identity.genderCategory] ?? rel.kind;
}

/** Their job's title, bare ("electrician"), if they have one. */
export function jobTitle(person: Person, life: PersonLife | undefined, content: ContentBundle): string | undefined {
  if (person.occupation === undefined) return undefined;
  const def = content.jobs[person.occupation];
  if (!def) return undefined;
  const level = Math.min(def.levels.length, Math.max(1, life?.level || 1));
  return def.levels[level - 1]?.title;
}

/** The text role for a person: name, pronouns, and the facts of their life ({npc.relation}, {npc.partner}, {npc.city}, {npc.job}). */
export function lifeTextRole(state: LifeState, personId: Id, content: ContentBundle): TextRole | undefined {
  const person = state.people[personId];
  if (!person) return undefined;
  const rel = state.relationships[personId];
  const title = jobTitle(person, person.life, content);
  return {
    name: person.name,
    pronouns: person.identity.pronouns,
    ...(rel ? { relation: relationWord(person, rel, content) } : {}),
    ...(person.life?.partner ? { partner: person.life.partner.name.first } : person.life?.ended ? { partner: person.life.ended.partner } : {}),
    city: content.cities[person.cityId]?.name ?? person.cityId,
    ...(title !== undefined ? { job: withArticle(title) } : {}),
  };
}

/** Serious illnesses and addictions: severity at least the balance's `serious`. */
export function seriousTrouble(life: PersonLife | undefined, content: ContentBundle): Trouble | undefined {
  const bar = content.balance.people.trouble.serious;
  return life?.troubles.find((t) => t.kind !== 'crime' && t.severity >= bar);
}

/** The crime case, if there is one. */
export function crimeCase(life: PersonLife | undefined): Trouble | undefined {
  return life?.troubles.find((t) => t.kind === 'crime');
}

/** True when the person is in prison now. */
export function isJailed(life: PersonLife | undefined): boolean {
  return crimeCase(life)?.stage === 'jail';
}

/**
 * The extra yearly chance of dying from the illnesses and addictions someone
 * has (the conditions' own mortality, scaled by severity and softened by
 * treatment, and by the balance's share for the people you know).
 */
export function troubleDeathChance(life: PersonLife | undefined, content: ContentBundle): number {
  if (!life || life.troubles.length === 0) return 0;
  let total = 0;
  for (const t of life.troubles) {
    if (t.kind === 'crime') continue;
    const def = content.conditions[t.refId];
    if (!def || def.mortality === 0) continue;
    total += def.mortality * (t.severity / 100) * (t.treated ? content.balance.health.treated.mortality : 1);
  }
  return total * content.balance.people.trouble.deathScale;
}
