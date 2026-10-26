/** God mode (G1): the content rules no edit may break, presence, the closed list of knock-ons, and that edits are silent. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { checkInvariants } from '../invariants';
import { currentPartner, FAMILY_KINDS, isRomanticKind, kindSince } from '../relationships';
import { cloneJson } from '../testFixtures';
import type { LifeState, RelationshipKind } from '../types';
import { ageBounds, checkEdit, performEdit, type RefusalCode } from './index';
import { addPerson, editable, relativeOf } from './fixtures';

const SELF = 'self' as const;
const person = (id: string) => ({ person: id });
const ADULT = content.balance.relationships.adultAge;
const noJob = Object.values(content.jobs).find((j) => !j.requires && !j.vehicle && !j.retired && j.levels.length >= 3)!;

function codes(life: LifeState, payload: unknown): RefusalCode[] {
  const result = checkEdit(life, payload, content);
  return result.ok ? [] : [...new Set(result.refusals.map((r) => r.code))].sort();
}
function edit(life: LifeState, payload: unknown): LifeState {
  const next = performEdit(life, payload, content);
  expect(checkInvariants(next, content)).toEqual([]);
  return next;
}
const kindOf = (id: string) => ({ target: person(id), relationship: { kind: 'partner' } });

/** `pal` is your partner (a woman attracted to men, you a man attracted to women). */
function partnered(extra?: (d: LifeState) => void): LifeState {
  return produce(edit(editable(), kindOf('pal')), (d) => {
    extra?.(d);
  });
}

describe('no romance involving anyone under 18', () => {
  const romantic = ['partner', 'fiance', 'spouse', 'ex'] as const;

  it.each(romantic)('a minor can’t become your %s', (kind) => {
    expect(codes(editable(), { target: person('kid'), relationship: { kind } })).toEqual(['minor_romance']);
  });

  it.each(romantic)('you can’t have a %s while you are a minor', (kind) => {
    expect(codes(editable(16), { target: person('pal'), relationship: { kind } })).toContain('minor_romance');
  });

  it('a classmate, a teacher or a child who is a minor can’t become a partner', () => {
    const life = produce(editable(), (d) => {
      addPerson(d, { id: 'mate', age: 15, kind: 'classmate' });
      d.education.current = { program: 'high', year: 1, lengthYears: 4, gpa: 3, boost: 0, scholarship: 0, repeats: 0, since: d.currentYear } as never;
    });
    expect(codes(life, { target: person('mate'), relationship: { kind: 'partner' } })).toContain('minor_romance');
    const teacher = produce(editable(), (d) => addPerson(d, { id: 'tch', age: 45, kind: 'teacher' }));
    expect(codes(teacher, { target: person('tch'), relationship: { kind: 'partner' } })).toEqual(['family_kind']);
    const child = produce(editable(), (d) => {
      addPerson(d, { id: 'cub', age: 5, kind: 'child' });
      d.people.cub!.child = { origin: 'birth', custody: 'you', custodyDecided: true, health: 80, happiness: 70, fitness: 60, stress: 20, geneticRisk: 30, talent: null, gpa: 0, latent: {} };
    });
    expect(codes(child, { target: person('cub'), relationship: { kind: 'partner' } })).toEqual(['family_kind', 'minor_romance']);
  });

  it('lowering the age of a partner, fiancé, spouse or ex below 18 at the time is refused', () => {
    const partner = partnered();
    const thisYear = partner.currentYear;
    expect(kindSince(partner.relationships.pal!)).toBe(thisYear);
    expect(codes(partner, { target: person('pal'), birthYear: thisYear - 17 })).toEqual(['minor_romance']);
    expect(edit(partner, { target: person('pal'), birthYear: thisYear - 18 }).people.pal!.birthYear).toBe(thisYear - 18);
    const ex = produce(editable(), (d) => {
      addPerson(d, { id: 'old', age: 30, kind: 'ex' });
      d.relationships.old!.since = d.currentYear - 9;
      d.relationships.old!.kindSince = d.currentYear - 6;
    });
    expect(codes(ex, { target: person('old'), birthYear: ex.currentYear - 23 })).toEqual(['minor_romance']);
    expect(edit(ex, { target: person('old'), birthYear: ex.currentYear - 24 }).people.old!.birthYear).toBe(ex.currentYear - 24);
  });

  it('shows the age bounds a partner’s age can take', () => {
    const partner = partnered();
    const bounds = ageBounds(partner, 'pal', content);
    expect(bounds.editable).toBe(true);
    expect(bounds.maxBirthYear).toBe(partner.currentYear - ADULT);
    expect(bounds.minBirthYear).toBe(partner.currentYear - content.balance.mortality.maxAge + 1);
  });

  it('whatever kind an edit gives anyone, no accepted edit leaves a romance with a minor', () => {
    const life = produce(editable(), (d) => {
      addPerson(d, { id: 'teen2', age: 17, kind: 'acquaintance', category: 'woman', attractedTo: ['man'] });
      addPerson(d, { id: 'mate', age: 15, kind: 'classmate' });
      addPerson(d, { id: 'xx', age: 17, kind: 'ex' });
      d.relationships.xx!.kindSince = d.currentYear - 10;
      d.relationships.xx!.status = 'ended';
    });
    const kinds = ['friend', 'acquaintance', 'partner', 'fiance', 'spouse', 'ex', 'coworker', 'boss', 'classmate'] as const;
    for (const id of Object.keys(life.people)) {
      for (const kind of kinds) {
        const result = checkEdit(life, { target: person(id), relationship: { kind } }, content);
        if (!result.ok) continue;
        const next = performEdit(life, { target: person(id), relationship: { kind } }, content);
        const rel = next.relationships[id]!;
        if (isRomanticKind(rel.kind)) {
          expect(next.character.age).toBeGreaterThanOrEqual(ADULT);
          expect(next.currentYear - next.people[id]!.birthYear).toBeGreaterThanOrEqual(ADULT);
          expect(kindSince(rel) - next.people[id]!.birthYear).toBeGreaterThanOrEqual(ADULT);
        }
      }
    }
  });
});

