/** God mode (G1): each editable area for you and for a person: an accepted edit, its limits and its refusals. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { checkInvariants } from '../invariants';
import type { LifeState } from '../types';
import { checkEdit, EditRefusedError, performEdit, type RefusalCode } from './index';
import { editable, relativeOf } from './fixtures';

/** The codes an edit is refused with. */
function codes(life: LifeState, payload: unknown): RefusalCode[] {
  const result = checkEdit(life, payload, content);
  return result.ok ? [] : result.refusals.map((r) => r.code);
}

/** Applies an edit that must be accepted, and checks the life is still valid. */
function edit(life: LifeState, payload: unknown): LifeState {
  const next = performEdit(life, payload, content);
  expect(checkInvariants(next, content)).toEqual([]);
  return next;
}

const SELF = 'self' as const;
const person = (id: string) => ({ person: id });
const noJob = Object.values(content.jobs).find((j) => !j.requires && !j.vehicle && !j.retired && j.levels.length >= 3)!;

describe('you: name, identity, hidden identity, looks', () => {
  it('edits the name by the creation rules, tidied', () => {
    const next = edit(editable(), { target: SELF, name: { first: '  Jo   Anne ', last: "O'Neil-Smith" } });
    expect(next.character.name).toEqual({ first: 'Jo Anne', last: "O'Neil-Smith" });
    expect(next.character.formerNames).toBeUndefined();
    expect(codes(editable(), { target: SELF, name: { first: '', last: 'X' } })).toEqual(['invalid_value']);
    expect(codes(editable(), { target: SELF, name: { first: 'A'.repeat(31), last: 'X' } })).toEqual(['invalid_value']);
    expect(codes(editable(), { target: SELF, name: { first: '12', last: 'X' } })).toEqual(['invalid_value']);
    expect(edit(editable(), { target: SELF, name: { first: 'Zoë', last: 'Łukasz' } }).character.name.first).toBe('Zoë');
  });

  it('edits gender, expression, pronouns, attraction and can-carry', () => {
    const they = { subject: 'they', object: 'them', possessive: 'their', possessivePronoun: 'theirs', reflexive: 'themself', verbPlural: true };
    const next = edit(editable(), { target: SELF, identity: { genderCategory: 'nonbinary', genderIdentity: 'agender', genderExpression: 'neutral', pronouns: they, attractedTo: ['man', 'woman', 'nonbinary'], canCarry: true } });
    expect(next.character.identity).toMatchObject({ genderCategory: 'nonbinary', genderIdentity: 'agender', genderExpression: 'neutral', attractedTo: ['man', 'woman', 'nonbinary'] });
    expect(next.character.identity.pronouns).toEqual(they);
    expect(next.character.canCarry).toBe(true);
    expect(edit(editable(), { target: SELF, identity: { attractedTo: [] } }).character.identity.attractedTo).toEqual([]);
    expect(codes(editable(), { target: SELF, identity: { attractedTo: ['man', 'man'] } })).toEqual(['invalid_value']);
    expect(codes(editable(), { target: SELF, identity: { genderCategory: 'robot' } })).toEqual(['invalid_value']);
  });

  it("can't turn off can-carry while you carry a pregnancy", () => {
    const life = produce(editable(), (d) => {
      d.character.canCarry = true;
      d.family.pregnancy = { startYear: d.currentYear, how: 'trying', carrier: 'you', decision: 'keep' };
    });
    expect(codes(life, { target: SELF, identity: { canCarry: false } })).toEqual(['carrying']);
  });

  it('sets and clears the hidden identity, personality and faith', () => {
    const she = { subject: 'she', object: 'her', possessive: 'her', possessivePronoun: 'hers', reflexive: 'herself', verbPlural: false };
    const set = edit(editable(), {
      target: SELF,
      latent: { attractedTo: ['man'], gender: { genderCategory: 'woman', genderIdentity: 'woman', pronouns: she }, expression: 'femme', personality: { kindness: 80, ambition: 10 }, faith: { id: 'jewish' } },
    });
    expect(set.character.latent.identity).toMatchObject({ attractedTo: ['man'], genderCategory: 'woman', genderExpression: 'femme' });
    expect(set.character.latent.personality).toEqual({ kindness: 80, ambition: 10 });
    expect(set.character.latent.faith).toEqual({ id: 'jewish' });
    const cleared = edit(set, { target: SELF, latent: { attractedTo: null, gender: null, expression: null, personality: { kindness: null, ambition: null }, faith: null } });
    expect(cleared.character.latent).toEqual({});
    expect(codes(editable(), { target: SELF, latent: { faith: { id: 'no_such_faith' } } })).toEqual(['unknown_id']);
  });

  it('edits looks and appearance words: one per group and one free word', () => {
    const groups = content.character.appearance.groups;
    const words = groups.map((g) => g.options[0]!);
    const next = edit(editable(), { target: SELF, looks: 99, appearance: { descriptors: [...words, 'a gap-toothed grin'] } });
    expect(next.character.stats.looks).toBe(99);
    expect(next.character.appearance.descriptors).toEqual([...words, 'a gap-toothed grin']);
    expect(codes(editable(), { target: SELF, appearance: { descriptors: [groups[0]!.options[0]!, groups[0]!.options[1]!] } })).toEqual(['appearance']);
    expect(codes(editable(), { target: SELF, appearance: { descriptors: ['one odd word', 'another odd word'] } })).toEqual(['appearance']);
  });
});

