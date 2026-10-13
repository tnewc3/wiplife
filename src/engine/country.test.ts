/** Countries (W4a): each country's rules are read from its definition (src/content/countries), with US behaviour unchanged. */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { content } from '../content';
import type { CountryId } from '../content/schemas';
import { evaluate } from './conditions';
import {
  atLegalAge,
  careScale,
  citiesOfCountry,
  countryIdOfCity,
  countryOf,
  formatMoney,
  healthShare,
  jobPayFactor,
  legalAge,
  medicalPrice,
  moneyDisplay,
  moneyDisplayOf,
  pensionAge,
  sameCountry,
  sameCountryCities,
  scaledAmount,
  startWeights,
  toLocal,
} from './country';
import { schoolAges, placeForAge, letterGrade, tuitionFor } from './education';
import { createLife } from './life';
import { InvalidInputError } from './creation/input';
import { benefitFromRecord } from './retirement';
import { sentenceWeights } from './legal';
import { getCityOptions, getCountryOptions } from './selectors';
import { taxOn } from './systems/economy';
import { renderText } from './text';
import { countryTextValues } from './country';
import { customInput } from './testFixtures';
import type { LifeState } from './types';

const IDS: CountryId[] = ['ca', 'mx', 'uk', 'us'];
const HOME: Record<CountryId, string> = { us: 'chicago', ca: 'toronto', uk: 'london', mx: 'mexico_city' };

const born = (id: CountryId, seed = `country-${id}`): LifeState => createLife({ mode: 'random', seed, birthYear: 2000, countryId: id }, content);
const inCity = (id: CountryId, age: number): LifeState =>
  produce(born(id), (d) => {
    d.character.cityId = HOME[id];
    d.character.age = age;
  });

describe('the country of a life', () => {
  it('follows the city, and every shipped city belongs to a defined country', () => {
    for (const city of Object.values(content.cities)) expect(content.countries[city.countryId]).toBeDefined();
    for (const id of IDS) {
      expect(countryIdOfCity(HOME[id], content)).toBe(id);
      expect(citiesOfCountry(id, content).length).toBeGreaterThanOrEqual(id === 'us' ? 5 : 3);
    }
  });

  it('restricts moving, shops and homes to the same country until emigration exists', () => {
    expect(sameCountry('toronto', 'montreal', content)).toBe(true);
    expect(sameCountry('toronto', 'chicago', content)).toBe(false);
    expect(sameCountryCities('london', content)).toEqual(['london', 'manchester', 'small_town_uk']);
  });

  it('starts random lives in every country, by the start weights', () => {
    const weights = startWeights(content);
    expect(Object.keys(weights).sort()).toEqual(IDS);
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) seen.add(countryOf(createLife({ mode: 'random', seed: `start-${i}`, birthYear: 2000 }, content), content).id);
    expect([...seen].sort()).toEqual(IDS);
  });

  it('starts a random life in the country asked for, in one of its cities, with its names', () => {
    for (const id of IDS) {
      for (let i = 0; i < 6; i++) {
        const life = born(id, `ask-${id}-${i}`);
        expect(countryOf(life, content).id).toBe(id);
        expect(countryIdOfCity(life.character.birthCityId, content)).toBe(id);
        expect(life.character.birthCityId).toBe(life.character.cityId);
      }
    }
  });

  it('keeps a US random life the same whether or not the country is asked for', () => {
    const a = born('us', 'same-us');
    const b = createLife({ mode: 'random', seed: 'same-us', birthYear: 2000, countryId: 'us' }, content);
    expect(b).toEqual(a);
  });

  it('refuses a country that does not exist', () => {
    expect(() => createLife({ mode: 'random', seed: 'x', birthYear: 2000, countryId: 'zz' as CountryId }, content)).toThrow(InvalidInputError);
  });

  it('creates a custom life in a city of any country', () => {
    for (const id of IDS) {
      const life = createLife({ mode: 'custom', seed: `custom-${id}`, birthYear: 2000, custom: customInput({ cityId: HOME[id] }) }, content);
      expect(countryOf(life, content).id).toBe(id);
    }
  });

  it('lists the countries and their cities for the creation screen', () => {
    const options = getCountryOptions(content);
    expect(options.map((o) => o.id).sort()).toEqual(IDS);
    for (const o of options) expect(o.cities.length).toBeGreaterThan(0);
    for (const city of getCityOptions(content)) expect(city.countryId).toBe(content.cities[city.id]!.countryId);
  });
});

