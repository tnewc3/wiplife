/**
 * Crowds at school (T1): per-school generation, joining, switching, leaving
 * and clashes, built on the people and ties that already exist (classmates,
 * E4 ties and feuds). A school's crowds are drawn once from src/content/cliques
 * and stay until you move or change school. A crowd brings its people into your
 * life when you first join it (classmates, tied to each other as friends); a
 * clash with its rival is a feud between one of your crowd and one of theirs.
 *
 * Nothing here is romantic, and nobody it creates is older than the teen
 * years allow: members are classmates around your own age. Numbers:
 * balance/teen.yaml (school, cliques).
 */
import type { CastSpec, CliqueDef, ContentBundle, TeenHistoryKey, TeenTrigger } from '../../content/schemas';
import { createPerson } from '../events/casting';
import { eventWeight } from '../events/selection';
import { applyStatEffects } from '../systems/economy';
import { clampInt, rollScore, weightedPick } from '../random';
import { chance, nextInt } from '../rng';
import { writeFromGroup } from '../systems/history';
import { addTie, canTie } from '../web/ties';
import { getTie } from '../web/query';
import type { Id, LifeState, Person, TeenClique } from '../types';
import { cliqueById, cliqueDef, cliqueName, inTeenYears, livingMembers, myClique, rivalClique } from './query';

/** A history line from text/teen.yaml (values: {clique}, {school}, ...). */
export function teenHistory(state: LifeState, key: TeenHistoryKey, values: Record<string, string>, content: ContentBundle): void {
  writeFromGroup(state, content.text.teen.history[key], ['teen', key], { values }, content);
}

/** The name of your school (from the city: its high school, or "the middle school"). */
export function schoolNameOf(state: LifeState, content: ContentBundle): string {
  const city = content.cities[state.teen.school?.cityId ?? state.character.cityId];
  return state.teen.school?.program === 'middle' ? `the middle school in ${city?.name ?? 'town'}` : (city?.schools.high ?? 'your school');
}

/**
 * Queues one of the teen registry's events (picked by weight among those
 * that fit now with this cast), unless one of them is already waiting for
 * that year: `now` is this year (the yearly step, which pacing then reads),
 * `next` is the year that begins next (an action between years or an event).
 * The caller passes the roles each trigger promises.
 */
export function queueTeenEvent(state: LifeState, trigger: TeenTrigger, cast: Record<string, Id>, content: ContentBundle, due: 'now' | 'next' = 'now'): boolean {
  const ids = content.registries.teen.triggers[trigger].events;
  const options = ids.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return false;
  const dueYear = due === 'now' ? state.currentYear : state.currentYear + 1;
  if (state.scheduled.some((s) => ids.includes(s.eventId) && s.dueYear === dueYear)) return false;
  const def = weightedPick(state.rng, options);
  state.scheduled.push({ eventId: def.id, dueYear, cast });
  return true;
}

/** How well your personality fits a crowd, from -1 to 1 (its likes, summed). */
export function fitWith(state: LifeState, def: CliqueDef): number {
  const p = state.character.personality;
  let fit = 0;
  for (const [trait, weight] of Object.entries(def.likes)) fit += (weight ?? 0) * ((p[trait as keyof typeof p] - 50) / 50);
  return Math.max(-1, Math.min(1, fit));
}

/** The chance a crowd takes you in when you try. */
export function joinChance(state: LifeState, clique: TeenClique, content: ContentBundle): number {
  const def = cliqueDef(content, clique.defId);
  if (!def) return 0;
  const j = content.balance.teen.cliques.join;
  const p = j.base + j.fit * fitWith(state, def) + j.standing * ((state.teen.standing - clique.standing) / 100);
  return Math.min(j.max, Math.max(j.min, p));
}

/** Why you can't try to join this crowd now, or null when you can. */
export type JoinBlock = 'age' | 'school' | 'unknown' | 'member' | 'turnedAway' | 'away';

export function joinBlock(state: LifeState, cliqueId: Id, content: ContentBundle): JoinBlock | null {
  if (!inTeenYears(state, content)) return 'age';
  if (state.housing.kind === 'incarcerated') return 'away';
  if (!state.teen.school) return 'school';
  const clique = cliqueById(state, cliqueId);
  if (!clique || !cliqueDef(content, clique.defId)) return 'unknown';
  if (state.teen.member?.cliqueId === cliqueId) return 'member';
  const turned = state.teen.turnedAway[cliqueId];
  if (turned !== undefined && state.currentYear - turned < content.balance.teen.cliques.coolOff) return 'turnedAway';
  return null;
}

/** Why you can't leave your crowd (you have none), or null. */
export function leaveBlock(state: LifeState): 'none' | null {
  return state.teen.member ? null : 'none';
}