describe('no romance with family, and family stays family', () => {
  const others: RelationshipKind[] = ['friend', 'acquaintance', 'partner', 'fiance', 'spouse', 'ex', 'coworker', 'boss', 'classmate'];

  it.each(FAMILY_KINDS.filter((k) => k !== 'child' && k !== 'stepchild' && k !== 'grandchild'))('your %s can’t become anything else', (kind) => {
    const life = editable();
    const relative = Object.values(life.relationships).find((r) => r.kind === kind);
    if (!relative) return;
    for (const to of others) {
      expect(codes(life, { target: person(relative.personId), relationship: { kind: to } })).toContain('family_kind');
    }
  });

  it('a child, a stepchild and a grandchild can’t become anything else', () => {
    for (const kind of ['child', 'stepchild', 'grandchild'] as const) {
      const life = produce(editable(), (d) => {
        addPerson(d, { id: 'kin', age: 25, kind });
        if (kind === 'grandchild') d.people.kin!.birthYear = d.currentYear - 2;
      });
      expect(codes(life, { target: person('kin'), relationship: { kind: 'partner' } })).toContain('family_kind');
      expect(codes(life, { target: person('kin'), relationship: { kind: 'friend' } })).toContain('family_kind');
    }
  });

  it('nobody becomes family: the family kinds are not in the payload at all', () => {
    for (const kind of FAMILY_KINDS) expect(codes(editable(), { target: person('pal'), relationship: { kind } })).toEqual(['invalid_value']);
  });

  it('a teacher stays a teacher, and nobody becomes one', () => {
    const life = produce(editable(), (d) => addPerson(d, { id: 'tch', age: 45, kind: 'teacher' }));
    for (const to of others) expect(codes(life, { target: person('tch'), relationship: { kind: to } })).toContain('family_kind');
    expect(codes(editable(), { target: person('pal'), relationship: { kind: 'teacher' } })).toEqual(['invalid_value']);
  });

  it('family can be active or estranged, not faded out', () => {
    const parent = relativeOf(editable(), 'parent');
    expect(edit(editable(), { target: person(parent.id), relationship: { status: 'estranged' } }).relationships[parent.id]!.status).toBe('estranged');
    expect(codes(editable(), { target: person(parent.id), relationship: { status: 'ended' } })).toEqual(['partner_status']);
  });
});

