/**
 * A stand-in life for a person, made to satisfy a `life` condition (the event
 * sandbox, development only, and tests): a partner, a job, children, an
 * illness and so on, as the condition asks, so an event can be previewed
 * without playing up to it.
 */
import type { Condition, ContentBundle, LifeCondition } from '../../content/schemas';
import type { Id, LifeState } from '../types';
import { defaultLife } from './model';

/** The `life` condition the event's requirements put on a role, if any. */
export function lifeConditionFor(requires: Condition | undefined, role: string): LifeCondition | undefined {
  if (!requires) return undefined;
  if ('all' in requires) return requires.all.map((c) => lifeConditionFor(c, role)).find((c) => c !== undefined);
  if ('role' in requires && requires.role === role) return requires.life;
  return undefined;
}

/** Gives the person a life that satisfies the condition (the first option of each list). */
export function giveSampleLife(state: LifeState, personId: Id, q: LifeCondition | undefined, content: ContentBundle): void {
  const person = state.people[personId];
  if (!person) return;
  const year = state.currentYear;
  const { adultAge } = content.balance.relationships;
  const life = defaultLife(state, person, state.relationships[personId], content);
  person.life = life;
  const status = q?.partner?.find((s) => s !== 'none');
  if (status || q?.ended) {
    const age = Math.max(adultAge, year - person.birthYear);
    const partner = {
      name: { first: 'Rowan', last: 'Hale' },
      genderCategory: 'nonbinary' as const,
      birthYear: year - age,
      canCarry: false,
      status: status ?? ('married' as const),
      since: year - 2,
      statusSince: year - 1,
    };
    if (q?.ended) life.ended = { year, how: q.ended[0]!, partner: partner.name.first };
    else life.partner = partner;
  }
  if (q?.employed) {
    const jobId = Object.keys(content.jobs).sort()[0]!;
    person.occupation = jobId;
    life.level = 1;
  }
  if (q?.employed === false) delete person.occupation;
  if (q?.children) life.children = [{ first: 'Sam', birthYear: year - 1 }];
  if (q?.wealth) person.wealthLevel = q.wealth[0]!;
  const serious = content.balance.people.trouble.serious;
  const condition = (kind: string) => Object.values(content.conditions).find((c) => !c.retired && (kind === 'addiction' ? c.kind === 'addiction' : c.kind !== 'addiction' && c.kind !== 'injury' && c.treatable));
  if (q?.trouble?.includes('illness') || (q?.serious && !q.trouble)) {
    const def = condition('illness');
    if (def) life.troubles.push({ kind: 'illness', refId: def.id, since: year - 1, severity: serious, treated: false });
  }
  if (q?.trouble?.includes('addiction')) {
    const def = condition('addiction');
    if (def) life.troubles.push({ kind: 'addiction', refId: def.id, since: year - 1, severity: serious, treated: false });
  }
  if (q?.crime || q?.trouble?.includes('crime')) {
    const offense = Object.keys(content.offenses).sort()[0]!;
    life.troubles.push({ kind: 'crime', refId: offense, since: year, severity: 0, treated: false, stage: q?.crime?.[0] ?? 'held', ...(q?.crime?.[0] === 'jail' ? { until: year + 1 } : {}) });
  }
  if (q?.care && q.care[0] !== 'none') {
    life.care = q.care[0]!;
    life.careSince = year;
  }
  if (q?.recovered) {
    const def = condition('addiction');
    if (def) life.recovered.push({ refId: def.id, year: year - 1 });
  }
}
