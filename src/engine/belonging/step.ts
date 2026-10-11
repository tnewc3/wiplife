/**
 * The belonging step of the year pipeline (W2), after the people you know have
 * had their year and before the social web: the groups of your city, the ones
 * you belong to (standing, the people there, what they ask of your week and
 * cost), your faith and values drifting, group standing and community feeding
 * your reputation, and the offers the year brings (an invitation, a role, a
 * decision about drifting away). Each offer is an event queued from
 * registries/belonging.yaml; the choices are the player's.
 */
import type { ContentBundle } from '../../content/schemas';
import { applyStatEffects } from '../systems/economy';
import { clampInt, weightedPick, wholeChange } from '../random';
import { chance, createRng, nextFloat } from '../rng';
import { whereabouts } from '../presence';
import type { Id, LifeState } from '../types';
import { cityGroups, ensureCity } from './cities';
import { driftFaith, stampChildFaith } from './faith';
import { growGroup, joinGroup, leaveGroup, livingPeople, queueGroupEvent, riseBlock } from './groups';
import { lapseMoved } from './leave';
import { instanceOf, ownFaithMemberships, valueOf, weeklyHours } from './query';
import { startBelonging } from './start';
import { driftValues } from './values';

const offered = (state: LifeState, key: string): number | undefined => state.belonging.offered[key];

/** A youth group ends when you are too old for it. */
function agedOut(state: LifeState, content: ContentBundle): void {
  for (const m of [...state.belonging.memberships]) {
    const g = instanceOf(state, m.groupId);
    const max = g && content.groups[g.defId]?.maxAge;
    if (max !== undefined && state.character.age > max) leaveGroup(state, m.groupId, 'left', content);
  }
}

/** Children and grandchildren take your faith (or another, as a household's children do) when you first meet them. */
function stampChildren(state: LifeState, content: ContentBundle): void {
  for (const id of Object.keys(state.people).sort()) {
    const p = state.people[id]!;
    if (p.faith || !(p.child || p.grandchild)) continue;
    stampChildFaith(state, p, state.rng, content);
  }
}

/** A child in a devout household is taken along to its congregation. */
function takenAlong(state: LifeState, content: ContentBundle): void {
  const b = state.belonging;
  const f = content.balance.belonging.faith;
  const age = state.character.age;
  if (age < f.takenAlongAge || age >= content.balance.relationships.adultAge) return;
  if (b.household.faith === null || b.household.devotion < f.takenAlong || b.offered.along !== undefined) return;
  if (b.memberships.length >= content.balance.belonging.groups.max) return;
  const options = cityGroups(state, state.character.cityId, content)
    .filter((g) => content.groups[g.defId]?.religion === b.household.faith && age >= (content.groups[g.defId]?.minAge ?? 0))
    .sort((a, c) => c.welcome - a.welcome || (a.id < c.id ? -1 : 1));
  const g = options[0];
  if (!g) return;
  if (joinGroup(state, g.id, 'casual', content, { family: true })) b.offered.along = state.currentYear;
}

/** A family's congregation ends with childhood unless you believe. */
function growUp(state: LifeState, content: ContentBundle): void {
  if (state.character.age < content.balance.relationships.adultAge) return;
  const f = state.belonging.faith;
  for (const m of [...state.belonging.memberships]) {
    if (!m.family) continue;
    const g = instanceOf(state, m.groupId);
    const religion = g && content.groups[g.defId]?.religion;
    if (f.id !== null && f.id === religion && f.strength > content.balance.belonging.faith.wavering) delete m.family;
    else leaveGroup(state, m.groupId, 'left', content);
  }
}

/** Life gets in the way: now and then a member simply stops going. */
function attrition(state: LifeState, content: ContentBundle): void {
  const a = content.balance.belonging.groups.attrition;
  for (const m of [...state.belonging.memberships]) {
    if (m.family || state.currentYear - m.since < 1) continue;
    const base = m.commitment === 'committed' ? a.committed : a.casual;
    const p = base * (state.character.stats.stress >= a.stressLine ? a.stressed : 1);
    if (chance(state.rng, p)) leaveGroup(state, m.groupId, 'drifted', content);
  }
}