describe('work and school kinds stay where they come from', () => {
  it('nobody becomes a boss, coworker or classmate', () => {
    for (const kind of ['coworker', 'boss', 'classmate'] as const) {
      expect(codes(editable(), { target: person('pal'), relationship: { kind } })).toEqual(['place_kind']);
    }
  });

  it('a coworker can become a friend or a partner', () => {
    const life = produce(editable(), (d) => {
      d.career.job = { jobId: noJob.id, level: 1, yearsAtLevel: 0, performance: 50, salary: 30000, since: d.currentYear - 1, employer: noJob.employers[0]! };
      addPerson(d, { id: 'cow', age: 29, kind: 'coworker' });
    });
    expect(edit(life, { target: person('cow'), relationship: { kind: 'friend' } }).relationships.cow!.kind).toBe('friend');
    expect(edit(life, { target: person('cow'), relationship: { kind: 'partner' } }).relationships.cow!.kind).toBe('partner');
  });
});

describe('one partner at a time, attraction both ways, not taken, a current partner stays active', () => {
  it('makes a friend a partner: kindSince is this year; a spouse is wasSpouse', () => {
    const partner = partnered();
    expect(partner.relationships.pal).toMatchObject({ kind: 'partner', kindSince: partner.currentYear });
    const spouse = edit(partner, { target: person('pal'), relationship: { kind: 'spouse' } });
    expect(spouse.relationships.pal).toMatchObject({ kind: 'spouse', wasSpouse: true });
    expect(currentPartner(spouse)?.personId).toBe('pal');
  });

  it('a second current partner is refused', () => {
    const life = produce(partnered(), (d) => addPerson(d, { id: 'dot', age: 31, kind: 'friend' }));
    expect(codes(life, { target: person('dot'), relationship: { kind: 'partner' } })).toEqual(['second_partner']);
    expect(codes(life, { target: person('dot'), relationship: { kind: 'fiance' } })).toEqual(['second_partner']);
    // Retire the first partner and the second is fine.
    const exed = edit(life, { target: person('pal'), relationship: { kind: 'ex' } });
    expect(edit(exed, { target: person('dot'), relationship: { kind: 'partner' } }).relationships.dot!.kind).toBe('partner');
  });

  it('a partner needs attraction both ways, judged on the life after the edit', () => {
    expect(codes(editable(), kindOf('ace'))).toEqual(['no_attraction']);
    const cold = edit(editable(), { target: person('pal'), identity: { attractedTo: [] } });
    expect(codes(cold, kindOf('pal'))).toEqual(['no_attraction']);
    // Fix it and use the fix in one save.
    const fixed = edit(cold, { target: person('pal'), identity: { attractedTo: ['man'] }, relationship: { kind: 'partner' } });
    expect(fixed.relationships.pal!.kind).toBe('partner');
    // Taking the attraction away from a partner, or from yourself, is refused.
    expect(codes(partnered(), { target: person('pal'), identity: { attractedTo: ['woman'] } })).toEqual(['no_attraction']);
    expect(codes(partnered(), { target: SELF, identity: { attractedTo: ['man'] } })).toEqual(['no_attraction']);
    expect(codes(partnered(), { target: SELF, identity: { genderCategory: 'woman' } })).toEqual(['no_attraction']);
    expect(edit(partnered(), { target: SELF, identity: { attractedTo: ['woman', 'man'] } }).character.identity.attractedTo).toEqual(['woman', 'man']);
  });

  it('someone who has a partner of their own, or is in a couple in your social web, is taken', () => {
    const withPartner = produce(editable(), (d) => {
      d.people.pal!.life = {
        tier: 'near', background: 'working', level: 0, levelSince: d.currentYear, partner: { name: { first: 'Sam', last: 'Lee' }, genderCategory: 'man', birthYear: d.currentYear - 30, canCarry: false, status: 'dating', since: d.currentYear - 2, statusSince: d.currentYear - 2 },
        children: [], troubles: [], recovered: [], gossip: 50,
      };
    });
    expect(checkInvariants(withPartner, content)).toEqual([]);
    expect(codes(withPartner, kindOf('pal'))).toEqual(['taken']);
    const tied = produce(editable(), (d) => {
      addPerson(d, { id: 'other', age: 33, kind: 'acquaintance' });
      d.web.ties['other|pal'] = { a: 'other', b: 'pal', kind: 'dating', affection: 60, origin: 'event', since: d.currentYear - 1 } as never;
    });
    expect(codes(tied, kindOf('pal'))).toEqual(['taken']);
  });

  it('a current partner can’t be estranged or faded out', () => {
    expect(codes(partnered(), { target: person('pal'), relationship: { status: 'estranged' } })).toEqual(['partner_status']);
    expect(codes(partnered(), { target: person('pal'), relationship: { status: 'ended' } })).toEqual(['partner_status']);
    const cut = edit(editable(), { target: person('pal'), relationship: { status: 'estranged' } });
    expect(codes(cut, kindOf('pal'))).toEqual(['partner_status']);
    expect(edit(cut, { target: person('pal'), relationship: { kind: 'partner', status: 'active' } }).relationships.pal!.status).toBe('active');
  });

  it('a partner can go straight to friend or ex, and a live-in partner then moves out without a history line', () => {
    const living = produce(partnered(), (d) => {
      d.housing.partnerId = 'pal';
    });
    expect(checkInvariants(living, content)).toEqual([]);
    for (const kind of ['friend', 'ex', 'acquaintance'] as const) {
      const next = edit(living, { target: person('pal'), relationship: { kind } });
      expect(next.housing.partnerId).toBeUndefined();
      expect(next.history).toEqual(living.history);
    }
  });
});