describe('you: stats, personality, hidden values', () => {
  it('edits stats within 0–100 (health from 1)', () => {
    const next = edit(editable(), { target: SELF, stats: { health: 1, happiness: 0, smarts: 100, fitness: 55, stress: 100 }, personality: { ambition: 0, confidence: 100, kindness: 50, riskTaking: 1, discipline: 2, sociability: 3 } });
    expect(next.character.stats).toMatchObject({ health: 1, happiness: 0, smarts: 100, fitness: 55, stress: 100 });
    expect(next.character.personality).toMatchObject({ ambition: 0, confidence: 100, riskTaking: 1 });
    expect(codes(editable(), { target: SELF, stats: { health: 0 } })).toEqual(['invalid_value']);
    expect(codes(editable(), { target: SELF, stats: { happiness: 101 } })).toEqual(['invalid_value']);
    expect(codes(editable(), { target: SELF, stats: { happiness: 50.5 } })).toEqual(['invalid_value']);
    expect(codes(editable(), { target: SELF, personality: { ambition: null } })).toEqual(['field_unavailable']);
  });

  it('edits hidden values, the talent and whether it is found', () => {
    const life = produce(editable(), (d) => {
      d.character.hidden.talent = 'art';
      d.character.hidden.talentDiscovered = false;
      d.discovery.surfaced.talent = { year: d.currentYear - 1, times: 1 };
    });
    const found = edit(life, { target: SELF, values: { luck: 1, reputation: 2, geneticRisk: 3, vice: 4, innerConflict: 5, happinessBaseline: 6, talentDiscovered: true } });
    expect(found.character.hidden).toMatchObject({ luck: 1, reputation: 2, geneticRisk: 3, vice: 4, innerConflict: 5, happinessBaseline: 6, talentDiscovered: true });
    // A found talent is no longer waiting to surface.
    expect(found.discovery.surfaced.talent).toBeUndefined();
    // A different talent clears a pending surfacing.
    const other = edit(life, { target: SELF, values: { talent: 'cooking' } });
    expect(other.character.hidden.talent).toBe('cooking');
    expect(other.discovery.surfaced.talent).toBeUndefined();
    const none = edit(life, { target: SELF, values: { talent: null } });
    expect(none.character.hidden).toMatchObject({ talent: null, talentDiscovered: false });
    expect(codes(life, { target: SELF, values: { talent: 'no_such_talent' } })).toEqual(['unknown_id']);
    expect(codes(none, { target: SELF, values: { talentDiscovered: true } })).toEqual(['talent_missing']);
  });
});

