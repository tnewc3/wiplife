/**
 * Countries, simulated (W4a): what the run measures about each country's lives: how long they last, schooling (a
 * diploma by 19, a degree by 30), income (gross pay at 40 and the share that goes in tax), owning a home by 50,
 * bankruptcy, net worth at 65, student debt at 25 and the retirement benefit. Every country has its own targets
 * (src/content/balance/countries.yaml targets), and a run for one country (`--country`) is judged on those in place of
 * the shared money and lifespan targets (withCountryTargets).
 *
 * Money is in the base currency (US dollars); the report writes each country's own currency beside it.
 */
import type { ContentBundle, CountryId } from '../../src/content/schemas';
import { countryIdOfCity, formatMoney, moneyDisplay } from '../../src/engine/country';
import { netWorth } from '../../src/engine/finance';
import type { LifeState } from '../../src/engine/types';
import type { TargetResult } from './run';

const BASE = { code: 'USD', symbol: '$', rate: 1, locale: 'en-US', name: 'dollar', plural: 'dollars' };

/** Fewer lives than this and a country's targets are not judged (too few to say). */
export const MIN_LIVES_TO_JUDGE = 30;

/** What the run saw in one country. */
export interface CountryRow {
  lives: number;
  /** Age at the end of each life. */
  ages: number[];
  adults: { lives: number; bankrupt: number };
  /** A diploma (or its equivalent) by 19, of lives that reached 20. */
  diploma19: { lives: number; got: number };
  /** A college degree, associate or better, by 30, of lives that reached 30. */
  degree30: { lives: number; got: number };
  /** Gross pay in the year they turned 40, of lives that reached it and had any. */
  gross40: number[];
  /** Own a home by 50, of lives that reached 50. */
  owned50: { lives: number; owned: number };
  netWorth65: number[];
  /** Student debt at 25, of lives that owed any. */
  student25: number[];
  student25Lives: number;
  /** First year's retirement benefit, of lives that got one. */
  benefit: number[];
  /** Tax and gross pay over every working-age year with income: the share of pay that goes in tax. */
  tax: { gross: number; tax: number };
  /** Medical debt at death, of lives that reached 40. */
  medicalDebt40: { lives: number; any: number };
}

export interface CountriesReport {
  rows: Record<string, CountryRow>;
}

const emptyRow = (): CountryRow => ({
  lives: 0,
  ages: [],
  adults: { lives: 0, bankrupt: 0 },
  diploma19: { lives: 0, got: 0 },
  degree30: { lives: 0, got: 0 },
  gross40: [],
  owned50: { lives: 0, owned: 0 },
  netWorth65: [],
  student25: [],
  student25Lives: 0,
  benefit: [],
  tax: { gross: 0, tax: 0 },
  medicalDebt40: { lives: 0, any: 0 },
});

export const emptyCountriesReport = (): CountriesReport => ({ rows: {} });

/** Watches each life as it is played and files it under the country it was born in. */
export class CountriesWatcher {
  private ownedBy50 = false;
  private gross40: number | null = null;
  private netWorth65: number | null = null;
  private student25: number | null = null;
  private firstBenefit: number | null = null;
  private medical40 = false;
  private tax = 0;
  private gross = 0;

  constructor(
    private readonly report: CountriesReport,
    private readonly content: ContentBundle,
  ) {}

  /** The life as a year begins. */
  observe(life: LifeState): void {
    const age = life.character.age;
    if (age <= 50 && life.housing.kind === 'owned') this.ownedBy50 = true;
    const ledger = life.finances.lastLedger;
    if (ledger?.year === life.currentYear) {
      if (ledger.gross > 0 && age >= 18 && age < 67) {
        this.gross += ledger.gross;
        this.tax += ledger.tax;
      }
      if (age === 40) this.gross40 = ledger.gross;
      if (ledger.retirement > 0) this.firstBenefit ??= ledger.retirement;
    }
    if (age === 65) this.netWorth65 = netWorth(life);
    if (age === 25) this.student25 = life.finances.debts.filter((d) => d.kind === 'student').reduce((sum, d) => sum + d.balance, 0);
    if (age === 40) this.medical40 = life.finances.debts.some((d) => d.kind === 'medical');
  }

