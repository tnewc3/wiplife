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
import { SPORTS_TRIGGERS } from '../../src/content/schemas';
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

const VALUE = /\{(sport|team|league|position|stage|trophy|pick|draftRound|draftTeam|record|statLine|opponent|injury|salary|season)\}/g;
const PRO_ACTIONS = new Set(['sign', 'extend', 'playout', 'trade', 'ask']);

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
    for (const t of teams) if (!bundle.cities[t.city]) e(`team ${t.id}: unknown city "${t.city}"`);
    if (teams.filter((t) => bundle.cities[t.city]).length < sport.season.playoffTeams + 2) e('more teams than playoff places, please');
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
    }
    if (!bundle.fameAwards || !Object.values(bundle.fameAwards).some((a) => a.path === def.id && a.minRung < sport.proRung && !a.retired)) e('an award for amateurs');
    if (!Object.values(bundle.fameAwards).some((a) => a.path === def.id && a.minRung >= sport.proRung && !a.retired)) e('an award for pros');
    for (const tier of [1, 2, 3]) if (!Object.values(bundle.fameCompanies).some((c) => c.path === def.id && c.tier === tier && !c.retired)) e(`a brand at tier ${tier}`);
  }

  // The events the sports step queues.
  if (!partialEvents) {
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
    };
    for (const name of used) {
      const [what, ok] = wants[name]!;
      if (!ok) e(`uses {${name}} without requiring ${what}`);
    }
    // The category contracts hold the rest (the build rejects an event missing its category's requirements).
  }
  return errors;
}