describe('you: health conditions', () => {
  it('adds, changes and removes conditions', () => {
    const added = edit(editable(), { target: SELF, conditions: [{ conditionId: 'type_2_diabetes', severity: 40, treated: false }, { conditionId: 'broken_bone', severity: 10, treated: true }] });
    expect(added.health.conditions.map((c) => c.conditionId)).toEqual(['type_2_diabetes', 'broken_bone']);
    expect(added.health.conditions[0]).toMatchObject({ severity: 40, treated: false, since: added.currentYear });
    const changed = edit(added, { target: SELF, conditions: [{ conditionId: 'type_2_diabetes', severity: 80, treated: true }] });
    expect(changed.health.conditions).toEqual([expect.objectContaining({ conditionId: 'type_2_diabetes', severity: 80, treated: true, since: added.currentYear })]);
    expect(edit(changed, { target: SELF, conditions: [] }).health.conditions).toEqual([]);
    expect(codes(added, { target: SELF, conditions: [{ conditionId: 'cancer', severity: 0, treated: false }] })).toEqual(['invalid_value']);
    expect(codes(added, { target: SELF, conditions: [{ conditionId: 'cancer', severity: 5, treated: false }, { conditionId: 'cancer', severity: 6, treated: false }] })).toEqual(['condition_duplicate']);
    expect(codes(added, { target: SELF, conditions: [{ conditionId: 'not_a_condition', severity: 5, treated: false }] })).toEqual(['unknown_id']);
  });

  it('names a mental or born-with condition only from the age it can be named', () => {
    const named = edit(editable(), { target: SELF, conditions: [{ conditionId: 'adhd', severity: 30, treated: false, named: true }] });
    expect(named.health.conditions[0]).toMatchObject({ conditionId: 'adhd', diagnosed: named.currentYear, since: named.birthYear });
    expect(edit(named, { target: SELF, conditions: [{ conditionId: 'adhd', severity: 30, treated: false, named: false }] }).health.conditions[0]!.diagnosed).toBeUndefined();
    const baby = editable(3);
    expect(codes(baby, { target: SELF, conditions: [{ conditionId: 'depression', severity: 30, treated: false, named: true }] })).toContain('condition_age');
    expect(codes(editable(), { target: SELF, conditions: [{ conditionId: 'cancer', severity: 30, treated: false, named: true }] })).toEqual(['field_unavailable']);
  });
});

describe('you: job, wealth, city', () => {
  it('takes a job and changes its level, with pay from the track and your city', () => {
    const hired = edit(editable(), { target: SELF, work: { jobId: noJob.id, level: 2 } });
    expect(hired.career.job).toMatchObject({ jobId: noJob.id, level: 2, yearsAtLevel: 0, since: hired.currentYear });
    expect(hired.career.job!.salary).toBeGreaterThan(0);
    expect(hired.career.retired).toBe(false);
    const up = edit(hired, { target: SELF, work: { jobId: noJob.id, level: 3 } });
    expect(up.career.job!.level).toBe(3);
    expect(up.career.job!.salary).toBeGreaterThan(hired.career.job!.salary - 1);
    expect(up.career.job!.since).toBe(hired.career.job!.since);
  });

  it('records a job you leave as one you quit, and leaves it with no job', () => {
    const hired = edit(editable(), { target: SELF, work: { jobId: noJob.id, level: 1 } });
    const other = Object.values(content.jobs).find((j) => j.id === 'retail_associate')!;
    const switched = edit(hired, { target: SELF, work: { jobId: other.id, level: 1 } });
    expect(switched.career.job!.jobId).toBe(other.id);
    expect(switched.career.history.at(-1)).toMatchObject({ jobId: noJob.id, endedBy: 'quit', toYear: switched.currentYear });
    const none = edit(switched, { target: SELF, work: { jobId: null, level: 1 } });
    expect(none.career.job).toBeNull();
    expect(none.career.history).toHaveLength(2);
  });

  it('refuses a job you could not take', () => {
    expect(codes(editable(12), { target: SELF, work: { jobId: noJob.id, level: 1 } })).toContain('job_age');
    expect(codes(editable(), { target: SELF, work: { jobId: noJob.id, level: 9 } })).toEqual(['invalid_value']);
    expect(codes(editable(), { target: SELF, work: { jobId: 'not_a_job', level: 1 } })).toEqual(['unknown_id']);
    const needs = Object.values(content.jobs).find((j) => j.requires && !j.retired)!;
    expect(codes(editable(), { target: SELF, work: { jobId: needs.id, level: 1 } })).toContain('job_requirements');
    const retired = produce(editable(), (d) => {
      d.career.retired = true;
    });
    expect(codes(retired, { target: SELF, work: { jobId: noJob.id, level: 1 } })).toEqual(['job_retired']);
  });

  it('sets the family wealth level', () => {
    expect(edit(editable(), { target: SELF, wealth: 'rich' }).character.familyWealth).toBe('rich');
    expect(codes(editable(), { target: SELF, wealth: 'filthy' })).toEqual(['invalid_value']);
  });

  it('moves you as relocate does, without the fee or a history line: your job ends as moved and the partner who lives with you comes along', () => {
    const hired = edit(editable(), { target: SELF, work: { jobId: noJob.id, level: 1 } });
    const moved = edit(hired, { target: SELF, cityId: 'houston' });
    expect(moved.character.cityId).toBe('houston');
    expect(moved.housing).toMatchObject({ kind: 'renting', cityId: 'houston' });
    expect(moved.career.job).toBeNull();
    expect(moved.career.history.at(-1)).toMatchObject({ endedBy: 'moved' });
    expect(moved.finances.savings).toBe(hired.finances.savings);
    expect(moved.history).toEqual(hired.history);
    expect(moved.rng).toEqual(hired.rng);
  });
});

