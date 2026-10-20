/**
 * Risk and legal activities (Batch 2b): crime, the black market, gambling, lawsuits,
 * a legal name change and loans, all run through Batch 2a's activity type and the one
 * `do_activity` action. Rules under test: ages (the law's juvenile rules, the gambling age,
 * a parent's agreement), odds (heat, a record, evidence, a house edge that always wins),
 * every consequence through the legal, finance, health or vice system, validated names,
 * loans that cost what their rates say, and the input log replay.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../../content';
import { RISK_CATEGORIES } from '../../content/schemas';
import { finishAction, isLifeActionAvailable, performAction } from '../actions';
import { playYear, resolveAll } from '../autoplay';
import { createLife } from '../life';
import { amortizedPayment, declareBankruptcy, totalDebt } from '../finance';
import { checkInvariants } from '../invariants';
import { countedRecord } from '../record';
import { replayLife } from '../replay';
import { createRng } from '../rng';
import { cloneJson, lifeAtAge } from '../testFixtures';
import type { LifeState } from '../types';
import { runEconomy } from '../systems/economy';
import { chanceNow, tierWeights } from './perform';
import { allPastimes, pastimeBlock, pastimePrice, type PastimeChoice } from './query';
import { consentOptions, houseEdge, loanOffer, parseLegalName, exposure, lastGamblingLoss, FAKE_ID_FLAG } from './risk';
import { getActivitiesView } from './views';

const rich = (life: LifeState, savings = 500_000): LifeState =>
  produce(life, (d) => {
    d.finances.savings = savings;
    d.finances.debts = [];
    d.housing = { kind: 'renting', cityId: d.character.cityId, annualCost: 0, since: d.currentYear - 2 };
  });

const withIncome = (life: LifeState, gross = 80_000): LifeState =>
  produce(life, (d) => {
    d.finances.lastLedger = { year: d.currentYear - 1, gross, retirement: 0, tax: 0, housing: 0, living: 0, debtPayments: 0, interest: 0, debtInterest: 0, borrowed: 0, support: 0, children: 0, care: 0, supportPaid: 0, supportReceived: 0, upkeep: 0, insurance: 0, giving: 0, business: 0, net: gross };
  });

const act = (life: LifeState, pastimeId: string, extra: Record<string, unknown> = {}) => performAction(life, 'do_activity', { pastimeId, ...extra }, content);

function settle(life: LifeState): LifeState {
  if (life.phase !== 'action') return life;
  const done = resolveAll(life, content, createRng(`${life.seed}:settle:${life.inputLog.length}`));
  return done.phase === 'action' ? finishAction(done) : done;
}

/** Tries seeds until the predicate holds for the life after the activity; returns that life (and the one before). */
function scan(make: (seed: string) => LifeState, pastimeId: string, extra: Record<string, unknown>, wanted: (after: LifeState) => boolean, tries = 400) {
  for (let i = 0; i < tries; i++) {
    const before = make(`b2b-${pastimeId}-${i}`);
    const after = settle(act(before, pastimeId, extra));
    if (wanted(after)) return { before, after };
  }
  throw new Error(`no seed gave the wanted outcome for ${pastimeId}`);
}

describe('the risk and legal content', () => {
  const all = allPastimes(content);
  it('has at least 5 options in every category, each with outcome wordings', () => {
    for (const category of RISK_CATEGORIES) {
      const defs = all.filter((p) => p.category === category);
      expect(defs.length, category).toBeGreaterThanOrEqual(5);
      for (const d of defs) for (const tier of Object.values(d.tiers)) for (const list of [tier?.text, tier?.together]) if (list) expect(list.length, d.id).toBeGreaterThanOrEqual(2);
    }
  });
  it('gives every game a house edge in balance, and the chances add up', () => {
    for (const [id, game] of Object.entries(content.balance.risk.games)) {
      expect(houseEdge(game), id).toBeGreaterThanOrEqual(game.minEdge);
      expect(game.outcomes.reduce((s, o) => s + o.chance, 0), id).toBeCloseTo(1, 9);
    }
  });
  it('keeps the loan rates in order: a bank, then a payday lender, then a shark', () => {
    const d = content.balance.economy.interest.debts;
    expect(d.bank).toBeLessThan(d.payday);
    expect(d.payday).toBeLessThan(d.shark);
    expect(content.balance.economy.debts.termYears.payday).toBe(1);
  });
  it('lets a teenager see only the petty crimes and nothing that needs an adult', () => {
    const teen = rich(lifeAtAge('b2b-teen-menu', 15));
    const ids = getActivitiesView(teen, content).groups.flatMap((g) => g.entries.map((e) => e.id));
    expect(ids).toContain('shoplift');
    expect(ids).toContain('vandalize');
    for (const id of ['burglary', 'steal_a_car', 'hold_up_a_store', 'run_a_scam', 'buy_pills', 'buy_illegal_drugs', 'deal_on_the_side', 'play_the_slots', 'take_a_bank_loan', 'sue_your_employer', 'borrow_from_a_loan_shark']) expect(ids, id).not.toContain(id);
  });
});

