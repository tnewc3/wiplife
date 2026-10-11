/**
 * Values belonging events can use in their text (W2): {group} (the group the
 * event is about, or the one you belong to), {role} (your role in it),
 * {groupFaith} (the religion of a faith group) and {tradition}, {faith} and
 * {adherent} (your faith, and what a follower of it is called) and
 * {latentFaith} (the faith you felt a pull toward, or "no religion"). The
 * content build checks that an event using one requires what it names
 * (tools/content/belonging.ts).
 */
import type { ContentBundle } from '../../content/schemas';
import type { Id, LifeState } from '../types';
import { adherentName, castGroupId, faithName, instanceOf, membershipOf, roleName } from './query';

export const BELONGING_TEXT_VALUES = ['group', 'role', 'groupFaith', 'tradition', 'faith', 'adherent', 'latentFaith'] as const;

export function belongingTextValues(state: LifeState, cast: Record<string, Id>, content: ContentBundle): Record<string, string> {
  const b = state.belonging;
  const g = instanceOf(state, castGroupId(cast)) ?? (b.memberships[0] ? instanceOf(state, b.memberships[0].groupId) : undefined);
  const def = g && content.groups[g.defId];
  const m = g && membershipOf(state, g.id);
  const latent = state.character.latent.faith;
  return {
    group: g?.name ?? '',
    role: m && def ? roleName(m, def) : '',
    groupFaith: def?.religion !== undefined ? faithName(content, def.religion) : '',
    tradition: def?.tradition ?? '',
    faith: b.faith.id === null ? '' : faithName(content, b.faith.id),
    adherent: b.faith.id === null ? '' : adherentName(content, b.faith.id),
    latentFaith: latent ? faithName(content, latent.id) : '',
  };
}
