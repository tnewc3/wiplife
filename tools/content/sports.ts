/**
 * Content checks for sports (E6c): each sport (a fame path with a sport block)
 * agrees with the balance, the cities, the conditions and the awards; ways in
 * respect each route's ages choice by choice; the events the sports step
 * queues exist and are follow-ups; playoff events form a chain of three
 * series, each pinned and each ending in a win or a loss; pro actions are for
 * adults; events only use the text values their requirements guarantee; and
 * all the names are made up.
 */
import type { CollectionKey, Condition, ContentBundle, Effect, EventDef } from '../../src/content/schemas';
import { FUTURE_COUNTRIES, SPORTS_TRIGGERS } from '../../src/content/schemas';
import type { ContentError } from './compile';
import { ageCeiling, ageFloor, outcomesOf } from './fame';
import { ROMANCE_WORDS } from './references';

const BALANCE = 'balance/sports.yaml';
const REGISTRY = 'registries/sports.yaml';

type SportsCond = Extract<Condition, { sports: unknown }>['sports'];

/** True when a requirement of the event (all of them together) guarantees what the test asks. */
function requiresSports(def: EventDef, test: (c: SportsCond) => boolean): boolean {
  const walk = (c: Condition | undefined): boolean => {
    if (!c) return false;
    if ('all' in c) return c.all.some(walk);
    if ('any' in c) return c.any.length > 0 && c.any.every(walk);
    return 'sports' in c && test(c.sports);
  };
  return walk(def.requires);
}

/** The age floor and ceiling a choice has: the event's own, tightened by the choice's visibleIf. */
function choiceAges(def: EventDef, choice: { visibleIf?: Condition | undefined }): { floor: number; ceiling: number } {
  return {
    floor: Math.max(ageFloor(def.requires), ageFloor(choice.visibleIf)),
    ceiling: Math.min(ageCeiling(def.requires), ageCeiling(choice.visibleIf)),
  };
}

const VALUE = /\{(sport|team|league|position|stage|trophy|pick|draftRound|draftTeam|record|statLine|opponent|injury|salary|season|number|tryout|tier|campus|share|scholarship|prospect|teamNick|place|parent|host|suitor|derbyRival|nation|tournament|caps|clubCountry)\}/g;
const PRO_ACTIONS = new Set(['sign', 'extend', 'playout', 'trade', 'ask', 'camp', 'loan', 'transfer', 'cap', 'tournament']);