describe('the dead', () => {
  const dead = produce(editable(), (d) => addPerson(d, { id: 'gone', age: 60, kind: 'friend', alive: false }));

  it('can be renamed and have their gender words changed, nothing else', () => {
    expect(edit(dead, { target: person('gone'), name: { first: 'Old', last: 'Friend' }, identity: { genderIdentity: 'man', genderExpression: 'gruff' } }).people.gone!.name.first).toBe('Old');
    expect(codes(dead, { target: person('gone'), looks: 5 })).toEqual(['dead_person']);
    expect(codes(dead, { target: person('gone'), identity: { attractedTo: [] } })).toEqual(['dead_person']);
    expect(codes(dead, { target: person('gone'), identity: { canCarry: true } })).toEqual(['dead_person']);
    expect(codes(dead, { target: person('gone'), relationship: { kind: 'partner' } })).toEqual(['dead_person']);
    expect(codes(dead, { target: person('gone'), birthYear: 1950 })).toEqual(['dead_person']);
    expect(codes(dead, { target: person('gone'), cityId: 'houston' })).toEqual(['dead_person']);
  });
});

describe('age limits', () => {
  it('your age is never editable', () => {
    expect(codes(editable(), { target: SELF, birthYear: 1990 })).toEqual(['age_fixed']);
  });

  it.each([
    ['a parent', (l: LifeState) => relativeOf(l, 'parent').id],
    ['a sibling', (l: LifeState) => relativeOf(l, 'sibling').id],
    ['a grandparent', (l: LifeState) => relativeOf(l, 'grandparent').id],
  ])('%s keeps their age', (_label, pick) => {
    const life = editable();
    const id = pick(life);
    expect(codes(life, { target: person(id), birthYear: life.people[id]!.birthYear - 1 })).toEqual(['age_fixed']);
  });

  it('your teachers, bosses, coworkers and classmates, your children and the one who cares for you keep their age', () => {
    const life = produce(editable(), (d) => {
      d.career.job = { jobId: noJob.id, level: 1, yearsAtLevel: 0, performance: 50, salary: 30000, since: d.currentYear - 1, employer: noJob.employers[0]! };
      addPerson(d, { id: 'bs', age: 50, kind: 'boss' });
      addPerson(d, { id: 'cow', age: 29, kind: 'coworker' });
      addPerson(d, { id: 'tch', age: 45, kind: 'teacher' });
      addPerson(d, { id: 'mate', age: 29, kind: 'classmate' });
    });
    for (const id of ['bs', 'cow', 'tch', 'mate']) {
      expect(ageBounds(life, id, content).editable).toBe(false);
      expect(codes(life, { target: person(id), birthYear: life.people[id]!.birthYear - 3 })).toEqual(['age_fixed']);
    }
  });

  it('is bound by the children they had, their job, and their troubles', () => {
    const life = produce(editable(), (d) => {
      d.people.pal!.life = {
        tier: 'near', background: 'working', level: 0, levelSince: d.currentYear, partner: null,
        children: [{ first: 'Kit', birthYear: d.currentYear - 6 }], troubles: [], recovered: [], gossip: 50,
      };
    });
    expect(checkInvariants(life, content)).toEqual([]);
    const b = ageBounds(life, 'pal', content);
    const { parentAgeAtBirth } = content.balance.creation.family;
    expect(b.maxBirthYear).toBe(life.currentYear - 6 - Math.max(ADULT, parentAgeAtBirth.min));
    expect(b.minBirthYear).toBe(Math.max(life.currentYear - content.balance.mortality.maxAge + 1, life.currentYear - 6 - parentAgeAtBirth.max));
    expect(codes(life, { target: person('pal'), birthYear: b.maxBirthYear + 1 })).toEqual(['age_bounds']);
    expect(edit(life, { target: person('pal'), birthYear: b.maxBirthYear }).people.pal!.birthYear).toBe(b.maxBirthYear);
    expect(codes(life, { target: person('pal'), birthYear: b.minBirthYear - 1 })).toEqual(['age_bounds']);
  });
});

