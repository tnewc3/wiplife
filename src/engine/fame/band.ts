/**
 * Bands (Batch 4). A band is the people you make the work with: a name, the
 * members (people in your life, each with the part they play, their skill
 * and how they feel about you, which is their relationship's affection), who
 * leads it and its chemistry. A solo act has none.
 *
 * - You form one (auditions bring new people from your city, near your age:
 *   a young star's bandmates are young too), or join one (offers come from
 *   bands in your city), at any rung and from any way in; the band way in
 *   starts you in one.
 * - As the leader (you formed it, or took it over) you can rename it, throw a
 *   member out or recruit a replacement. You can leave, or go solo; leaving
 *   the band you lead ends it.
 * - Members who leave your life or your city leave the band (so moving away
 *   can end it).
 * - Each year chemistry follows how the members feel, and the step may queue
 *   a clash, a member quitting, a member poached, or a break-up (events, whose
 *   choices decide what happens through the `band` effect).
 * - A band adds to the quality of the work and to shows by its members' skill
 *   and its chemistry, brings more people to a show, and takes its share of
 *   what the work earns.
 *
 * Numbers: balance/fame.yaml band. Members are made by the casting code
 * (createPerson) as friends in your city, tagged `band`.
 */
import type { CastSpec, ContentBundle, Effect, FameInstrumentDef, FamePathDef, FameTrigger } from '../../content/schemas';
import { curveAt } from '../curve';
import { createPerson } from '../events/casting';
import { clampInt, wholeChange } from '../random';
import { chance, nextInt, pick, type RngState } from '../rng';
import type { BandMember, Id, LifeState } from '../types';
import { addTie, canTie, inCircle } from '../web/ties';
import { fameHistory, hasGuardian } from './ladder';
import { isMinorStar, pathDef, workedPaths } from './query';
import { bandNameSuggestion, genresOf, setMainGenre } from './sound';

type BandEffect = Extract<Effect, { type: 'band' }>;

/** The role a band event casts the bandmate it is about in. */
export const BANDMATE_ROLE = 'bandmate';

/** The parts of a band in a path (instruments and the lead vocals). */
export function partsOf(def: FamePathDef | undefined): readonly FameInstrumentDef[] {
  return def?.instruments ?? [];
}

/** The path bands belong to among yours (the first that has them). */
export function bandPathOf(state: LifeState, content: ContentBundle): Id | null {
  return workedPaths(state).find((id) => pathDef(content, id)?.bands !== undefined) ?? null;
}

/** Your bandmates who are still in your life. */
export function liveMembers(state: LifeState): BandMember[] {
  return state.fame.band?.members.filter((m) => inCircle(state, m.id)) ?? [];
}

/** The people in your band now (or who lead it). */
export function bandPeople(state: LifeState, role: 'member' | 'leader'): Id[] {
  const band = state.fame.band;
  if (!band) return [];
  if (role === 'leader') return band.leader !== 'you' && inCircle(state, band.leader) ? [band.leader] : [];
  return liveMembers(state).map((m) => m.id);
}

/** What the band adds to the quality of work and to a show: its members' skill and its chemistry. 0 for a solo act. */
export function bandQuality(state: LifeState, content: ContentBundle): number {
  const band = state.fame.band;
  const members = liveMembers(state);
  if (!band || members.length === 0) return 0;
  const q = content.balance.fame.band.quality;
  const skill = members.reduce((sum, m) => sum + m.skill, 0) / members.length;
  return skill * q.skill + (band.chemistry - 50) * q.chemistry;
}

/** After a show or a fight: every member's feelings move by `affection`, and the band's chemistry by `chemistry`. */
export function moveBand(state: LifeState, affection: number, chemistry: number, rng: RngState): void {
  const band = state.fame.band;
  if (!band) return;
  for (const m of liveMembers(state)) {
    const rel = state.relationships[m.id]!;
    rel.affection = clampInt(rel.affection + wholeChange(rng, affection), 0, 100);
  }
  band.chemistry = clampInt(band.chemistry + chemistry, 0, 100);
}

/** A bandmate's skill when they join, by your rung, with a little either way. */
function memberSkill(rung: number, content: ContentBundle, rng: RngState): number {
  return clampInt(curveAt(content.balance.fame.band.skill, rung) + nextInt(rng, -8, 8), 0, 100);
}