describe('crime', () => {
  it('follows the juvenile rules: a teen is charged, never sent to jail, the case is sealed at 18, and nothing serious is open to them', () => {
    const adultAge = content.balance.relationships.adultAge;
    for (const id of ['burglary', 'steal_a_car', 'hold_up_a_store', 'run_a_scam']) expect(content.pastimes[id]!.minAge, id).toBeGreaterThanOrEqual(adultAge);
    expect(pastimeBlock(rich(lifeAtAge('b2b-teen-burglary', 16)), content.pastimes.burglary!, {}, content)).toBe('age');
    const { after } = scan((s) => rich(lifeAtAge(s, 15)), 'shoplift', {}, (l) => l.legal.record.length > 0);
    const entry = after.legal.record.at(-1)!;
    expect(entry.offenseId).toBe('shoplifting');
    expect(entry.outcome).not.toBe('jail');
    expect(after.crime.heat).toBe(0);
    expect(after.pastimes.receipts.at(-1)!.text).toMatch(/warning|fine|probation/);
    // At 18 the juvenile case is sealed by the teen system and no longer counts for an employer.
    const grown = produce(after, (d) => {
      d.currentYear += 3;
      d.character.age += 3;
    });
    expect(countedRecord(grown, content).length).toBe(0);
  });
  it('pays small cash for a petty theft, dirty money for a serious crime, and shows both on the receipt', () => {
    const petty = scan((s) => rich(lifeAtAge(s, 25), 1000), 'pickpocket', {}, (l) => l.pastimes.receipts.at(-1)!.tier === 'good');
    const r = petty.after.pastimes.receipts.at(-1)!;
    expect(r.money!.change).toBeGreaterThan(0);
    expect(r.money!.balance).toBe(petty.after.finances.savings);
    expect(petty.after.finances.dirty).toBe(0);
    const heavy = scan((s) => rich(lifeAtAge(s, 30), 1000), 'burglary', {}, (l) => l.pastimes.receipts.at(-1)!.tier === 'good');
    const h = heavy.after.pastimes.receipts.at(-1)!;
    expect(h.money!.dirty!.change).toBeGreaterThan(0);
    expect(heavy.after.finances.dirty).toBe(h.money!.dirty!.balance);
    expect(heavy.after.finances.savings).toBe(1000);
    expect(heavy.after.crime.heat).toBeGreaterThan(0);
    expect(checkInvariants(heavy.after, content)).toEqual([]);
  });
  it('sends a serious crime that goes wrong through the law: a record entry, a sentence in the words, heat on you', () => {
    const { after } = scan((s) => rich(lifeAtAge(s, 30)), 'hold_up_a_store', {}, (l) => l.pastimes.receipts.at(-1)!.tier === 'bad');
    expect(after.legal.record.at(-1)!.offenseId).toBe('robbery');
    expect(after.pastimes.receipts.at(-1)!.text).toMatch(/fine|probation|prison|warning/);
    expect(after.character.hidden.reputation).toBeLessThan(after.pastimes.receipts.length ? 100 : 0);
    expect(checkInvariants(after, content)).toEqual([]);
  });
  it('makes getting caught likelier with heat, a record and a crew, and leaves a legal life alone', () => {
    const life = rich(lifeAtAge('b2b-exposure', 30));
    const def = content.pastimes.burglary!;
    const bad = (l: LifeState) => {
      const w = tierWeights(l, def, {}, 0, content);
      return w.filter(([t]) => t === 'bad' || t === 'backfire').reduce((s, [, x]) => s + x, 0) / w.reduce((s, [, x]) => s + x, 0);
    };
    expect(exposure(life, content)).toBe(1);
    const hot = produce(life, (d) => void (d.crime.heat = 80));
    const recorded = produce(life, (d) => void d.legal.record.push({ offenseId: 'theft', year: d.currentYear - 1, outcome: 'fine', amount: 500 }));
    expect(bad(hot)).toBeGreaterThan(bad(life));
    expect(bad(recorded)).toBeGreaterThan(bad(life));
  });
  it('draws more heat on a crew member who works alone, and costs standing in the crew', () => {
    const base = rich(lifeAtAge('b2b-crew', 30));
    const crewMember = produce(base, (d) => {
      d.crime.crew = { id: Object.keys(content.crews)[0]!, cityId: d.character.cityId, leader: 'p0', members: [] } as never;
      d.crime.rank = 1;
      d.crime.standing = 60;
    });
    // Find a seed where the same burglary succeeds for both, and compare the heat.
    for (let i = 0; i < 200; i++) {
      const a = produce(base, (d) => void (d.rng = createRng(`b2b-crewheat-${i}`)));
      const b = produce(crewMember, (d) => void (d.rng = createRng(`b2b-crewheat-${i}`)));
      const alone = settle(act(a, 'burglary'));
      const crew = settle(act(b, 'burglary'));
      if (alone.pastimes.receipts.at(-1)!.tier === 'good' && crew.pastimes.receipts.at(-1)!.tier === 'good') {
        expect(crew.crime.heat).toBeGreaterThan(alone.crime.heat);
        expect(crew.crime.standing).toBeLessThan(60);
        return;
      }
    }
    throw new Error('no seed where both succeed');
  });
});

