/**
 * Who came to the funeral (W1). Everyone the funeral would expect (family,
 * partners, friends, an ex you were married to, and anyone else you were
 * close to) either could not come (in prison, seriously ill, in care), or
 * decides: each cause that applies (estrangement, a feud, an ex, a story they
 * believe, low trust, low affection, living far away) is a chance of staying
 * away, and the reason given is the strongest cause that applied, so a
 * reason always fits. Every number is in balance/eulogy.yaml.
 */
import type { AbsenceCause, ContentBundle, CouldNotReason } from '../../content/schemas';
import { ABSENCE_CAUSES } from '../../content/schemas';
import { relationWord } from '../lives/model';
import { lifeTextRole } from '../lives/model';
import { isFamilyKind, isPartnerKind, ageOf } from '../relationships';
import { chance, pick, type RngState } from '../rng';
import { renderText, TextError, type TextRole } from '../text';
import type { FuneralGuest, Id, LifeState } from '../types';
import { heardText } from '../web/knowledge';
import { heardAboutYou } from '../web/query';
import { couldNotAttend } from './speaker';

/** The people the funeral would expect, in id order. */
export function expectedGuests(life: LifeState, content: ContentBundle): Id[] {
  const b = content.balance.eulogy;
  const out: Id[] = [];
  for (const rel of Object.values(life.relationships)) {
    const person = life.people[rel.personId];
    if (!person || !person.alive || rel.status === 'ended' || ageOf(life, person) < b.speaker.minAge) continue;
    const closeness = rel.affection + rel.trust;
    const expected =
      isFamilyKind(rel.kind) ||
      isPartnerKind(rel.kind) ||
      (rel.kind === 'ex' ? rel.wasSpouse === true : closeness >= (rel.kind === 'friend' ? b.attendance.friendMinCombined : b.attendance.otherMinCombined));
    if (expected) out.push(person.id);
  }
  // L1: the people you asked to be with you at the end are expected, whatever else they are to you.
  for (const id of life.later.terminal?.visitors ?? []) {
    const person = life.people[id];
    if (person?.alive && life.relationships[id]?.status !== 'ended' && ageOf(life, person) >= b.speaker.minAge && !out.includes(id)) out.push(id);
  }
  return out.sort();
}

/** The causes that apply to this person, each with its chance. Empty when nothing keeps them away. */
export function absenceCauses(life: LifeState, personId: Id, speakerId: Id | undefined, content: ContentBundle): { cause: AbsenceCause; p: number }[] {
  const a = content.balance.eulogy.attendance;
  const rel = life.relationships[personId]!;
  const person = life.people[personId]!;
  const hits: { cause: AbsenceCause; p: number }[] = [];
  const add = (cause: AbsenceCause) => hits.push({ cause, p: a.causes[cause] });
  if (rel.status === 'estranged') add('estranged');
  if (feudWith(life, personId, speakerId) !== null) add('feud');
  if (rel.kind === 'ex') add('ex');
  if (rumorAbout(life, personId, content) !== null) add('rumor');
  if (rel.trust < a.distrustBelow) add('distrust');
  if (rel.affection < a.distantBelow) add('distant');
  if (person.cityId !== life.character.cityId && rel.affection + rel.trust < a.farBelow) add('far');
  return hits;
}

/** The feud this person is in, if any: with the speaker, one where you took the other side, or any other. */
function feudWith(life: LifeState, personId: Id, speakerId: Id | undefined): 'speaker' | 'sided' | 'other' | null {
  let found: 'speaker' | 'sided' | 'other' | null = null;
  for (const tie of Object.values(life.web.ties)) {
    if ((tie.a !== personId && tie.b !== personId) || !tie.feud) continue;
    const other = tie.a === personId ? tie.b : tie.a;
    if (!life.people[other]?.alive) continue;
    if (tie.feud.side !== undefined && tie.feud.side !== personId) return 'sided';
    if (other === speakerId) found = 'speaker';
    else found ??= 'other';
  }
  return found;
}

/** The harshest story this person believes about you that isn't true: the phrase, or null. */
function rumorAbout(life: LifeState, personId: Id, content: ContentBundle): string | null {
  let worst: { score: number; text: string } | null = null;
  for (const item of heardAboutYou(life, personId)) {
    const holder = item.holders[personId]!;
    if (holder.version === item.truth) continue;
    const version = content.registries.web.kinds[item.kind as keyof typeof content.registries.web.kinds]?.versions[holder.version];
    if (!version || version.affection + version.trust >= 0) continue;
    const text = heardText(life, item, holder.version, content);
    if (text === '') continue;
    const score = version.affection + version.trust;
    if (worst === null || score < worst.score) worst = { score, text };
  }
  return worst?.text ?? null;
}

const first = (life: LifeState, id: Id | undefined) => (id !== undefined ? (life.people[id]?.name.first ?? '') : '');

function role(life: LifeState, id: Id, content: ContentBundle): TextRole {
  const person = life.people[id]!;
  return lifeTextRole(life, id, content) ?? { name: person.name, pronouns: person.identity.pronouns };
}