/** Classmates who come with a crowd: made once, around your age, with the crowd's personality, tied to each other as friends. */
export function ensureMembers(state: LifeState, clique: TeenClique, content: ContentBundle): void {
  if (livingMembers(state, clique).length >= 2) return;
  const bal = content.balance.teen.cliques;
  const def = cliqueDef(content, clique.defId);
  if (!def) return;
  const count = nextInt(state.rng, bal.members.min, bal.members.max);
  const age = state.character.age;
  const spec: CastSpec = { kind: 'classmate', presence: 'city', createIfMissing: true, age: { min: Math.max(11, age - bal.memberAge.below), max: Math.min(17, age + bal.memberAge.above) } };
  const made: Id[] = [];
  for (let i = 0; i < count; i++) {
    const id = createPerson(state, spec, state.rng, content);
    if (id === null) continue;
    const person = state.people[id] as Person;
    for (const [trait, delta] of Object.entries(def.traits)) {
      const key = trait as keyof Person['traits'];
      person.traits[key] = clampInt((person.traits[key] ?? 50) + (delta ?? 0), 0, 100);
    }
    person.tags = [...person.tags, `crowd:${clique.id}`];
    state.relationships[id]!.affection = rollScore(state.rng, bal.memberAffection);
    made.push(id);
  }
  clique.members = [...livingMembers(state, clique), ...made];
  // They know each other: friends, tied to one another (E4).
  const all = clique.members;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (canTie(state, all[i]!, all[j]!)) addTie(state.web, all[i]!, all[j]!, 'friends', rollScore(state.rng, bal.tieAffection), 'context', state.currentYear);
    }
  }
}

/** Sets up the crowds of the school you are in now (a new school, when you moved or changed school). */
export function runSchool(state: LifeState, content: ContentBundle): void {
  const t = state.teen;
  const program = state.education.current?.program;
  if (program !== 'middle' && program !== 'high') {
    // Out of school: no crowds.
    if (t.school) {
      if (t.member) teenHistory(state, 'cliqueLeft', { clique: cliqueName(content, myClique(state)) }, content);
      t.school = null;
      t.cliques = [];
      t.member = null;
      delete t.invite;
      delete t.clash;
      t.turnedAway = {};
    }
    return;
  }
  const key = `${state.character.cityId}:${program}`;
  if (t.school?.key === key) return;
  const moved = t.school !== null;
  t.school = { key, cityId: state.character.cityId, program, since: state.currentYear };
  t.cliques = [];
  t.member = null;
  t.turnedAway = {};
  delete t.invite;
  delete t.clash;
  t.standing = content.balance.teen.cliques.standingStart;
  const bal = content.balance.teen.school;
  const defs = Object.keys(content.cliques)
    .sort()
    .map((id) => content.cliques[id]!)
    .filter((d) => !d.retired);
  const count = Math.min(defs.length, nextInt(state.rng, bal.cliques.min, bal.cliques.max));
  const pool = [...defs];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const def = weightedPick(state.rng, pool.map((d) => [d, d.weight] as const));
    pool.splice(pool.indexOf(def), 1);
    const id = `k${t.nextClique}`;
    t.nextClique += 1;
    const standing = clampInt(def.standing + nextInt(state.rng, -bal.standingNoise, bal.standingNoise), 0, 100);
    t.cliques.push({ id, defId: def.id, members: [], standing });
  }
  // Rivals: pairs.
  const open = t.cliques.map((c) => c.id);
  for (const c of t.cliques) {
    if (c.rival !== undefined || !chance(state.rng, bal.rivalChance)) continue;
    const others = open.filter((id) => id !== c.id && cliqueById(state, id)?.rival === undefined);
    if (others.length === 0) continue;
    const other = cliqueById(state, others[nextInt(state.rng, 0, others.length - 1)]!)!;
    c.rival = other.id;
    other.rival = c.id;
  }
  if (moved) teenHistory(state, 'newSchool', { school: schoolNameOf(state, content) }, content);
}

/** Your place in your crowd (0–100): how fond its members are of you, on average. */
export function rankOf(state: LifeState): number {
  const members = livingMembers(state, myClique(state));
  if (members.length === 0) return 0;
  const total = members.reduce((sum, id) => sum + (state.relationships[id]?.affection ?? 0), 0);
  return clampInt(total / members.length, 0, 100);
}

function setAffection(state: LifeState, id: Id, delta: number): void {
  const rel = state.relationships[id];
  if (rel) rel.affection = clampInt(rel.affection + delta, 0, 100);
}

