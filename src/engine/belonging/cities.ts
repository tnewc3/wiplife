/**
 * The groups of a city (W2): the clubs, congregations and causes that exist
 * there, each with a fictional name and traits of its own (welcoming or
 * reserved, strict or relaxed, casual or intense). They are made from the
 * life's seed and the city alone, so they are the same whenever they are
 * asked for, and written into the life the first time you act on them.
 */
import type { ContentBundle, GroupDef } from '../../content/schemas';
import { clampInt, rollScore } from '../random';
import { chance, createRng, nextInt, pick } from '../rng';
import type { GroupInstance, Id, LifeState } from '../types';

/** Active kinds of group, in id order. */
export function activeGroupDefs(content: ContentBundle): GroupDef[] {
  return Object.keys(content.groups)
    .sort()
    .map((id) => content.groups[id]!)
    .filter((d) => !d.retired);
}

/** Every group a city has, from the seed. Their `people` are empty until someone joins. */
export function generateCity(seed: string, cityId: Id, content: ContentBundle): GroupInstance[] {
  const rng = createRng(`${seed}:groups:${cityId}`);
  const out: GroupInstance[] = [];
  for (const def of activeGroupDefs(content)) {
    const p = Math.min(1, def.weight * (def.cities[cityId] ?? 1));
    if (p <= 0 || !chance(rng, p)) continue;
    const count = nextInt(rng, def.count.min, def.count.max);
    const names = [...def.names];
    for (let n = 1; n <= count; n++) {
      const name = names.length > 0 ? names.splice(nextInt(rng, 0, names.length - 1), 1)[0]! : `${pick(rng, def.names)} (${n})`;
      out.push({
        id: `g_${cityId}_${def.id}_${n}`,
        defId: def.id,
        cityId,
        name,
        welcome: clampInt(rollScore(rng, def.traits.welcome), 0, 100),
        strict: clampInt(rollScore(rng, def.traits.strict), 0, 100),
        intense: clampInt(rollScore(rng, def.traits.intense), 0, 100),
        people: [],
      });
    }
  }
  return out;
}

/** The groups of a city: those written into the life, or, until then, the ones the seed gives it. */
export function cityGroups(state: LifeState, cityId: Id, content: ContentBundle): GroupInstance[] {
  const b = state.belonging;
  const ids = b.cities[cityId];
  if (ids) return ids.flatMap((id) => (b.groups[id] ? [b.groups[id]!] : []));
  return generateCity(state.seed, cityId, content);
}

/** Writes a city's groups into the life (once). */
export function ensureCity(state: LifeState, cityId: Id, content: ContentBundle): void {
  const b = state.belonging;
  if (b.cities[cityId]) return;
  const made = generateCity(state.seed, cityId, content);
  b.cities[cityId] = made.map((g) => g.id);
  for (const g of made) b.groups[g.id] = g;
}

/** A group by id, written into the life or, until then, the one the seed gives its city. */
export function findGroup(state: LifeState, groupId: Id | undefined, content: ContentBundle): GroupInstance | undefined {
  if (groupId === undefined) return undefined;
  const known = state.belonging.groups[groupId];
  if (known) return known;
  const m = /^g_(.+)_[a-z0-9_]+_\d+$/.exec(groupId);
  if (!m) return undefined;
  // Several city ids start the same way (small_town, small_town_ca): the longest one that fits is the city.
  const cityId = Object.keys(content.cities)
    .filter((c) => groupId.startsWith(`g_${c}_`))
    .sort((a, b) => b.length - a.length)[0];
  return cityId ? generateCity(state.seed, cityId, content).find((g) => g.id === groupId) : undefined;
}

/** The groups an event can be about: the ones you belong to, then the ones in your city you do not. */
export function groupPool(state: LifeState, content: ContentBundle): Id[] {
  const mine = state.belonging.memberships.map((m) => m.groupId);
  const others = cityGroups(state, state.character.cityId, content)
    .map((g) => g.id)
    .filter((id) => !mine.includes(id));
  return [...mine, ...others];
}