export function checkSports(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const b = bundle.balance.sports;
  const { adultAge } = bundle.balance.relationships;
  const sports = Object.values(bundle.famePaths).filter((p) => !p.retired && p.sport !== undefined);

  // Balance.
  const media = bundle.famePaths[b.retire.broadcastPath];
  if (!media || media.sport) err(BALANCE, `retire.broadcastPath "${b.retire.broadcastPath}" must be a path in arts and media`);
  if (!bundle.jobs['coach']) err('jobs/', 'a coaching job track ("coach") for athletes who retire into coaching');
  if (b.draft.top < b.draft.declare) err(BALANCE, 'draft.top must not be below draft.declare');
  if (b.contract.kind.minimum > b.contract.kind.standard) err(BALANCE, 'contract.kind: a minimum deal pays less than a standard one');
  if (!(b.injury.commitment.back <= b.injury.commitment.steady && b.injury.commitment.steady <= b.injury.commitment.all)) err(BALANCE, 'injury.commitment must grow from holding back to all in');
  if (!(b.injury.level.youth <= b.injury.level.school && b.injury.level.school <= b.injury.level.college && b.injury.level.college <= b.injury.level.pro)) err(BALANCE, 'injury.level must grow with the level of play');
  if (b.injury.aggravate.min > b.injury.aggravate.max) err(BALANCE, 'injury.aggravate: min is greater than max');
  for (const kind of ['minimum', 'rookie', 'standard', 'star'] as const) if (b.contract.years[kind].min > b.contract.years[kind].max) err(BALANCE, `contract.years.${kind}: min is greater than max`);

  // Batch 5: tryouts, training, scholarships and the draft.
  const tiers = b.tryout.tiers;
  for (const [id, t] of Object.entries(tiers)) {
    if (t.minAge > t.maxAge) err(BALANCE, `tryout.tiers.${id}: minAge is above maxAge`);
    if (t.minAge < 8) err(BALANCE, `tryout.tiers.${id}: no team takes anyone under 8`);
    if (t.fallback !== null) {
      const f = tiers[t.fallback];
      if (f.level !== t.level) err(BALANCE, `tryout.tiers.${id}: the fallback must be a team of the same level`);
      if (f.bar >= t.bar) err(BALANCE, `tryout.tiers.${id}: the fallback must be easier to make than the team`);
    }
  }
  for (const level of ['youth', 'school', 'college'] as const) {
    if (!Object.values(tiers).some((t) => t.level === level && t.fallback === null)) err(BALANCE, `tryout.tiers: ${level} needs a team at the bottom (no fallback) that takes everyone who earned the level`);
    if (bundle.text.sports.tiers && !Object.keys(tiers).every((id) => id in bundle.text.sports.tiers)) err('text/sports.yaml', 'tiers: words for every team tier');
  }
  if (b.tryout.tiers.academy.minAge < 8) err(BALANCE, 'tryout.tiers.academy: minAge');
  if (b.scholarship.ages.from > b.scholarship.ages.to) err(BALANCE, 'scholarship.ages: from is above to');
  if (b.scholarship.ages.from < 16) err(BALANCE, 'scholarship.ages: recruiting starts at 16 at the earliest');
  for (const t of ['community', 'state', 'elite'] as const) if (b.scholarship.tiers[t].from >= b.scholarship.tiers[t].full) err(BALANCE, `scholarship.tiers.${t}: an offer begins below the score of the best one`);
  for (let i = 1; i < b.draft.projection.length; i++) if (b.draft.projection[i]!.upTo <= b.draft.projection[i - 1]!.upTo) err(BALANCE, 'draft.projection must be in increasing upTo order');
  for (const band of b.draft.projection) if (!bundle.text.sports.projection[band.id]) err('text/sports.yaml', `projection: words for "${band.id}"`);
  for (const [country, c] of Object.entries(bundle.countries)) {
    const a = c.athletics;
    if (a.scholarships.available && a.scholarships.tiers.length === 0) err(`countries/${country}.yaml`, 'athletics.scholarships: available, but no program recruits');
    if (!a.scholarships.available && a.scholarships.maxShare > 0) err(`countries/${country}.yaml`, 'athletics.scholarships: not available, but pays a share');
  }
  // Every sport has a school team (one record with the sports career) and skills to train.
  for (const def of sports) {
    if (!Object.values(bundle.activities).some((a) => a.sport === def.id && !a.retired)) err(fileOf('famePaths', def.id), `${def.id}: needs a school team in teams and clubs with sport: ${def.id}`);
    if ((def.skills ?? []).length < 3) err(fileOf('famePaths', def.id), `${def.id}: needs at least three skills to train`);
  }
  for (const a of Object.values(bundle.activities)) {
    if (a.sport === undefined) continue;
    const sp = bundle.famePaths[a.sport];
    if (!sp?.sport) err(`activities/${a.id}.yaml`, `sport "${a.sport}" is not a sport`);
    if (a.kind !== 'team') err(`activities/${a.id}.yaml`, 'a sport belongs to a team, not a club');
  }

  // Sports.
  for (const def of sports) {
    const sport = def.sport!;
    const file = fileOf('famePaths', def.id);
    const e = (message: string) => err(file, `${def.id}: ${message}`);
    if (def.rungs.length < sport.proRung + 2) e('needs at least two rungs above the pro rung');
    if (def.rungs.length !== bundle.balance.fame.gain.rung.length) e(`needs ${bundle.balance.fame.gain.rung.length} rungs, like balance/fame.yaml gain.rung`);
    if (sport.ageOut.length !== sport.proRung - 1) e(`ageOut needs an age for each of the ${sport.proRung - 1} levels below the pros`);
    sport.ageOut.forEach((a, i) => {
      if (i > 0 && a <= sport.ageOut[i - 1]!) e('ageOut must grow from level to level');
    });
    if ((def.rungs[sport.proRung - 1]?.minAge ?? 0) < adultAge) e(`the pro rung must ask for age ${adultAge}: nobody under ${adultAge} is in the pros`);
    if (sport.draft.age < adultAge || sport.draft.force < sport.draft.age) e(`draft ages: from ${adultAge}, and the forced age is not below the first`);
    if ((sport.ageOut[sport.proRung - 2] ?? 0) < sport.draft.force) e('you must not age out of college before the draft age is forced');
    if (def.rungs.slice(0, sport.proRung - 1).some((r) => r.income !== 0)) e('amateur rungs pay nothing (a college scholarship is an event)');
    if (def.rungs[sport.proRung - 1]!.income <= 0) e('the pro rung must pay');
    if (def.talents.length === 0 || !def.talents.every((t) => bundle.talents[t])) e('a talent that fits that exists');
    const stats = new Set(sport.stats.map((s) => s.id));
    if (stats.size !== sport.stats.length) e('duplicate stat ids');
    for (const p of sport.positions) {
      for (const s of p.stats) if (!stats.has(s.id)) e(`position ${p.id}: unknown stat "${s.id}"`);
      const weights = Object.values(p.fit).reduce((a, w) => a + (w ?? 0), 0);
      if (weights < 0.9 || weights > 1.1) e(`position ${p.id}: fit weights should sum to about 1 (got ${weights.toFixed(2)})`);
    }
    if (new Set(sport.positions.map((p) => p.id)).size !== sport.positions.length) e('duplicate position ids');
    const teams = sport.leagues.pro.teams;
    if (new Set(teams.map((t) => t.id)).size !== teams.length) e('duplicate team ids');
    const tierNames = sport.leagues.pro.tiers;
    for (const t of teams) {
      if (!bundle.cities[t.city]) e(`team ${t.id}: unknown city "${t.city}"`);
      if (t.nearestCityId !== undefined) {
        // Batch 6: a team away from the modeled cities: you live in the nearest modeled city (of the same country; a club in a country
        // the game does not model has a UK city) and commute. The list of these is printed by the content build.
        const near = bundle.cities[t.nearestCityId];
        if (!near) e(`team ${t.id}: unknown nearestCityId "${t.nearestCityId}"`);
        else if (t.futureCountry === true && near.countryId !== 'uk') e(`team ${t.id}: a club in a country the game does not model has a UK city to commute from (not "${t.nearestCityId}")`);
        else if (t.futureCity === true && Object.values(bundle.cities).some((c) => c.name === t.cityName && !c.retired)) e(`team ${t.id}: "${t.cityName}" is a city of the game: use city, not futureCity`);
      }
      if (t.tier === 2 && tierNames === undefined) e(`team ${t.id}: a second league needs leagues.pro.tiers`);
      if (t.futureCountry === true && !sport.leagues.pro.markets?.some((g) => g.includes('uk') && g.includes(t.country!))) e(`team ${t.id}: a club in ${t.country} needs a market group of ${t.country} and uk (leagues.pro.markets)`);
    }
    // Batch 6: a country's league: at home, every country needs a league to play in; with two leagues, each needs clubs to move between.
    const countryOfTeam = (t: (typeof teams)[number]): string => t.country ?? bundle.cities[t.city]?.countryId ?? '';
    for (const country of Object.values(bundle.countries)) {
      const here = teams.filter((t) => countryOfTeam(t) === country.id);
      if (here.length < 6) e(`country ${country.id}: ${here.length} pro teams; every country needs at least 6 in every sport`);
      if (tierNames !== undefined && (here.filter((t) => t.tier === 1).length < 6 || here.filter((t) => t.tier === 2).length < 4)) e(`country ${country.id}: a league with two tiers needs at least 6 clubs in the first and 4 in the second`);
    }
    if (tierNames !== undefined) {
      for (const g of sport.leagues.pro.markets ?? []) for (const c of g) {
        if (!(FUTURE_COUNTRIES as readonly string[]).includes(c)) continue;
        const here = teams.filter((t) => t.country === c);
        if (here.filter((t) => t.tier === 1).length < 6 || here.filter((t) => t.tier === 2).length < 4) e(`country ${c}: needs at least 6 clubs in the first league and 4 in the second`);
      }
    }
    if (sport.academy !== undefined && sport.academy.minAge > sport.academy.maxAge) e('academy: minAge is above maxAge');
    if (sport.academy !== undefined && sport.academy.abroadMinAge > sport.academy.maxAge) e('academy: a trial abroad must be open before the academy age ends');
    if (sport.academy !== undefined && sport.academy.minAge < 8) e('academy: no academy takes anyone under 8');
    if (sport.draft.rounds * teams.length < 12) e('the draft must have room for a dozen players');
    for (const i of sport.injuries) {
      const c = bundle.conditions[i.id];
      if (!c) e(`unknown injury "${i.id}"`);
      else if (c.kind !== 'injury') e(`injury "${i.id}" must be a condition of kind injury`);
      if (i.min > i.max) e(`injury ${i.id}: min is greater than max`);
    }
    for (const r of def.routes) {
      const rung = r.rung ?? 1;
      if (rung >= sport.proRung) e(`route ${r.id}: no way in begins in the pros`);
      const ask = def.rungs[rung - 1]?.minAge ?? 0;
      if (r.minAge < ask) e(`route ${r.id}: starts younger than its rung allows (${ask})`);
      if (r.maxAge === undefined) e(`route ${r.id}: needs a maxAge`);
      else if (r.maxAge < r.minAge) e(`route ${r.id}: maxAge is below minAge`);
      // B1: someone who enters at the route's last age plays that season and at least one more before the level's age-out.
      else if (r.maxAge + 1 > (sport.ageOut[rung - 1] ?? Infinity)) e(`route ${r.id}: maxAge ${r.maxAge} is too old for the level's age-out (${sport.ageOut[rung - 1]}): entries at that age would be aged out after their first season`);
    }
    if (!bundle.fameAwards || !Object.values(bundle.fameAwards).some((a) => a.path === def.id && a.minRung < sport.proRung && !a.retired)) e('an award for amateurs');
    if (!Object.values(bundle.fameAwards).some((a) => a.path === def.id && a.minRung >= sport.proRung && !a.retired)) e('an award for pros');
    for (const tier of [1, 2, 3]) if (!Object.values(bundle.fameCompanies).some((c) => c.path === def.id && c.tier === tier && !c.retired)) e(`a brand at tier ${tier}`);
  }

  // The events the sports step queues.
  if (!partialEvents) {
    for (const [level, ids] of Object.entries(bundle.registries.sports.tryouts)) {
      for (const id of ids) {
        const ev = bundle.events[id];
        if (!ev) err(REGISTRY, `tryouts.${level}: unknown event "${id}"`);
        else {
          if (!ev.followUpOnly) err(fileOf('events', id), `${id}: a tryout scrimmage must be followUpOnly`);
          if (ev.category !== 'sportstryout') err(fileOf('events', id), `${id}: a tryout scrimmage is in the sportstryout category`);
          const approaches = new Set((ev.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []).flatMap((o) => (o.effects as Effect[]).flatMap((x) => (x.type === 'sports' && x.action === 'tryout' ? [x.approach ?? ''] : [])))));
          if (approaches.size < 3) err(fileOf('events', id), `${id}: a tryout scrimmage offers at least three ways to play it`);
          if (level === 'pro' && ageFloor(ev.requires) < bundle.balance.relationships.adultAge) err(fileOf('events', id), `${id}: a pro camp is for adults`);
        }
      }
    }
    for (const trigger of SPORTS_TRIGGERS) {
      for (const id of bundle.registries.sports.triggers[trigger].events) {
        const def = bundle.events[id];
        if (!def) err(REGISTRY, `${trigger}: unknown event "${id}"`);
        else if (!def.followUpOnly) err(fileOf('events', id), `${id}: answers ${trigger}, so it must be followUpOnly (the sports step queues it)`);
      }
    }
    // The playoffs are a chain of three series: every series has events, each pinned and ending in a win or a loss.
    for (const round of [1, 2, 3]) {
      const ids = bundle.registries.sports.triggers.playoffs.events.filter((id) => bundle.events[id] && requiresSports(bundle.events[id]!, (c) => c.round?.eq === round));
      if (ids.length === 0) err(REGISTRY, `playoffs: needs an event that requires { sports: { round: { eq: ${round} } } }`);
    }
    for (const id of bundle.registries.sports.triggers.playoffs.events) {
      const def = bundle.events[id];
      if (!def) continue;
      const file = fileOf('events', id);
      if (!def.pin) err(file, `${id}: a playoff event must be pin: true (its text must not change as the run moves on)`);
      if (!requiresSports(def, (c) => c.run === true)) err(file, `${id}: a playoff event requires { sports: { run: true } }`);
      for (const c of def.choices ?? []) {
        for (const o of c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []) {
          if (!(o.effects as Effect[]).some((x) => x.type === 'sports' && x.action === 'series')) err(file, `${id}: choice "${c.id}" must end the series in a win or a loss`);
        }
      }
    }
  }

  // Events.
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
    const outcomes = outcomesOf(def);
    const effects = outcomes.flatMap((o) => o.effects as Effect[]);
    const usesSports = def.category.startsWith('sports') || effects.some((x) => x.type === 'sports') || JSON.stringify(def.requires ?? {}).includes('"sports"');
    const texts = [def.title, def.text, ...(def.choices ?? []).map((c) => c.label), ...outcomes.flatMap((o) => [o.text ?? '', ...(o.effects as Effect[]).flatMap((x) => (x.type === 'history' ? [x.text] : []))])];
    if (!usesSports) {
      if (VALUE.test(JSON.stringify(def.title + def.text))) e('uses a sports text value without being a sports event');
      VALUE.lastIndex = 0;
      continue;
    }
    const floor = ageFloor(def.requires);

    // Pro business is for adults; nothing here is romantic.
    const adultEffect = effects.some((x) => x.type === 'sports' && PRO_ACTIONS.has(x.action)) || effects.some((x) => x.type === 'fame' && (x.action === 'contract' || x.action === 'agent')) || effects.some((x) => x.type === 'legal');
    if (adultEffect && floor < adultAge) e(`signs, negotiates or answers to the law, so it requires { age: { gte: ${adultAge} } }`);
    for (const [role, spec] of Object.entries(def.cast ?? {})) {
      if (spec.romantic || spec.admirer) e(`cast.${role}: sports content has no romantic roles`);
      if (spec.kind === 'partner' && floor < adultAge) e(`cast.${role}: a partner means the event requires { age: { gte: ${adultAge} } }`);
    }
    const reachableByMinor = def.lifeStages.some((s) => ['early', 'child', 'teen'].includes(s)) && floor < bundle.balance.economy.independenceAge;
    if (reachableByMinor) {
      for (const t of texts) if (ROMANCE_WORDS.test(t.replace(/\{[^}]*\}/g, ''))) e(`can be met by someone under ${bundle.balance.economy.independenceAge}, so it can't use romantic or sexual words ("${t.match(ROMANCE_WORDS)![0]}")`);
    }

    // A way in respects each route's ages, choice by choice.
    for (const c of def.choices ?? []) {
      const outs = c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : [];
      for (const o of outs) {
        for (const x of o.effects as Effect[]) {
          if (x.type !== 'fame' || x.action !== 'enter') continue;
          const path = bundle.famePaths[x.path!];
          if (!path?.sport) continue;
          const route = path.routes.find((r) => r.id === x.route);
          if (!route) {
            e(`unknown route "${String(x.route)}" in ${path.id}`);
            continue;
          }
          const ages = choiceAges(def, c);
          const lowest = Math.max(path.minAge, route.minAge);
          if (ages.floor < lowest) e(`choice "${c.id}" starts ${path.id} by "${route.id}", which needs age ${lowest}: require { age: { gte: ${lowest} } } on the event or the choice`);
          if (route.maxAge !== undefined && ages.ceiling > route.maxAge) e(`choice "${c.id}" starts ${path.id} by "${route.id}", which is open to age ${route.maxAge}: require { age: { lte: ${route.maxAge} } } on the event or the choice`);
        }
      }
    }

    // Text values need what they name.
    const used = new Set<string>();
    for (const t of texts) for (const m of t.matchAll(VALUE)) used.add(m[1]!);
    VALUE.lastIndex = 0;
    const any = requiresSports(def, () => true) || def.category.startsWith('sports');
    const wants: Record<string, [string, boolean]> = {
      sport: ['a sports condition', any],
      team: ['a sports condition', any],
      league: ['a sports condition', any],
      position: ['a sports condition', any],
      trophy: ['a sports condition', any],
      stage: ['{ sports: { run: true } }', requiresSports(def, (c) => c.run === true)],
      opponent: ['{ sports: { run: true } }', requiresSports(def, (c) => c.run === true)],
      pick: ['{ sports: { drafted: true } }', requiresSports(def, (c) => c.drafted === true)],
      draftRound: ['{ sports: { drafted: true } }', requiresSports(def, (c) => c.drafted === true)],
      draftTeam: ['{ sports: { drafted: true } } or offered', requiresSports(def, (c) => c.drafted === true || c.offered === true)],
      record: ['a season this year ({ sports: { result: [...] } } or { fame: { released: true } })', requiresSports(def, (c) => c.result !== undefined || c.rating !== undefined) || JSON.stringify(def.requires ?? {}).includes('"released":true')],
      statLine: ['a season this year ({ sports: { result: [...] } } or { fame: { released: true } })', requiresSports(def, (c) => c.result !== undefined || c.rating !== undefined) || JSON.stringify(def.requires ?? {}).includes('"released":true')],
      season: ['a season this year', requiresSports(def, (c) => c.result !== undefined || c.rating !== undefined) || JSON.stringify(def.requires ?? {}).includes('"released":true')],
      injury: ['{ sports: { injured: true } }', requiresSports(def, (c) => c.injured === true)],
      salary: ['{ sports: { contract: true } }', requiresSports(def, (c) => c.contract === true)],
      number: ['a sports condition', any],
      tryout: ['{ sports: { tryout: true } }', requiresSports(def, (c) => c.tryout === true)],
      tier: ['a sports condition', any],
      campus: ['{ sports: { offers: [...] } } or { sports: { scholarship: true } }', requiresSports(def, (c) => c.offers !== undefined || c.scholarship === true)],
      share: ['{ sports: { offers: [...] } } or { sports: { scholarship: true } }', requiresSports(def, (c) => c.offers !== undefined || c.scholarship === true)],
      scholarship: ['a sports condition', any],
      prospect: ['{ sports: { prospect: true } }', requiresSports(def, (c) => c.prospect === true)],
      teamNick: ['a sports condition', any],
      place: ['a sports condition', any],
      parent: ['{ sports: { loan: true } } or { sports: { academy: true } }', requiresSports(def, (c) => c.loan === true || c.loanOffered === true || c.academy === true || c.graduated === true || c.academyOut === true)],
      host: ['{ sports: { loan: true } } or { sports: { loanOffered: true } }', requiresSports(def, (c) => c.loan === true || c.loanOffered === true)],
      suitor: ['{ sports: { window: true } }', requiresSports(def, (c) => c.window === true)],
      derbyRival: ['{ sports: { derby: true } }', requiresSports(def, (c) => c.derby === true)],
      nation: ['{ sports: { calledUp: true } }', requiresSports(def, (c) => c.calledUp === true || c.tournament === true)],
      tournament: ['{ sports: { calledUp: true } } or { sports: { tournament: true } }', requiresSports(def, (c) => c.calledUp === true || c.tournament === true)],
      caps: ['{ sports: { calledUp: true } } or { sports: { tournament: true } }', requiresSports(def, (c) => c.calledUp === true || c.tournament === true)],
      clubCountry: ['{ sports: { abroad: true } } or { sports: { away: [...] } }', requiresSports(def, (c) => c.abroad === true || c.away !== undefined)],
    };
    for (const name of used) {
      const [what, ok] = wants[name]!;
      if (!ok) e(`uses {${name}} without requiring ${what}`);
    }
    // The category contracts hold the rest (the build rejects an event missing its category's requirements).
  }
  return errors;
}

/** Batch 6: the teams away from the modeled cities, by sport: the list that is ready when those cities (and countries) are added. */
export function futureTeams(bundle: ContentBundle): { sport: string; id: string; name: string; cityName: string; nearestCityId: string; kind: 'city' | 'country'; country: string; tier: number }[] {
  const out: { sport: string; id: string; name: string; cityName: string; nearestCityId: string; kind: 'city' | 'country'; country: string; tier: number }[] = [];
  for (const def of Object.values(bundle.famePaths)) {
    if (def.retired || !def.sport) continue;
    for (const t of def.sport.leagues.pro.teams) {
      if (t.nearestCityId === undefined || t.cityName === undefined) continue;
      out.push({ sport: def.id, id: t.id, name: t.name, cityName: t.cityName, nearestCityId: t.nearestCityId, kind: t.futureCountry === true ? 'country' : 'city', country: t.country ?? bundle.cities[t.nearestCityId]?.countryId ?? '', tier: t.tier });
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'city' ? -1 : 1) || a.country.localeCompare(b.country) || a.cityName.localeCompare(b.cityName) || a.sport.localeCompare(b.sport));
}