describe('you and people: faith, languages, citizenships', () => {
  it('sets your faith and how strongly you believe', () => {
    const next = edit(editable(), { target: SELF, faith: { id: 'catholic', strength: 80 } });
    expect(next.belonging.faith).toMatchObject({ id: 'catholic', strength: 80 });
    expect(edit(editable(), { target: SELF, faith: { id: null, strength: 0 } }).belonging.faith).toMatchObject({ id: null, strength: 0 });
    expect(codes(editable(), { target: SELF, faith: { id: null, strength: 30 } })).toEqual(['faith_strength']);
    expect(codes(editable(), { target: SELF, faith: { id: 'catholic', strength: 0 } })).toEqual(['faith_strength']);
    expect(codes(editable(), { target: SELF, faith: { id: 'nope', strength: 30 } })).toEqual(['unknown_id']);
  });

  it("sets a person's faith", () => {
    const next = edit(editable(), { target: person('pal'), faith: { id: 'jewish', strength: 60 } });
    expect(next.people.pal!.faith).toEqual({ id: 'jewish', strength: 60 });
  });

  it('edits languages: skill, native, add and remove', () => {
    const next = edit(editable(), { target: SELF, languages: [{ id: 'en', skill: 90, native: true }, { id: 'es', skill: 40, native: false }] });
    expect(next.character.languages).toEqual([
      expect.objectContaining({ id: 'en', skill: 90, native: true, lastUsed: next.currentYear }),
      expect.objectContaining({ id: 'es', skill: 40, native: false, lastUsed: next.currentYear }),
    ]);
    expect(codes(next, { target: SELF, languages: [{ id: 'es', skill: 40, native: false }] })).toEqual(['no_native_language']);
    expect(codes(next, { target: SELF, languages: [{ id: 'en', skill: 90, native: true }, { id: 'en', skill: 10, native: true }] })).toEqual(['language_duplicate']);
    expect(codes(next, { target: SELF, languages: [{ id: 'xx', skill: 10, native: true }] })).toEqual(['unknown_id']);
    expect(codes(next, { target: SELF, languages: [{ id: 'en', skill: 101, native: true }] })).toEqual(['invalid_value']);
    expect(edit(editable(), { target: person('pal'), languages: [{ id: 'en', skill: 100, native: true }, { id: 'fr', skill: 20, native: false }] }).people.pal!.languages).toHaveLength(2);
  });

  it('adds and removes citizenships; the first stays; never empty; none that forbids dual citizenship beside another', () => {
    const dual = Object.entries(content.balance.immigration.countries).find(([id, c]) => id !== 'us' && c.dual)![0];
    const next = edit(editable(), { target: SELF, citizenships: ['us', dual] });
    expect(next.character.citizenships).toEqual(['us', dual]);
    expect(edit(next, { target: SELF, citizenships: ['us'] }).character.citizenships).toEqual(['us']);
    expect(codes(next, { target: SELF, citizenships: [] })).toEqual(['citizenship_empty']);
    expect(codes(next, { target: SELF, citizenships: [dual] })).toEqual(['citizenship_first']);
    expect(codes(next, { target: SELF, citizenships: ['us', 'atlantis'] })).toEqual(['invalid_value']);
    expect(codes(next, { target: SELF, citizenships: ['us', dual, dual] })).toEqual(['citizenship_duplicate']);
    const single = Object.entries(content.balance.immigration.countries).find(([id, c]) => id !== 'us' && !c.dual);
    if (single) expect(codes(editable(), { target: SELF, citizenships: ['us', single[0]] })).toEqual(['citizenship_dual']);
    expect(edit(editable(), { target: person('pal'), citizenships: ['us', dual] }).people.pal!.citizenships).toEqual(['us', dual]);
  });
});

