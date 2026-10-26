/**
 * Leaving a group (W2). Kept apart from the rest of membership so the code that moves you
 * to another city can end the memberships there without pulling in the whole group system.
 */
import type { ContentBundle } from '../../content/schemas';
import { writeFromGroup } from '../systems/history';
import { pruneWeb } from '../web/ties';
import type { Id, LifeState } from '../types';
import { instanceOf, membershipOf, roleName } from './query';

/** You leave a group (or the move away from its city, or drifting away, takes you out of it). */
export function leaveGroup(state: LifeState, groupId: Id, how: 'left' | 'moved' | 'drifted', content: ContentBundle, quiet = false): boolean {
  const b = state.belonging;
  const m = membershipOf(state, groupId);
  const g = instanceOf(state, groupId);
  if (!m || !g) return false;
  b.memberships = b.memberships.filter((x) => x.groupId !== groupId);
  const def = content.groups[g.defId];
  b.past.push({ groupId, defId: g.defId, name: g.name, cityId: g.cityId, fromYear: m.since, toYear: state.currentYear, topRung: Math.max(m.rung, 0), how });
  if (b.past.length > 30) b.past.splice(0, b.past.length - 30);
  fadeAfterLeaving(state, g.people, content);
  if (!quiet) writeFromGroup(state, content.text.belonging.history[how === 'moved' ? 'moved' : 'left'], ['belonging', how === 'moved' ? 'moved' : 'left'], { values: { group: g.name, role: def ? roleName(m, def) : '' } }, content);
  return true;
}

/** The friends you made in a group you have left, and are not close to, fade from your life; the close ones, and anyone you share a memory with, stay. */
function fadeAfterLeaving(state: LifeState, people: readonly Id[], content: ContentBundle): void {
  const keep = content.balance.belonging.groups.members.keepAffection;
  let faded = false;
  for (const id of people) {
    const rel = state.relationships[id];
    if (rel && rel.status === 'active' && rel.kind === 'friend' && rel.affection < keep && rel.memories.length === 0) {
      rel.status = 'ended';
      faded = true;
    }
  }
  // Their ties and the stories they held go with them.
  if (faded) pruneWeb(state);
}

/** The memberships you can no longer keep because the group is in another city end quietly. */
export function lapseMoved(state: LifeState, content: ContentBundle, quiet = false): void {
  for (const m of [...state.belonging.memberships]) {
    const g = instanceOf(state, m.groupId);
    if (!g || g.cityId !== state.character.cityId) leaveGroup(state, m.groupId, 'moved', content, quiet);
  }
}