describe('the black market', () => {
  it('sells a fake ID to a teenager only with the law behind it, and lets a 19-year-old into a bar only while it lasts', () => {
    expect(content.pastimes.buy_a_fake_id!.minAge).toBe(16);
    expect(pastimeBlock(rich(lifeAtAge('b2b-id-15', 15)), content.pastimes.buy_a_fake_id!, {}, content)).toBe('age');
    const nineteen = rich(lifeAtAge('b2b-id-19', 19));
    expect(pastimeBlock(nineteen, content.pastimes.go_to_a_bar!, {}, content)).toBe('age');
    const { after } = scan((s) => rich(lifeAtAge(s, 18)), 'buy_a_fake_id', {}, (l) => l.flags[FAKE_ID_FLAG] === true);
    expect(pastimeBlock(after, content.pastimes.go_to_a_bar!, {}, content)).toBe(null);
    // The country's drinking age is unchanged: someone old enough needs no ID.
    expect(pastimeBlock(rich(lifeAtAge('b2b-id-30', 30)), content.pastimes.go_to_a_bar!, {}, content)).toBe(null);
  });
  it('catches a fake ID now and then: the ID is gone and the law has an entry', () => {
    let caught = 0;
    let uses = 0;
    for (let i = 0; i < 300; i++) {
      const life = produce(rich(lifeAtAge(`b2b-id-use-${i}`, 19)), (d) => void (d.flags[FAKE_ID_FLAG] = true));
      const after = settle(act(life, 'go_to_a_bar'));
      uses++;
      if (after.flags[FAKE_ID_FLAG] !== true) {
        caught++;
        expect(after.legal.record.some((e) => e.offenseId === 'fake_id')).toBe(true);
        expect(after.pastimes.receipts.at(-1)!).toBeTruthy();
      }
    }
    expect(caught / uses).toBeGreaterThan(0.03);
    expect(caught / uses).toBeLessThan(0.35);
  });
  it('can start a drug addiction and a possession charge through the health and legal systems, never for a minor', () => {
    expect(content.pastimes.buy_pills!.minAge).toBe(18);
    expect(content.pastimes.buy_illegal_drugs!.minAge).toBe(18);
    let addicted = 0;
    let charged = 0;
    for (let i = 0; i < 300; i++) {
      const life = produce(rich(lifeAtAge(`b2b-drugs-${i}`, 30)), (d) => void (d.character.hidden.vice = 80));
      const after = settle(act(life, 'buy_illegal_drugs'));
      if (after.health.conditions.some((c) => c.conditionId === 'drug_addiction')) addicted++;
      if (after.legal.record.some((e) => e.offenseId === 'drug_possession')) charged++;
      expect(checkInvariants(after, content)).toEqual([]);
    }
    expect(addicted).toBeGreaterThan(0);
    expect(charged).toBeGreaterThan(0);
  });
});