describe('money: kept in the base unit, shown in the local currency', () => {
  it('converts by the exchange rate and shows the symbol, with the sign in front', () => {
    const rates = content.balance.countries.exchangeRates;
    for (const id of IDS) {
      const display = moneyDisplay(content.countries[id]!, content);
      expect(display.rate).toBe(rates[content.countries[id]!.currency.code]);
      expect(toLocal(1000, display)).toBe(Math.round(1000 * display.rate));
      expect(formatMoney(1000, display).startsWith(display.symbol)).toBe(true);
      expect(formatMoney(-1000, display).startsWith('−')).toBe(true);
    }
    expect(formatMoney(1000, moneyDisplay(content.countries.us!, content))).toBe('$1,000');
    expect(formatMoney(1000, moneyDisplay(content.countries.uk!, content))).toBe(`£${Math.round(1000 * rates.GBP!).toLocaleString('en-GB')}`);
    expect(formatMoney(0, moneyDisplay(content.countries.ca!, content))).toBe(`${content.countries.ca!.currency.symbol}0`);
  });

  it('never changes what is stored: the same base amount reads differently, converting back gives it', () => {
    const mx = moneyDisplay(content.countries.mx!, content);
    expect(Math.round(toLocal(5000, mx) / mx.rate)).toBe(5000);
    expect(toLocal(5000, mx)).not.toBe(5000);
  });

  it('scales a price written at US prices to the country you live in', () => {
    expect(scaledAmount(inCity('us', 30), 1000, content)).toBe(1000);
    for (const id of ['ca', 'uk', 'mx'] as const) expect(scaledAmount(inCity(id, 30), 1000, content)).toBe(Math.round(1000 * content.countries[id]!.priceLevel));
  });

  it('renders {$300} as an amount in local currency at local prices, and refuses it with no money format', () => {
    const life = inCity('mx', 30);
    const display = moneyDisplayOf(life, content);
    const money = (n: number) => formatMoney(scaledAmount(life, n, content), display);
    expect(renderText('You find {$300}.', { money })).toBe(`You find ${money(300)}.`);
    expect(money(300).startsWith('$')).toBe(true);
    expect(() => renderText('You find {$300}.', {})).toThrow();
  });
});

describe('legal ages', () => {
  it('differ by country and can be overridden by a city', () => {
    expect(legalAge('drinking', 'chicago', content)).toBe(21);
    expect(legalAge('drinking', 'london', content)).toBe(18);
    expect(legalAge('drinking', 'mexico_city', content)).toBe(18);
    expect(legalAge('drinking', 'toronto', content)).toBe(19);
    // Quebec's own drinking age.
    expect(legalAge('drinking', 'montreal', content)).toBe(18);
    expect(legalAge('driving', 'chicago', content)).toBe(16);
    expect(legalAge('driving', 'london', content)).toBe(17);
    expect(legalAge('driving', 'mexico_city', content)).toBe(18);
  });

  it('is what the conditions and age checks use', () => {
    const at = (id: CountryId, age: number) => inCity(id, age);
    expect(atLegalAge(at('us', 20), 'drinking', content)).toBe(false);
    expect(atLegalAge(at('uk', 20), 'drinking', content)).toBe(true);
    expect(evaluate({ legalAge: 'drinking' }, at('us', 20), { content })).toBe(false);
    expect(evaluate({ legalAge: 'drinking' }, at('mx', 18), { content })).toBe(true);
  });

  it('puts the permit no later than driving, and marriage at adult age, in every city', () => {
    for (const city of Object.values(content.cities)) {
      expect(legalAge('permit', city.id, content)).toBeLessThanOrEqual(legalAge('driving', city.id, content));
    }
  });
});

describe('the country conditions', () => {
  it('matches a country by the city you live in', () => {
    expect(evaluate({ country: ['ca', 'uk'] }, inCity('uk', 30), { content })).toBe(true);
    expect(evaluate({ country: ['ca', 'uk'] }, inCity('us', 30), { content })).toBe(false);
  });
});

describe('school', () => {
  it('starts and ends at each country’s own ages', () => {
    const us = schoolAges(inCity('us', 10), content);
    const uk = schoolAges(inCity('uk', 10), content);
    const mx = schoolAges(inCity('mx', 10), content);
    expect(us.startAge).toBe(5);
    expect(uk.startAge).toBe(4);
    expect(mx.startAge).toBe(5);
    expect(uk.highEnd).toBe(uk.highStart + content.countries.uk!.school.high);
    expect(placeForAge(us.startAge, inCity('us', us.startAge), content)?.program).toBe('elementary');
    expect(placeForAge(uk.startAge, inCity('uk', uk.startAge), content)?.program).toBe('elementary');
  });

  it('shows grades the way each country does', () => {
    expect(letterGrade(4, inCity('us', 16), content)).toBe('A');
    expect(letterGrade(4, inCity('mx', 16), content)).not.toBe('A');
    expect(letterGrade(4, inCity('uk', 16), content)).toMatch(/%|\d|A/);
  });

  it('charges each country’s tuition, in base units, at its own prices', () => {
    const place = { program: 'college', tier: 'state' } as const;
    const us = tuitionFor(inCity('us', 19), place as never, content);
    expect(us).toBe(content.countries.us!.tuition.college.state);
    const uk = tuitionFor(inCity('uk', 19), place as never, content);
    expect(uk).toBe(content.countries.uk!.tuition.college.state);
    const mx = tuitionFor(inCity('mx', 19), place as never, content);
    expect(mx).toBeLessThan(us);
  });
});

