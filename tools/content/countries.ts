/**
 * Country checks (W4a, docs/expansion.md): the country files agree with the cities, name pools, trades, grad programs,
 * jobs and balance they point at, and every country is complete.
 */
import { COUNTRY_IDS, TIERS, type CollectionKey, type ContentBundle } from '../../src/content/schemas';
import type { ContentError } from './compile';

/** Keys whose strings are ids, conditions or numbers rather than words the player reads. */
const NOT_TEXT = new Set(['id', 'category', 'requires', 'visibleIf', 'weight', 'bind', 'cast', 'tone', 'rarity', 'lifeStages', 'countries', 'aliases', 'justified', 'type', 'key', 'action', 'path', 'route', 'item', 'eventId', 'offenseId']);

/** Every string the player can read in an event: its title and text, its choices' labels and its outcomes' text and history lines. */
function eventStrings(value: unknown, key = ''): string[] {
  if (typeof value === 'string') return NOT_TEXT.has(key) || ['label', 'title', 'text'].includes(key) === false ? [] : [value];
  if (Array.isArray(value)) return value.flatMap((v) => eventStrings(v, key));
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => (NOT_TEXT.has(k) && k !== 'text' ? [] : eventStrings(v, k)));
  return [];
}

const COUNTRIES_BALANCE = 'balance/countries.yaml';

type FileOf = (typeKey: CollectionKey, id: string) => string;

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** How far a country's stated national level may sit from the average of its cities (the United States is the reference at 1.0). */
const NATIONAL_TOLERANCE = 0.12;

