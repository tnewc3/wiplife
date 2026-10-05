/**
 * Stepping in for someone (E3): the `lifeHelp` effect. Each action goes
 * through a system that already exists (their case in the legal system, their
 * treatment in the health conditions, their care in housing and money); the
 * cost is a separate effect in the event. Anything that doesn't fit is
 * ignored, so a stale event can't break a life.
 */
import type { ContentBundle } from '../../content/schemas';
import type { RngState } from '../rng';
import type { Id, LifeState } from '../types';
import { rollJob } from './career';
import { ageOfPerson, defaultLife } from './model';

export type HelpAction = 'bail' | 'rehab' | 'treatment' | 'job_lead' | 'move_in' | 'pay_care' | 'leave_care';

export function lifeHelp(state: LifeState, personId: Id, action: HelpAction, rng: RngState, content: ContentBundle): void {
  const person = state.people[personId];
  const rel = state.relationships[personId];
  if (!person || !person.alive || !rel) return;
  if (!person.life) person.life = defaultLife(state, person, rel, content);
  const life = person.life;
  switch (action) {
    case 'bail': {
      const held = life.troubles.find((t) => t.kind === 'crime' && t.stage === 'held');
      if (held) held.stage = 'bailed';
      return;
    }
    case 'rehab': {
      const addiction = life.troubles.find((t) => t.kind === 'addiction' && !t.treated);
      if (addiction) addiction.treated = true;
      return;
    }
    case 'treatment': {
      const sick = life.troubles.find((t) => t.kind === 'illness' && !t.treated && content.conditions[t.refId]?.treatable);
      if (sick) sick.treated = true;
      return;
    }
    case 'job_lead': {
      const { adultAge } = content.balance.relationships;
      const age = ageOfPerson(state, person);
      if (person.occupation !== undefined || age < adultAge || age >= content.balance.economy.retirement.age || life.retired) return;
      const job = rollJob(rng, content, content.balance.people, person, person.wealthLevel, life.background, age);
      person.occupation = job.jobId;
      person.wealthLevel = job.wealth;
      life.level = job.level;
      life.levelSince = state.currentYear;
      delete life.jobLost;
      return;
    }
    case 'move_in': {
      const h = state.housing.kind;
      if ((life.care !== 'needed' && life.care !== 'paid' && life.care !== 'sibling') || (h !== 'renting' && h !== 'owned')) return;
      life.care = 'home';
      person.cityId = state.character.cityId;
      return;
    }
    case 'pay_care':
      if (life.care === 'needed' || life.care === 'sibling' || life.care === 'home') life.care = 'paid';
      return;
    case 'leave_care':
      if (life.care === 'needed' || life.care === 'home' || life.care === 'paid') life.care = 'sibling';
      return;
  }
}