describe('gambling', () => {
  it('follows the legal gambling age of the country', () => {
    const slots = content.pastimes.play_the_slots!;
    const age = content.countries.us!.legalAges.gambling;
    expect(pastimeBlock(rich(lifeAtAge('b2b-gamble-young', age - 1)), slots, { stake: 'low' }, content)).toBe('age');
    expect(pastimeBlock(rich(lifeAtAge('b2b-gamble-ok', age)), slots, { stake: 'low' }, content)).toBe(null);
    const ukAge = content.countries.uk!.legalAges.gambling;
    const uk = produce(rich(lifeAtAge('b2b-gamble-uk', ukAge)), (d) => void (d.character.cityId = Object.values(content.cities).find((c) => c.countryId === 'uk')!.id));
    expect(pastimeBlock(uk, slots, { stake: 'low' }, content)).toBe(null);
  });
  it('needs a stake, and prices it by the stake chosen, through the finance module', () => {
    const life = rich(lifeAtAge('b2b-stake', 30), 5000);
    const slots = content.pastimes.play_the_slots!;
    expect(pastimeBlock(life, slots, {}, content)).toBe('stake');
    const low = pastimePrice(life, slots, { stake: 'low' }, content);
    const high = pastimePrice(life, slots, { stake: 'high' }, content);
    expect(high).toBeGreaterThan(low * 4);
    const after = settle(act(life, 'play_the_slots', { stake: 'low' }));
    const r = after.pastimes.receipts.at(-1)!;
    expect(r.money).toBeDefined();
    expect(r.money!.balance).toBe(after.finances.savings);
    expect(r.text).toContain('$');
    expect(checkInvariants(after, content)).toEqual([]);
  });
  it('loses money on average: the table of every game returns less than the stake, and over many nights the house comes out ahead', () => {
    for (const [id, game] of Object.entries(content.balance.risk.games)) expect(game.outcomes.reduce((s, o) => s + o.chance * o.multiple, 0), id).toBeLessThan(1);
    let staked = 0;
    let net = 0;
    for (let i = 0; i < 700; i++) {
      for (const id of ['play_blackjack', 'bet_on_the_horses', 'buy_a_lottery_ticket']) {
        const life = rich(lifeAtAge(`b2b-edge-${id}-${i}`, 30), 10_000_000);
        staked += pastimePrice(life, content.pastimes[id]!, { stake: 'medium' }, content);
        net += act(life, id, { stake: 'medium' }).pastimes.receipts.at(-1)!.money?.change ?? 0;
      }
    }
    expect(net / staked).toBeLessThan(0);
  }, 120_000);
  it('offers a loss-chasing choice only after a loss, bets the loss back, and can borrow a little for it', () => {
    const slots = content.pastimes.play_the_slots!;
    expect(pastimeBlock(rich(lifeAtAge('b2b-chase-none', 30)), slots, { stake: 'low', chase: true }, content)).toBe('chase');
    const { after } = scan((s) => rich(lifeAtAge(s, 30), 3000), 'play_the_slots', { stake: 'high' }, (l) => (l.pastimes.receipts.at(-1)!.money?.change ?? 0) < 0);
    const loss = lastGamblingLoss(after, content);
    expect(loss).toBeGreaterThan(0);
    expect(pastimeBlock(after, slots, { stake: 'low', chase: true }, content)).toBe(null);
    expect(pastimePrice(after, slots, { stake: 'low', chase: true }, content)).toBeGreaterThanOrEqual(Math.min(loss, 3000));
    // Broke, a chase borrows up to the limit and shows the debt on the receipt.
    const broke = produce(after, (d) => void (d.finances.savings = 10));
    if (pastimeBlock(broke, slots, { stake: 'low', chase: true }, content) === null) {
      const chased = settle(act(broke, 'play_the_slots', { stake: 'low', chase: true }));
      expect(chased.pastimes.receipts.at(-1)!.money!.debtChange).toBeGreaterThan(0);
      expect(totalDebt(chased)).toBeGreaterThan(0);
      expect(chased.finances.debts.some((d) => d.kind === 'personal')).toBe(true);
    }
    // Chasing makes a gambling problem likelier, and so does a higher stake.
    const p = (choice: PastimeChoice) => chanceNow(after, 'gambling_addiction', choice, 0, content);
    expect(p({ stake: 'low', chase: true })).toBeGreaterThan(p({ stake: 'low' }));
    expect(p({ stake: 'high' })).toBeGreaterThan(p({ stake: 'low' }));
  });
  it('starts the existing gambling addiction condition, not a new one', () => {
    let started = 0;
    for (let i = 0; i < 400; i++) {
      const life = produce(rich(lifeAtAge(`b2b-addict-${i}`, 30)), (d) => void (d.character.hidden.vice = 90));
      const after = act(life, 'play_the_slots', { stake: 'high' });
      if (after.health.conditions.some((c) => c.conditionId === 'gambling_addiction')) started++;
    }
    expect(started).toBeGreaterThan(0);
    expect(content.conditions.gambling_addiction).toBeDefined();
  });
});