describe('you: money', () => {
  it('sets savings within the cap, whole dollars', () => {
    expect(edit(editable(), { target: SELF, money: { savings: 123_456 } }).finances.savings).toBe(123_456);
    expect(edit(editable(), { target: SELF, money: { savings: content.balance.godmode.money.savingsMax } }).finances.savings).toBe(content.balance.godmode.money.savingsMax);
    expect(codes(editable(), { target: SELF, money: { savings: content.balance.godmode.money.savingsMax + 1 } })).toEqual(['money_range']);
    expect(codes(editable(), { target: SELF, money: { savings: -1 } })).toEqual(['money_range']);
    expect(codes(editable(), { target: SELF, money: { savings: 10.5 } })).toEqual(['invalid_value']);
  });

  it('adds, changes and forgives debts, with the kind’s usual rate and a minimum payment', () => {
    const added = edit(editable(), { target: SELF, money: { debts: [{ kind: 'personal', balance: 5000 }, { kind: 'medical', balance: 900 }] } });
    expect(added.finances.debts).toHaveLength(2);
    const [a, b] = added.finances.debts;
    expect(a).toMatchObject({ kind: 'personal', balance: 5000, missed: 0 });
    expect(a!.minPayment).toBeGreaterThan(0);
    expect(a!.annualRate).toBe(content.balance.economy.interest.debts.personal);
    const changed = edit(added, { target: SELF, money: { debts: [{ id: a!.id, kind: 'personal', balance: 1000 }] } });
    expect(changed.finances.debts).toEqual([expect.objectContaining({ id: a!.id, balance: 1000 })]);
    expect(changed.finances.debts[0]!.minPayment).toBeLessThan(a!.minPayment);
    expect(b!.id).not.toBe(a!.id);
    expect(edit(changed, { target: SELF, money: { debts: [] } }).finances.debts).toEqual([]);
  });

  it('refuses debts of the wrong kind, too large, for a child, or tied to a home, car or business', () => {
    const max = content.balance.godmode.money.debtMax;
    expect(codes(editable(), { target: SELF, money: { debts: [{ kind: 'mortgage', balance: 1000 }] } })).toEqual(['debt_kind']);
    expect(codes(editable(), { target: SELF, money: { debts: [{ kind: 'personal', balance: max + 1 }] } })).toEqual(['money_range']);
    expect(codes(editable(), { target: SELF, money: { debts: [{ kind: 'personal', balance: 0 }] } })).toEqual(['money_range']);
    expect(codes(editable(10), { target: SELF, money: { debts: [{ kind: 'personal', balance: 100 }] } })).toEqual(['child_debt']);
    const owned = produce(editable(), (d) => {
      d.housing = { kind: 'owned', cityId: 'chicago', annualCost: 0, since: d.currentYear - 1, homeValue: 200_000, mortgageDebtId: 'd1' };
      d.finances.debts = [{ id: 'd1', kind: 'mortgage', balance: 150_000, annualRate: 0.06, minPayment: 12_000, missed: 0 }];
    });
    expect(codes(owned, { target: SELF, money: { debts: [{ id: 'd1', kind: 'mortgage', balance: 10 }] } })).toEqual(['debt_kind', 'debt_locked']);
    // The mortgage is left alone when the list of editable debts is rewritten.
    const kept = edit(owned, { target: SELF, money: { debts: [{ kind: 'personal', balance: 500 }] } });
    expect(kept.finances.debts.find((d) => d.id === 'd1')).toMatchObject({ kind: 'mortgage', balance: 150_000 });
    expect(codes(editable(), { target: SELF, money: { debts: [{ id: 'd9', kind: 'personal', balance: 5 }] } })).toEqual(['unknown_id']);
  });
});

