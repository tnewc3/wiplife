/**
 * Requests (E3): a change in someone's life can ask something of you, as an
 * event card (registries/people.yaml lists the events for each trigger). They
 * are queued as events due this year, so the pacing director counts them
 * toward the year's budget and the cap of six events still holds. A few a
 * year at most, from people who care enough to ask, each person at most
 * once in a while.
 */
import type { ContentBundle, EventDef, RequestTrigger } from '../../content/schemas';
import { evaluate } from '../conditions';
import { fitsSetting } from '../events/selection';
import { consistencyProblems } from '../presence';
import { romanceAllowed } from '../relationships';
import { weightedPick } from '../random';
import type { Id, LifeState } from '../types';
import type { Ask, Ctx } from './subject';

/** The events that could answer this trigger for this person now: they fit (requirements, presence, cooldowns), weighted by base weight. */
export function requestOptions(state: LifeState, trigger: RequestTrigger, personId: Id, content: ContentBundle): EventDef[] {
  const cast = { npc: personId };
  return content.registries.people.requests[trigger].events
    .map((id) => content.events[id])
    .filter((def): def is EventDef => {
      if (!def || def.retired) return false;
      const log = state.eventLog[def.id];
      if (def.once && log) return false;
      if (def.cooldownYears && log && state.currentYear - log.lastYear < def.cooldownYears) return false;
      return (
        fitsSetting(state, def, content) &&
        evaluate(def.requires, state, { cast, roles: 'strict', content }) &&
        romanceAllowed(state, def, cast, content) &&
        consistencyProblems(state, def, cast, content).length === 0
      );
    });
}

/**
 * Turns the year's asks into queued events: the most pressing first (the
 * order in registries/people.yaml), one per person, up to the balance's
 * maximum, skipping people who feel too little for you to ask (except a
 * death in the family) or asked lately. Returns the asks that became events,
 * so their news lines can be left out (the card tells it).
 */
export function queueRequests(ctx: Ctx): Ask[] {
  const { state, content, bal } = ctx;
  const r = bal.requests;
  const queued: Ask[] = [];
  if (!ctx.open || ctx.view.character.age < r.minAge) return queued;
  const order = content.registries.people.priority;
  const asks = [...ctx.asks].sort((a, b) => order.indexOf(a.trigger) - order.indexOf(b.trigger) || (a.id < b.id ? -1 : 1));
  const used = new Set<Id>();
  for (const a of asks) {
    if (queued.length >= r.maxPerYear) break;
    if (used.has(a.id)) continue;
    const rel = state.relationships[a.id];
    const person = state.people[a.id];
    if (!rel || !person?.life) continue;
    const urgent = a.trigger === 'death';
    if (!urgent && rel.affection < r.minAffection) continue;
    if (!urgent && person.life.requestYear !== undefined && ctx.year - person.life.requestYear < r.personCooldownYears) continue;
    const options = requestOptions(state, a.trigger, a.id, content);
    if (options.length === 0) continue;
    const def = weightedPick(state.rng, options.map((o) => [o, o.weight.base] as const));
    state.scheduled.push({ eventId: def.id, dueYear: ctx.year, cast: { npc: a.id } });
    person.life.requestYear = ctx.year;
    used.add(a.id);
    queued.push(a);
  }
  return queued;
}
