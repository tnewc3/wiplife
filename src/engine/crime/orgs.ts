/**
 * Organizations (O1): the organizations of a city (the named crews that work there and generated ones with made-up
 * names), who holds each neighborhood, the members of the one you are in as people with skill, loyalty and heat, and
 * the strength each has. Extends E6a's crews: a crew you join is one of these, and what you do in it changes them.
 * Numbers: balance/orgs.yaml. Everything that draws uses the life's generator, and only for someone in crime.
 */
import type { ContentBundle, OrgKind } from '../../content/schemas';
import { ORG_KINDS } from '../../content/schemas';
import { createPerson } from '../events/casting';
import { clampInt, rollNormal, rollScore, weightedKey } from '../random';
import { chance, nextInt, pick } from '../rng';
import type { CastSpec } from '../../content/schemas';
import type { Id, LifeState, OrgMember, WorldOrg } from '../types';
import { crewDef, crewKind, liveMembers, topRank } from './query';

/** The organizations of a city, made on first need (named crews that work there, then generated ones) and kept. */
export function ensureCity(state: LifeState, content: ContentBundle, cityId: Id): WorldOrg[] {
  const world = state.orgs;
  const existing = world.cities[cityId];
  if (existing) return existing;
  const b = content.balance.orgs.world;
  const city = content.cities[cityId];
  const orgs: WorldOrg[] = Object.values(content.crews)
    .filter((c) => !c.retired && c.cities.includes(cityId))
    .sort((a, c) => (a.id < c.id ? -1 : 1))
    .map((c): WorldOrg => ({ id: c.id, defId: c.id, name: c.name, kind: c.kind, cityId, strength: rollScore(state.rng, b.strength), attitude: clampInt(Math.round(rollNormal(state.rng, b.attitude)), -100, 100), war: 0, status: 'neutral' }));
  const want = orgs.length + nextInt(state.rng, b.generated.min, b.generated.max);
  const names = new Set(orgs.map((o) => o.name));
  const reg = content.registries.orgs.names;
  while (orgs.length < want) {
    const kind = weightedKey<OrgKind>(state.rng, b.kindWeights);
    const parts = reg[kind];
    let name = '';
    for (let tries = 0; tries < 12 && (name === '' || names.has(name)); tries++) {
      name = pick(state.rng, parts.patterns).replace('{a}', pick(state.rng, parts.first)).replace('{b}', pick(state.rng, parts.second));
    }
    if (names.has(name)) break;
    names.add(name);
    const id = `g${world.next}`;
    world.next += 1;
    orgs.push({ id, name, kind, cityId, strength: rollScore(state.rng, b.strength), attitude: clampInt(Math.round(rollNormal(state.rng, b.attitude)), -100, 100), war: 0, status: 'neutral' });
  }
  // Gangs and clubs buy from a cartel in the city, when there is one.
  const cartels = orgs.filter((o) => content.orgKinds[o.kind]?.supplies);
  for (const o of orgs) if (content.orgKinds[o.kind]?.buys && cartels.length > 0) o.supplier = pick(state.rng, cartels).id;
  world.cities[cityId] = orgs;
  // Neighborhoods: each organization gets its starting ones, and some are left to no one.
  const hoods = (city?.neighborhoods ?? []).map((h) => h.id);
  const map: Record<Id, Id | null> = Object.fromEntries(hoods.map((h) => [h, null]));
  const free = [...hoods];
  for (const o of orgs) {
    for (let i = 0; i < b.startHoods[o.kind] && free.length > 0; i++) {
      const at = nextInt(state.rng, 0, free.length - 1);
      map[free[at]!] = o.id;
      free.splice(at, 1);
    }
  }
  for (const h of free) map[h] = chance(state.rng, b.unheld) ? null : pick(state.rng, orgs).id;
  world.hoods[cityId] = map;
  return orgs;
}

export function worldOrg(state: LifeState, cityId: Id, id: Id | undefined): WorldOrg | undefined {
  return id === undefined ? undefined : state.orgs.cities[cityId]?.find((o) => o.id === id);
}

/** The world organization you are in. */
export function myOrg(state: LifeState): WorldOrg | undefined {
  const crew = state.crime.crew;
  return crew ? worldOrg(state, crew.cityId, crew.defId) : undefined;
}

/** Its name, for any world organization id of a city (a named crew or a generated one). */
export function orgName(state: LifeState, content: ContentBundle, cityId: Id, id: Id | undefined): string {
  return worldOrg(state, cityId, id)?.name ?? crewDef(content, id)?.name ?? '';
}