/** The ages a new bandmate can be: an adult's are adults; a young star's are young, within a few years of them. */
export function memberAgeRange(state: LifeState, content: ContentBundle): { min: number; max: number } {
  const age = state.character.age;
  const b = content.balance.fame.band;
  const adult = content.balance.relationships.adultAge;
  if (age < adult) return { min: Math.max(10, age - b.minorSpread), max: Math.min(adult - 1, age + b.minorSpread) };
  return { min: Math.max(b.adultMin, age - 8), max: Math.max(b.adultMin, age + 10) };
}

/** A new person for the band, from an audition (or the band that asks you in): a friend in your city, tagged `band`. */
function audition(state: LifeState, part: Id, skill: number, memory: string, content: ContentBundle, rng: RngState): BandMember | null {
  const spec = { kind: 'friend', presence: 'city', age: memberAgeRange(state, content) } as CastSpec;
  const id = createPerson(state, spec, rng, content);
  if (id === null) return null;
  const person = state.people[id]!;
  person.tags.push('band');
  const rel = state.relationships[id]!;
  rel.affection = clampInt(content.balance.fame.band.affection + nextInt(rng, -8, 8), 0, 100);
  rel.memories.push({ tag: memory, year: state.currentYear });
  return { id, part, skill, since: state.currentYear };
}

/** Ties the new member to the rest of the band (people who play together know each other). */
function tieIn(state: LifeState, id: Id, rng: RngState): void {
  for (const other of liveMembers(state)) {
    if (other.id !== id && canTie(state, id, other.id)) addTie(state.web, id, other.id, 'friends', 55 + nextInt(rng, 0, 10), 'context', state.currentYear);
  }
}

