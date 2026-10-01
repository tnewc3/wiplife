/**
 * Event index, eligibility and weights (docs/technical.md, "Event engine
 * internals"). The index groups events by life stage once per content bundle,
 * so each year only the events for the current stage are checked.
 */
import type { ContentBundle, EventDef } from '../../content/schemas';
import { evaluate } from '../conditions';
import { isRomanceEvent } from '../relationships';
import type { LifeStage, LifeState } from '../types';

const indexCache = new WeakMap<ContentBundle, Map<LifeStage, EventDef[]>>();

/** Events that can happen on their own (not retired, not follow-up only), by life stage, in id order. */
export function eventIndex(content: ContentBundle): Map<LifeStage, EventDef[]> {
  let index = indexCache.get(content);
  if (!index) {
    index = new Map();
    for (const id of Object.keys(content.events).sort()) {
      const def = content.events[id]!;
      if (def.retired || def.followUpOnly) continue;
      for (const stage of def.lifeStages) {
        const list = index.get(stage) ?? [];
        list.push(def);
        index.set(stage, list);
      }
    }
    indexCache.set(content, index);
  }
  return index;
}

/** The last year any event of this category fired, if ever. */
function lastCategoryYear(state: LifeState, category: string, content: ContentBundle): number | undefined {
  let last: number | undefined;
  for (const [id, log] of Object.entries(state.eventLog)) {
    if (content.events[id]?.category === category && (last === undefined || log.lastYear > last)) last = log.lastYear;
  }
  return last;
}

/** A prison event (its category is marked prison): it happens only while you're in prison, and only these happen then (Stage 9). */
export function isPrisonEvent(def: EventDef, content: ContentBundle): boolean {
  return content.registries.categories.categories[def.category]?.prison === true;
}

/** The event fits where you are: prison events in prison, every other event outside it. */
export function fitsSetting(state: LifeState, def: EventDef, content: ContentBundle): boolean {
  return isPrisonEvent(def, content) === (state.housing.kind === 'incarcerated');
}

/**
 * An event's weight this year: zero when it is on cooldown, already happened
 * (one-time events), is a romance event and you're not an adult, doesn't fit
 * where you are (prison), or its requirements fail; otherwise base × rarity
 * × matching modifiers. Requirements about cast roles are checked after casting.
 */
export function eventWeight(state: LifeState, def: EventDef, content: ContentBundle): number {
  if (state.character.age < content.balance.relationships.adultAge && isRomanceEvent(def, content)) return 0;
  if (!fitsSetting(state, def, content)) return 0;
  const log = state.eventLog[def.id];
  if (def.once && log) return 0;
  if (def.cooldownYears && log && state.currentYear - log.lastYear < def.cooldownYears) return 0;
  const categoryCooldown = content.registries.categories.categories[def.category]?.cooldownYears;
  if (categoryCooldown) {
    const last = lastCategoryYear(state, def.category, content);
    if (last !== undefined && state.currentYear - last < categoryCooldown) return 0;
  }
  if (!evaluate(def.requires, state, { roles: 'assumeTrue' })) return 0;
  let weight = def.weight.base * content.balance.events.rarityWeight[def.rarity];
  for (const modifier of def.weight.modifiers ?? []) {
    if (evaluate(modifier.if, state, { roles: 'assumeTrue' })) weight *= modifier.x;
  }
  return weight;
}
