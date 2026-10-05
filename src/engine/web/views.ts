/**
 * What the UI needs about the social web (E4), read through selectors: a
 * person's connections (who they are close to and who they are feuding with),
 * what they have heard about you (their version of the story), and the
 * pickers for the interactions that take a second person or a story.
 */
import type { ContentBundle, TieKindId, TieStatusId } from '../../content/schemas';
import { relationWord } from '../lives/model';
import type { Id, LifeState } from '../types';
import { introduceCandidates, topicItems } from './actions';
import { heardText, kindDef } from './knowledge';
import { learnedHow, tieStatus } from './query';
import { inCircle } from './ties';

export interface ConnectionView {
  personId: Id;
  /** Their first name and full name. */
  name: string;
  fullName: string;
  /** What they are to you in words ("sister", "friend"). */
  relation: string;
  kind: TieKindId;
  status: TieStatusId;
  /** The side you took in their feud, if you did, and whether you are staying out of it. */
  sided: boolean;
  neutral: boolean;
}

const STATUS_ORDER: Record<TieStatusId, number> = { feuding: 0, close: 1, normal: 2, strained: 3 };

/** The people this person is tied to, feuds first, then the closest. Only people alive and in your circle. */
export function getConnections(state: LifeState, personId: Id, content: ContentBundle): ConnectionView[] {
  if (!state.people[personId]) return [];
  return Object.values(state.web.ties)
    .filter((t) => t.a === personId || t.b === personId)
    .flatMap((t): ConnectionView[] => {
      const otherId = t.a === personId ? t.b : t.a;
      const other = state.people[otherId];
      const rel = state.relationships[otherId];
      if (!other || !rel || !inCircle(state, otherId)) return [];
      return [
        {
          personId: otherId,
          name: other.name.first,
          fullName: `${other.name.first} ${other.name.last}`,
          relation: relationWord(other, rel, content),
          kind: t.kind,
          status: tieStatus(t, content),
          sided: t.feud?.side !== undefined,
          neutral: t.feud !== undefined && t.feud.side === undefined,
        },
      ];
    })
    .sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || (x.fullName < y.fullName ? -1 : 1));
}

export interface HeardView {
  itemId: string;
  /** What they have heard: a phrase that follows "has heard". */
  text: string;
  secret: boolean;
  /** What they believe isn't what happened. */
  distorted: boolean;
  learned: 'you' | 'saw' | 'gossip';
}

/** What a close person has heard about you, their version of the story. Empty for people you aren't close to. */
export function getHeard(state: LifeState, personId: Id, content: ContentBundle): HeardView[] {
  const person = state.people[personId];
  if (!person || !person.alive || person.life?.tier !== 'close') return [];
  return state.web.items
    .filter((i) => i.subject === 'you' && i.holders[personId] !== undefined)
    .map((i): HeardView => {
      const h = i.holders[personId]!;
      return { itemId: i.id, text: heardText(state, i, h.version, content), secret: kindDef(content, i.kind)?.secret === true, distorted: h.version !== i.truth, learned: learnedHow(h.from) };
    })
    .filter((h) => h.text.length > 0);
}

export interface PickView {
  id: Id | string;
  label: string;
  detail?: string;
}

/** The people you could introduce this person to. */
export function getIntroduceChoices(state: LifeState, personId: Id, content: ContentBundle): PickView[] {
  return introduceCandidates(state, personId, content).map((id) => {
    const p = state.people[id]!;
    return { id, label: `${p.name.first} ${p.name.last}`, detail: relationWord(p, state.relationships[id]!, content) };
  });
}

/** The stories this person has heard that an interaction can be about. */
export function getTopicChoices(state: LifeState, personId: Id, topic: 'distorted' | 'secret', content: ContentBundle): PickView[] {
  return topicItems(state, personId, topic, content).map((i) => ({ id: i.id, label: heardText(state, i, i.holders[personId]!.version, content) }));
}
