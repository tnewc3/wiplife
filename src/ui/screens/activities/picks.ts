import type { PastimeRoute } from '../../../content/schemas';
import type { ActivityEntryView } from '../../../engine/selectors';

/** What the player has chosen on an entry before pressing its button: a lawsuit's route, a chase, a typed name, a parent's agreement. */
export interface Picks {
  look?: string;
  route?: PastimeRoute;
  chase?: boolean;
  first?: string;
  last?: string;
  consent?: string | null;
}

/** The typed names and the parent who agrees, as the action takes them (the engine checks and tidies them). */
export function nameParams(entry: ActivityEntryView, p: Picks): { first?: string; last?: string; consentId?: string } {
  const n = entry.name!;
  return {
    ...(n.fields.includes('first') ? { first: p.first ?? '' } : {}),
    ...(n.fields.includes('last') ? { last: p.last ?? '' } : {}),
    ...(!n.adult && (p.consent ?? n.consent[0]?.id) ? { consentId: p.consent ?? n.consent[0]!.id } : {}),
  };
}