  /** The life has ended (or the run has): file it. */
  finish(life: LifeState): void {
    const id = countryIdOfCity(life.character.birthCityId, this.content);
    const row = (this.report.rows[id] ??= emptyRow());
    const c = life.character;
    row.lives++;
    row.ages.push(c.age);
    if (c.age >= 18) {
      row.adults.lives++;
      if (life.finances.bankruptcyYear !== undefined) row.adults.bankrupt++;
    }
    const credentials = life.education.credentials;
    if (c.age >= 20) {
      row.diploma19.lives++;
      if (credentials.some((x) => (x.type === 'hs_diploma' || x.type === 'ged') && x.year - life.birthYear <= 19)) row.diploma19.got++;
    }
    if (c.age >= 30) {
      row.degree30.lives++;
      if (credentials.some((x) => (x.type === 'associate' || x.type === 'bachelor' || x.type === 'grad') && x.year - life.birthYear <= 30)) row.degree30.got++;
    }
    if (this.gross40 !== null && this.gross40 > 0) row.gross40.push(this.gross40);
    if (c.age >= 50) {
      row.owned50.lives++;
      if (this.ownedBy50) row.owned50.owned++;
    }
    if (this.netWorth65 !== null) row.netWorth65.push(this.netWorth65);
    if (this.student25 !== null) {
      row.student25Lives++;
      if (this.student25 > 0) row.student25.push(this.student25);
    }
    if (this.firstBenefit !== null) row.benefit.push(this.firstBenefit);
    row.tax.gross += this.gross;
    row.tax.tax += this.tax;
    if (c.age >= 40) {
      row.medicalDebt40.lives++;
      if (this.medical40) row.medicalDebt40.any++;
    }
  }
}

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};
const share = (n: number, d: number) => (d > 0 ? n / d : 0);
const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—');

/** The countries with lives in the report, in a fixed order. */
export function countriesIn(report: CountriesReport): string[] {
  return Object.keys(report.rows).sort();
}

/** The country section of the report. */
export function formatCountries(report: CountriesReport, content: ContentBundle): string[] {
  const lines: string[] = ['Countries (W4a; money in the base currency, with the local currency beside it):'];
  for (const id of countriesIn(report)) {
    const country = content.countries[id];
    if (!country) continue;
    const row = report.rows[id]!;
    const display = moneyDisplay(country, content);
    const local = (n: number) => `${formatMoney(n, BASE)} (${formatMoney(n, display)} ${display.code})`;
    lines.push(
      `  ${country.name} — ${row.lives} lives; 1 base unit = ${display.rate} ${display.code}`,
      `    lifespan: median ${median(row.ages)}; bankrupt ${pct(row.adults.bankrupt, row.adults.lives)} of ${row.adults.lives} adults`,
      `    school: diploma or equivalent by 19 ${pct(row.diploma19.got, row.diploma19.lives)} of ${row.diploma19.lives}; a college degree by 30 ${pct(row.degree30.got, row.degree30.lives)} of ${row.degree30.lives}; student debt at 25 ${pct(row.student25.length, row.student25Lives)} of ${row.student25Lives} owe any, median ${local(median(row.student25))}`,
      `    income: median gross pay at 40 ${local(median(row.gross40))} (${row.gross40.length} lives); tax is ${pct(row.tax.tax, row.tax.gross)} of gross pay in working years`,
      `    home: owned one by 50 ${pct(row.owned50.owned, row.owned50.lives)} of ${row.owned50.lives}; median net worth at 65 ${local(median(row.netWorth65))} (${row.netWorth65.length} lives)`,
      `    retirement: median first-year benefit ${local(median(row.benefit))} (${row.benefit.length} lives); medical debt at 40 ${pct(row.medicalDebt40.any, row.medicalDebt40.lives)} of ${row.medicalDebt40.lives}`,
    );
  }
  return lines;
}

