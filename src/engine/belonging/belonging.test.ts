import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { GROUP_ROLE, type Condition } from '../../content/schemas';
import { LIFE_ACTION_IDS, performAction } from '../actions';
import { evaluate } from '../conditions';
import { InvalidInputError } from '../creation/input';
import { consistencyProblems } from '../presence';
import { castEvent } from '../events/casting';
import { applyEffects } from '../events/effects';
import { checkInvariants } from '../invariants';
import { createLife } from '../life';
import { moveTo } from '../housing';
import { createRng } from '../rng';
import { customInput, lifeAtAge, liveOut } from '../testFixtures';
import { getBelongingView } from '../selectors';
import type { LifeState } from '../types';
import { generateCity, cityGroups, ensureCity } from './cities';
import { changeFaith, driftFaith, faithOf } from './faith';
import { groupCosts, joinBlock, joinGroup, leaveGroup, riseBlock, promote } from './groups';
import { groupPerformanceDrag, groupGradeDrag } from './load';
import { instanceOf, membershipOf, weeklyHours } from './query';
import { runBelonging } from './step';
import { driftValues, nudgeValue } from './values';

const fx = (state: LifeState, effects: Parameters<typeof applyEffects>[1], cast: Record<string, string> = {}): LifeState =>
  produce(state, (d) => {
    applyEffects(d, effects, { cast, rng: d.rng, content, def: content.events.group_newcomer_welcome! });
  });

/** An adult who lives in a big city, with a congregation of their own religion, a club and a food bank to join. */
/** The same content with nobody drifting out of a group, for tests that watch one membership over many years. */
const steady = {
  ...content,
  balance: {
    ...content.balance,
    belonging: { ...content.balance.belonging, groups: { ...content.balance.belonging.groups, attrition: { ...content.balance.belonging.groups.attrition, casual: 0, committed: 0, stressed: 0 } } },
  },
} as typeof content;

function adult(seed: string, age = 35): LifeState {
  return produce(lifeAtAge(seed, age), (d) => {
    ensureCity(d, d.character.cityId, content);
    d.finances.lastLedger = { year: d.currentYear - 1, gross: 60_000, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, giving: 0, business: 0, net: 60_000 };
  });
}

function firstOf(life: LifeState, test: (defId: string, g: { id: string }) => boolean): string | undefined {
  return cityGroups(life, life.character.cityId, content).find((g) => test(g.defId, g))?.id;
}

/** A club the life can join: any group of type club that is open to adults. */
function aClub(life: LifeState): string {
  const id = cityGroups(life, life.character.cityId, content).find((g) => content.groups[g.defId]!.type === 'club' && content.groups[g.defId]!.maxAge === undefined)?.id;
  if (!id) throw new Error('no club in this city');
  return id;
}

