/**
 * What More → Health shows about your mind (M1): the conditions that have been
 * named (never the ones that haven't), what each way of caring for them costs
 * and asks, the people around you who have noticed, and whether you can see a
 * therapist. Read-only; the UI changes things through actions.
 */
import type { ContentBundle, MentalCareId } from '../../content/schemas';
import { isIndependent } from '../finance';
import { canSeeTherapist, therapistQuote } from './therapist';
import { careBlock, careCost, leanOn } from './care';
import { careOf, namedMental } from './query';
import type { Id, LifeState, Reaction } from '../types';

export interface CareOption {
  care: MentalCareId;
  /** Caring for it this way now. */
  on: boolean;
  /** Dollars a year (whole dollars, your city's prices); null for leaning on people, which costs no money. */
  yearly: number | null;
  /** The first visit, when there is one. */
  intake: number | null;
  /** Why you can't start it, or null when you can (or it is on and can be stopped). */
  block: 'unsuitable' | 'alone' | null;
  /** The people it would draw on (names), for leaning on people. */
  people: string[];
}

export interface MentalConditionView {
  id: string;
  name: string;
  blurb: string;
  kind: 'mental' | 'neuro';
  severity: number;
  diagnosedYear: number;
  care: CareOption[];
  /** Neurodivergence: what it gives you and what it asks of you (the words on its definition). */
  strengths: string[];
  challenges: string[];
}

export interface NoticerView {
  id: Id;
  name: string;
  reaction: Reaction;
}

export interface MentalView {
  conditions: MentalConditionView[];
  /** People who have noticed you struggling (or you told), closest first. */
  noticed: NoticerView[];
  therapist: { cost: number; block: 'visited' | 'young' | 'prison' | 'busy' | null };
  /** Your family takes you and pays while you're a child. */
  familyPays: boolean;
}

export function getMentalView(state: LifeState, content: ContentBundle): MentalView {
  const conditions = namedMental(state, content)
    .map(({ condition, def }): MentalConditionView => {
      const care = careOf(condition);
      const options = (def.care ?? []).map((c): CareOption => {
        const on = care.includes(c);
        const block = on ? null : careBlock(state, def.id, c, content);
        return {
          care: c,
          on,
          yearly: c === 'support' ? null : careCost(state, c, 'yearly', content),
          intake: c === 'support' ? null : careCost(state, c, 'intake', content),
          block: block === 'unsuitable' || block === 'alone' ? block : null,
          people: c === 'support' ? leanOn(state, content).map((id) => state.people[id]!.name.first) : [],
        };
      });
      return {
        id: def.id,
        name: def.name,
        blurb: def.blurb,
        kind: def.kind as 'mental' | 'neuro',
        severity: condition.severity,
        diagnosedYear: condition.diagnosed!,
        care: options,
        strengths: def.strengthNotes ?? [],
        challenges: def.challengeNotes ?? [],
      };
    })
    .sort((a, b) => (a.kind === b.kind ? b.severity - a.severity || a.name.localeCompare(b.name) : a.kind === 'mental' ? -1 : 1));
  const noticed = Object.keys(state.health.mental.noticed)
    .filter((id) => state.people[id]?.alive)
    .sort((a, b) => state.relationships[b]!.affection - state.relationships[a]!.affection || (a < b ? -1 : 1))
    .map((id) => ({ id, name: state.people[id]!.name.first, reaction: state.health.mental.noticed[id]!.reaction }));
  const block =
    state.housing.kind === 'incarcerated'
      ? 'prison'
      : state.character.age < 10
        ? 'young'
        : state.health.mental.lastTherapist === state.currentYear
          ? 'visited'
          : !canSeeTherapist(state, content)
            ? 'busy'
            : null;
  return { conditions, noticed: conditions.length > 0 ? noticed : [], therapist: { cost: therapistQuote(state, content), block }, familyPays: !isIndependent(state, content) };
}