export function checkCountries(bundle: ContentBundle, fileOf: FileOf): ContentError[] {
  const errors: ContentError[] = [];
  const activeIds = <T extends { retired?: boolean | undefined }>(record: Record<string, T>) =>
    Object.entries(record)
      .filter(([, def]) => !def.retired)
      .map(([id]) => id);
  const edu = bundle.balance.education;
  const { exchangeRates, startWeights } = bundle.balance.countries;

  for (const id of COUNTRY_IDS) {
    if (!bundle.countries[id]) errors.push({ file: 'countries/', message: `no definition for the country "${id}" (add countries/${id}.yaml)` });
  }

  for (const [id, city] of Object.entries(bundle.cities)) {
    const file = fileOf('cities', id);
    const country = bundle.countries[city.countryId];
    if (!country) {
      errors.push({ file, message: `${id}: unknown country "${city.countryId}"` });
      continue;
    }
    if (country.retired && !city.retired) errors.push({ file, message: `${id}: its country "${city.countryId}" is retired` });
    if (!bundle.names[city.countryId] || bundle.names[city.countryId]!.retired) {
      errors.push({ file, message: `no name pool for country "${city.countryId}" (add names/${city.countryId}.yaml)` });
    }
    const permit = city.legalAges?.permit ?? country.legalAges.permit;
    const driving = city.legalAges?.driving ?? country.legalAges.driving;
    if (permit > driving) errors.push({ file, message: `${id}: the permit age (${permit}) is after the driving age (${driving})` });
    for (const code of [...(city.languages?.official ?? []), ...(city.languages?.common ?? [])]) {
      if (!/^[a-z]{2,3}$/.test(code)) errors.push({ file, message: `${id}: language "${code}" must be a lowercase language code` });
    }
  }

  // B1: name pools are big enough, and a city's heritage weights name heritages its country's pool has.
  const minNames = bundle.balance.creation.namePool;
  for (const pool of Object.values(bundle.names)) {
    for (const [hid, h] of Object.entries(pool.heritages)) {
      for (const category of ['man', 'woman', 'nonbinary'] as const) {
        const n = new Set(h.first[category].map((x) => x.toLocaleLowerCase('en-US'))).size;
        if (n < minNames.minFirstPerCategory) errors.push({ file: `names/${pool.id}.yaml`, message: `${hid}: ${n} distinct ${category} first names; needs at least ${minNames.minFirstPerCategory}` });
      }
      const last = new Set(h.last.map((x) => x.toLocaleLowerCase('en-US'))).size;
      if (last < minNames.minLast) errors.push({ file: `names/${pool.id}.yaml`, message: `${hid}: ${last} distinct last names; needs at least ${minNames.minLast}` });
    }
  }
  for (const [id, city] of Object.entries(bundle.cities)) {
    const heritages = bundle.names[city.countryId]?.heritages ?? {};
    for (const hid of Object.keys(city.heritageWeights ?? {})) {
      if (!heritages[hid]) errors.push({ file: fileOf('cities', id), message: `${id}: heritageWeights names "${hid}", which is not a heritage in names/${city.countryId}.yaml` });
    }
  }

  for (const country of Object.values(bundle.countries)) {
    const file = `countries/${country.id}.yaml`;
    const err = (message: string) => errors.push({ file, message });
    const cities = Object.entries(bundle.cities).filter(([, c]) => c.countryId === country.id && !c.retired);
    if (!country.retired && cities.length === 0) err('a country needs at least one active city');

    // Money.
    if (exchangeRates[country.currency.code] === undefined) {
      errors.push({ file: COUNTRIES_BALANCE, message: `exchangeRates: no rate for ${country.currency.code} (the currency of ${country.id})` });
    }
    if (startWeights[country.id] === undefined) errors.push({ file: COUNTRIES_BALANCE, message: `startWeights: no weight for "${country.id}"` });
    if (exchangeRates['USD'] !== 1) errors.push({ file: COUNTRIES_BALANCE, message: 'exchangeRates: USD is the base currency and must be 1' });

    // The national levels are about what the cities add up to.
    if (country.id !== 'us' && cities.length > 0) {
      const col = mean(cities.map(([, c]) => c.costOfLiving));
      const pay = mean(cities.map(([, c]) => c.salaryMultiplier));
      if (Math.abs(col - country.priceLevel) / country.priceLevel > NATIONAL_TOLERANCE) {
        err(`priceLevel ${country.priceLevel} is not within ${NATIONAL_TOLERANCE * 100}% of its cities' average cost of living (${col.toFixed(2)})`);
      }
      if (Math.abs(pay - country.salaryMultiplier) / country.salaryMultiplier > NATIONAL_TOLERANCE) {
        err(`salaryMultiplier ${country.salaryMultiplier} is not within ${NATIONAL_TOLERANCE * 100}% of its cities' average pay (${pay.toFixed(2)})`);
      }
    }

    // School.
    const s = country.school;
    const years = s.elementary + s.middle + s.high;
    const highEnds = s.startAge + years;
    if (country.words.gradeLabels.length !== years) err(`words.gradeLabels has ${country.words.gradeLabels.length} names but school runs ${years} years`);
    if (s.dropoutAge >= highEnds) err(`school.dropoutAge must be before high school ends (${highEnds})`);
    if (s.dropoutAge < s.startAge + s.elementary + s.middle) err('school.dropoutAge must be in high school');
    if (s.applyAge < highEnds - 1) err(`school.applyAge can't be before the last year of high school (${highEnds - 1})`);
    if (edu.college.transferCredit >= Math.min(country.collegeYears.state, country.collegeYears.elite)) {
      err('collegeYears: a bachelor’s must take more years than college.transferCredit (balance/education.yaml)');
    }
    for (const tier of TIERS) {
      if (country.tuition.college[tier] > country.tuition.college.elite && tier !== 'elite') err(`tuition.college.${tier} is above the elite tier`);
    }

    // Tuition for every trade and grad program, and nothing for one that does not exist.
    for (const id of Object.keys(country.tuition.trade)) if (!bundle.trades[id]) err(`tuition.trade: unknown trade "${id}"`);
    for (const id of Object.keys(country.tuition.grad)) if (!bundle.gradPrograms[id]) err(`tuition.grad: unknown grad program "${id}"`);
    for (const id of activeIds(bundle.trades)) if (country.tuition.trade[id] === undefined) err(`tuition.trade.${id}: no tuition for the trade "${id}"`);
    for (const id of activeIds(bundle.gradPrograms)) if (country.tuition.grad[id] === undefined) err(`tuition.grad.${id}: no tuition for the grad program "${id}"`);

    // Pay.
    for (const id of Object.keys(country.jobs.salaryByJob)) if (!bundle.jobs[id]) err(`jobs.salaryByJob: unknown job "${id}"`);

    // Pension and tax.
    if (country.pension.minYears > country.pension.fullYears) err('pension.minYears is more than fullYears');
    if (country.pension.earningsCap < country.pension.creditIncome) err('pension.earningsCap is below creditIncome');
    for (const outcome of ['warning', 'fine', 'probation', 'jail'] as const) {
      if (country.sentencing.outcomes[outcome] === 0 && outcome === 'warning') err('sentencing.outcomes.warning must not be 0 (a minor offense needs a lightest outcome)');
    }

    // Names: the pool exists and has every heritage the country uses.
    const pool = bundle.names[country.id];
    if (!pool) {
      err(`no name pool (add names/${country.id}.yaml)`);
    } else {
      for (const heritage of Object.keys(country.names.heritageWeights)) {
        if (!pool.heritages[heritage]) err(`names.heritageWeights: heritage "${heritage}" is not in names/${country.id}.yaml`);
      }
    }
  }

  // The legal ages the teen systems rely on.
  for (const country of Object.values(bundle.countries)) {
    const file = `countries/${country.id}.yaml`;
    if (country.legalAges.permit > country.legalAges.driving) errors.push({ file, message: 'legalAges: the permit age is after the driving age' });
    if (country.legalAges.marriage < bundle.balance.relationships.adultAge) {
      errors.push({ file, message: `legalAges.marriage is below the age romance starts (${bundle.balance.relationships.adultAge}); romance is for adults only` });
    }
  }
  return errors;
}

