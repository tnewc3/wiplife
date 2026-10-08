/**
 * Content checks for crime careers (E6a): the events the crime step queues
 * exist, only happen that way and cast only what fits; crews, rivals, cities
 * and businesses agree with each other and with the balance; crime is for
 * adults (an event that joins a crew, moves rank or heat, or pays dirty money
 * requires an adult age, and no crime event can be met by anyone younger);
 * an event that names {crew}, {rivalCrew} or {rank} requires what it names;
 * a crew role needs a crew; and nothing here reads as instructions: crime
 * stays at the level of story and consequences.
 */
import { CRIME_TRIGGERS, type CollectionKey, type Condition, type ContentBundle, type Effect, type EventDef } from '../../src/content/schemas';
import type { ContentError } from './compile';

const REGISTRY = 'registries/crime.yaml';
const BALANCE = 'balance/crime.yaml';

/** Event categories that are about a crime career, whatever they do. */
const CRIME_CATEGORIES = ['crimeoffers', 'crime', 'crimehome', 'crimelaw', 'crimepast'];

function required(condition: Condition | undefined): Condition[] {
  if (!condition) return [];
  if ('all' in condition) return condition.all.flatMap(required);
  return [condition];
}

function requiresAtLeast(condition: Condition | undefined, age: number): boolean {
  return required(condition).some((c) => {
    if (!('age' in c)) return false;
    const a = c.age;
    return Math.max(a.gte ?? -Infinity, a.gt === undefined ? -Infinity : a.gt + 1, a.eq ?? -Infinity) >= age;
  });
}