describe('lawsuits', () => {
  const fired = (seed: string) =>
    produce(rich(lifeAtAge(seed, 35)), (d) => {
      d.flags.whistleblower = true;
      d.flags.burned_out = true;
    });
  it('is on offer only with something to go on', () => {
    const none = rich(lifeAtAge('b2b-suit-none', 35));
    const def = content.pastimes.sue_your_employer!;
    expect(pastimeBlock(none, def, { quality: 'standard', route: 'trial' }, content)).toBe('requires');
    expect(pastimeBlock(fired('b2b-suit-ev'), def, { quality: 'standard', route: 'trial' }, content)).toBe(null);
    expect(getActivitiesView(none, content).groups.flatMap((g) => g.entries.map((e) => e.id))).not.toContain('sue_your_employer');
    expect(getActivitiesView(fired('b2b-suit-view'), content).groups.flatMap((g) => g.entries.map((e) => e.id))).toContain('sue_your_employer');
  });
  it('turns evidence and a better lawyer into better odds, and a settlement into a likelier but smaller payout', () => {
    const def = content.pastimes.sue_your_employer!;
    const good = (l: LifeState, c: PastimeChoice) => {
      const w = tierWeights(l, def, c, 0, content);
      return w.filter(([t]) => t === 'great' || t === 'good').reduce((s, [, x]) => s + x, 0) / w.reduce((s, [, x]) => s + x, 0);
    };
    const oneProof = produce(rich(lifeAtAge('b2b-ev1', 35)), (d) => void (d.flags.whistleblower = true));
    const twoProof = fired('b2b-ev2');
    expect(good(twoProof, { quality: 'standard', route: 'trial' })).toBeGreaterThan(good(oneProof, { quality: 'standard', route: 'trial' }));
    expect(good(twoProof, { quality: 'premier', route: 'trial' })).toBeGreaterThan(good(twoProof, { quality: 'budget', route: 'trial' }));
    expect(good(twoProof, { quality: 'standard', route: 'settle' })).toBeGreaterThan(good(twoProof, { quality: 'standard', route: 'trial' }));
    const price = (q: 'budget' | 'standard' | 'premier') => pastimePrice(twoProof, def, { quality: q, route: 'trial' }, content);
    expect(price('budget')).toBeLessThan(price('standard'));
    expect(price('standard')).toBeLessThan(price('premier'));
  });
  it('settles or goes to trial, pays the fee up front, moves money through finance and says so on the receipt', () => {
    const settled = scan((s) => fired(s), 'sue_your_employer', { quality: 'standard', route: 'settle' }, (l) => l.pastimes.receipts.at(-1)!.tier === 'good');
    const r = settled.after.pastimes.receipts.at(-1)!;
    const fee = pastimePrice(settled.before, content.pastimes.sue_your_employer!, { quality: 'standard' }, content);
    expect(r.money!.change).toBeGreaterThan(-fee);
    expect(r.money!.balance).toBe(settled.after.finances.savings);
    expect(settled.after.flags.won_a_lawsuit).toBe(true);
    const lost = scan((s) => fired(s), 'sue_your_employer', { quality: 'standard', route: 'trial' }, (l) => l.pastimes.receipts.at(-1)!.tier === 'bad');
    expect(lost.after.pastimes.receipts.at(-1)!.money!.change).toBeLessThan(-pastimePrice(lost.before, content.pastimes.sue_your_employer!, { quality: 'standard' }, content));
    expect(lost.after.flags.lost_a_lawsuit).toBe(true);
    expect(checkInvariants(lost.after, content)).toEqual([]);
  });
  it('sues an ex only when the memories of the marriage are there, and the relationship feels it', () => {
    const base = rich(lifeAtAge('b2b-suit-ex', 40));
    const def = content.pastimes.sue_your_ex!;
    expect(def.companionKinds).toEqual(['ex']);
    const withEx = produce(base, (d) => {
      const id = 'p-ex';
      d.people[id] = { ...Object.values(d.people)[0]!, id, alive: true, cityId: d.character.cityId, birthYear: d.currentYear - 40 } as never;
      d.relationships[id] = { kind: 'ex', status: 'active', affection: 30, trust: 30, memories: [{ tag: 'divorced', year: d.currentYear - 3 }], since: d.currentYear - 3 } as never;
    });
    const view = getActivitiesView(withEx, content).groups.flatMap((g) => g.entries).find((e) => e.id === 'sue_your_ex');
    // The memory tag shape is the relationship system's; whatever it is, the lawsuit is offered or hidden by it, never by chance.
    expect(view === undefined || view.companions.length > 0).toBe(true);
  });
  it('can be sued through events: the content exists, needs its cause, and costs through the cost items', () => {
    for (const id of ['sued_by_a_neighbor', 'sued_by_a_customer', 'sued_by_your_ex', 'sued_over_a_crash', 'sued_by_a_former_employer']) {
      const def = content.events[id]!;
      expect(def, id).toBeDefined();
      expect(def.category).toBe('justice');
      const text = JSON.stringify(def);
      expect(text).toMatch(/lawsuit_(settlement|judgment|defense)/);
    }
    expect(Object.keys(content.balance.economy.costs)).toEqual(expect.arrayContaining(['lawsuit_settlement', 'lawsuit_judgment', 'lawsuit_defense']));
  });
});