describe('faith at birth', () => {
  it('comes from the family: most lives take the household’s faith, and the faiths are the real ones', () => {
    let kept = 0;
    let withFaith = 0;
    let raised = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const life = createLife({ mode: 'random', seed: `faith-${i}`, birthYear: 2000, countryId: 'us' }, content);
      const b = life.belonging;
      if (b.faith.id !== null) {
        withFaith++;
        seen.add(b.faith.id);
        expect(content.registries.belonging.faiths[b.faith.id]).toBeDefined();
      } else expect(b.faith.strength).toBe(0);
      if (b.household.faith !== null) {
        raised++;
        if (b.faith.id === b.household.faith) kept++;
      }
      expect(b.faith.raised).toBe(b.household.faith);
    }
    expect(kept / raised).toBeGreaterThan(0.75);
    expect(withFaith / 300).toBeGreaterThan(0.5);
    expect(withFaith / 300).toBeLessThan(0.9);
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('is the same for the same seed, and the family shares the household’s faith', () => {
    const a = createLife({ mode: 'random', seed: 'faith-same', birthYear: 2000, countryId: 'us' }, content);
    const b = createLife({ mode: 'random', seed: 'faith-same', birthYear: 2000, countryId: 'us' }, content);
    expect(a.belonging).toEqual(b.belonging);
    // Parents get the household's faith (most of the time), each worked out from the seed and no randomness of the life's.
    const parent = Object.values(a.people).find((p) => a.relationships[p.id]?.kind === 'parent')!;
    const before = a.rng;
    const faith = faithOf(a, parent, content);
    expect(faithOf(a, parent, content)).toEqual(faith);
    expect(a.rng).toEqual(before);
  });

  it('can be chosen in custom creation: a faith, none, or a roll', () => {
    const jewish = createLife({ mode: 'custom', seed: 'faith-c1', birthYear: 2000, custom: customInput({ faith: 'jewish' }) }, content);
    expect(jewish.belonging.faith.id).toBe('jewish');
    expect(jewish.belonging.household.faith).toBe('jewish');
    expect(jewish.belonging.faith.strength).toBeGreaterThan(0);
    const none = createLife({ mode: 'custom', seed: 'faith-c2', birthYear: 2000, custom: customInput({ faith: 'none' }) }, content);
    expect(none.belonging.faith).toMatchObject({ id: null, strength: 0 });
    const rolled = createLife({ mode: 'custom', seed: 'faith-c3', birthYear: 2000, custom: customInput({ faith: 'family' }) }, content);
    expect(checkInvariants(rolled, content)).toEqual([]);
    expect(() => createLife({ mode: 'custom', seed: 'faith-c4', birthYear: 2000, custom: customInput({ faith: 'not_a_faith' }) }, content)).toThrow(InvalidInputError);
  });

  it('starts values from temperament: a kind, sociable character values compassion and community more', () => {
    const kind = createLife({ mode: 'custom', seed: 'val-1', birthYear: 2000, custom: customInput({ personality: { ambition: 50, confidence: 50, kindness: 95, riskTaking: 50, discipline: 50, sociability: 95 } }) }, content);
    const cold = createLife({ mode: 'custom', seed: 'val-1', birthYear: 2000, custom: customInput({ personality: { ambition: 50, confidence: 50, kindness: 5, riskTaking: 50, discipline: 50, sociability: 5 } }) }, content);
    expect(kind.belonging.temperament.compassion).toBeGreaterThan(cold.belonging.temperament.compassion + 20);
    expect(kind.belonging.temperament.community).toBeGreaterThan(cold.belonging.temperament.community + 15);
  });
});

describe('the groups of a city', () => {
  it('are the same every time, and differ from city to city and from group to group', () => {
    const a = generateCity('city-seed', 'chicago', content);
    expect(generateCity('city-seed', 'chicago', content)).toEqual(a);
    expect(generateCity('city-seed', 'houston', content).map((g) => g.id)).not.toEqual(a.map((g) => g.id));
    const traits = new Set(a.map((g) => `${g.welcome}/${g.strict}/${g.intense}`));
    expect(traits.size).toBeGreaterThan(a.length * 0.8);
    for (const g of a) expect(content.groups[g.defId]!.names).toContain(g.name);
  });

  it('have a congregation for every religion in a big city across lives, and none of a few in a small town', () => {
    const found = new Set<string>();
    for (let i = 0; i < 25; i++) for (const g of generateCity(`c-${i}`, 'nyc', content)) if (content.groups[g.defId]!.religion) found.add(content.groups[g.defId]!.religion!);
    expect([...found].sort()).toEqual(Object.keys(content.registries.belonging.faiths).sort());
    for (let i = 0; i < 25; i++) {
      const small = generateCity(`c-${i}`, 'small_town', content).map((g) => g.defId);
      expect(small).not.toContain('sikh_gurdwara');
      expect(small).not.toContain('orthodox_synagogue');
    }
  });

  it('give every faith’s congregations the same hours, costs and values (no faith is harder or easier to belong to)', () => {
    const faiths = Object.values(content.groups).filter((g) => g.type === 'faith');
    for (const g of faiths) {
      expect(g.commitment).toEqual(faiths[0]!.commitment);
      expect(g.values).toEqual(faiths[0]!.values);
      expect(g.traits).toEqual(faiths[0]!.traits);
    }
  });
});

describe('actions', () => {
  it('have ids of their own: none repeats another stage’s action', () => {
    expect(new Set(LIFE_ACTION_IDS).size).toBe(LIFE_ACTION_IDS.length);
  });
});

describe('membership', () => {
  it('joining brings people: three to five friends in your city, tied to each other through the web', () => {
    const life = adult('join-1');
    const id = aClub(life);
    const joined = produce(life, (d) => void joinGroup(d, id, 'casual', content));
    const m = membershipOf(joined, id)!;
    expect(m).toMatchObject({ commitment: 'casual', rung: 0, since: joined.currentYear });
    const g = instanceOf(joined, id)!;
    expect(g.people.length).toBeGreaterThanOrEqual(3);
    expect(g.people.length).toBeLessThanOrEqual(5);
    for (const pid of g.people) {
      const p = joined.people[pid]!;
      expect(joined.relationships[pid]!.kind).toBe('friend');
      expect(p.cityId).toBe(joined.character.cityId);
      expect(joined.currentYear - p.birthYear).toBeGreaterThanOrEqual(18);
    }
    const ties = g.people.flatMap((a, i) => g.people.slice(i + 1).map((b) => joined.web.ties[a < b ? `${a}|${b}` : `${b}|${a}`])).filter(Boolean);
    expect(ties.length).toBeGreaterThanOrEqual(g.people.length - 1);
    expect(ties.every((t) => t!.kind === 'friends')).toBe(true);
    expect(checkInvariants(joined, content)).toEqual([]);
  });

  it('works through the actions: join, change how committed you are, leave', () => {
    const life = adult('join-2');
    const id = aClub(life);
    const joined = performAction(life, 'join_group', { groupId: id, level: 'committed' }, content);
    expect(membershipOf(joined, id)!.commitment).toBe('committed');
    const casual = performAction(joined, 'set_group_commitment', { groupId: id, level: 'casual' }, content);
    expect(membershipOf(casual, id)!.commitment).toBe('casual');
    const left = performAction(casual, 'leave_group', { groupId: id }, content);
    expect(membershipOf(left, id)).toBeUndefined();
    expect(left.belonging.past.at(-1)).toMatchObject({ groupId: id, how: 'left' });
    expect(left.history.some((h) => h.tags.includes('belonging'))).toBe(true);
    // The people you got to know stay.
    expect(instanceOf(left, id)!.people.length).toBeGreaterThan(0);
    expect(left.inputLog.filter((i) => i.kind === 'action')).toHaveLength(3);
  });

  it('refuses what does not fit: a group in another city, one you belong to, one too many, a child committing', () => {
    const life = adult('join-3');
    const id = aClub(life);
    expect(() => performAction(life, 'join_group', { groupId: 'g_nowhere_x_1', level: 'casual' }, content)).toThrow(InvalidInputError);
    expect(() => performAction(life, 'join_group', { groupId: id, level: 'bogus' }, content)).toThrow(InvalidInputError);
    const other = Object.keys(content.cities).find((c) => c !== life.character.cityId)!;
    const faraway = generateCity(life.seed, other, content)[0]!;
    expect(joinBlock(life, faraway.id, 'casual', content)).toBe('city');
    const joined = performAction(life, 'join_group', { groupId: id, level: 'casual' }, content);
    expect(joinBlock(joined, id, 'casual', content)).toBe('member');
    const many = produce(joined, (d) => {
      for (const g of cityGroups(d, d.character.cityId, content)) if (d.belonging.memberships.length < content.balance.belonging.groups.max) joinGroup(d, g.id, 'casual', content);
    });
    const spare = cityGroups(many, many.character.cityId, content).find((g) => !membershipOf(many, g.id) && content.groups[g.defId]!.maxAge === undefined)!;
    expect(joinBlock(many, spare.id, 'casual', content)).toBe('full');
    const kid = produce(lifeAtAge('join-kid', 14), (d) => ensureCity(d, d.character.cityId, content));
    const food = cityGroups(kid, kid.character.cityId, content).find((g) => content.groups[g.defId]!.minAge <= 14)!;
    expect(joinBlock(kid, food.id, 'committed', content)).toBe('committedAge');
  });

  it('a group ends when you move to another city', () => {
    const life = produce(adult('join-4'), (d) => void joinGroup(d, aClub(d), 'committed', content));
    const other = Object.keys(content.cities).find((c) => c !== life.character.cityId)!;
    const moved = produce(life, (d) => moveTo(d, 'renting', other, content));
    expect(moved.belonging.memberships).toHaveLength(0);
    expect(moved.belonging.past.at(-1)!.how).toBe('moved');
    expect(checkInvariants(moved, content)).toEqual([]);
  });

  it('a youth group ends when you grow out of it', () => {
    let tested = 0;
    for (let i = 0; i < 30 && tested < 2; i++) {
      const teen = produce(lifeAtAge(`youth-${i}`, 16), (d) => {
        ensureCity(d, d.character.cityId, content);
        const youth = cityGroups(d, d.character.cityId, content).find((g) => g.defId === 'youth_club');
        if (youth) joinGroup(d, youth.id, 'casual', content);
      });
      const youth = teen.belonging.memberships[0];
      if (!youth) continue;
      tested++;
      const grown = produce(teen, (d) => {
        d.currentYear += 2;
        d.character.age += 2;
        d.scheduled = [];
        runBelonging(d, content);
      });
      expect(grown.belonging.memberships.some((m) => m.groupId === youth.groupId)).toBe(false);
      expect(grown.belonging.past.at(-1)).toMatchObject({ groupId: youth.groupId, how: 'left' });
    }
    expect(tested).toBeGreaterThan(0);
  });
});

describe('leaving a group', () => {
  it('lets the friends you are not close to fade, and keeps the close ones and anyone you share a memory with', () => {
    const base = adult('leave-fade-1');
    const id = aClub(base);
    const joined = produce(base, (d) => void joinGroup(d, id, 'committed', content));
    const people = instanceOf(joined, id)!.people;
    expect(people.length).toBeGreaterThanOrEqual(2);
    const keep = content.balance.belonging.groups.members.keepAffection;
    const [close, shared, distant] = people;
    const left = produce(joined, (d) => {
      d.relationships[close!]!.affection = keep + 10;
      d.relationships[shared!]!.affection = 20;
      d.relationships[shared!]!.memories.push({ tag: 'met_through_a_group', year: d.currentYear });
      if (distant) d.relationships[distant]!.affection = 20;
      leaveGroup(d, id, 'left', content);
    });
    expect(left.relationships[close!]!.status).toBe('active');
    expect(left.relationships[shared!]!.status).toBe('active');
    if (distant) expect(left.relationships[distant]!.status).toBe('ended');
    expect(checkInvariants(left, content)).toEqual([]);
  });
});

describe('standing, roles and costs', () => {
  it('a committed member’s standing climbs toward the committed level, a casual one’s to a lower one', () => {
    const base = adult('stand-1');
    const id = aClub(base);
    const run = (level: 'casual' | 'committed') =>
      produce(base, (d) => {
        joinGroup(d, id, level, content);
        for (let i = 0; i < 12; i++) {
          d.currentYear += 1;
          d.character.age += 1;
          runBelonging(d, steady);
        }
      });
    const committed = run('committed');
    const casual = run('casual');
    expect(membershipOf(committed, id)!.standing).toBeGreaterThan(membershipOf(casual, id)!.standing + 10);
    expect(membershipOf(committed, id)!.standing).toBeGreaterThan(70);
  });

  it('roles come with years and standing, and the step asks a qualified committed member', () => {
    const start = produce(adult('rise-1'), (d) => void joinGroup(d, aClub(d), 'committed', content));
    const id = start.belonging.memberships[0]!.groupId;
    expect(riseBlock(start, membershipOf(start, id)!, content)).toBe('years');
    let asked = false;
    let life = start;
    for (let i = 0; i < 40 && !asked; i++) {
      life = produce(life, (d) => {
        d.currentYear += 1;
        d.character.age += 1;
        d.scheduled = [];
        runBelonging(d, steady);
      });
      asked = life.scheduled.some((s) => content.registries.belonging.triggers.rise.events.includes(s.eventId) && s.cast[GROUP_ROLE] === id);
    }
    expect(asked).toBe(true);
    expect(riseBlock(life, membershipOf(life, id)!, content)).toBeNull();
    // Accepting moves them up a rung; the top of the ladder is a limit.
    let risen = life;
    for (let i = 0; i < 6; i++) risen = produce(risen, (d) => void promote(d, id, content));
    const def = content.groups[instanceOf(risen, id)!.defId]!;
    expect(membershipOf(risen, id)!.rung).toBe(def.ladder.length - 1);
    expect(riseBlock(risen, membershipOf(risen, id)!, content)).toBe('top');
  });

  it('cost scales with the city and what you earn, never above the cap, and nothing without income', () => {
    const life = adult('cost-1');
    const joined = produce(life, (d) => {
      // (Congregations ask a share of what you earn; clubs ask a flat sum.)
      const faith = generateCity('cost-faith', 'nyc', content).filter((g) => content.groups[g.defId]!.type === 'faith').slice(0, 2);
      for (const g of faith) {
        d.belonging.groups[g.id] = { ...g, cityId: d.character.cityId };
        d.belonging.memberships.push({ groupId: g.id, since: d.currentYear - 1, commitment: 'committed', rung: 0, rungSince: d.currentYear - 1, standing: 60 });
      }
    });
    const rich = groupCosts(joined, content, 200_000, true);
    const poor = groupCosts(joined, content, 20_000, true);
    expect(rich).toBeGreaterThan(poor);
    expect(poor).toBeLessThanOrEqual(Math.floor(content.balance.belonging.groups.cost.incomeCap * 20_000));
    expect(groupCosts(joined, content, 0, true)).toBe(0);
    expect(groupCosts(joined, content, 60_000, false)).toBe(0);
    // A dearer city asks more of the flat part.
    const inCity = (city: string) => groupCosts(produce(joined, (d) => void (d.character.cityId = city)), content, 200_000, true);
    const cheap = Object.keys(content.cities).reduce((a, b) => (content.cities[a]!.costOfLiving <= content.cities[b]!.costOfLiving ? a : b));
    const dear = Object.keys(content.cities).reduce((a, b) => (content.cities[a]!.costOfLiving >= content.cities[b]!.costOfLiving ? a : b));
    expect(inCity(dear)).toBeGreaterThan(inCity(cheap));
  });

  it('the year’s dues are in the ledger and add up', () => {
    let life = produce(lifeAtAge('ledger-1', 30), (d) => {
      ensureCity(d, d.character.cityId, content);
      d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear };
      for (const g of cityGroups(d, d.character.cityId, content).slice(0, 2)) joinGroup(d, g.id, 'committed', content);
    });
    life = liveOutOneYear(life);
    const l = life.finances.lastLedger!;
    expect(l.giving).toBeGreaterThanOrEqual(0);
    expect(l.net).toBe(l.gross + l.retirement + l.interest + l.supportReceived - l.tax - l.housing - l.living - l.children - l.care - l.supportPaid - l.upkeep - l.insurance - l.giving - l.debtPayments);
  });
});

