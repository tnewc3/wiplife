/**
 * The `group`, `faith` and `value` effects (W2): what an event can do to
 * your place in a group, your faith (or someone else's) and your values. The
 * engine ignores anything that does not fit now, so a stale event cannot
 * break a life.
 */
import type { ContentBundle, Effect } from '../../content/schemas';
import { clampInt } from '../random';
import { chance } from '../rng';
import type { Id, LifeState } from '../types';
import { startItem } from '../web/knowledge';
import { cityGroups, ensureCity } from './cities';
import { acceptLatentFaith, changeFaith, faithOf, setPersonFaith, shiftStrength } from './faith';
import { addStanding, demote, joinGroup, leaveGroup, promote, setCommitment } from './groups';
import { castGroupId, instanceOf, membershipOf } from './query';
import { nudgeValue } from './values';

/** The group an effect acts on: the one the event is about, or, with none, the one group you belong to. */
function targetGroup(state: LifeState, cast: Record<string, Id>): Id | undefined {
  const bound = castGroupId(cast);
  if (bound !== undefined) return bound;
  const mine = state.belonging.memberships;
  return mine.length === 1 ? mine[0]!.groupId : undefined;
}

export function applyGroupEffect(state: LifeState, effect: Extract<Effect, { type: 'group' }>, cast: Record<string, Id>, content: ContentBundle): void {
  const b = state.belonging;
  switch (effect.action) {
    case 'join': {
      ensureCity(state, state.character.cityId, content);
      let id = targetGroup(state, cast);
      if (effect.defId !== undefined) {
        // One of that kind in your city that you don't belong to, the most welcoming first.
        const options = cityGroups(state, state.character.cityId, content)
          .filter((g) => g.defId === effect.defId && !membershipOf(state, g.id))
          .sort((a, c) => c.welcome - a.welcome || (a.id < c.id ? -1 : 1));
        id = options[0]?.id;
      }
      if (id !== undefined) joinGroup(state, id, effect.level ?? 'casual', content);
      return;
    }
    case 'leave': {
      const id = targetGroup(state, cast);
      if (id !== undefined) leaveGroup(state, id, 'left', content);
      return;
    }
    case 'commit': {
      const id = targetGroup(state, cast);
      if (id !== undefined && effect.level !== undefined) setCommitment(state, id, effect.level);
      return;
    }
    case 'promote': {
      const id = targetGroup(state, cast);
      const m = membershipOf(state, id);
      if (id !== undefined && m && promote(state, id, content)) announceRise(state, content);
      return;
    }
    case 'demote': {
      const id = targetGroup(state, cast);
      if (id !== undefined) demote(state, id, content);
      return;
    }
    case 'standing': {
      const id = targetGroup(state, cast);
      if (id !== undefined && effect.delta !== undefined) addStanding(state, id, effect.delta, content);
      return;
    }
    case 'community':
      if (effect.delta !== undefined) b.community = clampInt(b.community + effect.delta, 0, 100);
      return;
    case 'news': {
      if (effect.kind === undefined) return;
      const subject = effect.role === undefined ? 'you' : cast[effect.role];
      if (subject === undefined || (subject !== 'you' && !state.people[subject])) return;
      startItem({ cur: state, web: state.web, content, rng: state.rng, year: state.currentYear }, effect.kind, subject, undefined);
      return;
    }
  }
}

/** A new role is sometimes news. */
function announceRise(state: LifeState, content: ContentBundle): void {
  if (!chance(state.rng, content.balance.belonging.groups.news.honorChance)) return;
  startItem({ cur: state, web: state.web, content, rng: state.rng, year: state.currentYear }, 'groupHonor', 'you', undefined);
}

export function applyFaithEffect(state: LifeState, effect: Extract<Effect, { type: 'faith' }>, cast: Record<string, Id>, content: ContentBundle): void {
  const reg = content.registries.belonging;
  // Someone else's faith.
  if (effect.who !== undefined) {
    const person = state.people[cast[effect.who] ?? ''];
    if (!person) return;
    const now = faithOf(state, person, content);
    switch (effect.action) {
      case 'strengthen':
        setPersonFaith(person, now.id, now.strength + (effect.delta ?? 0));
        return;
      case 'weaken':
        setPersonFaith(person, now.id, now.strength - (effect.delta ?? 0));
        return;
      case 'lose':
        setPersonFaith(person, null, 0);
        return;
      case 'convert':
        if (effect.id !== undefined && reg.faiths[effect.id]) setPersonFaith(person, effect.id, content.balance.belonging.faith.start.convert);
        return;
      default:
        return;
    }
  }
  switch (effect.action) {
    case 'strengthen':
      shiftStrength(state, effect.delta ?? 0);
      return;
    case 'weaken':
      shiftStrength(state, -(effect.delta ?? 0));
      return;
    case 'lose':
      changeFaith(state, null, 'lose', content);
      return;
    case 'convert': {
      let to: Id | null | undefined;
      if (effect.id !== undefined) to = effect.id;
      else if (effect.group === true) {
        const g = instanceOf(state, castGroupId(cast));
        to = g ? content.groups[g.defId]?.religion : undefined;
      } else if (effect.role !== undefined) {
        const person = state.people[cast[effect.role] ?? ''];
        to = person ? faithOf(state, person, content).id : undefined;
      }
      if (to === undefined) return;
      changeFaith(state, to, state.belonging.faith.id === null && to !== null ? 'find' : 'convert', content);
      return;
    }
    case 'return': {
      const raised = state.belonging.faith.raised;
      if (raised !== null && raised !== state.belonging.faith.id) changeFaith(state, raised, 'return', content);
      return;
    }
    case 'fromLatent':
      acceptLatentFaith(state, content);
      return;
  }
}

export function applyValueEffect(state: LifeState, effect: Extract<Effect, { type: 'value' }>, content: ContentBundle): void {
  nudgeValue(state, effect.key, effect.delta, content);
}