/** A feud between one of your crowd and one of theirs (E4), and how their side feels about you. */
function startFeud(state: LifeState, mine: TeenClique, theirs: TeenClique, content: ContentBundle): void {
  const bal = content.balance.teen.cliques.clash;
  ensureMembers(state, theirs, content);
  for (const id of livingMembers(state, theirs)) setAffection(state, id, bal.affection);
  const a = [...livingMembers(state, mine)].sort((x, y) => (state.relationships[y]!.affection - state.relationships[x]!.affection) || (x < y ? -1 : 1))[0];
  const b = livingMembers(state, theirs)[0];
  if (a === undefined || b === undefined) return;
  const existing = getTie(state.web, a, b);
  if (existing) {
    existing.affection = Math.min(existing.affection, bal.feud);
    existing.feud ??= { since: state.currentYear };
  } else if (canTie(state, a, b)) {
    addTie(state.web, a, b, 'friends', bal.feud, 'context', state.currentYear).feud = { since: state.currentYear };
  }
}

/** Your crowd and another fall out: a clash, with a feud (the crowd you left, the rival crowd, or one that wasn't ready to share). */
export function startClash(state: LifeState, otherId: Id, content: ContentBundle): boolean {
  const t = state.teen;
  const other = cliqueById(state, otherId);
  if (!other || t.clash || !t.school) return false;
  const years = content.balance.teen.cliques.yearly.clashYears;
  t.clash = { cliqueId: other.id, since: state.currentYear, until: state.currentYear + nextInt(state.rng, years.min, years.max) - 1 };
  const mine = myClique(state);
  if (mine) startFeud(state, mine, other, content);
  else ensureMembers(state, other, content);
  teenHistory(state, 'cliqueClash', { clique: cliqueName(content, mine ?? other), school: schoolNameOf(state, content) }, content);
  return true;
}

/** The clash is over (its feud ends the way a feud does in E4: the tie is mended). */
export function endClash(state: LifeState, content: ContentBundle): void {
  const t = state.teen;
  if (!t.clash) return;
  const theirs = cliqueById(state, t.clash.cliqueId);
  const mine = myClique(state);
  const bal = content.balance.web.feud;
  for (const a of livingMembers(state, mine)) {
    for (const b of livingMembers(state, theirs)) {
      const tie = getTie(state.web, a, b);
      if (tie?.feud) {
        delete tie.feud;
        tie.affection = Math.max(tie.affection, bal.endAffection);
      }
    }
  }
  delete t.clash;
}

/**
 * You try to join a crowd (switching, if you belong to another). The crowd's
 * answer is rolled, unless `roll` is false (an event that has already had its
 * say: a crowd that asked you in, a check the event made). Returns what happened.
 */
export function joinClique(state: LifeState, cliqueId: Id, content: ContentBundle, roll = true): 'joined' | 'switched' | 'turnedAway' | 'blocked' {
  if (joinBlock(state, cliqueId, content) !== null) return 'blocked';
  const t = state.teen;
  const clique = cliqueById(state, cliqueId)!;
  const name = cliqueName(content, clique);
  const school = schoolNameOf(state, content);
  if (roll && !chance(state.rng, joinChance(state, clique, content))) {
    t.turnedAway[cliqueId] = state.currentYear;
    teenHistory(state, 'cliqueTurnedAway', { clique: name, school }, content);
    return 'turnedAway';
  }
  const old = myClique(state);
  if (old) leaveCrowd(state, old.id, content, clique.id);
  ensureMembers(state, clique, content);
  t.member = { cliqueId, since: state.currentYear, rank: 0 };
  t.member.rank = rankOf(state);
  if (t.invite === cliqueId) delete t.invite;
  // Joining the crowd you were clashing with settles it.
  if (t.clash?.cliqueId === cliqueId) endClash(state, content);
  teenHistory(state, old ? 'cliqueSwitched' : 'cliqueJoined', { clique: name, school }, content);
  return old ? 'switched' : 'joined';
}

/**
 * You leave a crowd: its members feel it, your standing dips, and the crowd
 * may hold it against you (more so when you go to its rival): a clash.
 */
function leaveCrowd(state: LifeState, oldId: Id, content: ContentBundle, goingTo?: Id): void {
  const t = state.teen;
  const old = cliqueById(state, oldId);
  if (!old) return;
  const bal = content.balance.teen.cliques.leave;
  for (const id of livingMembers(state, old)) setAffection(state, id, bal.affection);
  t.standing = clampInt(t.standing + bal.standing, 0, 100);
  t.turnedAway[oldId] = state.currentYear;
  t.member = null;
  const toRival = goingTo !== undefined && old.rival === goingTo;
  if (!t.clash && chance(state.rng, toRival ? bal.rivalClashChance : bal.clashChance)) {
    // After the move, the crowd you left is the one at odds with you.
    t.member = null;
    startClashAfterMove(state, old.id, goingTo, content);
  }
}

