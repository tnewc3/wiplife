import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { archiveEntry } from '../archive';
import { hireChance } from '../career';
import { InvalidInputError } from '../creation/input';
import { totalDebt } from '../finance';
import { createChild } from '../family/children';
import { checkInvariants } from '../invariants';
import { beginYear } from '../life';
import { playYear, resolveAll } from '../autoplay';
import { replayLife } from '../replay';
import { createRng } from '../rng';
import { PhaseError } from '../life';
import { cloneJson, liveOut } from '../testFixtures';
import type { LifeState } from '../types';
import { die, parentLife } from './fixtures';
import { chooseGuardian, continueAsHeir, heirCandidates } from './heir';
import { releaseTrust } from './heritage';
import { getDeathView, getFamilyLineView, getPreviously, groupArchiveByLine } from './views';

const play = (life: LifeState) => resolveAll(beginYear(life, content), content, createRng(`choices:${life.currentYear}`));

describe('who can carry on', () => {
  it('is any living child, at any age, once the life has ended', () => {
    const alive = parentLife({ kids: [0, 9, 30] });
    expect(heirCandidates(alive)).toEqual([]);
    const dead = die(alive);
    const ids = heirCandidates(dead);
    expect(ids).toHaveLength(3);
    expect(ids.map((id) => dead.currentYear - dead.people[id]!.birthYear).sort((a, b) => a - b)).toEqual([0, 9, 30]);
  });

  it('leaves out children who died, stepchildren and everyone else', () => {
    const dead = die(
      produce(parentLife({ kids: [8, 12], spouse: true }), (d) => {
        const [first] = Object.keys(d.people).filter((id) => d.people[id]!.child);
        d.people[first!]!.alive = false;
        d.people[first!]!.deathYear = d.currentYear;
        d.family.lostChildren = 1;
      }),
    );
    expect(heirCandidates(dead)).toHaveLength(1);
    expect(() => continueAsHeir(dead, 'sp', content)).toThrow(InvalidInputError);
    expect(() => continueAsHeir(dead, 'nobody', content)).toThrow(InvalidInputError);
    expect(() => continueAsHeir(parentLife({ kids: [8] }), heirCandidates(dead)[0]!, content)).toThrow(PhaseError);
  });
});