describe('a person: name, identity, looks, stats, personality', () => {
  it('edits name, gender words, attraction, can-carry, looks, smarts, mood and traits (set or cleared)', () => {
    const next = edit(editable(), {
      target: person('pal'),
      name: { first: 'Pia', last: 'Lund' },
      identity: { genderIdentity: 'woman', attractedTo: ['woman', 'man'], canCarry: true },
      looks: 77,
      stats: { smarts: 12, mood: 30, moodBase: 40 },
      personality: { ambition: 90, kindness: null },
    });
    const pal = next.people.pal!;
    expect(pal.name).toEqual({ first: 'Pia', last: 'Lund' });
    expect(pal.identity.attractedTo).toEqual(['woman', 'man']);
    expect(pal).toMatchObject({ looks: 77, smarts: 12, mood: 30, moodBase: 40, canCarry: true });
    expect(pal.traits.ambition).toBe(90);
    expect(pal.traits.kindness).toBeUndefined();
  });

  it('refuses stats a person has no use for, and your own mood', () => {
    expect(codes(editable(), { target: person('pal'), stats: { health: 50 } })).toEqual(['field_unavailable']);
    expect(codes(editable(), { target: SELF, stats: { mood: 50 } })).toEqual(['field_unavailable']);
    expect(codes(editable(), { target: person('pal'), money: { savings: 5 } })).toEqual(['field_unavailable']);
    expect(codes(editable(), { target: person('pal'), conditions: [] })).toEqual(['field_unavailable']);
    expect(codes(editable(), { target: SELF, relationship: { affection: 5 } })).toEqual(['field_unavailable']);
    expect(codes(editable(), { target: person('nobody'), looks: 5 })).toEqual(['unknown_id']);
  });

  it('edits a child’s own stats, hidden identity, gene risk and talent', () => {
    const life = produce(editable(), (d) => {
      const template = d.people.pal!;
      d.people.kiddo = {
        ...JSON.parse(JSON.stringify(template)),
        id: 'kiddo',
        birthYear: d.currentYear - 5,
        child: { origin: 'birth', custody: 'you', custodyDecided: true, health: 80, happiness: 70, fitness: 60, stress: 20, geneticRisk: 30, talent: null, gpa: 0, latent: {} },
      };
      d.relationships.kiddo = { personId: 'kiddo', kind: 'child', status: 'active', affection: 80, trust: 80, memories: [], since: d.currentYear - 5 };
      d.people.kiddo!.identity.attractedTo = [];
      d.people.kiddo!.traits = { ambition: 50, confidence: 50, kindness: 50, riskTaking: 50, discipline: 50, sociability: 50 };
      delete d.people.kiddo!.life;
    });
    expect(checkInvariants(life, content)).toEqual([]);
    const next = edit(life, { target: person('kiddo'), stats: { health: 5, happiness: 6, fitness: 7, stress: 8 }, values: { geneticRisk: 90, talent: 'art' }, latent: { attractedTo: ['woman'], personality: { sociability: 10 } } });
    expect(next.people.kiddo!.child).toMatchObject({ health: 5, happiness: 6, fitness: 7, stress: 8, geneticRisk: 90, talent: 'art' });
    expect(next.people.kiddo!.child!.latent).toMatchObject({ identity: { attractedTo: ['woman'] }, personality: { sociability: 10 } });
    expect(codes(life, { target: person('kiddo'), values: { luck: 4 } })).toEqual(['field_unavailable']);
    expect(codes(life, { target: person('kiddo'), personality: { kindness: null } })).toEqual(['child_traits']);
    expect(codes(editable(), { target: person('pal'), latent: { attractedTo: ['man'] } })).toEqual(['field_unavailable']);
  });
});