/** One year in each group. */
function groupYears(state: LifeState, content: ContentBundle): void {
  const bal = content.balance.belonging;
  const s = bal.groups.standing;
  const b = state.belonging;
  let communityPush = 0;
  for (const m of b.memberships) {
    const g = instanceOf(state, m.groupId);
    const def = g && content.groups[g.defId];
    if (!g || !def) continue;
    const committed = m.commitment === 'committed';
    const target = (committed ? s.target.committed : s.target.casual) + s.welcome * (g.welcome - 50);
    const first = state.currentYear - m.since <= 1 ? s.firstYear : 1;
    const move = (s.pull * (target - m.standing) + (nextFloat(state.rng) * 2 - 1) * s.noise) * first;
    m.standing = clampInt(m.standing + wholeChange(state.rng, move), s.floor, s.ceiling);
    communityPush += bal.community.gain[def.type] * (committed ? 1 : bal.values.casualShare);
    // The people there: you come to know a few more, and the ones you see stay close.
    g.people = livingPeople(state, g);
    if (committed && chance(state.rng, bal.groups.members.growChance)) growGroup(state, g, state.rng, content);
    const gain = wholeChange(state.rng, bal.groups.members.affectionGain * (committed ? 1 : bal.values.casualShare));
    if (gain !== 0) for (const id of g.people) {
      const rel = state.relationships[id];
      if (rel) rel.affection = clampInt(rel.affection + gain, 0, 100);
    }
  }
  b.community = clampInt(b.community + wholeChange(state.rng, communityPush + bal.community.pull * (bal.community.start - b.community)), 0, 100);
}

/** What the week your groups take does to the rest of your life. */
function loadYear(state: LifeState, content: ContentBundle): void {
  const load = content.balance.belonging.groups.load;
  const n = state.belonging.memberships.length;
  if (n === 0) return;
  const hours = weeklyHours(state, content);
  applyStatEffects(state, {
    stress: { perYear: load.stress * Math.max(0, hours - load.free), limit: load.stressLimit },
    happiness: { perYear: load.belonging * Math.min(n, 2), limit: load.belongingLimit },
  });
  // The people at home notice when you are out most evenings.
  if (hours > load.home.over) {
    for (const id of Object.keys(state.relationships).sort()) {
      const rel = state.relationships[id]!;
      if ((rel.kind === 'spouse' || rel.kind === 'partner' || rel.kind === 'fiance') && rel.status === 'active' && whereabouts(state, id, content) === 'household') {
        rel.affection = clampInt(rel.affection - load.home.affection, 0, 100);
      }
    }
  }
}

/** Group standing and community feed the hidden reputation. */
function reputation(state: LifeState, content: ContentBundle): void {
  const r = content.balance.belonging.reputation;
  const b = state.belonging;
  let points = ((b.community - 50) / 50) * r.community;
  for (const m of b.memberships) points += ((m.standing - 50) / 50) * r.standing * (m.commitment === 'committed' ? 1 : content.balance.belonging.values.casualShare);
  points = Math.max(-r.maxPerYear, Math.min(r.maxPerYear, points));
  b.repCarry += points;
  const whole = Math.trunc(b.repCarry);
  if (whole !== 0) {
    const h = state.character.hidden;
    h.reputation = clampInt(h.reputation + whole, 0, 100);
    b.repCarry -= whole;
  }
}