describe('presence', () => {
  it('a partner who lives with you can’t be given another city; one who doesn’t can', () => {
    const living = produce(partnered(), (d) => {
      d.housing.partnerId = 'pal';
    });
    expect(codes(living, { target: person('pal'), cityId: 'houston' })).toEqual(['lives_with_you']);
    expect(edit(partnered(), { target: person('pal'), cityId: 'houston' }).people.pal!.cityId).toBe('houston');
    // Change the relationship first and move them in the same save.
    expect(edit(living, { target: person('pal'), relationship: { kind: 'ex' }, cityId: 'houston' }).people.pal!.cityId).toBe('houston');
  });

  it('a child who lives with you, and a parent while you live with your parents, can’t be given another city', () => {
    const life = produce(editable(), (d) => {
      addPerson(d, { id: 'cub', age: 5, kind: 'child' });
      d.people.cub!.child = { origin: 'birth', custody: 'you', custodyDecided: true, health: 80, happiness: 70, fitness: 60, stress: 20, geneticRisk: 30, talent: null, gpa: 0, latent: {} };
      d.people.cub!.traits = { ambition: 50, confidence: 50, kindness: 50, riskTaking: 50, discipline: 50, sociability: 50 };
    });
    expect(codes(life, { target: person('cub'), cityId: 'houston' })).toEqual(['lives_with_you']);
    const teen = editable(16);
    const parent = relativeOf(teen, 'parent');
    expect(codes(teen, { target: person(parent.id), cityId: 'houston' })).toEqual(['lives_with_you']);
  });

  it('a coworker, boss, classmate or teacher can’t be given another city', () => {
    const life = produce(editable(), (d) => {
      d.career.job = { jobId: noJob.id, level: 1, yearsAtLevel: 0, performance: 50, salary: 30000, since: d.currentYear - 1, employer: noJob.employers[0]! };
      addPerson(d, { id: 'cow', age: 29, kind: 'coworker' });
      addPerson(d, { id: 'tch', age: 45, kind: 'teacher' });
    });
    expect(codes(life, { target: person('cow'), cityId: 'houston' })).toEqual(['works_with_you']);
    expect(codes(life, { target: person('tch'), cityId: 'houston' })).toEqual(['works_with_you']);
    expect(edit(life, { target: person('cow'), relationship: { kind: 'friend' }, cityId: 'houston' }).people.cow!.cityId).toBe('houston');
  });

  it('nobody can be placed in another country', () => {
    const abroad = Object.values(content.cities).find((c) => c.countryId !== 'us' && !c.retired)!.id;
    expect(codes(editable(), { target: person('pal'), cityId: abroad })).toEqual(['move_other_country']);
    expect(codes(editable(), { target: SELF, cityId: abroad })).toEqual(['move_other_country']);
  });

  it('your own move follows the relocate rules', () => {
    expect(codes(editable(15), { target: SELF, cityId: 'houston' })).toContain('move_minor');
    const owner = produce(editable(), (d) => {
      d.housing = { kind: 'owned', cityId: 'chicago', annualCost: 0, since: d.currentYear - 1, homeValue: 200_000 };
    });
    expect(codes(owner, { target: SELF, cityId: 'houston' })).toEqual(['move_owned_home']);
    const probation = produce(editable(), (d) => {
      d.legal.probationUntil = d.currentYear + 2;
    });
    expect(codes(probation, { target: SELF, cityId: 'houston' })).toEqual(['move_probation']);
    const abroad = produce(editable(), (d) => {
      d.travel.residence = { country: 'Canada', destinationId: 'x', type: 'student', route: 'semester', startYear: d.currentYear, endYear: d.currentYear + 1, homeCityId: 'chicago', settled: false } as never;
    });
    expect(codes(abroad, { target: SELF, cityId: 'houston' })).toContain('move_abroad');
    expect(codes(editable(), { target: SELF, cityId: 'nowhere' })).toEqual(['unknown_id']);
  });

  it('a partner who lives with you comes along; one who doesn’t stays', () => {
    const living = produce(partnered(), (d) => {
      d.housing.partnerId = 'pal';
      addPerson(d, { id: 'dot', age: 31, kind: 'friend' });
    });
    const moved = edit(living, { target: SELF, cityId: 'houston' });
    expect(moved.people.pal!.cityId).toBe('houston');
    expect(moved.housing.partnerId).toBe('pal');
    expect(moved.people.dot!.cityId).toBe('chicago');
    expect(moved.finances.savings).toBe(living.finances.savings);
    expect(moved.history).toEqual(living.history);
    const apart = edit(partnered(), { target: SELF, cityId: 'houston' });
    expect(apart.people.pal!.cityId).toBe('chicago');
  });
});

