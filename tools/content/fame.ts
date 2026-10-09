/**
 * Content checks for fame in arts and media (E6b): the balance, paths,
 * agents, awards and companies agree with each other; the events the fame step
 * queues exist and are follow-ups; events only use the text values their
 * requirements guarantee; ways in respect each path's youngest age; nothing in
 * fame content is romantic or sexual (and a stalker is for adults only); a
 * minor's deals are signed by a parent; and all the names are made up.
 */
import { FAME_TRIGGERS, type CollectionKey, type Condition, type ContentBundle, type Effect, type EventDef } from '../../src/content/schemas';
import type { ContentError } from './compile';
import { ROMANCE_WORDS } from './references';

const BALANCE = 'balance/fame.yaml';
const REGISTRY = 'registries/fame.yaml';
const TEXT = 'text/fame.yaml';

export function required(condition: Condition | undefined): Condition[] {
  if (!condition) return [];
  if ('all' in condition) return condition.all.flatMap(required);
  return [condition];
}

export function ageFloor(condition: Condition | undefined): number {
  let floor = 0;
  for (const c of required(condition)) {
    if (!('age' in c)) continue;
    const a = c.age;
    floor = Math.max(floor, a.gte ?? 0, a.gt === undefined ? 0 : a.gt + 1, a.eq ?? 0);
  }
  return floor;
}

export function ageCeiling(condition: Condition | undefined): number {
  let ceiling = Infinity;
  for (const c of required(condition)) {
    if (!('age' in c)) continue;
    const a = c.age;
    ceiling = Math.min(ceiling, a.lte ?? Infinity, a.lt === undefined ? Infinity : a.lt - 1, a.eq ?? Infinity);
  }
  return ceiling;
}

