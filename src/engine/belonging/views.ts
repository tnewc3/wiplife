/**
 * What the UI needs about belonging (W2), read through selectors: the groups
 * of your city (the ones you belong to, with your role, standing and the
 * people there, and the ones you could join), your faith and your values. Nothing
 * here changes the life.
 */
import { VALUE_IDS, type Commitment, type ContentBundle, type GroupType, type ValueId } from '../../content/schemas';
import { groupCosts, costOf, joinBlock, livingPeople, type JoinBlock, riseBlock } from './groups';
import { cityGroups } from './cities';
import { faithName, instanceOf, isLeader, membershipOf, roleName, weeklyHours, yearsIn } from './query';
import { strengthWord } from './faith';
import type { Id, LifeState } from '../types';

export interface GroupPersonView {
  id: Id;
  name: string;
  age: number;
  affection: number;
}

export interface GroupView {
  id: Id;
  name: string;
  /** The kind of group ("Parish", "Book club"). */
  kind: string;
  type: GroupType;
  /** A faith group's religion and tradition, in words. */
  religion: string | null;
  tradition: string | null;
  blurb: string;
  activities: string[];
  /** Its own traits in words: welcoming or reserved, strict or relaxed, intense or easygoing. */
  traits: { welcome: string; strict: string; intense: string };
  /** The roles it offers, from a plain member up. */
  ladder: string[];
  hours: Record<Commitment, number>;
  /** What each level costs you in a year here. */
  cost: Record<Commitment, number>;
  minAge: number;
  /** Why you can't join now (as casual), or null. */
  block: JoinBlock | null;
  /** Whether you could join as committed (a child can't). */
  canCommit: boolean;
}

export interface MembershipView {
  group: GroupView;
  commitment: Commitment;
  role: string;
  rung: number;
  leader: boolean;
  years: number;
  standing: number;
  /** What it costs you this year at this level. */
  cost: number;
  people: GroupPersonView[];
  /** The next role up, and what it still needs, or null at the top. */
  next: { name: string; needs: 'years' | 'standing' | 'committed' | 'age' | null } | null;
  /** Your family took you along as a child. */
  family: boolean;
  /** You are old enough to commit to a group. */
  canCommit: boolean;
}

export interface BelongingView {
  /** Whether Groups has anything to show you now (you are old enough to belong to or have been taken to one). */
  city: string;
  faith: {
    name: string;
    id: Id | null;
    strength: number;
    word: 'none' | 'wavering' | 'steady' | 'devout';
    raised: string;
    changed: boolean;
    /** The faith your family has, in words. */
    household: string;
  };
  values: { id: ValueId; level: number }[];
  community: number;
  hours: number;
  /** What your groups cost this year, at your current earnings. */
  cost: number;
  memberships: MembershipView[];
  /** The groups of your city you do not belong to, by type. */
  available: Record<GroupType, GroupView[]>;
  past: { name: string; fromYear: number; toYear: number; how: 'left' | 'moved' | 'drifted' }[];
  maxMemberships: number;
  canAct: boolean;
}

function groupView(state: LifeState, id: Id, content: ContentBundle): GroupView | null {
  const g = instanceOf(state, id) ?? cityGroups(state, state.character.cityId, content).find((x) => x.id === id);
  const def = g && content.groups[g.defId];
  if (!g || !def) return null;
  const gross = state.finances.lastLedger?.gross ?? 0;
  const words = content.text.belonging.traits;
  const dummy = { groupId: g.id, since: state.currentYear, commitment: 'casual' as Commitment, rung: 0, rungSince: state.currentYear, standing: 0 };
  return {
    id: g.id,
    name: g.name,
    kind: def.name,
    type: def.type,
    religion: def.religion !== undefined ? faithName(content, def.religion) : null,
    tradition: def.tradition ?? null,
    blurb: def.blurb,
    activities: def.activities,
    traits: {
      welcome: g.welcome >= 55 ? words.welcome.high : words.welcome.low,
      strict: g.strict >= 55 ? words.strict.high : words.strict.low,
      intense: g.intense >= 55 ? words.intense.high : words.intense.low,
    },
    ladder: def.ladder.map((r) => r.name),
    hours: { casual: def.commitment.casual.hours, committed: def.commitment.committed.hours },
    cost: {
      casual: state.character.age >= content.balance.relationships.adultAge ? costOf(state, { ...dummy, commitment: 'casual' }, content, gross) : 0,
      committed: state.character.age >= content.balance.relationships.adultAge ? costOf(state, { ...dummy, commitment: 'committed' }, content, gross) : 0,
    },
    minAge: def.minAge,
    block: joinBlock(state, g.id, 'casual', content),
    canCommit: joinBlock(state, g.id, 'committed', content) === null,
  };
}

export function getBelongingView(state: LifeState, content: ContentBundle): BelongingView {
  const b = state.belonging;
  const gross = state.finances.lastLedger?.gross ?? 0;
  const adult = state.character.age >= content.balance.relationships.adultAge;
  const memberships: MembershipView[] = [];
  for (const m of b.memberships) {
    const gv = groupView(state, m.groupId, content);
    const g = instanceOf(state, m.groupId);
    const def = g && content.groups[g.defId];
    if (!gv || !g || !def) continue;
    const next = def.ladder[m.rung + 1];
    const block = riseBlock(state, m, content);
    memberships.push({
      group: gv,
      commitment: m.commitment,
      role: roleName(m, def),
      rung: m.rung,
      leader: isLeader(m, def),
      years: yearsIn(state, m),
      standing: m.standing,
      cost: adult ? costOf(state, m, content, gross) : 0,
      people: livingPeople(state, g).map((id) => {
        const p = state.people[id]!;
        return { id, name: `${p.name.first} ${p.name.last}`, age: state.currentYear - p.birthYear, affection: state.relationships[id]?.affection ?? 0 };
      }),
      next: next ? { name: next.name, needs: block === 'top' ? null : block } : null,
      family: m.family === true,
      canCommit: state.character.age >= 16,
    });
  }
  const available = { club: [], faith: [], service: [], civic: [] } as Record<GroupType, GroupView[]>;
  for (const g of cityGroups(state, state.character.cityId, content)) {
    if (membershipOf(state, g.id)) continue;
    const v = groupView(state, g.id, content);
    if (v) available[v.type].push(v);
  }
  for (const type of Object.keys(available) as GroupType[]) available[type].sort((x, y) => (x.block === null ? 0 : 1) - (y.block === null ? 0 : 1) || x.name.localeCompare(y.name));
  const f = b.faith;
  return {
    city: content.cities[state.character.cityId]?.name ?? state.character.cityId,
    faith: {
      name: f.id === null ? content.registries.belonging.noneName : faithName(content, f.id),
      id: f.id,
      strength: f.strength,
      word: strengthWord(state, content),
      raised: faithName(content, f.raised),
      changed: f.changes > 0,
      household: faithName(content, b.household.faith),
    },
    values: VALUE_IDS.map((id) => ({ id, level: b.values[id] })),
    community: b.community,
    hours: weeklyHours(state, content),
    cost: groupCosts(state, content, gross, adult),
    memberships,
    available,
    past: [...b.past].reverse().slice(0, 8).map((p) => ({ name: p.name, fromYear: p.fromYear, toYear: p.toYear, how: p.how })),
    maxMemberships: content.balance.belonging.groups.max,
    canAct: state.phase === 'yearStart' && state.housing.kind !== 'incarcerated',
  };
}