function outcomesOf(def: EventDef) {
  if (def.autoOutcome) return [def.autoOutcome];
  return (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
}

/** True when a part of the requirements mentions this `crime` field in a way that guarantees what the text names. */
function requiresCrime(def: EventDef, test: (c: NonNullable<Extract<Condition, { crime: unknown }>['crime']>) => boolean): boolean {
  const walk = (c: Condition | undefined): boolean => {
    if (!c) return false;
    if ('all' in c) return c.all.some(walk);
    if ('any' in c) return c.any.length > 0 && c.any.every(walk);
    return 'crime' in c && test(c.crime);
  };
  return walk(def.requires);
}

/** Words that would turn a story into instructions: methods, tools, named products. */
const INSTRUCTION_WORDS =
  /\b(?:lock\s?pick\w*|hot[- ]?wir\w*|bypass\w*|disable the alarm|jam(?:ming)? the signal|step[- ]by[- ]step|tutorial|here'?s how|how to|recipe|synthesi[sz]\w*|detonat\w*|explosive\w*|fentanyl|heroin|cocaine|meth(?:amphetamine)?|glock|ar-?15|ak-?47|silencer|suppressor|untraceable|burner phone|vpn|crypto\w*|bitcoin)\b/i;

const STEREOTYPE_WORDS =
  /\b(?:mafia|cartel|yakuza|triads?|bloods|crips|mob|gangs?ters?|italian|irish|russian|mexican|colombian|chinese|asian|latino|latina|hispanic|black|white|christians?|muslims?|jewish|jews|church|mosque|temple|cosa nostra|hell'?s angels)\b/i;

export function checkCrime(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const b = bundle.balance.crime;
  const { adultAge } = bundle.balance.relationships;
  const active = <T extends { retired?: boolean | undefined }>(record: Record<string, T>) => Object.values(record).filter((d) => !d.retired);

  // Balance and content agree.
  if (b.entry.memberAge.min < adultAge) err(BALANCE, `entry.memberAge.min must be at least the adult age ${adultAge}: nobody under ${adultAge} is in a crew`);
  if (b.entry.memberAge.min > b.entry.memberAge.max) err(BALANCE, 'entry.memberAge: min is greater than max');
  if (b.ranks[0]!.reach !== undefined) err(BALANCE, 'ranks[0] is the rank you start at: it has no reach');
  b.ranks.forEach((r, i) => {
    if (i > 0 && r.reach === undefined) err(BALANCE, `ranks[${i}] needs reach (what it takes to be offered rank ${i + 1})`);
    if (i > 1 && r.reach && b.ranks[i - 1]!.reach && r.reach.standing < b.ranks[i - 1]!.reach!.standing) err(BALANCE, `ranks[${i}].reach.standing is below the rank before it`);
    if (i > 0 && r.payout < b.ranks[i - 1]!.payout) err(BALANCE, `ranks[${i}].payout is below the rank before it`);
  });
  for (const [name, bands] of [['heat.bands', b.heat.bands], ['standing.bands', b.standing.bands], ['rivalry.bands', b.rivalry.bands]] as const) {
    if (bands.some((v, i) => i > 0 && v <= bands[i - 1]!)) err(BALANCE, `${name} must increase`);
  }
  const lt = b.dirty.laundering.tiers;
  if (lt.some((t, i) => i > 0 && (t.fee > lt[i - 1]!.fee || t.risk < lt[i - 1]!.risk || t.capacity < lt[i - 1]!.capacity))) {
    err(BALANCE, 'dirty.laundering.tiers: a higher tier charges less, is riskier and takes more');
  }
  if (lt[0]!.rank !== 0) err(BALANCE, 'dirty.laundering.tiers[0].rank must be 0: a first-tier business is open to anyone holding dirty money');
  if (b.heat.bands.length !== 4 || b.standing.bands.length !== 4) err(BALANCE, 'heat and standing have five words each: four band starts');
  const sizes = Object.values(b.jobs.sizes);
  if (sizes.some((s, i) => i > 0 && (s.payout < sizes[i - 1]!.payout || s.heat < sizes[i - 1]!.heat))) err(BALANCE, 'jobs.sizes must grow in payout and heat from petty to major');

  // Crews, rivals and businesses.
  for (const [id, def] of Object.entries(bundle.crews)) {
    const file = fileOf('crews', id);
    for (const city of def.cities) if (!bundle.cities[city]) err(file, `${id}: unknown city "${city}"`);
    for (const rival of def.rivals) {
      const other = bundle.crews[rival];
      if (!other) err(file, `${id}: unknown rival crew "${rival}"`);
      else if (rival === id) err(file, `${id}: a crew is not its own rival`);
      else if (!other.cities.some((c) => def.cities.includes(c))) err(file, `${id}: rival "${rival}" works in none of ${id}'s cities`);
    }
    if (STEREOTYPE_WORDS.test(`${def.name} ${def.blurb} ${def.ranks.join(' ')}`)) err(file, `${id}: a crew is made up and says nothing about race, religion, nationality or background (found a stereotype word)`);
    if (INSTRUCTION_WORDS.test(`${def.name} ${def.blurb}`)) err(file, `${id}: crime stays at the level of story (found instruction wording)`);
  }
  for (const city of active(bundle.cities)) {
    const crews = active(bundle.crews).filter((c) => c.cities.includes(city.id));
    // (A city with no crew has no crime careers; one with a single crew has no rival for it.)
    if (crews.length === 1) err(fileOf('cities', city.id), `${city.id}: has one crew, and a crew needs a rival that works in the same city`);
  }
  for (const tier of [1, 2, 3]) if (!active(bundle.fronts).some((f) => f.tier === tier)) err('fronts/', `no business at tier ${tier}`);
  for (const [id, def] of Object.entries(bundle.fronts)) {
    if (STEREOTYPE_WORDS.test(`${def.name} ${def.blurb}`)) err(fileOf('fronts', id), `${id}: a business is made up and says nothing about race, religion, nationality or background`);
    if (INSTRUCTION_WORDS.test(`${def.name} ${def.blurb}`)) err(fileOf('fronts', id), `${id}: crime stays at the level of story (found instruction wording)`);
  }
  for (const [key, group] of Object.entries(bundle.text.crime.history)) {
    for (const v of group.variants) if (INSTRUCTION_WORDS.test(v)) err('text/crime.yaml', `history.${key}: crime stays at the level of story (found instruction wording)`);
  }
  for (const o of ['robbery', 'burglary', 'racketeering', 'money_laundering', 'extortion', 'fraud', 'disorderly_conduct']) {
    if (!bundle.offenses[o]) err('offenses/', `crime events use the offense ${o}`);
  }

  // The events the crime step queues.
  if (!partialEvents) {
    const queued: [string, string[]][] = [['jobs', bundle.registries.crime.jobs], ...CRIME_TRIGGERS.map((t): [string, string[]] => [t, bundle.registries.crime.triggers[t].events])];
    for (const [name, ids] of queued) {
      for (const id of ids) {
        const def = bundle.events[id];
        if (!def) {
          err(REGISTRY, `${name}: unknown event "${id}"`);
          continue;
        }
        const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
        if (!def.followUpOnly) e(`answers ${name}, so it must be followUpOnly (the crime step queues it)`);
        for (const [role, spec] of Object.entries(def.cast ?? {})) {
          // The step queues it with nobody cast: roles are found (crew roles) or made (the rival), never the step's.
          if (spec.crew === undefined && !spec.optional && spec.kind !== undefined && !['friend', 'acquaintance', 'classmate'].includes(spec.kind) && !spec.support) e(`cast.${role}: a crime event is cast from your crew or the people around you`);
        }
        if (name === 'jobs') {
          const jobs = outcomesOf(def).flatMap((o) => (o.effects as Effect[]).filter((x) => x.type === 'crime' && x.action === 'job'));
          if (jobs.length === 0) e('is a job, so some outcome must record it (a crime job effect)');
          if (!requiresCrime(def, (c) => c.member === true)) e('is a job, so it must require { crime: { member: true } }');
        }
        if (name === 'promotion' && !outcomesOf(def).some((o) => (o.effects as Effect[]).some((x) => x.type === 'crime' && x.action === 'promote'))) e('answers promotion, so some outcome must promote you');
        if (name === 'informant' && !requiresCrime(def, (c) => c.informant === true)) e('answers informant, so it must require { crime: { informant: true } }');
        if (name === 'investigation' && !requiresCrime(def, (c) => c.investigated === true)) e('answers investigation, so it must require { crime: { investigated: true } }');
        if (name === 'rival' && !requiresCrime(def, (c) => c.rival === true)) e('answers rival, so it must require { crime: { rival: true } }');
        if (name === 'pushedOut' && !requiresCrime(def, (c) => c.standing !== undefined)) e('answers pushedOut, so it must require a low standing');
      }
    }
  }

  // Events.
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
    const outcomes = outcomesOf(def);
    const effects = outcomes.flatMap((o) => o.effects as Effect[]);
    const usesCrime = effects.some((x) => x.type === 'crime' || x.type === 'dirtyMoney') || CRIME_CATEGORIES.includes(def.category) || Object.values(def.cast ?? {}).some((s) => s.crew !== undefined);
    const conditions: (Condition | undefined)[] = [def.requires, ...(def.weight.modifiers ?? []).map((m) => m.if), ...(def.choices ?? []).map((c) => c.visibleIf)];
    const walk = (c: Condition | undefined): void => {
      if (!c) return;
      if ('all' in c) c.all.forEach(walk);
      else if ('any' in c) c.any.forEach(walk);
      else if ('not' in c) walk(c.not);
      else if ('crime' in c) for (const crew of c.crime.crew ?? []) if (!bundle.crews[crew]) e(`crime.crew: unknown crew "${crew}"`);
    };
    conditions.forEach(walk);
    if (!usesCrime) continue;

    // Crime is for adults: nobody under the adult age can meet it.
    const young = new Set(['early', 'child', 'teen']);
    if (def.lifeStages.some((s) => young.has(s))) e(`crime content is for adults (${adultAge}+): its life stages can't include ${[...young].join(', ')}`);
    const contract = bundle.registries.categories.categories[def.category]?.requires;
    if (!requiresAtLeast(def.requires, adultAge) && !requiresAtLeast(contract, adultAge)) e(`crime content is for adults: require { age: { gte: ${adultAge} } }`);
    for (const x of effects) {
      if (x.type === 'crime' && x.action === 'join' && !requiresAtLeast(def.requires, adultAge)) e(`joins a crew, so it must require { age: { gte: ${adultAge} } } itself`);
    }

    // Text values name what the event requires.
    const texts: { text: string; joins: boolean; moves: boolean }[] = [
      { text: `${def.title} ${def.text}`, joins: false, moves: false },
      ...(def.choices ?? []).map((c) => ({ text: c.label, joins: false, moves: false })),
      ...outcomes.flatMap((o) => {
        const fx = o.effects as Effect[];
        const joins = fx.some((x) => x.type === 'crime' && x.action === 'join');
        const moves = joins || fx.some((x) => x.type === 'crime' && (x.action === 'promote' || x.action === 'demote'));
        return [{ text: `${o.text ?? ''} ${fx.flatMap((x) => (x.type === 'history' ? [x.text] : [])).join(' ')}`, joins, moves }];
      }),
    ];
    const member = requiresCrime(def, (c) => c.member === true || c.former === true || c.crew !== undefined);
    const rival = requiresCrime(def, (c) => c.rival === true);
    const ranked = requiresCrime(def, (c) => c.member === true);
    for (const t of texts) {
      if (/\{crew\}/.test(t.text) && !member && !t.joins) e('uses {crew} without requiring a crew (crime: member or former) or joining one in the same outcome');
      if (/\{rivalCrew\}/.test(t.text) && !rival) e('uses {rivalCrew} without requiring a rival crew (crime: rival: true)');
      if (/\{rank\}/.test(t.text) && !ranked && !t.moves) e('uses {rank} without requiring that you are in a crew (crime: member: true)');
      if (INSTRUCTION_WORDS.test(t.text)) e(`crime stays at the level of story and consequences (found instruction wording: "${t.text.match(INSTRUCTION_WORDS)![0]}")`);
    }
    for (const [role, spec] of Object.entries(def.cast ?? {})) {
      if (spec.crew === undefined) continue;
      if (spec.crew === 'rival' && !rival) e(`cast.${role}: a role from the rival crew needs requires: crime: rival: true`);
      else if (spec.crew !== 'rival' && !ranked) e(`cast.${role}: a role from your crew needs requires: crime: member: true`);
      if (spec.crew === 'informant' && !requiresCrime(def, (c) => c.informant === true)) e(`cast.${role}: the informant needs requires: crime: informant: true`);
      if (spec.crew === 'boss' && !requiresCrime(def, (c) => c.leader === false || (c.rank?.lte !== undefined && c.rank.lte < bundle.balance.crime.ranks.length))) e(`cast.${role}: the person who runs the crew above you needs requires: a rank below the top (crime: rank lte ${bundle.balance.crime.ranks.length - 1}, or leader: false)`);
    }
    // Rank, heat and rivalry only change for someone in a crew.
    if (effects.some((x) => x.type === 'crime' && x.action !== 'join' && x.action !== 'heat' && x.action !== 'investigate' && x.action !== 'close') && !ranked && !def.followUpOnly) {
      e('changes standing, rank or the crew, so it must require { crime: { member: true } }');
    }
  }
  return errors;
}