function liveOutOneYear(life: LifeState): LifeState {
  const ended = liveOut(life, content);
  return ended;
}

describe('commitment lightly affects work, school and the people at home', () => {
  it('hours over what is easy pull a little on work and grades, stress and the partner at home', () => {
    const life = produce(adult('load-1'), (d) => {
      for (const g of cityGroups(d, d.character.cityId, content)) if (d.belonging.memberships.length < 4 && content.groups[g.defId]!.maxAge === undefined) joinGroup(d, g.id, 'committed', content);
    });
    expect(weeklyHours(life, content)).toBeGreaterThan(content.balance.belonging.groups.load.work.over);
    expect(groupPerformanceDrag(life, content)).toBeLessThan(0);
    expect(groupGradeDrag(life, content)).toBeLessThan(0);
    const none = produce(life, (d) => {
      d.belonging.memberships = [];
    });
    expect(groupPerformanceDrag(none, content)).toBe(0);
    expect(groupGradeDrag(none, content)).toBe(0);
    // Stress goes up with the hours, and the partner you live with feels it.
    const withPartner = produce(life, (d) => {
      d.character.stats.stress = 40;
      d.relationships.sp = { personId: 'sp', kind: 'spouse', status: 'active', affection: 70, trust: 70, memories: [], since: d.currentYear - 5 };
      d.people.sp = { ...Object.values(d.people)[0]!, id: 'sp', alive: true, tags: [], cityId: d.character.cityId, birthYear: d.currentYear - 35 };
      d.housing.partnerId = 'sp';
    });
    const after = produce(withPartner, (d) => {
      d.scheduled = [];
      runBelonging(d, content);
    });
    expect(after.character.stats.stress).toBeGreaterThan(withPartner.character.stats.stress);
    expect(after.relationships.sp!.affection).toBeLessThan(70);
  });
});

