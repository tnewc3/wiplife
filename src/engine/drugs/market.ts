/**
 * Buying drugs (D1) from a dealer you know, a friend who knows someone (a contact), a night out, or the black market. Each
 * source has its own price mark-up, batch quality and risks: being taken for nothing, a bad batch, a robbery, or being
 * caught (more likely with heat and a record). What you buy joins your stock (a stash, with a hidden option). Buying for
 * resale is for adults, like all buying. Story and consequences only. Numbers: balance/drugs.yaml (sources, buy).
 */
import type { ContentBundle, DrugSource } from '../../content/schemas';
import { createPerson } from '../events/casting';
import { isIncarcerated } from '../legal';
import { addHeat } from '../crime/money';
import { spend } from '../finance';
import { clampInt, rollNormal } from '../random';
import { unsealedRecord } from '../record';
import { chance, nextInt } from '../rng';
import type { Id, LifeState } from '../types';
import { charge } from './legal';
import { drugDef, isAdult, liveDealers, rollYear, unitPrice } from './query';
import { dollarText, note, say, unitsText } from './text';

export type BuyBlock = 'age' | 'jail' | 'drug' | 'source' | 'amount' | 'money' | 'cap' | 'resale';

/** A friend or acquaintance who might know someone: an adult you know who is still in your life. */
export function contactPeople(state: LifeState, content: ContentBundle): Id[] {
  return Object.values(state.relationships)
    .filter((r) => (r.kind === 'friend' || r.kind === 'acquaintance' || r.kind === 'coworker') && r.status === 'active' && state.people[r.personId]?.alive === true && !state.drugs.dealers.includes(r.personId))
    .filter((r) => {
      const p = state.people[r.personId]!;
      return state.currentYear - p.birthYear >= content.balance.drugs.ages.adult;
    })
    .map((r) => r.personId)
    .sort();
}

/** Whether a night out this year opens the nightlife source. */
export function nightlifeOpen(state: LifeState, content: ContentBundle): boolean {
  const p = state.pastimes;
  if (p.year !== state.currentYear) return false;
  return Object.keys(p.counts).some((id) => {
    const hub = content.pastimes[id]?.hub;
    return hub === 'nightlife' || hub === 'parties';
  });
}

/** The sources open to you for a drug now. */
export function sourcesFor(state: LifeState, drugId: Id, content: ContentBundle): DrugSource[] {
  const def = drugDef(content, drugId);
  if (!def || !isAdult(state, content) || isIncarcerated(state)) return [];
  return def.sources.filter((s) => {
    if (s === 'dealer') return liveDealers(state).length > 0;
    if (s === 'contact') return contactPeople(state, content).length > 0 || liveDealers(state).length > 0;
    if (s === 'nightlife') return nightlifeOpen(state, content);
    return true;
  });
}

export interface Quote {
  unit: number;
  total: number;
  /** The share off the unit price for buying in bulk for resale. */
  discount: number;
}

export function quote(state: LifeState, drugId: Id, source: DrugSource, units: number, resale: boolean, content: ContentBundle): Quote | null {
  const def = drugDef(content, drugId);
  if (!def) return null;
  const q = content.balance.drugs.sources[source].quality.mean;
  const discount = resale && units >= content.balance.drugs.dealing.resaleMin ? content.balance.drugs.buy.bulkDiscount : 0;
  const unit = Math.max(1, Math.round(unitPrice(state, def, source, q, content) * (1 - discount)));
  return { unit, total: unit * units, discount };
}

export function buyBlock(state: LifeState, drugId: Id, source: DrugSource, units: number, resale: boolean, content: ContentBundle): BuyBlock | null {
  const def = drugDef(content, drugId);
  if (!def) return 'drug';
  if (!isAdult(state, content)) return 'age';
  if (isIncarcerated(state)) return 'jail';
  if (!content.balance.drugs.buy.amounts.includes(units)) return 'amount';
  if (!sourcesFor(state, drugId, content).includes(source)) return 'source';
  if (resale && (units < content.balance.drugs.dealing.resaleMin || state.drugs.dealing === null)) return 'resale';
  const held = state.drugs.stock[drugId]?.units ?? 0;
  if (held + units > content.balance.drugs.buy.cap) return 'cap';
  const q = quote(state, drugId, source, units, resale, content)!;
  if (q.total > state.finances.savings) return 'money';
  return null;
}

/** The chance you are caught on a deal: the source's, plus heat, times your record. */
export function caughtChance(state: LifeState, source: DrugSource, content: ContentBundle): number {
  const b = content.balance.drugs;
  const record = Math.min(b.buy.recordMax, unsealedRecord(state).length);
  return Math.min(0.5, (b.sources[source].arrest + state.crime.heat * b.buy.heat) * b.buy.record ** record);
}

/** Adds units of a given quality to a stock, averaging the quality. */
export function addStock(state: LifeState, drugId: Id, units: number, quality: number): void {
  const s = state.drugs.stock[drugId];
  if (!s) {
    state.drugs.stock[drugId] = { units, quality: clampInt(quality, 0, 100), hidden: false };
    return;
  }
  s.quality = clampInt((s.quality * s.units + quality * units) / (s.units + units), 0, 100);
  s.units += units;
}

/**
 * You buy `units` of a drug from a source (the caller has checked `buyBlock`). What comes of it is rolled in this order:
 * caught, robbed, taken for nothing, a bad batch, else a fair deal. The result is in `drugs.last`.
 */