/** The targets of one country (src/content/balance/targets.yaml countries), measured on its row. */
export function countryTargetResults(id: CountryId, row: CountryRow, content: ContentBundle): TargetResult[] {
  const t = content.balance.countries.targets[id];
  if (!t) return [];
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const inRange = (x: number, r: { min: number; max: number }) => x >= r.min && x <= r.max;
  const money = (n: number) => `$${n.toLocaleString('en-US')}`;
  const bankrupt = share(row.adults.bankrupt, row.adults.lives);
  const owned = share(row.owned50.owned, row.owned50.lives);
  const diploma = share(row.diploma19.got, row.diploma19.lives);
  const degree = share(row.degree30.got, row.degree30.lives);
  const gross = median(row.gross40);
  const worth = median(row.netWorth65);
  const life = median(row.ages);
  const tax = share(row.tax.tax, row.tax.gross);
  const name = content.countries[id]?.name ?? id;
  return [
    { label: `${name}: median lifespan`, value: String(life), short: String(life), goal: `${t.lifespanMedian.min}–${t.lifespanMedian.max}`, met: inRange(life, t.lifespanMedian) },
    { label: `${name}: bankruptcy`, value: pct1(bankrupt), short: pct1(bankrupt), goal: `at most ${pct1(t.maxBankruptLives)}`, met: bankrupt <= t.maxBankruptLives },
    { label: `${name}: owned a home by 50`, value: pct1(owned), short: pct1(owned), goal: `at least ${pct1(t.minHomeOwners)}`, met: owned >= t.minHomeOwners },
    { label: `${name}: diploma by 19`, value: pct1(diploma), short: pct1(diploma), goal: `at least ${pct1(t.minDiplomaBy19)}`, met: diploma >= t.minDiplomaBy19 },
    { label: `${name}: college degree by 30`, value: pct1(degree), short: pct1(degree), goal: `${pct1(t.degreeBy30.min)}–${pct1(t.degreeBy30.max)}`, met: inRange(degree, t.degreeBy30) },
    { label: `${name}: median gross pay at 40`, value: money(gross), short: money(gross), goal: `${money(t.grossAt40.min)}–${money(t.grossAt40.max)}`, met: inRange(gross, t.grossAt40) },
    { label: `${name}: share of pay in tax`, value: pct1(tax), short: pct1(tax), goal: `${pct1(t.taxShare.min)}–${pct1(t.taxShare.max)}`, met: inRange(tax, t.taxShare) },
    { label: `${name}: median net worth at 65`, value: money(worth), short: money(worth), goal: `${money(t.medianNetWorth.min)}–${money(t.medianNetWorth.max)}`, met: inRange(worth, t.medianNetWorth) },
  ];
}

/** The country targets of every country with enough lives to judge, plus a note for those with too few. */
export function countryTargets(report: CountriesReport, content: ContentBundle): TargetResult[] {
  return countriesIn(report).flatMap((id) => {
    const row = report.rows[id]!;
    return row.lives >= MIN_LIVES_TO_JUDGE ? countryTargetResults(id as CountryId, row, content) : [];
  });
}

/**
 * The content a run for one country is judged on: the shared money and lifespan targets are that country's own
 * (src/content/balance/targets.yaml countries), so every other section of the report measures against what is fair
 * there. The game itself is untouched.
 */
export function withCountryTargets(content: ContentBundle, id: CountryId): ContentBundle {
  const t = content.balance.countries.targets[id];
  if (!t) return content;
  const targets = content.balance.targets;
  return {
    ...content,
    balance: {
      ...content.balance,
      targets: {
        ...targets,
        money: { ...targets.money, maxBankruptLives: t.maxBankruptLives, minHomeOwners: t.minHomeOwners, medianNetWorth: t.medianNetWorth },
        lifespan: { median: t.lifespanMedian },
      },
    },
  };
}