/** The weights of the groups you might be invited to. */
function inviteWeights(state: LifeState, content: ContentBundle, onlyOwnFaith: boolean): (readonly [Id, number])[] {
  const b = state.belonging;
  const age = state.character.age;
  const bal = content.balance.belonging.groups.invite;
  const hasCongregation = ownFaithMemberships(state, content).length > 0;
  const p = state.character.personality;
  const out: (readonly [Id, number])[] = [];
  for (const g of cityGroups(state, state.character.cityId, content)) {
    const def = content.groups[g.defId];
    if (!def || b.memberships.some((m) => m.groupId === g.id)) continue;
    if (age < Math.max(def.minAge, bal.minAge) || (def.maxAge !== undefined && age > def.maxAge)) continue;
    const last = offered(state, `invite:${g.id}`);
    if (last !== undefined && state.currentYear - last < bal.coolOff) continue;
    const own = def.religion !== undefined && def.religion === b.faith.id;
    if (onlyOwnFaith && !own) continue;
    const fit =
      def.type === 'club'
        ? 0.6 + (0.8 * p.sociability) / 100
        : def.type === 'service'
          ? 0.3 + valueOf(state, 'compassion') / 100
          : def.type === 'civic'
            ? 0.25 + valueOf(state, 'civic') / 100
            : own
              ? hasCongregation
                ? 0.3
                : 6
              : b.faith.id === null
                ? 0.35
                : 0.12;
    out.push([g.id, def.weight * fit] as const);
  }
  return out;
}

/** The year's offers: a role, a decision about drifting, an invitation. */
function offers(state: LifeState, content: ContentBundle): void {
  const bal = content.balance.belonging.groups;
  const reg = content.registries.belonging.triggers;
  const year = state.currentYear;
  const b = state.belonging;
  const hours = weeklyHours(state, content);
  // A role: a committed member who qualifies is asked.
  for (const m of b.memberships) {
    if (m.commitment !== 'committed' || riseBlock(state, m, content) !== null) continue;
    const last = offered(state, `rise:${m.groupId}`);
    if (last !== undefined && year - last < bal.rise.coolOff) continue;
    if (!chance(state.rng, bal.rise.chance)) continue;
    if (queueGroupEvent(state, reg.rise.events, m.groupId, content)) {
      b.offered[`rise:${m.groupId}`] = year;
      break;
    }
  }
  // Drifting: a member who is stretched thin, or who has lost the thread, comes to a decision.
  for (const m of b.memberships) {
    const committed = m.commitment === 'committed';
    if (state.currentYear - m.since < (committed ? 1 : 2) || m.family) continue;
    const overloaded = hours > content.balance.belonging.groups.load.free + 4 || state.character.stats.stress >= 70;
    if (committed && !(m.standing < bal.drift.standing || overloaded)) continue;
    const last = offered(state, `drift:${m.groupId}`);
    if (last !== undefined && year - last < bal.drift.coolOff) continue;
    if (!chance(state.rng, bal.drift.chance * (committed ? 1 : bal.drift.casualShare))) continue;
    if (queueGroupEvent(state, reg.drifting.events, m.groupId, content)) {
      b.offered[`drift:${m.groupId}`] = year;
      break;
    }
  }
  // An invitation: more likely for someone sociable, and for someone with a faith and no congregation of it.
  if (b.memberships.length >= bal.max || state.character.age < bal.invite.minAge) return;
  const faithInvite =
    b.faith.id !== null && state.character.age >= content.balance.belonging.faith.community.fromAge && ownFaithMemberships(state, content).length === 0 && b.faith.strength > content.balance.belonging.faith.wavering;
  const p = Math.max(0.01, bal.invite.base + bal.invite.sociability * ((state.character.personality.sociability - 50) / 50)) / (1 + b.memberships.length);
  const own = faithInvite && chance(state.rng, bal.invite.faith);
  if (!own && !chance(state.rng, p)) return;
  const options = inviteWeights(state, content, own);
  if (options.length === 0) return;
  const id = weightedPick(state.rng, options);
  if (queueGroupEvent(state, reg.invite.events, id, content)) b.offered[`invite:${id}`] = year;
}

export function runBelonging(state: LifeState, content: ContentBundle): void {
  // A life saved before belonging existed: a faith and values, from its seed (the same every time it is upgraded).
  if (state.belonging.upgrade) startBelonging(state, createRng(`${state.seed}:belonging`), content, {});
  if (state.housing.kind === 'incarcerated') return;
  ensureCity(state, state.character.cityId, content);
  lapseMoved(state, content);
  agedOut(state, content);
  stampChildren(state, content);
  takenAlong(state, content);
  growUp(state, content);
  attrition(state, content);
  groupYears(state, content);
  loadYear(state, content);
  driftFaith(state, content);
  driftValues(state, content);
  reputation(state, content);
  offers(state, content);
}