export function outcomesOf(def: EventDef) {
  if (def.autoOutcome) return [def.autoOutcome];
  return (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
}

/** True when a requirement of the event guarantees what the text names. */
function requiresFame(def: EventDef, test: (c: NonNullable<Extract<Condition, { fame: unknown }>['fame']>) => boolean): boolean {
  const walk = (c: Condition | undefined): boolean => {
    if (!c) return false;
    if ('all' in c) return c.all.some(walk);
    if ('any' in c) return c.any.length > 0 && c.any.every(walk);
    return 'fame' in c && test(c.fame);
  };
  return walk(def.requires);
}

const FAME_WORD = /\{(project|noun|review|fanLine|rungTitle|nextTitle|pathNoun|secondPath|company|agent|award|headline)\}/g;

export function checkFame(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const b = bundle.balance.fame;
  const { adultAge } = bundle.balance.relationships;
  const independence = bundle.balance.economy.independenceAge;
  const paths = Object.values(bundle.famePaths).filter((p) => !p.retired);
  const ladder = Math.max(...paths.map((p) => p.rungs.length));

  // Balance numbers match the ladders.
  if (b.gain.rung.length < ladder) err(BALANCE, `gain.rung needs a multiple for each of the ${ladder} rungs of the longest ladder`);
  if (b.crossover.rung > ladder) err(BALANCE, 'crossover.rung is above the top rung of every path');
  if (b.bigBreak.jump.min > b.bigBreak.jump.max) err(BALANCE, 'bigBreak.jump: min is greater than max');
  if (b.bigBreak.ceiling.none > b.bigBreak.ceiling.talent) err(BALANCE, 'bigBreak.ceiling: luck alone may not take you higher than a talent that fits');
  if (b.contracts.years.standard.min > b.contracts.years.standard.max) err(BALANCE, 'contracts.years: min is greater than max');
  if (b.tabloids.minAge < adultAge) err(BALANCE, `tabloids.minAge must be at least the adult age ${adultAge}: no secret of anyone under ${adultAge} is printed`);
  if (b.minors.parentAge > independence) err(BALANCE, `minors.parentAge must not be above the independence age ${independence}`);
  if (b.commitment.minorsMax === 'all') err(BALANCE, 'commitment.minorsMax must be below all in: nobody under 18 goes all in');
  if (!(b.commitment.strain.back.close <= b.commitment.strain.steady.close && b.commitment.strain.steady.close <= b.commitment.strain.all.close)) {
    err(BALANCE, 'commitment.strain must grow from holding back to all in');
  }
  if (!(b.gain.commitment.back <= b.gain.commitment.steady && b.gain.commitment.steady <= b.gain.commitment.all)) err(BALANCE, 'gain.commitment must grow from holding back to all in');
  if (!(b.scene.cost.low <= b.scene.cost.social && b.scene.cost.social <= b.scene.cost.entourage && b.scene.cost.entourage <= b.scene.cost.lavish)) err(BALANCE, 'scene.cost must grow from low to lavish');
  const sizes = Object.values(b.income.sizes);
  if (sizes.some((s, i) => i > 0 && s < sizes[i - 1]!)) err(BALANCE, 'income.sizes must grow from petty to major');

  // Paths.
  for (const def of paths) {
    const file = fileOf('famePaths', def.id);
    def.rungs.forEach((r, i) => {
      if (i === 0 && (r.fame !== 0 || r.quality !== 0)) err(file, `${def.id}: the first rung asks nothing (fame 0, quality 0)`);
      if (i > 0 && (r.fame <= def.rungs[i - 1]!.fame || r.quality < def.rungs[i - 1]!.quality || r.income < def.rungs[i - 1]!.income)) {
        err(file, `${def.id}: rung ${i + 1} must ask for more fame and quality, and pay more, than the one before it`);
      }
    });
    if (def.rungs.at(-1)!.fame > 95) err(file, `${def.id}: the top rung's fame must leave room under 100`);
    if (!def.kinds.some((k) => k.minRung === 1)) err(file, `${def.id}: some kind of work must be open on the first rung`);
    for (const k of def.kinds) if (k.minRung > def.rungs.length) err(file, `${def.id}: kind "${k.id}" needs a rung the ladder doesn't have`);
    if (def.tour.minRung > def.rungs.length || def.press.minRung > def.rungs.length) err(file, `${def.id}: tour or press needs a rung the ladder doesn't have`);
    for (const t of def.talents) if (!bundle.talents[t]) err(file, `${def.id}: unknown talent "${t}"`);
    for (const r of def.routes) if (r.minAge < def.minAge) err(file, `${def.id}: route "${r.id}" starts younger than the path allows (${def.minAge})`);
    const weights = Object.values(def.aptitude).reduce((a, w) => a + (w ?? 0), 0);
    if (weights < 0.9 || weights > 1.1) err(file, `${def.id}: aptitude weights should sum to about 1 (got ${weights.toFixed(2)})`);
    if (def.sport === undefined && (bundle.text.fame.titles[def.id]?.length ?? 0) < 8) err(TEXT, `titles.${def.id}: at least 8 titles`);
    if (!Object.values(bundle.fameCompanies).some((c) => c.path === def.id && c.tier === 1 && !c.retired)) err('studios/', `${def.id}: a company that signs newcomers (tier 1)`);
    if (!Object.values(bundle.fameAwards).some((a) => a.path === def.id && !a.retired)) err('awards/', `${def.id}: at least one award`);
    if (def.minAge < 13 && /social/i.test(def.id)) err(file, `${def.id}: social media platforms start at 13`);
  }
  for (const a of Object.values(bundle.fameAwards)) if (!bundle.famePaths[a.path]) err(fileOf('fameAwards', a.id), `${a.id}: unknown path "${a.path}"`);
  for (const c of Object.values(bundle.fameCompanies)) if (!bundle.famePaths[c.path]) err(fileOf('fameCompanies', c.id), `${c.id}: unknown path "${c.path}"`);
  for (const tier of [1, 2, 3]) if (!Object.values(bundle.fameAgents).some((a) => a.tier === tier && !a.retired)) err('agents/', `no agent at tier ${tier}`);
  for (const key of ['affair', 'unknown_crime', 'hidden_debt', 'addiction', 'identity', 'mental_health', 'scandal']) {
    if (!bundle.text.fame.tabloid[key]) err(TEXT, `tabloid.${key}: a headline for every secret kind, and one for the scene`);
  }

  // The events the fame step queues.
  if (!partialEvents) {
    for (const trigger of FAME_TRIGGERS) {
      for (const id of bundle.registries.fame.triggers[trigger].events) {
        const def = bundle.events[id];
        if (!def) {
          err(REGISTRY, `${trigger}: unknown event "${id}"`);
          continue;
        }
        if (!def.followUpOnly) err(fileOf('events', id), `${id}: answers ${trigger}, so it must be followUpOnly (the fame step queues it)`);
      }
    }
    const bands = new Set(['flop', 'solid', 'hit', 'acclaimed', 'cult', 'crowd']);
    for (const band of bands) {
      for (const id of bundle.registries.fame.triggers[band as 'flop'].events) {
        const def = bundle.events[id];
        if (def && !requiresFame(def, (c) => c.last?.includes(band as 'flop') === true)) err(fileOf('events', id), `${id}: answers ${band}, so it must require { fame: { last: [${band}] } }`);
      }
    }
  }

  // Events.
  const young = new Set(['early', 'child', 'teen']);
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
    const outcomes = outcomesOf(def);
    const effects = outcomes.flatMap((o) => o.effects as Effect[]);
    const castFans = Object.values(def.cast ?? {}).some((s) => s.fan !== undefined);
    const usesFame = def.category.startsWith('fame') || effects.some((x) => x.type === 'fame' || x.type === 'famePay') || castFans;
    if (!usesFame) {
      const text = JSON.stringify(def);
      if (FAME_WORD.test(text)) e('uses a fame text value without being a fame event');
      FAME_WORD.lastIndex = 0;
      continue;
    }
    const floor = ageFloor(def.requires);
    const ceiling = ageCeiling(def.requires);
    const reachableByMinor = def.lifeStages.some((s) => young.has(s)) && floor < independence;
    const texts = [def.title, def.text, ...(def.choices ?? []).map((c) => c.label), ...outcomes.flatMap((o) => [o.text ?? '', ...(o.effects as Effect[]).flatMap((x) => (x.type === 'history' ? [x.text] : []))])];

    // Nothing in fame content is romantic, and nothing reachable by a minor reads as romantic or sexual.
    for (const [role, spec] of Object.entries(def.cast ?? {})) {
      if (spec.romantic || spec.admirer) e(`cast.${role}: fame content has no romantic roles (fans are fans)`);
    }
    if (def.category === 'romance' || def.category === 'partner') e('fame content is not romance');
    for (const t of texts) {
      if (reachableByMinor && ROMANCE_WORDS.test(t.replace(/\{[^}]*\}/g, ''))) e(`can be met by someone under ${independence}, so it can't use romantic or sexual words ("${t.match(ROMANCE_WORDS)![0]}")`);
    }

    // A stalker is an adult matter.
    const stalks = effects.some((x) => x.type === 'fame' && x.action === 'stalker') || Object.values(def.cast ?? {}).some((s) => s.fan === 'stalker');
    if (stalks && (floor < adultAge || def.lifeStages.some((s) => young.has(s)))) e(`involves a stalker, so it requires { age: { gte: ${adultAge} } } and no young life stage`);

    // Ways in respect each path's youngest age.
    for (const x of effects) {
      if (x.type !== 'fame') continue;
      if (x.action === 'enter' || x.action === 'cross') {
        const path = bundle.famePaths[x.path!];
        if (!path) {
          e(`unknown path "${x.path}"`);
          continue;
        }
        const route = x.route === undefined ? undefined : path.routes.find((r) => r.id === x.route);
        if (x.action === 'enter' && x.route !== undefined && !route) e(`unknown route "${x.route}" in ${path.id}`);
        const needed = Math.max(path.minAge, route?.minAge ?? 0);
        if (x.action === 'enter' && !requiresFame(def, (c) => c.active === false)) e('starts a career, so it must require { fame: { active: false } }');
        // Sports ways in are checked choice by choice in tools/content/sports.ts.
        if (x.action === 'enter' && !path.sport && floor < needed) e(`starts ${path.id} by "${x.route}", which needs age ${needed}: require { age: { gte: ${needed} } }`);
      }
      if ((x.action === 'contract' || (x.action === 'agent' && x.tier !== 0)) && floor < adultAge) {
        if (!hasParent(def)) e(`signs a deal or an agent, so it requires { age: { gte: ${adultAge} } } or casts the parent who signs for a minor`);
        if (ceiling >= adultAge) e('signs for a minor, so it requires { age: { lte: 17 } }');
      }
    }
    if (ceiling < adultAge && effects.some((x) => x.type === 'fame' && x.action === 'contract') && !hasParent(def)) e('a minor\'s deal is signed by a parent: cast a parent');

    // Fame text values need what they name.
    const used = new Set<string>();
    for (const t of texts) for (const m of t.matchAll(FAME_WORD)) used.add(m[1]!);
    FAME_WORD.lastIndex = 0;
    const active = requiresFame(def, (c) => c.active === true) || def.category === 'fame' || def.category === 'famebiz' || def.category === 'famefans' || def.category === 'famelife';
    const wants: Record<string, [string, (c: NonNullable<Extract<Condition, { fame: unknown }>['fame']>) => boolean]> = {
      project: ['released, last or ceremony', (c) => c.released === true || c.last !== undefined || c.ceremony !== undefined],
      noun: ['released or last', (c) => c.released === true || c.last !== undefined],
      review: ['released or last', (c) => c.released === true || c.last !== undefined],
      fanLine: ['released or last', (c) => c.released === true || c.last !== undefined],
      headline: ['tabloid or scandal', (c) => c.tabloid === true || c.scandal === true],
      award: ['ceremony', (c) => c.ceremony !== undefined],
      company: ['contract: true', (c) => c.contract === true],
      agent: ['an agent (agent gte 1)', (c) => (c.agent?.gte ?? 0) >= 1 || (c.agent?.gt ?? -1) >= 0],
      secondPath: ['second: true', (c) => c.second === true],
      pathNoun: ['a career or a retirement', (c) => c.active === true || c.retired === true || c.path !== undefined],
      rungTitle: ['a career', (c) => c.active === true || c.rung !== undefined],
      nextTitle: ['a career', (c) => c.active === true || c.rung !== undefined],
    };
    for (const name of used) {
      const [what, test] = wants[name]!;
      const ok = requiresFame(def, test) || (what === 'a career' && active) || (name === 'pathNoun' && (active || def.category === 'famepast'));
      if (!ok) e(`uses {${name}} without requiring ${what}`);
    }
  }
  return errors;
}

function hasParent(def: EventDef): boolean {
  return Object.values(def.cast ?? {}).some((s) => s.kind === 'parent' || s.kind === 'stepparent');
}