/** Neighborhood ids a world organization holds in a city. */
export function holdings(state: LifeState, cityId: Id, orgId: Id): Id[] {
  const map = state.orgs.hoods[cityId] ?? {};
  return Object.keys(map)
    .filter((h) => map[h] === orgId)
    .sort();
}

/** Its strength: what it has, plus what its neighborhoods give. */
export function strengthOf(state: LifeState, content: ContentBundle, org: WorldOrg): number {
  return org.strength + holdings(state, org.cityId, org.id).length * content.balance.orgs.territory.strengthPerHood;
}

/** Your organization's strength: the world figure, plus its neighborhoods, plus your members' skill. */
export function myStrength(state: LifeState, content: ContentBundle): number {
  const org = myOrg(state);
  const crew = state.crime.crew;
  if (!org || !crew) return 0;
  const t = content.balance.orgs.territory;
  const skill = Object.entries(crew.roster ?? {}).reduce((sum, [id, m]) => sum + (m.jailed === undefined && state.people[id]?.alive ? m.skill / 100 : 0), 0);
  return strengthOf(state, content, org) + skill * t.strengthPerMember;
}

/** Makes sure a neighborhood is held by the organization you join, so a leader has something to hold. */
export function ensureHolding(state: LifeState, content: ContentBundle): void {
  const crew = state.crime.crew;
  if (!crew) return;
  ensureCity(state, content, crew.cityId);
  const map = state.orgs.hoods[crew.cityId]!;
  const keys = Object.keys(map).sort();
  if (keys.length === 0 || keys.some((h) => map[h] === crew.defId)) return;
  const free = keys.filter((h) => map[h] === null);
  map[free.length > 0 ? pick(state.rng, free) : pick(state.rng, keys)] = crew.defId;
}

// ---- Members -------------------------------------------------------------------------------------------------------

/** A new member of the organization: their skill, loyalty and rank. */
export function newMember(state: LifeState, content: ContentBundle, rank: number, loyalty?: number): OrgMember {
  const b = content.balance.orgs.roster;
  return { skill: rollScore(state.rng, b.skill), loyalty: loyalty ?? rollScore(state.rng, b.loyalty), heat: 0, rank, since: state.currentYear };
}

/** Everyone in the crew has a roster entry; the roster holds nobody who is not in the crew. Idempotent. Draws only for new entries. */
export function ensureRoster(state: LifeState, content: ContentBundle): void {
  const crew = state.crime.crew;
  if (!crew) return;
  const roster = (crew.roster ??= {});
  const top = topRank(content, crew.defId);
  for (const id of Object.keys(roster)) if (!crew.members.includes(id)) delete roster[id];
  for (const id of crew.members) {
    if (!roster[id]) roster[id] = newMember(state, content, nextInt(state.rng, 1, Math.max(1, top - 1)));
    const m = roster[id]!;
    m.rank = clampInt(m.rank, 1, Math.max(1, top - 1));
  }
  if (crew.cut === undefined) crew.cut = 'fair';
}

/** Adds a new person to the crew: a friend of yours who is an adult in your city. Returns their id, or null when there is no room or no one could be made. */
export function recruitPerson(state: LifeState, content: ContentBundle, loyalty: number): Id | null {
  const crew = state.crime.crew;
  const def = crewDef(content, crew?.defId);
  if (!crew || !def) return null;
  const cap = content.balance.orgs.roster.cap[def.kind];
  if (liveMembers(state, crew).length >= cap) return null;
  const entry = content.balance.crime.entry;
  const spec: CastSpec = { kind: 'friend', presence: 'city', createIfMissing: true, age: { min: entry.memberAge.min, max: entry.memberAge.max } };
  const id = createPerson(state, spec, state.rng, content);
  if (id === null) return null;
  const person = state.people[id]!;
  for (const [trait, delta] of Object.entries(def.traits)) {
    const key = trait as keyof typeof person.traits;
    person.traits[key] = clampInt((person.traits[key] ?? 50) + (delta ?? 0), 0, 100);
  }
  if (!person.tags.includes(`crew:${def.id}`)) person.tags = [...person.tags, `crew:${def.id}`];
  state.relationships[id]!.affection = rollScore(state.rng, content.balance.crime.entry.memberAffection);
  crew.members.push(id);
  (crew.roster ??= {})[id] = newMember(state, content, 1, loyalty);
  return id;
}

export function memberName(state: LifeState, id: Id): string {
  const p = state.people[id];
  return p ? `${p.name.first} ${p.name.last}` : '';
}

/** The kind of the organization you are in, or the one you were in last. */
export function myKind(state: LifeState, content: ContentBundle): OrgKind | undefined {
  return crewKind(content, state.crime.crew?.defId ?? state.crime.past.at(-1)?.crewId);
}

export { ORG_KINDS };