/** The parts a band needs, in the order it fills them: the lead vocals (unless you sing), then the rest of a usual line-up. */
function partsToFill(def: FamePathDef, yours: Id, count: number, taken: readonly Id[] = []): Id[] {
  const order = ['vocals', 'guitar', 'bass', 'drums', 'keys', ...partsOf(def).map((p) => p.id)];
  const known = new Set(partsOf(def).map((p) => p.id));
  const out: Id[] = [];
  for (const id of order) {
    if (out.length >= count) break;
    if (!known.has(id) || id === yours || taken.includes(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/** The part you take in a new band: what you named, else your instrument, else the lead vocals. */
function yourPart(state: LifeState, def: FamePathDef, part: Id | undefined): Id {
  if (part !== undefined && partsOf(def).some((p) => p.id === part)) return part;
  return state.fame.instrument ?? def.bands?.singer ?? partsOf(def)[0]?.id ?? 'vocals';
}

export type BandBlock = 'inactive' | 'prison' | 'path' | 'have' | 'none' | 'parent' | 'leader' | 'member' | 'full' | 'part' | 'same' | 'offer';

/** Why you can't form a band now, or null. */
export function formBlock(state: LifeState, content: ContentBundle): BandBlock | null {
  const f = state.fame;
  if (!f.active) return 'inactive';
  if (state.housing.kind === 'incarcerated') return 'prison';
  if (bandPathOf(state, content) === null) return 'path';
  if (f.band) return 'have';
  if (isMinorStar(state, content) && !hasGuardian(state)) return 'parent';
  return null;
}

/** You hold auditions and form a band: new people from your city fill the parts. You lead it. */
export function formBand(state: LifeState, name: string, part: Id | undefined, content: ContentBundle, rng: RngState, how: 'formed' | 'route' = 'formed'): boolean {
  if (formBlock(state, content) !== null) return false;
  const f = state.fame;
  const pathId = bandPathOf(state, content)!;
  const def = pathDef(content, pathId)!;
  const b = content.balance.fame.band;
  const mine = yourPart(state, def, part);
  const size = nextInt(rng, b.size.min, Math.max(b.size.min, b.size.max));
  const rung = f.paths[pathId]!.rung;
  const members: BandMember[] = [];
  for (const p of partsToFill(def, mine, size)) {
    const m = audition(state, p, memberSkill(rung, content, rng), 'band_founded_with_you', content, rng);
    if (m) members.push(m);
  }
  if (members.length === 0) return false;
  f.band = { name, path: pathId, leader: 'you', members, part: mine, chemistry: b.chemistry, since: state.currentYear, how };
  for (const m of members) tieIn(state, m.id, rng);
  f.offers = [];
  f.totals.bandsFormed += 1;
  fameHistory(state, 'bandFormed', content);
  return true;
}

/** Why you can't take up this offer now, or null. */
export function joinBlock(state: LifeState, index: number, content: ContentBundle): BandBlock | null {
  const block = formBlock(state, content);
  if (block !== null) return block;
  const offer = state.fame.offers[index];
  if (!offer || offer.year < state.currentYear) return 'offer';
  return null;
}

/** You join a band in your city that asked you in: its members become people in your life, its founder leads it, and its sound becomes yours. */
export function joinBand(state: LifeState, index: number, content: ContentBundle, rng: RngState): boolean {
  if (joinBlock(state, index, content) !== null) return false;
  const f = state.fame;
  const offer = f.offers[index]!;
  const pathId = bandPathOf(state, content)!;
  const def = pathDef(content, pathId)!;
  const members: BandMember[] = [];
  for (const p of partsToFill(def, offer.part, offer.size)) {
    const m = audition(state, p, clampInt(offer.skill + nextInt(rng, -8, 8), 0, 100), 'band_took_you_in', content, rng);
    if (m) members.push(m);
  }
  if (members.length === 0) return false;
  f.band = { name: offer.name, path: pathId, leader: members[0]!.id, members, part: offer.part, chemistry: content.balance.fame.band.chemistry, since: state.currentYear, how: 'joined' };
  for (const m of members) tieIn(state, m.id, rng);
  f.offers = [];
  f.totals.bandsJoined += 1;
  const path = f.paths[pathId]!;
  if (path.genre === undefined) path.genre = offer.genre;
  else setMainGenre(state, pathId, offer.genre, content);
  fameHistory(state, 'bandJoined', content);
  return true;
}

/** Your band ends for you: it goes into your past bands, and the members are bandmates no more. */
function closeBand(state: LifeState, how: 'left' | 'solo' | 'split'): void {
  const f = state.fame;
  const band = f.band;
  if (!band) return;
  f.pastBands.push({ name: band.name, from: band.since, to: state.currentYear, how });
  if (f.pastBands.length > 12) f.pastBands.splice(0, f.pastBands.length - 12);
  for (const m of band.members) {
    const person = state.people[m.id];
    if (person) person.tags = person.tags.filter((t) => t !== 'band');
  }
  f.band = null;
}

/**
 * You leave the band: the members feel it (more when you go solo), and some
 * fans stay with the band (fewer when you go solo, since you are the one
 * they came for). Leaving a band you lead ends it.
 */
export function leaveBand(state: LifeState, solo: boolean, content: ContentBundle): boolean {
  const f = state.fame;
  const band = f.band;
  if (!band || !f.active) return false;
  const b = content.balance.fame.band;
  const how = solo ? b.solo : b.leave;
  for (const m of liveMembers(state)) {
    const rel = state.relationships[m.id]!;
    rel.affection = clampInt(rel.affection - how.affection, 0, 100);
    rel.memories.push({ tag: 'band_you_left', year: state.currentYear });
  }
  f.fans = Math.round(f.fans * how.fans);
  fameHistory(state, solo ? 'bandSolo' : 'bandLeft', content);
  if (band.leader === 'you') f.totals.bandSplits += 1;
  closeBand(state, solo ? 'solo' : 'left');
  return true;
}

/** The band breaks up (an event): everyone remembers it. */
export function splitBand(state: LifeState, content: ContentBundle): boolean {
  const band = state.fame.band;
  if (!band) return false;
  for (const m of liveMembers(state)) state.relationships[m.id]!.memories.push({ tag: 'band_split_up', year: state.currentYear });
  fameHistory(state, 'bandSplit', content);
  state.fame.totals.bandSplits += 1;
  closeBand(state, 'split');
  return true;
}

/** Why you can't do something only a leader can (rename, throw out, recruit), or null. */
export function leaderBlock(state: LifeState): BandBlock | null {
  const f = state.fame;
  if (!f.active) return 'inactive';
  if (state.housing.kind === 'incarcerated') return 'prison';
  if (!f.band) return 'none';
  if (f.band.leader !== 'you') return 'leader';
  return null;
}

export function renameBlock(state: LifeState, name: string): BandBlock | null {
  return leaderBlock(state) ?? (state.fame.band!.name === name ? 'same' : null);
}

export function renameBand(state: LifeState, name: string, content: ContentBundle): boolean {
  if (renameBlock(state, name) !== null) return false;
  state.fame.band!.name = name;
  fameHistory(state, 'bandRenamed', content);
  return true;
}

export function kickBlock(state: LifeState, id: Id): BandBlock | null {
  return leaderBlock(state) ?? (liveMembers(state).some((m) => m.id === id) ? null : 'member');
}

/** A member leaves the band (thrown out, quit, poached or gone from your life). Chemistry moves; with nobody left, the band is over. */
function removeMember(state: LifeState, id: Id, content: ContentBundle): void {
  const f = state.fame;
  const band = f.band;
  if (!band) return;
  band.members = band.members.filter((m) => m.id !== id);
  const person = state.people[id];
  if (person) person.tags = person.tags.filter((t) => t !== 'band');
  f.totals.memberChanges += 1;
  // The one who led it is gone: you take it over if you sing (or nobody else is left who has been there longer), else the longest-standing member.
  if (band.leader === id) {
    const singer = pathDef(content, band.path)?.bands?.singer;
    const next = [...liveMembers(state)].sort((a, b) => a.since - b.since || (a.id < b.id ? -1 : 1))[0];
    band.leader = band.part === singer || !next ? 'you' : next.id;
  }
  if (liveMembers(state).length === 0) splitBand(state, content);
}

/** As the leader you throw a member out: they take it hard; the band feels it (or breathes again, when they were the trouble). */
export function kickMember(state: LifeState, id: Id, content: ContentBundle): boolean {
  if (kickBlock(state, id) !== null) return false;
  const b = content.balance.fame.band;
  const rel = state.relationships[id]!;
  const trouble = rel.affection < 35;
  rel.affection = clampInt(rel.affection - b.kick.affection, 0, 100);
  rel.memories.push({ tag: 'band_kicked_out', year: state.currentYear });
  state.fame.band!.chemistry = clampInt(state.fame.band!.chemistry + (trouble ? Math.abs(b.kick.chemistry) : b.kick.chemistry), 0, 100);
  removeMember(state, id, content);
  return true;
}

export function recruitBlock(state: LifeState, part: Id, content: ContentBundle): BandBlock | null {
  const block = leaderBlock(state);
  if (block !== null) return block;
  const band = state.fame.band!;
  const def = pathDef(content, band.path);
  if (!partsOf(def).some((p) => p.id === part) || part === band.part || liveMembers(state).some((m) => m.part === part)) return 'part';
  if (liveMembers(state).length >= content.balance.fame.band.size.max + 2) return 'full';
  return null;
}

/** As the leader you hold auditions for a part: someone new joins. */
export function recruitMember(state: LifeState, part: Id, content: ContentBundle, rng: RngState): boolean {
  if (recruitBlock(state, part, content) !== null) return false;
  const band = state.fame.band!;
  const rung = state.fame.paths[band.path]?.rung ?? 1;
  const m = audition(state, part, memberSkill(rung, content, rng), 'band_joined_you', content, rng);
  if (!m) return false;
  band.members.push(m);
  tieIn(state, m.id, rng);
  state.fame.totals.memberChanges += 1;
  return true;
}

/** The parts a leader could recruit for now. Reads only. */
export function openParts(state: LifeState, content: ContentBundle): FameInstrumentDef[] {
  const band = state.fame.band;
  if (!band) return [];
  return partsOf(pathDef(content, band.path)).filter((p) => recruitBlock(state, p.id, content) === null);
}

/**
 * The band's year (the fame step): members who are gone from your life
 * leave it, chemistry follows how the members feel, and drama may come
 * (a break-up, a member quitting, a clash, a member poached), each an event
 * about the member it concerns. A musician with no band may be asked to join one.
 * Returns the events to queue, with who they are about.
 */
export function bandYear(state: LifeState, content: ContentBundle, rng: RngState): { trigger: FameTrigger; cast: Record<string, Id> }[] {
  const f = state.fame;
  const b = content.balance.fame.band;
  const out: { trigger: FameTrigger; cast: Record<string, Id> }[] = [];
  // Offers last until the next year begins.
  f.offers = f.offers.filter((o) => o.year >= state.currentYear);
  const band = f.band;
  if (band) {
    // Someone gone from your life, or living in another city now, is out of the band (a band plays together).
    for (const m of [...band.members]) if (!inCircle(state, m.id) || state.people[m.id]!.cityId !== state.character.cityId) removeMember(state, m.id, content);
    if (!f.band) return out;
    const members = liveMembers(state);
    const mean = members.reduce((sum, m) => sum + state.relationships[m.id]!.affection, 0) / members.length;
    band.chemistry = clampInt(band.chemistry + (mean - band.chemistry) * b.drift, 0, 100);
    const coolest = [...members].sort((x, y) => state.relationships[x.id]!.affection - state.relationships[y.id]!.affection || (x.id < y.id ? -1 : 1))[0]!;
    const best = [...members].sort((x, y) => y.skill - x.skill || (x.id < y.id ? -1 : 1))[0]!;
    if (chance(rng, curveAt(b.split, band.chemistry))) out.push({ trigger: 'bandSplit', cast: { [BANDMATE_ROLE]: band.leader === 'you' ? coolest.id : band.leader } });
    else if (chance(rng, curveAt(b.quit, band.chemistry))) out.push({ trigger: 'bandQuit', cast: { [BANDMATE_ROLE]: coolest.id } });
    else if (chance(rng, curveAt(b.clash, band.chemistry))) out.push({ trigger: 'bandClash', cast: { [BANDMATE_ROLE]: pick(rng, members).id } });
    if (state.character.age >= content.balance.relationships.adultAge && chance(rng, curveAt(b.poach, best.skill))) out.push({ trigger: 'bandPoached', cast: { [BANDMATE_ROLE]: best.id } });
    return out;
  }
  const pathId = bandPathOf(state, content);
  if (pathId === null || formBlock(state, content) !== null) return out;
  const path = f.paths[pathId]!;
  if (f.offers.length < 2 && chance(rng, curveAt(b.offer, path.rung))) {
    const def = pathDef(content, pathId)!;
    const genres = genresOf(content, pathId);
    const genre = path.genre ?? (genres.length > 0 ? pick(rng, genres).id : '');
    if (genre !== '') {
      f.offers.push({
        name: bandNameSuggestion(state, f.offers.length + nextInt(rng, 0, 20), content),
        genre,
        size: nextInt(rng, b.size.min, Math.max(b.size.min, b.size.max)),
        skill: memberSkill(path.rung, content, rng),
        part: yourPart(state, def, undefined),
        year: state.currentYear,
      });
      out.push({ trigger: 'bandOffer', cast: {} });
    }
  }
  return out;
}

/**
 * The band effects events can have: chemistry moves by `delta`; the member
 * in `role` quits (or is poached away); the band splits; you take up the
 * newest offer; you take the lead. The engine ignores what doesn't fit.
 */
export function applyBandEffect(state: LifeState, effect: BandEffect, cast: Record<string, Id>, content: ContentBundle, rng: RngState): void {
  const f = state.fame;
  const who = effect.role === undefined ? undefined : cast[effect.role];
  switch (effect.action) {
    case 'chemistry':
      if (f.band) f.band.chemistry = clampInt(f.band.chemistry + (effect.delta ?? 0), 0, 100);
      return;
    case 'quit':
      if (who !== undefined && f.band?.members.some((m) => m.id === who)) {
        state.relationships[who]?.memories.push({ tag: 'band_quit_on_you', year: state.currentYear });
        removeMember(state, who, content);
      }
      return;
    case 'split':
      splitBand(state, content);
      return;
    case 'join':
      if (f.offers.length > 0) joinBand(state, f.offers.length - 1, content, rng);
      return;
    case 'lead':
      if (f.band) f.band.leader = 'you';
      return;
  }
}