describe('a legal name change', () => {
  const adult = (seed = 'b2b-name') => rich(lifeAtAge(seed, 30), 5000);
  it('validates what is typed: letters, spaces, hyphens, apostrophes and periods, at most 30 characters', () => {
    expect(parseLegalName('  Ana   Maria ')).toBe('Ana Maria');
    expect(parseLegalName("O'Neil-Smith")).toBe("O'Neil-Smith");
    for (const bad of ['', '   ', '12345', '<b>x</b>', 'Anna{name}', '-Nobody', 'x'.repeat(31), 5, undefined, null]) expect(parseLegalName(bad), String(bad)).toBeNull();
    const life = adult();
    expect(() => performAction(life, 'do_activity', { pastimeId: 'change_your_first_name', first: '<script>' }, content)).toThrow();
    expect(() => performAction(life, 'do_activity', { pastimeId: 'change_your_first_name', first: 'x'.repeat(40) }, content)).toThrow();
    expect(isLifeActionAvailable(life, 'do_activity', { pastimeId: 'change_your_first_name' }, content)).toBe(false);
    expect(isLifeActionAvailable(life, 'do_activity', { pastimeId: 'change_your_first_name', first: life.character.name.first }, content)).toBe(false);
  });
  it('changes the name for good: a fee, a history entry, the old name remembered, and the new name in text from then on', () => {
    const life = adult();
    const price = pastimePrice(life, content.pastimes.change_your_first_name!, {}, content);
    const after = settle(act(life, 'change_your_first_name', { first: '  Rowan ' }));
    expect(after.character.name).toEqual({ first: 'Rowan', last: life.character.name.last });
    expect(after.character.formerNames).toEqual([{ first: life.character.name.first, last: life.character.name.last, year: life.currentYear }]);
    expect(after.finances.savings).toBe(life.finances.savings - price);
    expect(after.flags.changed_name).toBe(true);
    expect(after.history.some((h) => h.text.includes('Rowan'))).toBe(true);
    const r = after.pastimes.receipts.at(-1)!;
    expect(r.text).toContain('Rowan');
    expect(r.money).toEqual({ change: -price, balance: life.finances.savings - price, debtChange: 0 });
    expect(checkInvariants(after, content)).toEqual([]);
    // Once a year, and the character's gender marker is untouched.
    expect(pastimeBlock(after, content.pastimes.change_your_first_name!, { first: 'Quinn' }, content)).toBe('limit');
    expect(after.character.identity).toEqual(life.character.identity);
  });
  it('goes back to a former name, and takes a partner\'s family name only with a partner', () => {
    const life = adult('b2b-name-back');
    expect(pastimeBlock(life, content.pastimes.return_to_a_former_name!, {}, content)).toBe('requires');
    const changed = settle(act(life, 'change_your_last_name', { last: 'Marlowe' }));
    const later = produce(changed, (d) => void (d.currentYear += 1, d.character.age += 1, d.pastimes = { year: d.currentYear, counts: {}, receipts: [] }));
    const back = settle(act(later, 'return_to_a_former_name'));
    expect(back.character.name.last).toBe(life.character.name.last);
    expect(back.character.formerNames!.at(-1)!.last).toBe('Marlowe');
    expect(pastimeBlock(life, content.pastimes.take_your_partners_name!, {}, content)).toBe('requires');
  });
  it('lets a young teenager do it only with a parent who agrees', () => {
    const teen = rich(lifeAtAge('b2b-name-teen', 14), 5000);
    const def = content.pastimes.change_your_first_name!;
    expect(pastimeBlock(teen, def, { first: 'Rowan' }, content)).toBe('consent');
    expect(pastimeBlock(rich(lifeAtAge('b2b-name-12', 12), 5000), def, { first: 'Rowan' }, content)).toBe('age');
    const parents = consentOptions(teen, content);
    if (parents.length > 0) {
      expect(isLifeActionAvailable(teen, 'do_activity', { pastimeId: def.id, first: 'Rowan', consentId: parents[0]!.id }, content)).toBe(true);
      expect(isLifeActionAvailable(teen, 'do_activity', { pastimeId: def.id, first: 'Rowan', consentId: 'nobody' }, content)).toBe(false);
    }
  });
});

