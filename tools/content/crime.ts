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
const CRIME_CATEGORIES = ['crimeoffers', 'crime', 'crimeaway', 'crimehome', 'crimelaw', 'crimepast', 'youthoffers', 'youthcrime'];
/** O1 follow-up: the categories of youth crews (teens from the youth age). */
const YOUTH_CATEGORIES = ['youthoffers', 'youthcrime'];

function required(condition: Condition | undefined): Condition[] {
  if (!condition) return [];
  if ('all' in condition) return condition.all.flatMap(required);
  return [condition];
}

function requiresAtLeast(condition: Condition | undefined, age: number): boolean {
  return required(condition).some((c) => {
    if (!('age' in c) || 'role' in c) return false;
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
export const INSTRUCTION_WORDS =
  /\b(?:lock\s?pick\w*|hot[- ]?wir\w*|bypass\w*|disable the alarm|jam(?:ming)? the signal|step[- ]by[- ]step|tutorial|here'?s how|how to|recipe|synthesi[sz]\w*|detonat\w*|explosive\w*|fentanyl|heroin|cocaine|meth(?:amphetamine)?|glock|ar-?15|ak-?47|silencer|suppressor|untraceable|burner phone|vpn|crypto\w*|bitcoin)\b/i;

const STEREOTYPE_WORDS =
  /\b(?:mafia|cartel|yakuza|triads?|bloods|crips|mob|gangs?ters?|italian|irish|russian|mexican|colombian|chinese|asian|latino|latina|hispanic|black|white|christians?|muslims?|jewish|jews|church|mosque|temple|cosa nostra|hell'?s angels)\b/i;

/** Does the event's category itself require being away? */
function requiresCategoryAway(bundle: ContentBundle, def: EventDef): boolean {
  return required(bundle.registries.categories.categories[def.category]?.requires).some((c) => 'crime' in c && c.crime.away === true);
}

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
  b.ranks.forEach((r, i) => {
    if (r.cut && i < 3) err(BALANCE, `ranks[${i}].cut: only the two highest ranks take a yearly cut`);
  });
  if (!b.ranks.slice(3).every((r) => r.cut)) err(BALANCE, 'the two highest ranks each need a cut (ranks[3] and ranks[4])');
  if (b.ranks[4]!.cut && b.ranks[3]!.cut && b.ranks[4]!.cut.amount < b.ranks[3]!.cut.amount) err(BALANCE, 'ranks[4].cut.amount is below the rank before it');
  if (b.away.suspicion.bands.some((v, i) => i > 0 && v <= b.away.suspicion.bands[i - 1]!)) err(BALANCE, 'away.suspicion.bands must increase');
  if (b.away.floor > b.standing.lowAt + 40) err(BALANCE, 'away.floor is too high: standing should still be able to fade');
  const r = b.away.rejoin;
  if (r.pushed.rankDrop < r.drifted.rankDrop || r.drifted.rankDrop < r.moved.rankDrop || r.moved.rankDrop < r.left.rankDrop) err(BALANCE, 'away.rejoin: rankDrop should grow from left to moved to drifted to pushed');
  const lt = b.dirty.laundering.tiers;
  if (lt.some((t, i) => i > 0 && (t.fee > lt[i - 1]!.fee || t.risk < lt[i - 1]!.risk || t.capacity < lt[i - 1]!.capacity))) {
    err(BALANCE, 'dirty.laundering.tiers: a higher tier charges less, is riskier and takes more');
  }
  if (lt[0]!.rank !== 0) err(BALANCE, 'dirty.laundering.tiers[0].rank must be 0: a first-tier business is open to anyone holding dirty money');
  if (b.heat.bands.length !== 4 || b.standing.bands.length !== 4) err(BALANCE, 'heat and standing have five words each: four band starts');
  const sizes = Object.values(b.jobs.sizes);
  if (sizes.some((s, i) => i > 0 && (s.payout < sizes[i - 1]!.payout || s.heat < sizes[i - 1]!.heat))) err(BALANCE, 'jobs.sizes must grow in payout and heat from petty to major');

  // O1: kinds, member jobs, neighborhoods, generated names and numbers.
  const o = bundle.balance.orgs;
  const dirtyTexts = (file: string, label: string, ...texts: string[]) => {
    for (const t of texts) {
      if (INSTRUCTION_WORDS.test(t)) err(file, `${label}: crime stays at the level of story (found instruction wording: "${t.match(INSTRUCTION_WORDS)![0]}")`);
    }
  };
  for (const kind of ['street_gang', 'mafia', 'cartel', 'motorcycle_club'] as const) {
    const def = bundle.orgKinds[kind];
    const file = fileOf('orgKinds', kind);
    if (!def) {
      err('orgKinds/', `no definition for the kind ${kind}`);
      continue;
    }
    for (const id of def.jobs) {
      const job = bundle.orgJobs[id];
      if (!job) err(file, `${kind}: unknown job "${id}"`);
      else if (!job.kinds.includes(kind)) err(file, `${kind}: job "${id}" is not for this kind`);
    }
    if (!def.jobs.some((id) => bundle.orgJobs[id]?.effect === 'earn' || bundle.orgJobs[id]?.effect === 'supply')) err(file, `${kind}: needs at least one job that earns`);
    if (!def.jobs.includes('lie_low')) err(file, `${kind}: needs the lie_low job (the way to cool things)`);
    if (def.supplies && def.buys) err(file, `${kind}: a kind supplies or buys its drugs, not both`);
    if (def.codes.some((c) => c.check === 'heat' && c.over === undefined)) err(file, `${kind}: a heat code needs "over"`);
    dirtyTexts(file, kind, def.blurb, def.initiation.blurb, def.initiation.name, ...def.codes.map((c) => c.text));
    if (active(bundle.crews).filter((c) => c.kind === kind).length < 2) err('crews/', `at least two crews of kind ${kind}`);
  }
  if (!Object.values(bundle.orgKinds).some((k) => k.supplies)) err('orgKinds/', 'a cartel supplies drugs: some kind must supply');
  for (const [id, job] of Object.entries(bundle.orgJobs)) {
    const file = fileOf('orgJobs', id);
    if ((job.effect === 'earn' || job.effect === 'supply' || job.effect === 'launder') && job.size === undefined) err(file, `${id}: a job that moves money needs a size`);
    if (job.effect === 'supply' && !job.kinds.every((k) => bundle.orgKinds[k]?.supplies)) err(file, `${id}: only a kind that supplies has a supply job`);
    if (job.minRank !== undefined && job.minRank >= 5) err(file, `${id}: minRank is for a member below the top`);
    dirtyTexts(file, id, job.name, job.blurb, job.done, job.bust);
    if (!/\{member\}/.test(job.done) || !/\{member\}/.test(job.bust)) err(file, `${id}: the recap lines name {member}`);
    if (job.effect === 'earn' && !(/\{amount\}/.test(job.done) && /\{amount\}/.test(job.bust))) err(file, `${id}: an earning job's lines show {amount}`);
    if (STEREOTYPE_WORDS.test(`${job.name} ${job.blurb}`.replace(/\b(?:mafia|cartel)\b/gi, ''))) err(file, `${id}: a job says nothing about race, religion, nationality or background`);
  }
  for (const [kind, parts] of Object.entries(bundle.registries.orgs.names)) {
    for (const t of [...parts.patterns, ...parts.first, ...parts.second]) {
      if (STEREOTYPE_WORDS.test(t.replace(/\b(?:mafia|cartel)\b/gi, '')) || INSTRUCTION_WORDS.test(t)) err('registries/orgs.yaml', `names.${kind}: "${t}" is not a made-up name that says nothing about background`);
    }
    if (!parts.patterns.every((p) => p.includes('{a}'))) err('registries/orgs.yaml', `names.${kind}: every pattern needs {a}`);
  }
  for (const city of active(bundle.cities)) {
    const hoods = city.neighborhoods ?? [];
    const crewsHere = active(bundle.crews).some((c) => c.cities.includes(city.id));
    if (crewsHere && hoods.length < 4) err(fileOf('cities', city.id), `${city.id}: needs at least four neighborhoods for organizations to hold`);
    if (new Set(hoods.map((h) => h.id)).size !== hoods.length) err(fileOf('cities', city.id), `${city.id}: duplicate neighborhood ids`);
    if (new Set(hoods.map((h) => h.name)).size !== hoods.length) err(fileOf('cities', city.id), `${city.id}: duplicate neighborhood names`);
    if (STEREOTYPE_WORDS.test(hoods.map((h) => h.name).join(' '))) err(fileOf('cities', city.id), `${city.id}: a neighborhood name says nothing about race, religion, nationality or background`);
  }
  if (o.territory.income.some((v, i) => i > 0 && v < o.territory.income[i - 1]!)) err('balance/orgs.yaml', 'territory.income must not fall from value 1 to 5');
  if (!(o.cut.low.keep < o.cut.fair.keep && o.cut.fair.keep < o.cut.high.keep)) err('balance/orgs.yaml', 'cut: keep must rise from low to fair to high');
  if (!(o.cut.low.loyalty >= o.cut.fair.loyalty && o.cut.fair.loyalty >= o.cut.high.loyalty)) err('balance/orgs.yaml', 'cut: loyalty must not rise as you keep more');
  if (!(o.jobs.danger.low.arrest <= o.jobs.danger.medium.arrest && o.jobs.danger.medium.arrest <= o.jobs.danger.high.arrest)) err('balance/orgs.yaml', 'jobs.danger: arrest odds must rise from low to high');
  if (!(o.jobs.danger.low.killed <= o.jobs.danger.medium.killed && o.jobs.danger.medium.killed <= o.jobs.danger.high.killed)) err('balance/orgs.yaml', 'jobs.danger: death odds must rise from low to high');
  if (o.jobs.danger.low.killed !== 0) err('balance/orgs.yaml', 'jobs.danger.low.killed must be 0: a safe job never kills');
  for (const [name, bands] of [['bands.strength', o.bands.strength], ['bands.attitude', o.bands.attitude], ['bands.member', o.bands.member]] as const) {
    if (bands.some((v, i) => i > 0 && v <= bands[i - 1]!)) err('balance/orgs.yaml', `${name} must increase`);
  }
  for (const drug of o.supply.drugs) if (!bundle.drugs[drug]) err('balance/orgs.yaml', `supply.drugs: unknown drug "${drug}"`);
  for (const [kind, n] of Object.entries(o.roster.cap)) if (n < b.entry.members.max) err('balance/orgs.yaml', `roster.cap.${kind}: below the members a crew starts with (${b.entry.members.max})`);
  if (o.world.attitude.mean > 0) err('balance/orgs.yaml', 'world.attitude.mean: rivals start wary or hostile, not friendly');

  // O1 follow-up: youth crews.
  if (o.youth.memberAge.min < o.youth.minAge) err('balance/orgs.yaml', 'youth.memberAge.min must be at least the youth age: nobody younger is in a youth crew');
  if (o.youth.minAge >= adultAge) err('balance/orgs.yaml', 'youth.minAge must be below the adult age');
  for (const city of active(bundle.cities)) {
    const here = active(bundle.crews).filter((c) => c.cities.includes(city.id));
    if (here.length > 0 && !here.some((c) => c.youth === true)) err(fileOf('cities', city.id), `${city.id}: has crews but no youth crew for a teen to join`);
    if (here.length > 0 && !here.some((c) => c.youth !== true)) err(fileOf('cities', city.id), `${city.id}: has only youth crews, and an adult needs one to join`);
  }

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
        if ((name === 'away' || name === 'awayCut') && !(requiresCrime(def, (c) => c.away === true) || requiresCategoryAway(bundle, def))) e(`answers ${name}, so it must require { crime: { away: true } }`);
        if (name === 'back' && !requiresCrime(def, (c) => c.returned === true)) e('answers back, so it must require { crime: { returned: true } }');
        if (name === 'cut') {
          if (!outcomesOf(def).some((o) => (o.effects as Effect[]).some((x) => x.type === 'dirtyMoney' && x.cut === true))) e('answers cut, so some outcome must pay your cut (dirtyMoney cut)');
          if (!requiresCrime(def, (c) => c.rank?.gte !== undefined && c.rank.gte >= bundle.balance.crime.ranks.length - 1 || c.rank?.eq !== undefined && c.rank.eq >= bundle.balance.crime.ranks.length - 1)) e('answers cut, so it must require one of the top two ranks');
          if (!requiresCrime(def, (c) => c.away === false)) e('answers cut, so it must require { crime: { away: false } } (nothing is shared while you are far away)');
        }
        if (name === 'pushedOut' && !requiresCrime(def, (c) => c.standing !== undefined)) e('answers pushedOut, so it must require a low standing');
        // O1: the organization's own triggers.
        if (name === 'initiation') {
          if (!requiresCrime(def, (c) => c.initiating === true)) e('answers initiation, so it must require { crime: { initiating: true } }');
          if (!requiresCrime(def, (c) => c.kind !== undefined && c.kind.length === 1)) e('answers initiation, so it must require exactly one kind (crime: kind)');
          if (!outcomesOf(def).some((o) => (o.effects as Effect[]).some((x) => x.type === 'crime' && x.action === 'promote'))) e('answers initiation, so some outcome must promote you');
        }
        if (name === 'contest' && !requiresCrime(def, (c) => c.territory?.gte !== undefined && c.territory.gte >= 1)) e('answers contest, so it must require a held neighborhood (crime: territory gte 1)');
        if ((name === 'war' || name === 'truce' || name === 'betrayal') && !requiresCrime(def, (c) => c.war === true || c.rival === true)) e(`answers ${name}, so it must require { crime: { war: true } } (or a rival)`);
        if (name === 'truce' && !outcomesOf(def).some((o) => (o.effects as Effect[]).some((x) => x.type === 'crime' && x.action === 'truce'))) e('answers truce, so some outcome must make the truce');
        if ((name === 'discipline' || name === 'supply') && !requiresCrime(def, (c) => c.leader === true)) e(`answers ${name}, so it must require { crime: { leader: true } }: they are a leader's decisions`);
        if (name === 'supply' && !requiresCrime(def, (c) => c.kind?.includes('cartel') === true)) e('answers supply, so it must require a cartel (crime: kind: [cartel])');
      }
    }
  }

  // Deaths: rare, never out of nowhere. A death in a crew life comes only from a choice that clearly signals danger,
  // on a check you can fail, in an event that needs a visible build-up, with a way out in the same event.
  const causes = bundle.registries.crime.deathCauses;
  for (const cause of causes) if (!bundle.causes[cause]) err(REGISTRY, `deathCauses: unknown cause of death "${cause}"`);
  if (!partialEvents) {
    for (const cause of causes) {
      if (!Object.values(bundle.events).some((d) => !d.retired && outcomesOf(d).some((o) => (o.effects as Effect[]).some((x) => x.type === 'death' && x.cause === cause)))) err(REGISTRY, `deathCauses: no event ends in "${cause}"`);
    }
  }
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
    const choices = def.choices ?? [];
    const deadly = (o: { effects: unknown } | undefined) => ((o?.effects ?? []) as Effect[]).some((x) => x.type === 'death' && causes.includes(x.cause));
    const anyDeath = outcomesOf(def).some(deadly);
    if (!anyDeath) continue;
    if (!def.followUpOnly) e('a crew death comes only from an event the crime step queues (followUpOnly)');
    if (def.autoOutcome && deadly(def.autoOutcome)) e('a crew death is never automatic: it follows a choice');
    if (!requiresCrime(def, (c) => c.rivalry?.gte !== undefined && c.rivalry.gte >= 50) && !requiresCrime(def, (c) => c.heat?.gte !== undefined && c.heat.gte >= 10) && !required(def.requires).some((c) => 'flag' in c)) {
      e('a crew death needs a visible build-up: require rivalry of at least 50, heat of at least 10, or a flag that proves the danger');
    }
    for (const c of choices) {
      if (c.outcome && deadly(c.outcome)) e(`choices.${c.id}: a crew death is a risk you take on a check, never the certain result of a choice`);
      if (c.check) {
        if (deadly(c.check.success)) e(`choices.${c.id}: death on success`);
        if (deadly(c.check.failure) && c.check.base < 50) e(`choices.${c.id}: a check that can end in death must have a base of at least 50 (rare, never out of nowhere)`);
      }
    }
    if (!choices.some((c) => !deadly(c.outcome) && !deadly(c.check?.success) && !deadly(c.check?.failure))) e('a crew death needs a way out: at least one choice that cannot end in death');
    if (def.rarity === 'common') e('an event that can end in death is not common');
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

    // Crime is for adults, except the youth crews (O1 follow-up): teens from the youth age can be asked in or start a crew, and the
    // content for them has no dirty money, no death, no laundering and no life stage under the youth age.
    const contract = bundle.registries.categories.categories[def.category]?.requires;
    const youth = YOUTH_CATEGORIES.includes(def.category);
    const youthMin = bundle.balance.orgs.youth.minAge;
    if (youth) {
      const tooYoung = new Set(['early', 'child']);
      if (def.lifeStages.some((s) => tooYoung.has(s))) e(`youth crew content is for ${youthMin}+: its life stages can't include ${[...tooYoung].join(', ')}`);
      if (!requiresAtLeast(def.requires, youthMin) && !requiresAtLeast(contract, youthMin)) e(`youth crew content is for ${youthMin}+: require { age: { gte: ${youthMin} } }`);
      for (const x of effects) {
        if (x.type === 'dirtyMoney') e('a youth event never moves dirty money: a kid has none');
        if (x.type === 'death') e('a youth event never ends in death');
        if (x.type === 'crime' && x.action === 'join' && !requiresAtLeast(def.requires, youthMin)) e(`joins a youth crew, so it must require { age: { gte: ${youthMin} } } itself`);
      }
    } else {
      const young = new Set(['early', 'child', 'teen']);
      if (def.lifeStages.some((s) => young.has(s))) e(`crime content is for adults (${adultAge}+): its life stages can't include ${[...young].join(', ')}`);
      if (!requiresAtLeast(def.requires, adultAge) && !requiresAtLeast(contract, adultAge)) e(`crime content is for adults: require { age: { gte: ${adultAge} } }`);
      for (const x of effects) {
        if (x.type === 'crime' && x.action === 'join' && !requiresAtLeast(def.requires, adultAge)) e(`joins a crew, so it must require { age: { gte: ${adultAge} } } itself`);
      }
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
