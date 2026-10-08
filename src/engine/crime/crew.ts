/**
 * Crews (E6a): joining one, the people in it, ranks, and getting out. A crew
 * is a definition in src/content/crews made real for you: the people in it
 * are real people in your life (friends, tied to one another by E4 ties), one
 * of whom runs it until you do. Adults only: the engine refuses under 18 and
 * the content build requires it of every event that joins a crew. Numbers:
 * balance/crime.yaml (entry, ranks).
 */
import type { CastSpec, ContentBundle, CrewDef } from '../../content/schemas';
import { createPerson } from '../events/casting';
import { isIncarcerated } from '../legal';
import { clampInt, rollScore } from '../random';
import { nextInt, pick } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { CrimePast, Id, LifeState, Person } from '../types';
import { addTie, canTie } from '../web/ties';
import { crewDef, crewName, inCrew, liveMembers, rankTitle } from './query';

/** Crews that work in a city (active ones only). */
export function crewsIn(content: ContentBundle, cityId: Id): CrewDef[] {
  return Object.values(content.crews)
    .filter((c) => !c.retired && c.cities.includes(cityId))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Why you can't join a crew now, or null. */
export type JoinBlock = 'age' | 'inCrew' | 'away' | 'none';

export function joinBlock(state: LifeState, content: ContentBundle): JoinBlock | null {
  if (state.character.age < content.balance.relationships.adultAge) return 'age';
  if (inCrew(state)) return 'inCrew';
  if (isIncarcerated(state)) return 'away';
  if (crewsIn(content, state.character.cityId).length === 0) return 'none';
  return null;
}

/** Leans a person's traits toward the crew's and marks them as part of it. */
export function shapePerson(person: Person, def: CrewDef, tag: string): void {
  for (const [trait, delta] of Object.entries(def.traits)) {
    const key = trait as keyof Person['traits'];
    person.traits[key] = clampInt((person.traits[key] ?? 50) + (delta ?? 0), 0, 100);
  }
  if (!person.tags.includes(tag)) person.tags = [...person.tags, tag];
}

/** Makes new friends who are in the crew, tied to one another (E4) and to the rest. Returns their ids. */
function makeMembers(state: LifeState, def: CrewDef, count: number, content: ContentBundle): Id[] {
  const entry = content.balance.crime.entry;
  const spec: CastSpec = { kind: 'friend', presence: 'city', createIfMissing: true, age: { min: entry.memberAge.min, max: entry.memberAge.max } };
  const made: Id[] = [];
  for (let i = 0; i < count; i++) {
    const id = createPerson(state, spec, state.rng, content);
    if (id === null) continue;
    shapePerson(state.people[id]!, def, `crew:${def.id}`);
    state.relationships[id]!.affection = rollScore(state.rng, entry.memberAffection);
    made.push(id);
  }
  return made;
}

/** Ties everyone in the crew to everyone else, as friends (E4); pairs that are tied already stay as they are. */
function tieMembers(state: LifeState, ids: readonly Id[], content: ContentBundle): void {
  const spread = content.balance.crime.entry.tieAffection;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (canTie(state, ids[i]!, ids[j]!)) addTie(state.web, ids[i]!, ids[j]!, 'friends', rollScore(state.rng, spread), 'context', state.currentYear);
    }
  }
}

/** The oldest of these people (ties broken by id): who runs the crew. */
function oldestOf(state: LifeState, ids: readonly Id[]): Id | undefined {
  return [...ids].sort((a, b) => state.people[a]!.birthYear - state.people[b]!.birthYear || (a < b ? -1 : 1))[0];
}

/** Keeps the crew staffed: enough people you know, and someone running it while you don't. Called as you join and each year. */
export function staffCrew(state: LifeState, content: ContentBundle): void {
  const crew = state.crime.crew;
  const def = crew && crewDef(content, crew.defId);
  if (!crew || !def) return;
  crew.members = liveMembers(state, crew);
  const want = nextInt(state.rng, content.balance.crime.entry.members.min, content.balance.crime.entry.members.max);
  if (crew.members.length < Math.min(want, content.balance.crime.entry.members.min)) {
    const made = makeMembers(state, def, want - crew.members.length, content);
    crew.members = [...crew.members, ...made];
    tieMembers(state, crew.members, content);
  }
  const leaderGone = crew.leader === undefined || !crew.members.includes(crew.leader);
  if (state.crime.rank < content.balance.crime.ranks.length && leaderGone) {
    const next = oldestOf(state, crew.members);
    if (next !== undefined) crew.leader = next;
    else delete crew.leader;
  } else if (state.crime.rank >= content.balance.crime.ranks.length) delete crew.leader;
  if (crew.informant !== undefined && !crew.members.includes(crew.informant)) delete crew.informant;
}

/** Where you start in a crew: a rank and a standing. */
export interface Start {
  rank: number;
  standing: number;
}

/**
 * You are taken in by a crew that works in your city: a rank and standing to
 * start from (rank 1 and the usual standing for a new member; for a crew you
 * were in before, what balance `away.rejoin` gives for how you left it, below
 * the best rank you held; or what `start` says), the people already in it
 * (and whoever brought you, if given), and a rival crew. Returns false when
 * you may not (see `joinBlock`).
 */