/** What kept this person away, in words, for the cause. */
function reasonFor(life: LifeState, personId: Id, cause: AbsenceCause, speakerId: Id | undefined, content: ContentBundle, rng: RngState, used: Set<string>): string | null {
  const t = content.text.eulogy.absent;
  const rel = life.relationships[personId]!;
  const held = new Set(rel.memories.map((m) => m.tag));
  // A reason already given to someone else at this funeral is passed over while another fits.
  const pickVariant = (templates: readonly string[]): string => {
    const fresh = templates.filter((t) => !used.has(t));
    const chosen = pick(rng, fresh.length > 0 ? fresh : templates);
    used.add(chosen);
    return chosen;
  };
  const withMemories = (memory: Record<string, string>, generic: readonly string[]): string => {
    const specific = Object.entries(memory)
      .filter(([tag]) => held.has(tag))
      .map(([, line]) => line);
    const options = [...specific.flatMap((l) => Array<string>(content.balance.eulogy.attendance.specificWeight).fill(l)), ...generic];
    return pickVariant(options);
  };
  let template: string;
  switch (cause) {
    case 'estranged':
      template = withMemories(t.estranged.memory, t.estranged.generic);
      break;
    case 'ex':
      template = withMemories(t.ex.memory, t.ex.generic);
      break;
    case 'feud': {
      const kind = feudWith(life, personId, speakerId) ?? 'other';
      template = pickVariant(kind === 'sided' ? t.feud.sided : kind === 'speaker' ? t.feud.speaker : t.feud.generic);
      break;
    }
    case 'rumor':
      template = pickVariant(t.rumor);
      break;
    case 'distrust':
      template = pickVariant(t.distrust);
      break;
    case 'distant':
      template = pickVariant(t.distant);
      break;
    case 'far':
      template = pickVariant(t.far);
      break;
  }
  try {
    return renderText(template, {
      roles: { self: { name: life.character.name, pronouns: life.character.identity.pronouns }, npc: role(life, personId, content) },
      values: { heard: rumorAbout(life, personId, content) ?? '', speaker: first(life, speakerId) },
    });
  } catch (err) {
    if (err instanceof TextError) return null;
    throw err;
  }
}

/** L1: how much more or less likely this guest is to stay away because of your final wishes. */
function guestFactor(life: LifeState, id: Id, content: ContentBundle): number {
  const t = life.later.terminal;
  if (t === null) return 1;
  const b = content.balance.later.terminal;
  let factor = t.service !== null ? b.service[t.service].stayAway : 1;
  if (t.visits.some((v) => v.id === id && v.came)) factor *= b.attend.visited;
  if (t.letters.includes(id)) factor *= b.attend.letter;
  return factor;
}

/** L1: the reason given for someone you asked to be with you who did not come. */
function declinedReason(life: LifeState, id: Id, content: ContentBundle, rng: RngState): string {
  return renderText(pick(rng, content.text.later.lastDays.declinedReason), {
    roles: { self: { name: life.character.name, pronouns: life.character.identity.pronouns }, npc: role(life, id, content) },
  });
}

function couldNotReason(life: LifeState, personId: Id, why: CouldNotReason, content: ContentBundle, rng: RngState): string {
  return renderText(pick(rng, content.text.eulogy.couldNot[why]), {
    roles: { self: { name: life.character.name, pronouns: life.character.identity.pronouns }, npc: role(life, personId, content) },
  });
}

export interface Attendance {
  notAttending: FuneralGuest[];
  moreNotAttending: number;
  couldNotAttend: FuneralGuest[];
}

const guest = (life: LifeState, id: Id, reason: string, content: ContentBundle): FuneralGuest => ({
  name: `${life.people[id]!.name.first} ${life.people[id]!.name.last}`,
  relation: relationWord(life.people[id]!, life.relationships[id]!, content),
  reason,
});

/**
 * Who stayed away and who could not come. One draw from `rng` for each
 * expected guest who is free to choose, in id order, so the same life always
 * has the same funeral.
 */
export function getAttendance(life: LifeState, content: ContentBundle, speakerId: Id | undefined, rng: RngState): Attendance {
  const staying: { id: Id; closeness: number; reason: string }[] = [];
  const unable: { id: Id; closeness: number; reason: string }[] = [];
  const usedReasons = new Set<string>();
  for (const id of expectedGuests(life, content)) {
    if (id === speakerId) continue;
    const rel = life.relationships[id]!;
    const closeness = rel.affection + rel.trust;
    const cannot = couldNotAttend(life, id, content);
    if (cannot !== null) {
      unable.push({ id, closeness, reason: couldNotReason(life, id, cannot, content, rng) });
      continue;
    }
    // L1: someone you asked to be with you who did not come is listed as staying away (nothing is rolled).
    const visit = life.later.terminal?.visits.find((v) => v.id === id);
    if (visit && !visit.came) {
      staying.push({ id, closeness, reason: declinedReason(life, id, content, rng) });
      continue;
    }
    const hits = absenceCauses(life, id, speakerId, content);
    // L1: a visitor who came, or got your letter, rarely stays away now; the service you asked for changes how many come.
    const p = Math.min(0.97, (1 - hits.reduce((left, h) => left * (1 - h.p), 1)) * guestFactor(life, id, content));
    if (!chance(rng, p) || hits.length === 0) continue;
    // The strongest cause gives the reason; ties go in the order the causes are listed.
    const strongest = [...hits].sort((x, y) => y.p - x.p || ABSENCE_CAUSES.indexOf(x.cause) - ABSENCE_CAUSES.indexOf(y.cause))[0]!;
    const reason = reasonFor(life, id, strongest.cause, speakerId, content, rng, usedReasons);
    if (reason !== null) staying.push({ id, closeness, reason });
  }
  const closestFirst = (a: { id: Id; closeness: number }, b: { id: Id; closeness: number }) => b.closeness - a.closeness || (a.id < b.id ? -1 : 1);
  staying.sort(closestFirst);
  unable.sort(closestFirst);
  const max = content.balance.eulogy.attendance.maxListed;
  return {
    notAttending: staying.slice(0, max).map((s) => guest(life, s.id, s.reason, content)),
    moreNotAttending: Math.max(0, staying.length - max),
    couldNotAttend: unable.slice(0, max).map((s) => guest(life, s.id, s.reason, content)),
  };
}