describe('a person: illnesses, addictions and born-with conditions', () => {
  it('adds, changes and removes them, keeping their crimes', () => {
    const next = edit(editable(), { target: person('pal'), troubles: [{ kind: 'illness', refId: 'pneumonia', severity: 40, treated: false }, { kind: 'addiction', refId: 'alcohol_addiction', severity: 60, treated: true }], neuro: ['adhd'] });
    expect(next.people.pal!.life!.troubles).toEqual([
      expect.objectContaining({ kind: 'illness', refId: 'pneumonia', severity: 40, since: next.currentYear }),
      expect.objectContaining({ kind: 'addiction', refId: 'alcohol_addiction', severity: 60, treated: true }),
    ]);
    expect(next.people.pal!.neuro).toEqual(['adhd']);
    const worse = edit(next, { target: person('pal'), troubles: [{ kind: 'illness', refId: 'pneumonia', severity: 90, treated: true }] });
    expect(worse.people.pal!.life!.troubles).toEqual([expect.objectContaining({ refId: 'pneumonia', severity: 90, treated: true, since: next.currentYear })]);
    expect(edit(worse, { target: person('pal'), troubles: [], neuro: [] }).people.pal!.neuro).toBeUndefined();
    expect(codes(next, { target: person('pal'), troubles: [{ kind: 'illness', refId: 'alcohol_addiction', severity: 5, treated: false }] })).toEqual(['invalid_value']);
    expect(codes(next, { target: person('pal'), troubles: [{ kind: 'illness', refId: 'adhd', severity: 5, treated: false }] })).toEqual(['unknown_id']);
    expect(codes(next, { target: person('pal'), neuro: ['pneumonia'] })).toEqual(['unknown_id']);
    expect(codes(next, { target: person('pal'), troubles: ['pneumonia', 'cancer', 'dementia'].map((refId) => ({ kind: 'illness', refId, severity: 5, treated: false })) })).toContain('trouble_limit');
    expect(codes(next, { target: person('pal'), troubles: [{ kind: 'illness', refId: 'cancer', severity: 5, treated: false }, { kind: 'illness', refId: 'cancer', severity: 6, treated: false }] })).toEqual(['condition_duplicate']);
  });
});

describe('a person: job, wealth, city', () => {
  it('sets an occupation and level, and their wealth (also their background)', () => {
    const next = edit(editable(), { target: person('pal'), work: { jobId: noJob.id, level: 2 }, wealth: 'affluent' });
    const pal = next.people.pal!;
    expect(pal.occupation).toBe(noJob.id);
    expect(pal.wealthLevel).toBe('affluent');
    expect(pal.life).toMatchObject({ level: 2, levelSince: next.currentYear, background: 'affluent' });
    const none = edit(next, { target: person('pal'), work: { jobId: null, level: 1 } });
    expect(none.people.pal!.occupation).toBeUndefined();
    expect(none.people.pal!.life!.level).toBe(0);
    expect(codes(editable(), { target: person('kid'), work: { jobId: noJob.id, level: 1 } })).toContain('job_age');
    expect(codes(editable(), { target: person('pal'), work: { jobId: noJob.id, level: 99 } })).toEqual(['invalid_value']);
    expect(codes(editable(), { target: person('pal'), work: { jobId: 'zzz', level: 1 } })).toEqual(['unknown_id']);
  });

  it('keeps an edited job and wealth through five years of play', () => {
    // (Covered over real years in replay.test.ts; here, the edit leaves the person consistent for the lives step.)
    const next = edit(editable(), { target: person('pal'), work: { jobId: noJob.id, level: 1 }, wealth: 'poor' });
    expect(next.people.pal!.life!.background).toBe('poor');
  });

  it('moves a person to another city of their country', () => {
    const next = edit(editable(), { target: person('pal'), cityId: 'houston' });
    expect(next.people.pal!.cityId).toBe('houston');
    expect(codes(editable(), { target: person('pal'), cityId: 'no_city' })).toEqual(['unknown_id']);
  });
});

