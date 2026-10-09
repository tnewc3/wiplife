/**
 * Who speaks at the funeral (W1): the closest living person by affection and
 * trust, not estranged and able to come. Ties go to a spouse, then children,
 * then everyone else. The numbers are in balance/eulogy.yaml.
 */
import type { ContentBundle, CouldNotReason, EulogyGroup, EulogyTone } from '../../content/schemas';
import { isJailed } from '../lives/model';
import { ageOf, isChildKind } from '../relationships';
import type { Id, LifeState, Relationship } from '../types';

/** Why this person could not come to the funeral, if they could not: in prison, very ill, or in care. */
export function couldNotAttend(life: LifeState, personId: Id, content: ContentBundle): CouldNotReason | null {
  const own = life.people[personId]?.life;
  if (!own) return null;
  if (isJailed(own)) return 'prison';
  const bar = content.balance.eulogy.attendance.unableSeverity;
  if (own.troubles.some((t) => t.kind !== 'crime' && t.severity >= bar)) return 'ill';
  if (own.care === 'needed' || own.care === 'paid' || own.care === 'sibling') return 'care';
  return null;
}

/** What the speaker is to you, in the groups the opening is written for. */
export function groupOf(kind: Relationship['kind'], content: ContentBundle): EulogyGroup | null {
  const groups = content.balance.eulogy.speaker.groups;
  for (const [group, kinds] of Object.entries(groups)) if ((kinds as readonly string[]).includes(kind)) return group as EulogyGroup;
  return null;
}

/** How the speaker sounds, from how they feel about you. */
export function toneOf(combined: number, content: ContentBundle): EulogyTone {
  const t = content.balance.eulogy.tone;
  return combined >= t.warm ? 'warm' : combined < t.cool ? 'cool' : 'measured';
}

export interface SpeakerChoice {
  personId: Id;
  group: EulogyGroup;
  tone: EulogyTone;
  /** Affection plus trust. */
  combined: number;
}

/** A spouse first, then children, then everyone else. */
const tieRank = (kind: Relationship['kind']) => (kind === 'spouse' ? 0 : isChildKind(kind) ? 1 : 2);

/** Everyone who could speak, the closest first. */
export function eligibleSpeakers(life: LifeState, content: ContentBundle): SpeakerChoice[] {
  const b = content.balance.eulogy.speaker;
  const out: (SpeakerChoice & { rank: number; affection: number })[] = [];
  for (const rel of Object.values(life.relationships)) {
    const person = life.people[rel.personId];
    if (!person || !person.alive || rel.status !== 'active' || (b.excludedKinds as readonly string[]).includes(rel.kind)) continue;
    const group = groupOf(rel.kind, content);
    if (group === null || ageOf(life, person) < b.minAge || couldNotAttend(life, person.id, content) !== null) continue;
    const combined = rel.affection + rel.trust;
    if (combined < b.minCombined) continue;
    out.push({ personId: person.id, group, tone: toneOf(combined, content), combined, rank: tieRank(rel.kind), affection: rel.affection });
  }
  out.sort((a, b2) => b2.combined - a.combined || a.rank - b2.rank || b2.affection - a.affection || (a.personId < b2.personId ? -1 : a.personId > b2.personId ? 1 : 0));
  return out.map(({ personId, group, tone, combined }) => ({ personId, group, tone, combined }));
}

/** The speaker, or null when no one is close enough. */
export function chooseSpeaker(life: LifeState, content: ContentBundle): SpeakerChoice | null {
  return eligibleSpeakers(life, content)[0] ?? null;
}