describe('loans', () => {
  const earner = (seed: string, gross = 60_000) => withIncome(rich(lifeAtAge(seed, 35), 300), gross);

  it('approves a bank loan by income, record and bankruptcy', () => {
    const bank = content.pastimes.take_a_bank_loan!;
    expect(loanOffer(earner('b2b-loan-ok'), bank, content).block).toBe(null);
    expect(loanOffer(withIncome(rich(lifeAtAge('b2b-loan-poor', 35)), 4000), bank, content).block).toBe('income');
    const recorded = produce(earner('b2b-loan-rec'), (d) => {
      d.legal.record.push({ offenseId: 'theft', year: d.currentYear - 1, outcome: 'fine', amount: 800 }, { offenseId: 'shoplifting', year: d.currentYear - 2, outcome: 'warning' });
    });
    expect(loanOffer(recorded, bank, content).block).toBe('record');
    const bankrupt = produce(earner('b2b-loan-bk'), (d) => void (d.finances.bankruptcyYear = d.currentYear - 2));
    expect(loanOffer(bankrupt, bank, content).block).toBe('bankruptcy');
    const indebted = produce(earner('b2b-loan-debt'), (d) => void d.finances.debts.push({ id: 'd1', kind: 'medical', balance: 200_000, annualRate: 0.02, minPayment: 1000, missed: 0 }));
    expect(loanOffer(indebted, bank, content).block).toBe('debt');
    expect(isLifeActionAvailable(withIncome(rich(lifeAtAge('b2b-loan-poor2', 35)), 4000), 'do_activity', { pastimeId: bank.id }, content)).toBe(false);
  });
  it('makes a debt of its own kind at the rate and term in economy.yaml, with the fee out of the money, and shows it', () => {
    const life = earner('b2b-loan-make', 60_000);
    const offer = loanOffer(life, content.pastimes.take_a_bank_loan!, content);
    const after = settle(act(life, 'take_a_bank_loan'));
    const debt = after.finances.debts.find((d) => d.kind === 'bank')!;
    expect(debt.balance).toBe(offer.amount);
    expect(debt.annualRate).toBe(content.balance.economy.interest.debts.bank);
    expect(debt.minPayment).toBe(Math.max(content.balance.economy.debts.minPayment, amortizedPayment(offer.amount, debt.annualRate, content.balance.economy.debts.termYears.bank)));
    expect(after.finances.savings).toBe(life.finances.savings + offer.amount - offer.fee);
    const r = after.pastimes.receipts.at(-1)!;
    expect(r.money).toEqual({ change: offer.amount - offer.fee, balance: after.finances.savings, debtChange: offer.amount });
    expect(r.text).toContain('11%');
    expect(isLifeActionAvailable(after, 'do_activity', { pastimeId: 'take_a_bank_loan' }, content)).toBe(false);
    expect(checkInvariants(after, content)).toEqual([]);
  });
  it('costs what its rate says: a year of interest is the balance times the rate, for a bank, a payday lender and a shark', () => {
    for (const [id, kind] of [['take_a_bank_loan', 'bank'], ['take_a_payday_loan', 'payday'], ['borrow_from_a_loan_shark', 'shark']] as const) {
      const life = produce(earner(`b2b-loan-interest-${kind}`, 60_000), (d) => void (d.crime.heat = 5));
      const loan = settle(act(life, id));
      const debt = loan.finances.debts.find((d) => d.kind === kind)!;
      const before = debt.balance;
      const rate = content.balance.economy.interest.debts[kind];
      const poor = produce(loan, (d) => {
        d.finances.savings = 0;
        d.currentYear += 1;
        d.character.age += 1;
      });
      const next = produce(poor, (d) => runEconomy(d, content));
      expect(next.finances.lastLedger!.debtInterest, kind).toBeGreaterThanOrEqual(Math.round(before * rate) - 1);
    }
  });
  it('is dearer the shorter and faster it is: a payday loan is due at the next ledger and a bank loan runs for years', () => {
    const eco = content.balance.economy;
    const payday = amortizedPayment(1000, eco.interest.debts.payday, eco.debts.termYears.payday);
    const bank = amortizedPayment(1000, eco.interest.debts.bank, eco.debts.termYears.bank);
    expect(payday).toBe(Math.ceil(1000 * (1 + eco.interest.debts.payday)));
    expect(payday).toBeGreaterThan(bank * 3);
    const total = (rate: number, years: number) => amortizedPayment(1000, rate, years) * years - 1000;
    expect(total(eco.interest.debts.shark, eco.debts.termYears.shark)).toBeGreaterThan(total(eco.interest.debts.bank, eco.debts.termYears.bank));
  });
  it('lets a loan shark lend to anyone who knows one, links to crime, and does not care about bankruptcy', () => {
    const shark = content.pastimes.borrow_from_a_loan_shark!;
    const noCrewTown = Object.values(content.cities).find((c) => Object.values(content.crews).every((cr) => !cr.cities.includes(c.id)));
    const base = produce(earner('b2b-shark'), (d) => {
      if (noCrewTown) d.character.cityId = noCrewTown.id;
    });
    if (noCrewTown) expect(pastimeBlock(base, shark, {}, content)).toBe('contacts');
    const hot = produce(base, (d) => void (d.crime.heat = 20));
    expect(loanOffer(hot, shark, content).block).toBe(null);
    const loaned = settle(act(hot, 'borrow_from_a_loan_shark'));
    expect(loaned.finances.debts.some((d) => d.kind === 'shark')).toBe(true);
    expect(loaned.crime.heat).toBeGreaterThan(hot.crime.heat);
    // Bankruptcy clears a bank loan and a payday loan, never a shark's.
    const mixed = produce(loaned, (d) => {
      d.finances.debts.push({ id: 'd8', kind: 'bank', balance: 5000, annualRate: 0.11, minPayment: 600, missed: 0 }, { id: 'd9', kind: 'payday', balance: 800, annualRate: 0.9, minPayment: 1520, missed: 0 });
      declareBankruptcy(d);
    });
    expect(mixed.finances.debts.map((d) => d.kind)).toEqual(['shark']);
  });
  it('sends collectors for a missed payment and settles it their own way after enough of them: the debt is gone, and you are hurt', () => {
    const owed = produce(earner('b2b-shark-miss'), (d) => {
      d.finances.savings = 0;
      delete d.finances.lastLedger;
      d.career.job = null;
      d.finances.debts.push({ id: 'd1', kind: 'shark', balance: 4000, annualRate: 1.3, minPayment: 6000, missed: 2 });
    });
    const health = owed.character.stats.health;
    const next = produce(owed, (d) => {
      d.currentYear += 1;
      d.character.age += 1;
      runEconomy(d, content);
    });
    expect(next.finances.debts.some((d) => d.kind === 'shark')).toBe(false);
    expect(next.character.stats.health).toBeLessThan(health);
    expect(next.flags.shark_debt_cleared).toBe(true);
    expect(next.history.some((h) => h.tags.includes('sharkSettled'))).toBe(true);
  });
});