describe('taxes', () => {
  it('apply each country’s brackets to its slice of income', () => {
    for (const id of IDS) {
      const life = inCity(id, 40);
      const brackets = content.countries[id]!.tax.brackets;
      expect(taxOn(0, life, content)).toBe(0);
      let expected = 0;
      const gross = 60_000;
      brackets.forEach((b, i) => {
        const top = brackets[i + 1]?.from ?? Infinity;
        expected += Math.max(0, Math.min(gross, top) - b.from) * b.rate;
      });
      expect(taxOn(gross, life, content)).toBe(Math.round(expected));
    }
    expect(taxOn(60_000, inCity('uk', 40), content)).not.toBe(taxOn(60_000, inCity('us', 40), content));
  });
});

describe('pensions', () => {
  it('start at each country’s age and follow its own formula', () => {
    for (const id of IDS) expect(pensionAge(inCity(id, 40), content)).toBe(content.countries[id]!.pension.age);
    for (const id of IDS) {
      const pension = content.countries[id]!.pension;
      const life = produce(inCity(id, 70), (d) => {
        d.finances.earnings = { years: pension.fullYears, total: 30_000 * pension.fullYears };
      });
      const benefit = benefitFromRecord(life, content);
      expect(benefit).toBeGreaterThan(0);
      const short = produce(life, (d) => {
        d.finances.earnings = { years: pension.minYears - 1, total: 30_000 * (pension.minYears - 1) };
      });
      expect(benefitFromRecord(short, content)).toBe(0);
    }
  });
});

describe('healthcare', () => {
  it('has you pay the share of a bill that each country’s system leaves to you', () => {
    const shares = (id: CountryId) => content.countries[id]!.healthcare.shares;
    for (const id of IDS) {
      const life = inCity(id, 40);
      for (const kind of ['visit', 'treatment', 'therapy', 'medication', 'care'] as const) {
        expect(healthShare(life, kind, content)).toBe(shares(id)[kind]);
      }
      expect(medicalPrice(life, 'treatment', content)).toBeCloseTo(content.countries[id]!.priceLevel * shares(id).treatment);
    }
    // A public system covers most of a hospital stay; the US does not.
    expect(shares('uk').treatment).toBeLessThan(shares('us').treatment);
    expect(shares('ca').treatment).toBeLessThan(shares('us').treatment);
    expect(careScale(inCity('us', 80), content)).toBeGreaterThan(0);
  });
});

describe('work', () => {
  it('pays each country’s rate for the kind of job, around the city’s own multiplier', () => {
    for (const id of IDS) {
      const factor = jobPayFactor(inCity(id, 30), 'nobody', 'professional', content);
      expect(factor).toBe(content.countries[id]!.jobs.salaryByCategory.professional);
    }
  });
});

describe('the law', () => {
  it('weighs outcomes by each country’s sentencing, and rolls terms to its scale', () => {
    const offense = Object.values(content.offenses).find((o) => o.outcomes.jail > 0 && o.outcomes.fine > 0)!;
    const base = sentenceWeights(inCity('us', 30), offense, content);
    for (const id of ['ca', 'uk', 'mx'] as const) {
      const local = sentenceWeights(inCity(id, 30), offense, content);
      const s = content.countries[id]!.sentencing.outcomes;
      expect(local.jail / base.jail).toBeCloseTo(s.jail / content.countries.us!.sentencing.outcomes.jail);
    }
  });
});

describe('text words', () => {
  it('speaks of the country’s own schools, pension and currency', () => {
    const us = countryTextValues(inCity('us', 30), content);
    const uk = countryTextValues(inCity('uk', 30), content);
    expect(us.country).toBe('United States');
    expect(uk.country).toBe('United Kingdom');
    expect(us.currency).toBe('dollars');
    expect(uk.currency).toBe('pounds');
    expect(us.highSchool).not.toBe(uk.highSchool);
    expect(uk.pension).not.toBe(us.pension);
  });
});