describe('edits are silent and draw nothing', () => {
  it('write no history line, flag, memory, event or archive mark, and leave the generator alone', () => {
    let life = partnered();
    const edits: Record<string, unknown>[] = [
      { target: SELF, stats: { health: 33 } },
      { target: SELF, work: { jobId: noJob.id, level: 2 } },
      { target: SELF, work: { jobId: null, level: 1 } },
      { target: SELF, cityId: 'houston' },
      { target: person('pal'), relationship: { kind: 'spouse' }, cityId: 'houston' },
      { target: person('pal'), relationship: { kind: 'ex' } },
      { target: person('ace'), work: { jobId: noJob.id, level: 1 }, wealth: 'rich', troubles: [{ kind: 'illness', refId: 'cancer', severity: 20, treated: false }] },
      { target: SELF, money: { savings: 5000, debts: [{ kind: 'bank', balance: 700 }] } },
    ];
    const frozen = (l: LifeState) => cloneJson({ history: l.history, flags: l.flags, eventLog: l.eventLog, scheduled: l.scheduled, pending: l.pending, rng: l.rng, news: l.news, memories: Object.values(l.relationships).map((r) => r.memories), pendingInteraction: l.pendingInteraction, recap: l.recap, lifetime: l.lifetime });
    const base = frozen(life);
    for (const payload of edits) {
      life = performEdit(life, payload, content);
      expect(frozen(life)).toEqual(base);
    }
    expect(life.inputLog.filter((r) => r.kind === 'edit')).toHaveLength(edits.length + 1);
    expect(JSON.stringify(life)).not.toMatch(/god|edited/i);
  });

  it('are a pure function of the life and the payload', () => {
    const life = editable();
    const payload = { target: SELF, cityId: 'houston', work: { jobId: noJob.id, level: 1 } };
    expect(performEdit(life, payload, content)).toEqual(performEdit(life, payload, content));
  });
});

describe('knock-ons', () => {
  it('a new job starts as the career module starts one, and the job you had is one you quit', () => {
    const hired = edit(editable(), { target: SELF, work: { jobId: noJob.id, level: 1 } });
    expect(hired.career.job).toMatchObject({ yearsAtLevel: 0, since: hired.currentYear, employer: noJob.employers[0] });
    expect(hired.career.job!.performance).toBeGreaterThanOrEqual(0);
  });

  it('a person’s occupation and level set their life’s level and its year', () => {
    const next = edit(editable(), { target: person('pal'), work: { jobId: noJob.id, level: 3 } });
    expect(next.people.pal!.life).toMatchObject({ level: 3, levelSince: next.currentYear });
  });
});