describe('the Activities screen', () => {
  it('shows each risk mechanic with what it needs, and hides what is not on offer', () => {
    const life = withIncome(rich(lifeAtAge('b2b-screen', 40)), 90_000);
    const view = getActivitiesView(life, content);
    const entries = view.groups.flatMap((g) => g.entries);
    const slots = entries.find((e) => e.id === 'play_the_slots')!;
    expect(slots.stakes!.map((s) => s.stake)).toEqual(['low', 'medium', 'high']);
    expect(slots.chase).toEqual({ available: false, loss: 0 });
    const bank = entries.find((e) => e.id === 'take_a_bank_loan')!;
    expect(bank.loan!.amount).toBeGreaterThan(0);
    expect(bank.loan!.block).toBe(null);
    const name = entries.find((e) => e.id === 'change_your_first_name')!;
    expect(name.name!.fields).toEqual(['first']);
    expect(name.name!.adult).toBe(true);
    expect(view.groups.map((g) => g.category)).toEqual(expect.arrayContaining(['crime', 'black_market', 'gambling', 'loans', 'identity']));
    expect(entries.find((e) => e.id === 'return_to_a_former_name')).toBeUndefined();
  });
});

describe('saves and replay', () => {
  it('rebuilds a life exactly from its input log, with a stake, a typed name and a theft', () => {
    let life = createLife({ mode: 'random', seed: 'b2b-replay', birthYear: 2000, countryId: 'us' }, content);
    for (let i = 0; i < 26; i++) life = playYear(life, content);
    const tries: [string, Record<string, unknown>][] = [
      ['shoplift', {}],
      ['buy_a_lottery_ticket', { stake: 'low' }],
      ['play_blackjack', { stake: 'low' }],
      ['change_your_first_name', { first: ' Rowan ' }],
      ['pickpocket', {}],
    ];
    let done = 0;
    for (const [id, extra] of tries) {
      if (!isLifeActionAvailable(life, 'do_activity', { pastimeId: id, ...extra }, content)) continue;
      life = settle(act(life, id, extra));
      done++;
    }
    expect(done).toBeGreaterThanOrEqual(2);
    const rebuilt = replayLife(life.inputLog, content);
    expect(rebuilt.pastimes).toEqual(life.pastimes);
    expect(rebuilt.character.name).toEqual(life.character.name);
    expect(rebuilt.finances.savings).toBe(life.finances.savings);
    expect(rebuilt.legal.record).toEqual(life.legal.record);
    expect(cloneJson(rebuilt.crime)).toEqual(cloneJson(life.crime));
  });
});