export function joinCrew(state: LifeState, content: ContentBundle, brought?: Id, start?: Start): boolean {
  if (joinBlock(state, content) !== null) return false;
  const crews = crewsIn(content, state.character.cityId);
  // A crew you were in before takes you back first, if it works here.
  const before = [...state.crime.past].reverse().find((p) => crews.some((c) => c.id === p.crewId));
  const def = (before && crews.find((c) => c.id === before.crewId)) || pick(state.rng, crews);
  const entry = content.balance.crime.entry;
  const rivals = def.rivals.filter((id) => content.crews[id] && !content.crews[id]!.retired && content.crews[id]!.cities.includes(state.character.cityId));
  const crime = state.crime;
  crime.crew = {
    defId: def.id,
    cityId: state.character.cityId,
    since: state.currentYear,
    members: [],
    rivalMembers: [],
    ...(rivals.length > 0 ? { rival: pick(state.rng, rivals) } : {}),
  };
  const again = start ?? (before ? rejoinStart(before, content) : undefined);
  crime.rank = again?.rank ?? 1;
  crime.peak = crime.rank;
  crime.rankSince = state.currentYear;
  crime.standing = again?.standing ?? entry.standing;
  crime.lowYears = 0;
  crime.awayYears = 0;
  crime.rivalry = entry.rivalry;
  crime.heat = Math.max(crime.heat, entry.heat);
  const adultAge = content.balance.relationships.adultAge;
  const bringer = brought === undefined ? undefined : state.people[brought];
  if (brought !== undefined && state.relationships[brought] && bringer?.alive && state.currentYear - bringer.birthYear >= adultAge) {
    crime.crew.members.push(brought);
    shapePerson(state.people[brought]!, def, `crew:${def.id}`);
  }
  staffCrew(state, content);
  writeFromGroup(state, content.text.crime.history.joined, ['crime', 'joined'], { values: { crew: def.name } }, content);
  return true;
}

/** Where you start in a crew you were in before: below the best rank you held, by how you left it. */
function rejoinStart(before: CrimePast, content: ContentBundle): Start {
  const r = content.balance.crime.away.rejoin[before.how];
  return {
    rank: clampInt(before.topRank - r.rankDrop, 1, content.balance.crime.ranks.length - 1),
    standing: clampInt(content.balance.crime.entry.standing + r.standing, 0, 100),
  };
}

/** Where you would start in a crew that works where you live now, having moved: your best rank less a few, with your reputation and record counting for you. */
export function transferStart(state: LifeState, content: ContentBundle): Start {
  const t = content.balance.crime.away.transfer;
  const record = state.legal.record.some((r) => !r.sealed) ? t.record : 0;
  const reputation = Math.max(0, state.character.hidden.reputation - 50) * t.reputation;
  return {
    rank: clampInt(state.crime.peak - t.rankDrop, 1, content.balance.crime.ranks.length - 1),
    standing: clampInt(content.balance.crime.entry.standing + t.standing + record + reputation, 0, 100),
  };
}

/**
 * While you are away from your crew, you leave it (how: moved) and join one that
 * works where you live now, at a lower rank. False when you are not away or no
 * crew works here.
 */
export function transferCrew(state: LifeState, content: ContentBundle): boolean {
  const crew = state.crime.crew;
  if (!crew?.away || crewsIn(content, state.character.cityId).length === 0) return false;
  const start = transferStart(state, content);
  leaveCrew(state, 'moved', content);
  return joinCrew(state, content, undefined, start);
}

/** How you left, for the record and the history. */
export function leaveCrew(state: LifeState, how: CrimePast['how'], content: ContentBundle): boolean {
  const crime = state.crime;
  const crew = crime.crew;
  if (!crew) return false;
  crime.totals.years += Math.max(0, state.currentYear - crew.since);
  crime.past.push({ crewId: crew.defId, fromYear: crew.since, toYear: state.currentYear, topRank: crime.peak, how });
  const name = crewName(content, crew.defId);
  crime.crew = null;
  crime.rank = 0;
  crime.peak = 0;
  crime.rankSince = 0;
  crime.standing = 0;
  crime.lowYears = 0;
  crime.awayYears = 0;
  crime.rivalry = 0;
  const key = how === 'pushed' ? 'pushedOut' : how === 'drifted' ? 'drifted' : 'left';
  writeFromGroup(state, content.text.crime.history[key], ['crime', key], { values: { crew: name } }, content);
  return true;
}

/** One rank up (to the top, you run the crew), with a history line. */
export function promote(state: LifeState, content: ContentBundle): boolean {
  const crime = state.crime;
  const crew = crime.crew;
  const top = content.balance.crime.ranks.length;
  if (!crew || crime.rank >= top) return false;
  crime.rank += 1;
  crime.peak = Math.max(crime.peak, crime.rank);
  crime.rankSince = state.currentYear;
  crime.standing = Math.max(content.balance.crime.entry.standing, crime.standing - 25);
  crime.lowYears = 0;
  const values = { crew: crewName(content, crew.defId), rank: rankTitle(content, crew.defId, crime.rank) };
  if (crime.rank === top) {
    delete crew.leader;
    writeFromGroup(state, content.text.crime.history.leader, ['crime', 'leader'], { values }, content);
  } else writeFromGroup(state, content.text.crime.history.promoted, ['crime', 'promoted'], { values }, content);
  return true;
}

/** One rank down (never below the first). Falling from the top hands the crew to someone else. */
export function demote(state: LifeState, content: ContentBundle): boolean {
  const crime = state.crime;
  if (!crime.crew || crime.rank <= 1) return false;
  crime.rank -= 1;
  crime.rankSince = state.currentYear;
  crime.standing = Math.min(crime.standing, content.balance.crime.entry.standing);
  staffCrew(state, content);
  return true;
}

/** A person is no longer in the crew (they were caught, left, or were cut loose). They stay in your life. */
export function removeMember(state: LifeState, id: Id): void {
  const crew = state.crime.crew;
  if (!crew) return;
  crew.members = crew.members.filter((m) => m !== id);
  crew.rivalMembers = crew.rivalMembers.filter((m) => m !== id);
  if (crew.leader === id) delete crew.leader;
  if (crew.informant === id) delete crew.informant;
}