/** A clash with the crowd you just left: its feud is with whoever you now go around with. */
function startClashAfterMove(state: LifeState, leftId: Id, goingTo: Id | undefined, content: ContentBundle): void {
  const t = state.teen;
  const left = cliqueById(state, leftId);
  const now = cliqueById(state, goingTo);
  if (!left) return;
  const years = content.balance.teen.cliques.yearly.clashYears;
  t.clash = { cliqueId: leftId, since: state.currentYear, until: state.currentYear + nextInt(state.rng, years.min, years.max) - 1 };
  if (now) {
    ensureMembers(state, now, content);
    startFeud(state, now, left, content);
  }
  teenHistory(state, 'cliqueClash', { clique: cliqueName(content, left), school: schoolNameOf(state, content) }, content);
}

/** You leave your crowd for no other. */
export function leaveClique(state: LifeState, content: ContentBundle): boolean {
  const mine = myClique(state);
  if (!mine) return false;
  const name = cliqueName(content, mine);
  leaveCrowd(state, mine.id, content);
  teenHistory(state, 'cliqueLeft', { clique: name }, content);
  return true;
}

/** The yearly part of crowds: invitations, belonging, clashes and the people you left behind. */
export function runCliques(state: LifeState, content: ContentBundle): void {
  const t = state.teen;
  const bal = content.balance.teen.cliques;
  runSchool(state, content);
  delete t.invite;
  if (!t.school) return;
  const year = state.currentYear;

  // A clash that has run its course.
  if (t.clash && t.clash.until < year) endClash(state, content);

  const mine = myClique(state);
  const def = mine && cliqueDef(content, mine.defId);
  if (mine && def) {
    applyStatEffects(state, def.effects);
    const members = livingMembers(state, mine);
    for (const id of members) setAffection(state, id, def.friends);
    t.standing = clampInt(t.standing + (mine.standing - t.standing) * bal.yearly.standingPull, 0, 100);
    t.member!.rank = rankOf(state);
    // A clash flares with the crowd's rival.
    if (!t.clash && mine.rival !== undefined && chance(state.rng, bal.yearly.clashChance)) startClash(state, mine.rival, content);
  } else {
    applyStatEffects(state, bal.yearly.alone);
    t.standing = clampInt(t.standing + (bal.standingStart - t.standing) * bal.yearly.standingPull, 0, 100);
  }

  if (t.clash) {
    t.standing = clampInt(t.standing + bal.clash.standing, 0, 100);
    applyStatEffects(state, { stress: { perYear: bal.clash.stress, limit: 85 } });
    if (mine) {
      const member = livingMembers(state, mine)[0];
      const rival = livingMembers(state, cliqueById(state, t.clash.cliqueId))[0];
      if (member !== undefined && rival !== undefined && t.clash.since === year) queueTeenEvent(state, 'clash', { member, foe: rival }, content);
      else if (member !== undefined && rival !== undefined && chance(state.rng, bal.yearly.clashEventChance)) queueTeenEvent(state, 'clash', { member, foe: rival }, content);
    }
  }

  // People you left behind fade a little.
  for (const c of t.cliques) {
    if (c.id === mine?.id) continue;
    for (const id of livingMembers(state, c)) {
      const rel = state.relationships[id]!;
      if (rel.affection > 50) rel.affection = clampInt(rel.affection - Math.round((rel.affection - 50) * bal.yearly.fade), 0, 100);
    }
  }

  // A crowd notices you (more with standing), unless one has turned you away lately.
  if (chance(state.rng, bal.yearly.inviteChance * (0.5 + t.standing / 100))) {
    const options = t.cliques.filter((c) => c.id !== mine?.id && joinBlock(state, c.id, content) === null && c.id !== t.clash?.cliqueId);
    if (options.length > 0) {
      const pick = weightedPick(state.rng, options.map((c) => [c, Math.max(0.05, joinChance(state, c, content))] as const));
      t.invite = pick.id;
      queueTeenEvent(state, 'invited', {}, content);
    }
  }
}

/**
 * The crowd a `join` effect tries: the one that has noticed you; else the one
 * that would most likely take you (and isn't one you were turned away from lately).
 */
export function crowdToJoin(state: LifeState, content: ContentBundle): TeenClique | undefined {
  const invited = cliqueById(state, state.teen.invite);
  if (invited && joinBlock(state, invited.id, content) === null) return invited;
  const options = state.teen.cliques.filter((c) => joinBlock(state, c.id, content) === null);
  if (options.length === 0) return undefined;
  return [...options].sort((a, b) => joinChance(state, b, content) - joinChance(state, a, content) || (a.id < b.id ? -1 : 1))[0];
}

/** The rival of the crowd you belong to, for events and views. */
export const rivalOfMine = (state: LifeState) => rivalClique(state);
