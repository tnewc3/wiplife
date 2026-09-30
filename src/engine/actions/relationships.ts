/**
 * Relationship management actions (docs/design.md, section H): ask out,
 * propose, marry, break up, divorce, cut contact and reconcile. Each rule
 * says when the action can be taken with a person; the common checks (a
 * living person you know, one action per person per year, between years)
 * live in ./index.ts.
 */
import type { ActionId, ContentBundle } from '../../content/schemas';
import {
  ASKABLE_KINDS,
  currentPartner,
  isCurrentPartner,
  isFamilyKind,
  isPartnerKind,
  isRomanticMatch,
  yearsInKind,
} from '../relationships';
import type { LifeState, Person, Relationship } from '../types';

export interface ActionRule {
  /** Can't be undone: the UI asks for confirmation first. */
  irreversible: boolean;
  /** True when the action can be taken with this person now. */
  allowed: (state: LifeState, rel: Relationship, person: Person, content: ContentBundle) => boolean;
}

/** Old enough to cut contact with (or reconcile with) this person. */
function oldEnoughToDecide(state: LifeState, rel: Relationship, content: ContentBundle): boolean {
  const { minAge } = content.balance.relationships.actions;
  return state.character.age >= (isFamilyKind(rel.kind) ? minAge.family : minAge.others);
}

export const RELATIONSHIP_ACTIONS: Record<ActionId, ActionRule> = {
  ask_out: {
    irreversible: false,
    // Someone you know (not family, not already yours), both adults, attraction
    // both ways, and you're single.
    allowed: (state, rel, person, content) =>
      ASKABLE_KINDS.includes(rel.kind) &&
      rel.status === 'active' &&
      currentPartner(state) === null &&
      isRomanticMatch(state, person, content),
  },
  propose: {
    irreversible: false,
    allowed: (state, rel, _person, content) =>
      rel.kind === 'partner' &&
      isCurrentPartner(state, rel) &&
      yearsInKind(state, rel) >= content.balance.relationships.actions.proposeAfterYears,
  },
  marry: {
    irreversible: false,
    allowed: (state, rel, _person, content) =>
      rel.kind === 'fiance' &&
      isCurrentPartner(state, rel) &&
      yearsInKind(state, rel) >= content.balance.relationships.actions.marryAfterYears,
  },
  break_up: {
    irreversible: true,
    allowed: (state, rel) => (rel.kind === 'partner' || rel.kind === 'fiance') && isCurrentPartner(state, rel),
  },
  divorce: {
    irreversible: true,
    allowed: (state, rel) => rel.kind === 'spouse' && isCurrentPartner(state, rel),
  },
  cut_contact: {
    irreversible: true,
    // A current partner is left by breaking up or divorcing instead.
    allowed: (state, rel, _person, content) => rel.status === 'active' && !isPartnerKind(rel.kind) && oldEnoughToDecide(state, rel, content),
  },
  reconcile: {
    irreversible: false,
    allowed: (state, rel, _person, content) => rel.status === 'estranged' && oldEnoughToDecide(state, rel, content),
  },
};