describe('continuing as a grown heir', () => {
  const dead = die(parentLife({ kids: [28, 33], spouse: true, savings: 200_000, home: { value: 300_000, mortgage: 100_000 }, reputation: 58, seed: 'grown' }));
  const [elder, younger] = heirCandidates(dead).sort((a, b) => dead.people[a]!.birthYear - dead.people[b]!.birthYear).reverse();
  const heir = continueAsHeir(dead, younger!, content);

  it('is a valid life, a generation on, in the same family line', () => {
    expect(checkInvariants(heir, content)).toEqual([]);
    expect(heir.phase).toBe('yearStart');
    expect(heir.currentYear).toBe(dead.currentYear);
    expect(heir.character.age).toBe(33);
    expect(heir.character.name).toEqual(dead.people[younger!]!.name);
    expect(heir.lineage).toMatchObject({ generation: 2, parentLifeId: dead.id, lineId: dead.lineage.lineId, familyName: dead.lineage.familyName, reputation: dead.lineage.reputation });
    expect(heir.lineage.parentLifeId).toBe(dead.id);
    expect(heir.will).toBeNull();
    expect(heir.estate).toBeNull();
    expect(heir.death).toBeNull();
  });

  it('keeps who they are: stats, personality, identity, hidden traits and talent', () => {
    const was = dead.people[younger!]!;
    expect(heir.character.stats.smarts).toBe(was.smarts);
    expect(heir.character.stats.looks).toBe(was.looks);
    expect(heir.character.stats.health).toBe(was.child!.health);
    expect(heir.character.identity).toEqual(was.identity);
    expect(heir.character.latent).toEqual(was.child!.latent);
    expect(heir.character.hidden.talent).toBe(was.child!.talent);
    expect(heir.character.hidden.geneticRisk).toBe(was.child!.geneticRisk);
    for (const [trait, value] of Object.entries(was.traits)) expect(heir.character.personality[trait as keyof typeof heir.character.personality]).toBe(value);
    expect(heir.character.canCarry).toBe(was.canCarry);
  });

  it('sees the family from their own side', () => {
    const parent = Object.values(heir.relationships).find((r) => r.kind === 'parent' && !heir.people[r.personId]!.alive && heir.people[r.personId]!.name.first === dead.character.name.first)!;
    expect(parent).toBeDefined();
    expect(heir.people[parent.personId]!.deathYear).toBe(dead.currentYear);
    // Your spouse is the heir's other parent.
    expect(heir.relationships.sp!.kind).toBe('parent');
    expect(heir.relationships.sp!.memories.map((m) => m.tag)).toContain('lost_the_same_parent');
    // Your other child is the heir's sibling, and is no longer anyone's child.
    expect(heir.relationships[elder!]!.kind).toBe('sibling');
    expect(heir.people[elder!]!.child).toBeUndefined();
    expect(heir.relationships[younger!]).toBeUndefined();
    // Your parents are their grandparents; friends and coworkers are not carried over.
    const grandparents = Object.values(heir.relationships).filter((r) => r.kind === 'grandparent');
    expect(grandparents.length).toBeGreaterThan(0);
    for (const r of grandparents) expect(dead.relationships[r.personId]!.kind).toBe('parent');
    expect(Object.values(heir.relationships).every((r) => ['parent', 'stepparent', 'grandparent', 'relative', 'sibling'].includes(r.kind))).toBe(true);
    // Nobody is the heir's own spouse or child.
    expect(Object.values(heir.relationships).some((r) => ['spouse', 'child', 'partner'].includes(r.kind))).toBe(false);
  });

  it('is never rebuilt with the dead parent’s spouse as the heir’s spouse', () => {
    const other = die(parentLife({ kids: [], spouse: true, seed: 'step' }));
    const stepKid = produce(other, (d) => {
      // A child of an earlier relationship: their other parent is not the spouse.
      const rng = createRng('step-kid');
      createChild(d, rng, { origin: 'birth', age: 20, parents: { you: true }, custody: 'you' }, content);
    });
    const [id] = heirCandidates(stepKid);
    const converted = continueAsHeir(stepKid, id!, content);
    expect(converted.relationships.sp!.kind).toBe('stepparent');
    expect(checkInvariants(converted, content)).toEqual([]);
  });

  it('moves the inheritance over: savings, and the home with its mortgage', () => {
    const line = dead.estate!.lines.find((l) => l.id === younger)!;
    const home = dead.estate!.lines.find((l) => l.property);
    if (home?.id === younger) {
      expect(heir.housing.kind).toBe('owned');
      expect(heir.housing.homeValue).toBe(300_000);
      expect(heir.finances.debts.find((d) => d.id === heir.housing.mortgageDebtId)?.balance).toBe(100_000);
      expect(heir.flags.inherited_a_home).toBe(true);
    } else {
      expect(heir.housing.kind).not.toBe('owned');
      expect(totalDebt(heir)).toBe(0);
    }
    expect(heir.finances.savings).toBe(content.balance.family.heir.adultSavings[heir.character.familyWealth] + line.cash);
    expect(heir.finances.trust).toBeUndefined();
  });

  it('opens with a "Previously" card and the childhood recap, in order', () => {
    const card = getPreviously(heir)!;
    expect(card.parentName).toBe(`${dead.character.name.first} ${dead.character.name.last}`);
    expect(card.lines.length).toBeGreaterThanOrEqual(2);
    expect(card.lines.join(' ')).toContain(String(dead.character.age));
    expect(heir.history.length).toBeGreaterThanOrEqual(2);
    expect(heir.history[0]!.tags).toContain('childhood');
    expect(heir.history.some((e) => e.tags.includes('parentDeath') && e.importance === 3)).toBe(true);
    const years = heir.history.map((e) => e.year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    for (const e of heir.history) expect(e.age).toBe(e.year - heir.birthYear);
    // The card is there until the first year begins.
    expect(getPreviously(play(heir))).toBeNull();
  });

  it('records the generation in the archive, and keeps the dead life’s line', () => {
    const entry = archiveEntry(dead, content, `${dead.people[younger!]!.name.first} ${dead.people[younger!]!.name.last}`);
    expect(entry).toMatchObject({ generation: 1, lineId: dead.lineage.lineId, familyName: dead.lineage.familyName, familyReputation: dead.lineage.reputation });
    expect(entry.heirName).toBe(`${heir.character.name.first} ${heir.character.name.last}`);
    const later = archiveEntry(die(heir), content);
    expect(later).toMatchObject({ generation: 2, parentLifeId: dead.id, lineId: dead.lineage.lineId });
  });

  it('is rebuilt exactly from its input log, before and after playing a year', () => {
    expect(replayLife(heir.inputLog, content)).toEqual(heir);
    const played = playYear(heir, content);
    expect(replayLife(played.inputLog, content)).toEqual(played);
  });

  it('shows the Death screen the estate and what each child would inherit', () => {
    const view = getDeathView(dead, content)!;
    expect(view.heirs.map((h) => h.id).sort()).toEqual([...heirCandidates(dead)].sort());
    expect(view.lines.reduce((n, l) => n + l.percent, 0)).toBe(100);
    for (const h of view.heirs) expect(h.minor).toBe(false);
  });
});

describe('continuing as a minor heir', () => {
  const base = parentLife({ kids: [9, 15], spouse: true, savings: 300_000, seed: 'minor' });
  const dead = die(base);
  const [young] = heirCandidates(dead).sort((a, b) => dead.people[b]!.birthYear - dead.people[a]!.birthYear);

  it('lives with the surviving parent, and money is held in trust until 18', () => {
    const heir = continueAsHeir(dead, young!, content);
    expect(checkInvariants(heir, content)).toEqual([]);
    expect(heir.housing.kind).toBe('with_parents');
    expect(heir.housing.guardianId).toBe('sp');
    expect(heir.housing.foster).toBeUndefined();
    expect(heir.finances.savings).toBe(0);
    const share = dead.estate!.lines.find((l) => l.id === young)!.cash;
    expect(heir.finances.trust).toEqual({ balance: share, releaseAge: content.balance.family.heir.trustReleaseAge });
    expect(heir.education.current).not.toBeNull();
    expect(heir.character.age).toBe(9);
    expect(getPreviously(heir)!.lines.join(' ')).toContain('Sam');
  });

  it('releases the trust into savings at 18, never before, and nothing is lost', () => {
    let heir = continueAsHeir(dead, young!, content);
    const held = heir.finances.trust!.balance;
    for (let i = 0; i < 8; i++) heir = playYear(heir, content);
    expect(heir.character.age).toBe(17);
    expect(heir.finances.trust?.balance).toBe(held);
    const savings = heir.finances.savings;
    const released = produce(heir, (d) => {
      d.character.age = 18;
      d.currentYear = d.birthYear + 18;
      expect(releaseTrust(d)).toBe(held);
    });
    expect(released.finances.trust).toBeUndefined();
    expect(released.finances.savings).toBe(savings + held);
  });

  it('is released by the year pipeline when the heir turns 18', () => {
    const heir = continueAsHeir(dead, heirCandidates(dead).find((id) => id !== young)!, content);
    // The older child (15): 3 years to go.
    expect(heir.character.age).toBe(15);
    let current = heir;
    const trust = current.finances.trust!.balance;
    for (let i = 0; i < 3; i++) {
      // (A young star's parents add to it, E6b; nothing takes from it.)
      expect(current.finances.trust?.balance).toBeGreaterThanOrEqual(trust);
      current = playYear(current, content);
    }
    expect(current.character.age).toBe(18);
    expect(current.finances.trust).toBeUndefined();
    expect(current.finances.savings).toBeGreaterThanOrEqual(trust - 40_000);
  });

  it('sells an inherited home into trust, losing the selling costs', () => {
    const withHome = die(parentLife({ kids: [10], noRelatives: true, savings: 20_000, home: { value: 300_000, mortgage: 100_000 }, seed: 'minorhome' }));
    const [id] = heirCandidates(withHome);
    const heir = continueAsHeir(withHome, id!, content);
    const line = withHome.estate!.lines.find((l) => l.id === id)!;
    expect(line.property).toBeDefined();
    const net = 300_000 - Math.round(300_000 * content.balance.economy.ownership.sellingCosts) - 100_000;
    expect(heir.finances.trust!.balance).toBe(line.cash + net);
    expect(heir.housing.homeValue).toBeUndefined();
    expect(checkInvariants(heir, content)).toEqual([]);
  });
});

describe('who takes a minor in', () => {
  /** A dead life whose only living child is 10, with the relatives you pass in. */
  function orphan(relatives: (d: LifeState) => void) {
    const dead = die(
      produce(parentLife({ kids: [10], noRelatives: true, seed: 'guardian' }), (d) => {
        relatives(d);
      }),
    );
    return continueAsHeir(dead, heirCandidates(dead)[0]!, content);
  }
  const add = (d: LifeState, id: string, kind: 'parent' | 'sibling' | 'stepparent', age: number, over: { affection?: number; status?: 'active' | 'estranged' } = {}) => {
    const { child: _child, deathYear: _death, ...template } = cloneJson(Object.values(d.people)[0]!);
    d.people[id] = { ...template, id, name: { first: `R${id}`, last: 'Rel' }, birthYear: d.currentYear - age, alive: true, tags: [], cityId: d.character.cityId };
    d.relationships[id] = { personId: id, kind, status: over.status ?? 'active', affection: over.affection ?? 60, trust: 60, memories: [], since: d.currentYear - 10 };
  };

  it('goes to a surviving parent first, then a relative: grandparent, aunt or uncle, an older sibling', () => {
    const withGrandparent = orphan((d) => {
      add(d, 'gp', 'parent', 70);
      add(d, 'uncle', 'sibling', 45);
    });
    expect(withGrandparent.housing.guardianId).toBe('gp');
    expect(withGrandparent.relationships.gp!.kind).toBe('grandparent');
    expect(withGrandparent.relationships.uncle!.kind).toBe('relative');
    expect(withGrandparent.housing.foster).toBeUndefined();
    expect(checkInvariants(withGrandparent, content)).toEqual([]);

    const withRelative = orphan((d) => add(d, 'uncle', 'sibling', 45));
    expect(withRelative.housing.guardianId).toBe('uncle');
    expect(withRelative.relationships.uncle!.kind).toBe('relative');
    expect(checkInvariants(withRelative, content)).toEqual([]);
    expect(withRelative.housing.cityId).toBe(withRelative.people.uncle!.cityId);
  });

  it('skips relatives who are too old, too young, estranged or not fond of the heir', () => {
    // How the heir feels about each relative is rolled when they continue: set it here to what the test needs.
    const heir = orphan((d) => {
      add(d, 'old', 'parent', 95);
      add(d, 'young', 'sibling', 19);
      add(d, 'estranged', 'sibling', 40);
      add(d, 'cold', 'sibling', 40);
    });
    const only = (id: string, status: 'active' | 'estranged', affection: number) =>
      produce(heir, (d) => {
        for (const other of Object.keys(d.relationships)) if (other !== id && d.relationships[other]!.kind !== 'parent') d.relationships[other]!.status = 'ended';
        d.relationships[id]!.status = status;
        d.relationships[id]!.affection = affection;
      });
    expect(chooseGuardian(only('old', 'active', 80), content)).toBeNull();
    expect(chooseGuardian(only('young', 'active', 80), content)).toBeNull();
    expect(chooseGuardian(only('estranged', 'estranged', 80), content)).toBeNull();
    expect(chooseGuardian(only('cold', 'active', 5), content)).toBeNull();
    expect(chooseGuardian(only('cold', 'active', 80), content)).toEqual({ id: 'cold', kind: 'relative' });
  });

  it('is foster care when no one can: a carer is created, the flag is set, and the foster events follow', () => {
    const heir = orphan(() => undefined);
    expect(heir.housing.foster).toBe(true);
    expect(heir.housing.kind).toBe('with_parents');
    const carer = heir.people[heir.housing.guardianId!]!;
    expect(carer.tags).toContain('foster');
    expect(heir.relationships[carer.id]!.kind).toBe('stepparent');
    expect(heir.flags.in_foster_care).toBe(true);
    expect(heir.scheduled.map((s) => s.eventId)).toContain('foster_placement');
    expect(getPreviously(heir)!.lines.join(' ')).toContain('foster');
    expect(checkInvariants(heir, content)).toEqual([]);
  });

  it('aging out of foster care at 18 leaves a place of their own', () => {
    let heir = orphan(() => undefined);
    for (let i = 0; i < 8; i++) heir = playYear(heir, content);
    expect(heir.character.age).toBe(18);
    expect(heir.housing.foster).toBeUndefined();
    expect(heir.housing.kind).toBe('renting');
    expect(heir.flags.in_foster_care).toBeUndefined();
    expect(heir.flags.grew_up_in_foster_care).toBe(true);
    expect(checkInvariants(heir, content)).toEqual([]);
  });

  it('moves on to another guardian, or foster care, when the guardian dies', () => {
    const heir = orphan((d) => {
      add(d, 'uncle', 'sibling', 45);
      add(d, 'aunt', 'sibling', 50);
    });
    const first = heir.housing.guardianId!;
    const lost = produce(heir, (d) => {
      d.people[first]!.alive = false;
      d.people[first]!.deathYear = d.currentYear;
    });
    const next = playYear(lost, content);
    expect(next.housing.guardianId).not.toBe(first);
    expect(next.housing.foster).toBeUndefined();
    const alone = produce(next, (d) => {
      for (const id of Object.keys(d.people)) if (d.relationships[id]!.kind !== 'parent' && d.people[id]!.alive && id !== 'p0') d.people[id]!.alive = false;
      for (const id of Object.keys(d.people)) if (!d.people[id]!.alive && d.people[id]!.deathYear === undefined) d.people[id]!.deathYear = d.currentYear;
    });
    const fostered = playYear(alone, content);
    expect(fostered.housing.foster).toBe(true);
    expect(checkInvariants(fostered, content)).toEqual([]);
    expect(chooseGuardian(fostered, content)).toBeNull();
  });
});

describe('family reputation', () => {
  it('moves part of the way back to 50 and takes what the life added', () => {
    const quiet = die(parentLife({ kids: [20], seed: 'rep', reputation: 50 }));
    expect(quiet.lineage.reputation).toBeGreaterThanOrEqual(35);
    expect(quiet.lineage.reputation).toBeLessThanOrEqual(65);
    const disgraced = die(
      produce(parentLife({ kids: [20], seed: 'rep', reputation: 50 }), (d) => {
        d.legal.record = [{ offenseId: Object.keys(content.offenses)[0]!, year: d.currentYear - 5, outcome: 'jail', years: 3 }];
        d.flags.cooked_books = true;
        d.character.hidden.reputation = 20;
      }),
    );
    expect(disgraced.lineage.reputation).toBeLessThan(quiet.lineage.reputation - 10);
    expect(disgraced.lineage.deeds).toEqual(expect.arrayContaining(['conviction', 'scandal']));
    const generous = die(
      produce(parentLife({ kids: [20], seed: 'rep', reputation: 50 }), (d) => {
        d.flags.volunteers = true;
        writeCause(d);
      }),
    );
    expect(generous.lineage.deeds).toEqual(expect.arrayContaining(['honored', 'generous']));
    expect(generous.lineage.reputation).toBeGreaterThan(quiet.lineage.reputation);
  });

  it('passes to the heir: their own reputation, their hiring chances and how new people greet them', () => {
    const high = die(parentLife({ kids: [28], seed: 'repcarry', reputation: 90 }));
    const low = die(parentLife({ kids: [28], seed: 'repcarry', reputation: 10 }));
    const [highId] = heirCandidates(high);
    const heirHigh = continueAsHeir(high, highId!, content);
    const heirLow = continueAsHeir(low, heirCandidates(low)[0]!, content);
    expect(heirHigh.lineage.reputation).toBeGreaterThan(heirLow.lineage.reputation + 30);
    expect(heirHigh.character.hidden.reputation).toBeGreaterThan(heirLow.character.hidden.reputation + 10);
    const job = content.jobs[Object.keys(content.jobs).sort().find((id) => content.jobs[id]!.category === 'gig')!]!;
    // Same person otherwise: only the family name differs.
    const sameHeir = produce(heirHigh, (d) => {
      d.lineage.reputation = heirLow.lineage.reputation;
      d.character.hidden.reputation = heirHigh.character.hidden.reputation;
    });
    expect(hireChance(heirHigh, job, content)).toBeGreaterThan(hireChance(sameHeir, job, content));
  });

  it('shows on the family line', () => {
    const view = getFamilyLineView(parentLife({ reputation: 75 }), content);
    expect(view).toMatchObject({ generation: 1, reputation: 75 });
    expect(view.familyName.length).toBeGreaterThan(0);
  });
});

function writeCause(d: LifeState): void {
  const [kid] = Object.keys(d.people).filter((id) => d.people[id]!.child);
  d.will = { year: d.currentYear, shares: [{ kind: 'person', id: kid!, percent: 70 }, { kind: 'cause', id: 'food_bank', percent: 30 }] };
}

describe('three generations', () => {
  it('continue with zero invariant failures, each heir a child of the last', () => {
    const failures: string[] = [];
    const check = (life: LifeState) => failures.push(...checkInvariants(life, content));
    const youngest = (dead: LifeState) => heirCandidates(dead).sort((a, b) => dead.people[b]!.birthYear - dead.people[a]!.birthYear)[0]!;

    // Generation 1 ends, leaving a child of 9 and a grown one.
    const first = die(parentLife({ kids: [9, 28], spouse: true, seed: 'chain-c', age: 52, savings: 250_000 }));
    check(first);
    expect(first.lineage.generation).toBe(1);

    // Generation 2 is the child of 9: taken in by the surviving parent, with money held in trust, then grown up.
    let second = continueAsHeir(first, youngest(first), content);
    check(second);
    expect(second.lineage).toMatchObject({ generation: 2, parentLifeId: first.id, lineId: first.lineage.lineId });
    expect(second.housing.guardianId).toBe('sp');
    for (let i = 0; i < 13; i++) {
      second = playYear(second, content);
      check(second);
    }
    expect(second.character.age).toBe(22);
    expect(second.finances.trust).toBeUndefined();
    // A grown heir's own family isn't modelled; give them a family to carry on through (adopted, since they are young).
    second = produce(second, (d) => {
      const rng = createRng(`${d.seed}-adopted`);
      for (const age of [3, 6]) createChild(d, rng, { origin: 'adopted', age, parents: { you: false }, custody: 'you' }, content);
    });
    check(second);
    const secondDead = liveOut(second, content, check);
    check(secondDead);
    expect(secondDead.lineage.generation).toBe(2);
    expect(heirCandidates(secondDead).length).toBeGreaterThan(0);

    // Generation 3 carries on from the child, and its life goes on.
    let third = continueAsHeir(secondDead, youngest(secondDead), content);
    check(third);
    expect(third.lineage).toMatchObject({ generation: 3, parentLifeId: secondDead.id, lineId: first.lineage.lineId });
    for (let i = 0; i < 4; i++) {
      third = playYear(third, content);
      check(third);
    }
    expect(failures).toEqual([]);
    // Every generation is in one family line, and the archive groups them.
    const entries = [first, secondDead].map((l) => archiveEntry(l, content));
    const lines = groupArchiveByLine([...entries, archiveEntry(die(third), content)].reverse());
    expect(lines).toHaveLength(1);
    expect(lines[0]!.lives.map((l) => l.generation)).toEqual([1, 2, 3]);
  });
});