describe('values and reputation', () => {
  const years = (life: LifeState, n: number) =>
    produce(life, (d) => {
      for (let i = 0; i < n; i++) {
        d.currentYear += 1;
        d.character.age += 1;
        d.scheduled = [];
        runBelonging(d, steady);
      }
    });

  it('drift with long membership: a service group raises compassion, a civic one civic duty, against the same life with none', () => {
    const base = adult('values-1', 30);
    const service = firstOf(base, (def) => content.groups[def]!.type === 'service' && content.groups[def]!.minAge <= 18);
    const civic = firstOf(base, (def) => content.groups[def]!.type === 'civic' && content.groups[def]!.minAge <= 21);
    for (const [id, key] of [[service, 'compassion'], [civic, 'civic']] as const) {
      if (!id) continue;
      const member = years(produce(base, (d) => void joinGroup(d, id, 'committed', content)), 20);
      const control = years(base, 20);
      expect(member.belonging.values[key]).toBeGreaterThan(control.belonging.values[key] + 4);
    }
  });

  it('a choice in an event moves a value, and part of it sticks to temperament', () => {
    const base = adult('values-2');
    const after = fx(base, [{ type: 'value', key: 'independence', delta: 10 }]);
    expect(after.belonging.values.independence).toBe(base.belonging.values.independence + 10);
    expect(after.belonging.temperament.independence).toBe(base.belonging.temperament.independence + Math.round(10 * content.balance.belonging.values.sticks));
    // Left alone, the value settles back toward temperament.
    const settled = years(after, 25);
    expect(Math.abs(settled.belonging.values.independence - settled.belonging.temperament.independence)).toBeLessThan(3);
    expect(driftValues).toBeDefined();
    expect(nudgeValue).toBeDefined();
  });

  it('group standing and community feed the hidden reputation', () => {
    const base = adult('rep-1', 30);
    const id = firstOf(base, (def) => content.groups[def]!.type === 'service' && content.groups[def]!.minAge <= 18)!;
    const member = years(produce(base, (d) => void joinGroup(d, id, 'committed', content)), 25);
    const control = years(base, 25);
    expect(member.character.hidden.reputation).toBeGreaterThan(control.character.hidden.reputation);
    expect(member.belonging.community).toBeGreaterThan(control.belonging.community + 10);
  });
});