describe('a person: relationship and age', () => {
  it('edits affection, trust and status', () => {
    const next = edit(editable(), { target: person('pal'), relationship: { affection: 5, trust: 95, status: 'estranged' } });
    expect(next.relationships.pal).toMatchObject({ affection: 5, trust: 95, status: 'estranged' });
    expect(edit(next, { target: person('pal'), relationship: { status: 'ended' } }).relationships.pal!.status).toBe('ended');
  });

  it('edits the age of a friend within bounds, and not of family or children', () => {
    const next = edit(editable(), { target: person('pal'), birthYear: editable().currentYear - 50 });
    expect(next.people.pal!.birthYear).toBe(next.currentYear - 50);
    const parent = relativeOf(editable(), 'parent');
    expect(codes(editable(), { target: person(parent.id), birthYear: parent.birthYear - 1 })).toEqual(['age_fixed']);
    expect(codes(editable(), { target: SELF, birthYear: 1990 })).toEqual(['age_fixed']);
    expect(codes(editable(), { target: person('pal'), birthYear: editable().currentYear - 200 })).toEqual(['age_bounds']);
    expect(codes(editable(), { target: person('pal'), birthYear: 1000 })).toEqual(['age_bounds']);
  });
});

describe('refusals leave the life untouched', () => {
  it('throws every refusal together and changes nothing', () => {
    const life = editable();
    const before = JSON.stringify(life);
    let error: unknown;
    try {
      performEdit(life, { target: SELF, stats: { health: 50 }, faith: { id: 'nope', strength: 0 }, citizenships: [], languages: [{ id: 'es', skill: 5, native: false }] }, content);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EditRefusedError);
    expect((error as EditRefusedError).refusals.map((r) => r.code).sort()).toEqual(['citizenship_empty', 'faith_strength', 'no_native_language', 'unknown_id'].sort());
    expect(JSON.stringify(life)).toBe(before);
  });

  it('refuses an edit that changes nothing, and an unknown or oversized payload', () => {
    const life = editable();
    expect(codes(life, { target: SELF, stats: { health: life.character.stats.health } })).toEqual(['nothing_changed']);
    expect(codes(life, { target: SELF, stats: { health: 5 }, extra: 1 })).toEqual(['invalid_value']);
    expect(codes(life, { target: SELF, name: { first: 'A', last: 'B'.repeat(9000) } })).toEqual(['too_large']);
    expect(codes(life, 'nonsense')).toEqual(['invalid_value']);
  });

  it('refuses outside a year start, with a card open, and after death', () => {
    expect(codes(produce(editable(), (d) => { d.phase = 'events'; }), { target: SELF, looks: 5 })).toEqual(['not_between_years']);
    expect(codes(produce(editable(), (d) => { d.phase = 'action'; }), { target: SELF, looks: 5 })).toEqual(['not_between_years']);
    expect(codes(produce(editable(), (d) => { d.phase = 'dead'; d.death = { year: d.currentYear, age: d.character.age, causeId: 'old_age' }; }), { target: SELF, looks: 5 })).toEqual(['life_over']);
    expect(codes(produce(editable(), (d) => { d.pendingInteraction = { interactionId: 'x', personId: 'pal', year: d.currentYear } as never; }), { target: SELF, looks: 5 })).toEqual(['card_open']);
  });

  it('too many fields', () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ id: 'en', skill: i, native: true }));
    expect(codes(editable(), { target: SELF, languages: many.slice(0, 20), citizenships: ['us'], money: { debts: Array.from({ length: 20 }, () => ({ kind: 'personal', balance: 5 })) } })).toContain('too_many_fields');
  });
});