/**
 * The country-tag contract (registries/categories.yaml countryTags): wording that belongs to one country appears only in
 * events tagged for that country alone, and an event for every country writes amounts as {$300} (never "$300" or
 * "dollars") so they read right wherever it happens.
 */
export function checkCountryTags(bundle: ContentBundle, fileOf: FileOf, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const { terms } = bundle.registries.categories.countryTags;
  const patterns = terms.flatMap((t) => t.patterns.map((source) => ({ countries: t.countries as string[], re: new RegExp(source) })));
  for (const [id, def] of Object.entries(bundle.events)) {
    const file = fileOf('events', id);
    const tagged = def.countries ?? [];
    const only = (country: string) => tagged.length === 1 && tagged[0] === country;
    const within = (countries: string[]) => tagged.length > 0 && tagged.every((c) => countries.includes(c));
    const said = new Set<string>();
    const say = (message: string) => {
      if (!said.has(message)) errors.push({ file, message });
      said.add(message);
    };
    const strings = eventStrings({ title: def.title, text: def.text, choices: def.choices, outcome: (def as { outcome?: unknown }).outcome, check: (def as { check?: unknown }).check });
    for (const raw of strings) {
      // Placeholders are checked as text of their own (a {principal} is not the word "principal").
      const text = raw.replace(/\{[^{}]*\}/g, (m) => (m.startsWith('{$') ? m : ' '));
      for (const p of patterns) {
        const m = p.re.exec(text);
        if (m && !within(p.countries)) {
          say(`${id}: "${m[0]}" belongs to ${p.countries.join(' and ')} only; tag the event countries: [${p.countries.join(', ')}] or reword it`);
        }
      }
      for (const p of bundle.registries.categories.countryTags.placeholders) {
        const m = new RegExp(p.pattern).exec(text);
        if (m && tagged.length === 0) say(`${id}: "${m[0]}" is said differently in each country; write ${p.use}`);
      }
      if (/(?<!\{)\$[0-9]/.test(text) && !only('us')) say(`${id}: write amounts as {$300}, not a literal dollar sign (they scale to the country you live in)`);
      if (/\b(dollars?|bucks?)\b/i.test(text) && !only('us')) say(`${id}: say {currency}, or write the amount as {$300}; "dollars" is for events tagged countries: [us]`);
    }
  }
  void partialEvents;
  return errors;
}
