/**
 * The events and history lines the school step writes (registries/school.yaml,
 * text/school.yaml). Like the teen step's, an event is picked by weight among
 * those that fit now with this cast, and only one per trigger is waiting at a time.
 */
import type { ContentBundle, SchoolHistoryKey, SchoolTrigger } from '../../content/schemas';
import { eventWeight } from '../events/selection';
import { weightedPick } from '../random';
import { writeFromGroup } from '../systems/history';
import type { Id, LifeState } from '../types';

/** A history line from text/school.yaml (values: {exam}, {school}, {path}). */
export function schoolLine(state: LifeState, key: SchoolHistoryKey, values: Record<string, string>, content: ContentBundle): void {
  writeFromGroup(state, content.text.school.history[key], ['school', key], { values }, content);
}

/** Queues one of the trigger's events (this year's, or next year's when the player acted between years); false when none fits. */
export function queueSchoolEvent(state: LifeState, trigger: SchoolTrigger, cast: Record<string, Id>, content: ContentBundle, due: 'now' | 'next' = 'now'): boolean {
  const ids = content.registries.school.triggers[trigger].events;
  const options = ids.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return false;
  const dueYear = due === 'now' ? state.currentYear : state.currentYear + 1;
  if (state.scheduled.some((s) => ids.includes(s.eventId) && s.dueYear === dueYear)) return false;
  const def = weightedPick(state.rng, options);
  state.scheduled.push({ eventId: def.id, dueYear, cast });
  return true;
}