export function buy(state: LifeState, drugId: Id, source: DrugSource, units: number, resale: boolean, content: ContentBundle): void {
  const def = drugDef(content, drugId)!;
  const b = content.balance.drugs;
  const src = b.sources[source];
  rollYear(state);
  const q = quote(state, drugId, source, units, resale, content)!;
  const total = Math.round(q.total * (0.95 + nextInt(state.rng, 0, 10) / 100));
  const drug = def.noun;
  const values = { drug, units: unitsText(units, def), amount: dollarText(state, total, content), source: sourceWord(source, content) };
  const done = (kind: string, text: string, amount: number): void => {
    state.drugs.last = { action: 'buy', kind, drugId, units, amount, balance: state.finances.savings, note: text };
  };

  // Caught: the police are there, or the deal was a trap. You hold what you bought for a moment (and what you had); the court decides.
  if (chance(state.rng, caughtChance(state, source, content))) {
    spend(state, total, content);
    state.drugs.year.spent += total;
    state.drugs.totals.spent += total;
    addStock(state, drugId, units, src.quality.mean);
    say(state, 'caught', values, content);
    const result = charge(state, resale ? 'selling' : 'holding', content, { drugId });
    done('caught', note('caught', { ...values, sentence: result ? describe(result.outcome, content) : '' }, content), total);
    return;
  }
  // Robbed: the product and some of your cash.
  if (chance(state.rng, src.robbed)) {
    const cash = Math.min(state.finances.savings, Math.round(state.finances.savings * b.buy.robbedCash * Math.min(1, total / Math.max(1, state.finances.savings))));
    const lost = Math.min(state.finances.savings, total + cash);
    state.finances.savings -= lost;
    state.drugs.totals.robbed += 1;
    state.drugs.totals.spent += lost;
    state.drugs.year.spent += lost;
    say(state, 'robbed', { ...values, amount: dollarText(state, lost, content) }, content);
    state.character.stats.stress = clampInt(state.character.stats.stress + 6, 0, 100);
    done('robbed', note('robbed', { drug, amount: dollarText(state, lost, content) }, content), lost);
    return;
  }
  // Taken for nothing.
  if (chance(state.rng, src.ripoff)) {
    spend(state, total, content);
    state.drugs.totals.ripoffs += 1;
    state.drugs.totals.spent += total;
    state.drugs.year.spent += total;
    say(state, 'ripoff', values, content);
    done('ripoff', note('ripoff', { source: values.source, amount: values.amount }, content), total);
    return;
  }
  // A batch that is weak or cut, or a fair one.
  const bad = chance(state.rng, src.bad);
  const quality = bad ? clampInt(nextInt(state.rng, 2, b.buy.badQuality), 0, 100) : clampInt(rollNormal(state.rng, src.quality), 20, 100);
  spend(state, total, content);
  addStock(state, drugId, units, quality);
  state.drugs.year.bought += units;
  state.drugs.year.spent += total;
  state.drugs.totals.bought += units;
  state.drugs.totals.spent += total;
  if (resale) addHeat(state, b.buy.heatResale);
  else addHeat(state, b.buy.heatBuy);
  say(state, bad ? 'badBatch' : resale ? 'boughtResale' : 'bought', values, content);
  done(bad ? 'bad' : 'fine', note(bad ? 'badBatch' : 'fine', values, content), total);
}

function describe(outcome: string, content: ContentBundle): string {
  const key = outcome === 'jail' ? 'sentenceJail' : outcome === 'probation' ? 'sentenceProbation' : outcome === 'fine' ? 'sentenceFine' : 'sentenceWarning';
  return note(key, {}, content);
}

const SOURCE_NOTES = { dealer: 'sourceDealer', contact: 'sourceContact', nightlife: 'sourceNightlife', market: 'sourceMarket' } as const;

function sourceWord(source: DrugSource, content: ContentBundle): string {
  return note(SOURCE_NOTES[source], {}, content);
}

/** Hides or reveals a stash of one drug. */
export function setHidden(state: LifeState, drugId: Id, hidden: boolean): boolean {
  const s = state.drugs.stock[drugId];
  if (!s) return false;
  s.hidden = hidden;
  return true;
}

/** Why you can't ask a friend to put you in touch with a dealer, or null. */
export type IntroBlock = 'age' | 'jail' | 'nobody' | 'dealers';

export function introBlock(state: LifeState, content: ContentBundle): IntroBlock | null {
  if (!isAdult(state, content)) return 'age';
  if (isIncarcerated(state)) return 'jail';
  if (liveDealers(state).length >= content.balance.drugs.buy.dealersMax) return 'dealers';
  if (contactPeople(state, content).length === 0) return 'nobody';
  return null;
}

/** You ask a friend if they know someone. They may; a dealer joins your people. Returns whether one did. */
export function meetDealer(state: LifeState, content: ContentBundle): boolean {
  const b = content.balance.drugs.buy;
  state.drugs.last = null;
  if (!chance(state.rng, b.introduce)) {
    state.drugs.last = { action: 'dealer', kind: 'none', amount: 0, balance: state.finances.savings, note: note('noDealer', {}, content) };
    return false;
  }
  const id = createPerson(state, { kind: 'acquaintance', presence: 'city', age: b.dealerAge }, state.rng, content);
  if (id === null) return false;
  state.people[id]!.tags.push('dealer');
  state.drugs.dealers.push(id);
  const p = state.people[id]!;
  say(state, 'dealerMet', { name: `${p.name.first} ${p.name.last}` }, content);
  state.drugs.last = { action: 'dealer', kind: 'met', amount: 0, balance: state.finances.savings, note: note('dealerMet', { name: `${p.name.first} ${p.name.last}` }, content) };
  return true;
}