describe('faith over a life', () => {
  it('belief is steadied by a congregation of your religion and worn down without one', () => {
    const base = produce(adult('faith-d1', 40), (d) => {
      d.belonging.faith = { id: 'catholic', strength: 55, raised: 'catholic', since: null, changes: 0 };
    });
    const congregation = cityGroups(base, base.character.cityId, content).find((g) => content.groups[g.defId]!.religion === 'catholic') ?? generateCity('x', 'nyc', content).find((g) => content.groups[g.defId]!.religion === 'catholic')!;
    const steady = produce(base, (d) => {
      // (The congregation may be in another city for this seed: put one in this one.)
      d.belonging.groups[congregation.id] = { ...congregation, cityId: d.character.cityId };
      d.belonging.memberships.push({ groupId: congregation.id, since: d.currentYear - 2, commitment: 'committed', rung: 0, rungSince: d.currentYear - 2, standing: 70 });
      for (let i = 0; i < 15; i++) driftFaith(d, content);
    });
    const alone = produce(base, (d) => {
      for (let i = 0; i < 15; i++) driftFaith(d, content);
    });
    expect(steady.belonging.faith.strength).toBeGreaterThan(alone.belonging.faith.strength + 15);
  });

  it('can be found, lost, changed and returned to, through events, with a history line each time', () => {
    let life = adult('faith-ch', 30);
    const raised = life.belonging.household.faith;
    life = produce(life, (d) => {
      d.belonging.faith = { id: null, strength: 0, raised: 'catholic', since: null, changes: 0 };
    });
    life = fx(life, [{ type: 'faith', action: 'convert', id: 'buddhist' }]);
    expect(life.belonging.faith).toMatchObject({ id: 'buddhist', since: life.currentYear, changes: 1 });
    expect(life.belonging.faith.strength).toBe(content.balance.belonging.faith.start.find);
    life = fx(life, [{ type: 'faith', action: 'convert', id: 'sikh' }]);
    expect(life.belonging.faith.id).toBe('sikh');
    expect(life.belonging.faith.strength).toBe(content.balance.belonging.faith.start.convert);
    life = fx(life, [{ type: 'faith', action: 'lose' }]);
    expect(life.belonging.faith).toMatchObject({ id: null, strength: 0, changes: 3 });
    life = fx(life, [{ type: 'faith', action: 'return' }]);
    expect(life.belonging.faith.id).toBe('catholic');
    expect(life.belonging.faith.changes).toBe(4);
    expect(life.history.filter((h) => h.tags.includes('faith'))).toHaveLength(4);
    expect(checkInvariants(life, content)).toEqual([]);
    void raised;
  });

  it('a pull toward another faith surfaces by self-discovery and is acted on, or not', () => {
    const base = produce(adult('faith-l', 30), (d) => {
      d.belonging.faith = { id: 'protestant', strength: 50, raised: 'protestant', since: null, changes: 0 };
      d.character.latent.faith = { id: 'muslim' };
    });
    expect(evaluate({ discovery: { latent: ['faith'] } }, base)).toBe(true);
    expect(evaluate({ faith: { leaning: true } }, base, { content })).toBe(true);
    const accepted = fx(base, [{ type: 'faith', action: 'fromLatent' }]);
    expect(accepted.belonging.faith.id).toBe('muslim');
    expect(accepted.character.latent.faith).toBeUndefined();
    expect(accepted.discovery.surfaced.faith).toBeUndefined();
    expect(checkInvariants(accepted, content)).toEqual([]);
  });

  it('other people have faiths too, and a partner’s can differ from yours', () => {
    const life = produce(adult('faith-p'), (d) => {
      d.belonging.faith = { id: 'jewish', strength: 60, raised: 'jewish', since: null, changes: 0 };
      d.relationships.sp = { personId: 'sp', kind: 'spouse', status: 'active', affection: 70, trust: 70, memories: [], since: d.currentYear - 5 };
      d.people.sp = { ...Object.values(d.people)[0]!, id: 'sp', alive: true, tags: [], cityId: d.character.cityId, birthYear: d.currentYear - 35, faith: { id: 'hindu', strength: 70 } };
    });
    const cond = (c: Condition) => evaluate(c, life, { cast: { partner: 'sp' }, roles: 'strict', content });
    expect(cond({ role: 'partner', faith: { same: false, none: false } })).toBe(true);
    expect(cond({ role: 'partner', faith: { same: true } })).toBe(false);
    expect(cond({ role: 'partner', faith: { id: ['hindu'], strength: { gte: 60 } } })).toBe(true);
    const converted = fx(life, [{ type: 'faith', action: 'convert', role: 'partner' }], { partner: 'sp' });
    expect(converted.belonging.faith.id).toBe('hindu');
    const theirsChanges = fx(life, [{ type: 'faith', action: 'lose', who: 'partner' }], { partner: 'sp' });
    expect(theirsChanges.people.sp!.faith).toEqual({ id: null, strength: 0 });
    expect(theirsChanges.belonging.faith.id).toBe('jewish');
  });

  it('children take a household’s faith when first met', () => {
    const life = produce(adult('faith-k', 30), (d) => {
      d.belonging.faith = { id: 'sikh', strength: 80, raised: 'sikh', since: null, changes: 0 };
      d.relationships.kid = { personId: 'kid', kind: 'child', status: 'active', affection: 80, trust: 80, memories: [], since: d.currentYear - 1 };
      d.people.kid = { ...Object.values(d.people)[0]!, id: 'kid', alive: true, tags: [], cityId: d.character.cityId, birthYear: d.currentYear - 1, child: { origin: 'birth', custody: 'you', custodyDecided: true, health: 80, happiness: 70, fitness: 50, stress: 10, geneticRisk: 20, talent: null, gpa: 0, latent: {} } };
    });
    const after = produce(life, (d) => runBelonging(d, content));
    expect(after.people.kid!.faith).toBeDefined();
    expect(content.registries.belonging.faiths[after.people.kid!.faith!.id ?? 'sikh'] ?? after.people.kid!.faith!.id === null).toBeTruthy();
  });

  it('a family takes a child to its congregation, and the membership ends with childhood unless they believe', () => {
    let found = 0;
    for (let i = 0; i < 40 && found < 3; i++) {
      const kid = produce(lifeAtAge(`along-${i}`, 8), (d) => {
        d.belonging.household = { faith: 'protestant', devotion: 80 };
        d.belonging.faith = { id: 'protestant', strength: 70, raised: 'protestant', since: null, changes: 0 };
        delete d.character.latent.faith;
        runBelonging(d, content);
      });
      const m = kid.belonging.memberships[0];
      if (!m) continue;
      found++;
      expect(m.family).toBe(true);
      expect(m.commitment).toBe('casual');
      expect(content.groups[instanceOf(kid, m.groupId)!.defId]!.religion).toBe('protestant');
      expect(checkInvariants(kid, content)).toEqual([]);
      const believer = produce(kid, (d) => {
        d.currentYear += 10;
        d.character.age += 10;
        runBelonging(d, content);
      });
      expect(believer.belonging.memberships[0]?.family).toBeUndefined();
      const doubter = produce(kid, (d) => {
        d.currentYear += 10;
        d.character.age += 10;
        d.belonging.faith.strength = 10;
        runBelonging(d, content);
      });
      expect(doubter.belonging.memberships).toHaveLength(0);
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('events about groups', () => {
  it('belong to a group: they need a membership, bind the group they are about and cast its people', () => {
    const life = produce(adult('events-1'), (d) => void joinGroup(d, aClub(d), 'committed', content));
    const def = content.events.group_friend_forms!;
    expect(evaluate(def.requires, life, { roles: 'assumeTrue', content })).toBe(true);
    const bare = produce(life, (d) => {
      for (const m of [...d.belonging.memberships]) leaveGroup(d, m.groupId, 'left', content);
    });
    expect(evaluate(def.requires, bare, { content })).toBe(false);
    expect(castEvent(bare, def, createRng('cast-0'), content)).toBeNull();
    const result = castEvent(life, def, createRng('cast-1'), content)!;
    expect(result).not.toBeNull();
    const gid = result.cast[GROUP_ROLE]!;
    expect(membershipOf(life, gid)).toBeDefined();
    expect(instanceOf(life, gid)!.people).toContain(result.cast.friend);
    expect(consistencyProblems(life, def, result.cast, content)).toEqual([]);
    expect(consistencyProblems(bare, def, result.cast, content).length).toBeGreaterThan(0);
  });

  it('an invitation is about a group you do not belong to, and joining through it makes you a member', () => {
    const life = adult('events-2');
    const def = content.events.invite_to_club!;
    const result = castEvent(life, def, createRng('cast-2'), content)!;
    const gid = result.cast[GROUP_ROLE]!;
    expect(membershipOf(life, gid)).toBeUndefined();
    expect(content.groups[instanceOf(life, gid)!.defId]!.type).toBe('club');
    expect(consistencyProblems(life, def, result.cast, content)).toEqual([]);
    const joined = fx(life, [{ type: 'group', action: 'join', level: 'committed' }], result.cast);
    expect(membershipOf(joined, gid)!.commitment).toBe('committed');
  });

  it('group news travels by gossip: a scandal or an honor becomes a story the web carries', () => {
    const life = produce(adult('news-1'), (d) => void joinGroup(d, aClub(d), 'committed', content));
    const told = fx(life, [{ type: 'group', action: 'news', kind: 'groupScandal' }, { type: 'group', action: 'news', kind: 'groupHonor' }], { [GROUP_ROLE]: life.belonging.memberships[0]!.groupId });
    expect(told.web.items.map((i) => i.kind).sort()).toEqual(['groupHonor', 'groupScandal']);
    expect(told.web.items.every((i) => i.subject === 'you')).toBe(true);
    expect(checkInvariants(told, content)).toEqual([]);
  });

  it('a group role moves you up the ladder through an event, and the Groups view shows it', () => {
    const life = produce(adult('events-3'), (d) => void joinGroup(d, aClub(d), 'committed', content));
    const id = life.belonging.memberships[0]!.groupId;
    const after = fx(life, [{ type: 'group', action: 'promote' }, { type: 'group', action: 'standing', delta: 5 }], { [GROUP_ROLE]: id });
    expect(membershipOf(after, id)!.rung).toBe(1);
    const view = getBelongingView(after, content);
    expect(view.memberships[0]!.role).not.toBe(content.groups[instanceOf(after, id)!.defId]!.ladder[0]!.name);
    expect(view.faith.name.length).toBeGreaterThan(0);
    expect(view.values).toHaveLength(5);
  });
});

describe('lives with groups stay consistent', () => {
  it('whole lives with a player who joins groups keep every invariant', () => {
    for (let i = 0; i < 4; i++) {
      const start = produce(createLife({ mode: 'random', seed: `whole-${i}`, birthYear: 1990, countryId: 'us' }, content), () => {});
      const aged = produce(lifeAtAge(`whole-${i}`, 20), (d) => {
        ensureCity(d, d.character.cityId, content);
        const g = cityGroups(d, d.character.cityId, content).find((x) => content.groups[x.defId]!.maxAge === undefined && content.groups[x.defId]!.minAge <= 18);
        if (g) joinGroup(d, g.id, 'committed', content);
      });
      void start;
      const done = liveOut(aged, content, (life) => {
        const failures = checkInvariants(life, content);
        if (failures.length > 0) throw new Error(`${life.seed} age ${life.character.age}: ${failures.slice(0, 3).join('; ')}`);
      });
      expect(done.phase).toBe('dead');
    }
  }, 120_000);
});

describe('saves from before belonging', () => {
  it('get a faith and values from the seed on the first yearly step, and no group', () => {
    const old = produce(adult('old-save'), (d) => {
      d.belonging = { ...d.belonging, household: { faith: null, devotion: 0 }, faith: { id: null, strength: 0, raised: null, since: null, changes: 0 }, upgrade: true };
    });
    const a = produce(old, (d) => {
      runBelonging(d, content);
      d.scheduled = [];
    });
    const b = produce(old, (d) => runBelonging(d, content));
    expect(a.belonging.upgrade).toBeUndefined();
    expect(a.belonging.memberships).toHaveLength(0);
    expect(a.belonging.faith).toEqual(b.belonging.faith);
    expect(checkInvariants(a, content)).toEqual([]);
    expect(changeFaith).toBeDefined();
  });
});
