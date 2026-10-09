/**
 * Content checks for the teen years (T1): the events the teen step queues
 * exist, only happen that way and cast only what the step passes in; every
 * crowd, activity, job and rule that content names exists; the balance and the
 * content agree (enough crowds for a school, a rule for every domain); an event
 * that names {clique}, {rival}, {rule}, {school}, {activity} or {job} requires
 * what it names; and the rule that never bends: there is no romance, and no
 * sexual or romantic wording, in anything a person under 18 can meet.
 */
import { RULE_DOMAINS, TEEN_TRIGGERS, type CollectionKey, type Condition, type ContentBundle, type Effect, type EventDef } from '../../src/content/schemas';
import { CHILD_KINDS, isPartnerKind, isRomanceEvent, isRomanticKind } from '../../src/engine/relationships';
import type { ContentError } from './compile';
import { ROMANCE_WORDS } from './references';

const REGISTRY = 'registries/teen.yaml';
const BALANCE = 'balance/teen.yaml';

/** The roles each trigger's events may cast (the step passes these in), and which of them they must cast. */
const TRIGGER_ROLES: Record<(typeof TEEN_TRIGGERS)[number], { allowed: readonly string[]; required: readonly string[] }> = {
  caught: { allowed: ['parent'], required: ['parent'] },
  invited: { allowed: [], required: [] },
  clash: { allowed: ['member', 'foe'], required: ['member', 'foe'] },
  juvenile: { allowed: ['parent'], required: ['parent'] },
};

function required(condition: Condition | undefined): Condition[] {
  if (!condition) return [];
  if ('all' in condition) return condition.all.flatMap(required);
  return [condition];
}

/** True when every way of meeting the condition needs you to be at least this old. */
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

function textsOf(def: EventDef): string[] {
  const texts = [def.title, def.text, ...(def.choices ?? []).map((c) => c.label)];
  for (const o of outcomesOf(def)) {
    if (o.text) texts.push(o.text);
    for (const e of o.effects as Effect[]) if (e.type === 'history') texts.push(e.text);
  }
  return texts;
}

/** True when a part of the requirements mentions this `teen` field in a way that guarantees what the text names. */
function requiresTeen(def: EventDef, test: (t: NonNullable<Extract<Condition, { teen: unknown }>['teen']>) => boolean): boolean {
  const walk = (c: Condition | undefined): boolean => {
    if (!c) return false;
    if ('all' in c) return c.all.some(walk);
    if ('any' in c) return c.any.length > 0 && c.any.every(walk);
    return 'teen' in c && test(c.teen);
  };
  return walk(def.requires);
}

export function checkTeen(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const b = bundle.balance.teen;
  const { adultAge } = bundle.balance.relationships;
  const active = <T extends { retired?: boolean | undefined }>(record: Record<string, T>) => Object.values(record).filter((d) => !d.retired);

  // Balance and content agree.
  if (b.license.permitAge > b.license.licenseAge) err(BALANCE, 'license: permitAge is greater than licenseAge');
  if (b.license.licenseAge < bundle.balance.possessions.drivingAge) err(BALANCE, `license: licenseAge is below the driving age ${bundle.balance.possessions.drivingAge}`);
  if (b.ages.from >= adultAge) err(BALANCE, `ages.from must be below the adult age ${adultAge}`);
  if ((b.rules.tightness.levelAt[0] ?? 0) >= (b.rules.tightness.levelAt[1] ?? 0)) err(BALANCE, 'rules.tightness.levelAt: the first number must be below the second');
  const share = b.jobs.parentShare;
  if ((share[0] ?? 0) > (share[1] ?? 0) || (share[1] ?? 0) > (share[2] ?? 0)) err(BALANCE, 'jobs.parentShare: shares must not shrink as the rule gets stricter');
  if (b.school.cliques.max > active(bundle.cliques).length) err(BALANCE, `school.cliques.max (${b.school.cliques.max}) is more than the ${active(bundle.cliques).length} crowds in src/content/cliques`);
  if (b.focus.none.grades !== 0 || b.focus.none.friends !== 0 || b.focus.none.passion !== 0 || b.focus.none.odd !== 0) err(BALANCE, 'focus.none: a year with no focus gives nothing (grades, friends, passion and odd jobs are 0)');
  for (const age of b.rules.negotiate.looserAt) if (age < b.ages.from || age >= adultAge) err(BALANCE, `rules.negotiate.looserAt: age ${age} is outside the teen years`);
  for (const domain of RULE_DOMAINS) {
    if (!bundle.houseRules[domain]) err('houseRules/', `no house rule for "${domain}" (every domain needs one)`);
  }
  for (const [id, def] of Object.entries(bundle.activities)) {
    if (def.talent !== undefined && !bundle.talents[def.talent]) err(fileOf('activities', id), `${id}: unknown talent "${def.talent}"`);
  }
  if (!bundle.offenses['underage_drinking'] || !bundle.offenses['truancy']) err('offenses/', 'teen events use the offenses underage_drinking and truancy');

  // The events the teen step queues.
  if (!partialEvents) {
    for (const trigger of TEEN_TRIGGERS) {
      const roles = TRIGGER_ROLES[trigger];
      for (const id of bundle.registries.teen.triggers[trigger].events) {
        const def = bundle.events[id];
        if (!def) {
          err(REGISTRY, `${trigger}: unknown event "${id}"`);
          continue;
        }
        const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
        if (!def.followUpOnly) e(`answers ${trigger}, so it must be followUpOnly (the teen step queues it)`);
        const cast = def.cast ?? {};
        for (const role of Object.keys(cast)) if (!roles.allowed.includes(role)) e(`answers ${trigger}, so its cast can only be: ${roles.allowed.join(', ') || 'nobody'} (not "${role}")`);
        for (const role of roles.required) if (!(role in cast) || cast[role]!.optional) e(`answers ${trigger}, so it must cast "${role}" (not optional)`);
        if (trigger === 'caught' && !requiresTeen(def, (t) => t.caught !== undefined && t.caught !== false)) e('answers caught, so it must require { teen: { caught: ... } }');
        if (trigger === 'invited' && !requiresTeen(def, (t) => t.invited === true)) e('answers invited, so it must require { teen: { invited: true } }');
        if (trigger === 'clash' && !requiresTeen(def, (t) => t.clash === true)) e('answers clash, so it must require { teen: { clash: true } }');
      }
    }
  }

  // Events: references and the text values that need something to name.
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
    const conditions: (Condition | undefined)[] = [def.requires, ...(def.weight.modifiers ?? []).map((m) => m.if), ...(def.choices ?? []).map((c) => c.visibleIf)];
    const walk = (c: Condition | undefined): void => {
      if (!c) return;
      if ('all' in c) c.all.forEach(walk);
      else if ('any' in c) c.any.forEach(walk);
      else if ('not' in c) walk(c.not);
      else if ('teen' in c) {
        for (const crowd of c.teen.crowd ?? []) if (!bundle.cliques[crowd]) e(`teen.crowd: unknown crowd "${crowd}"`);
        if (Array.isArray(c.teen.job)) for (const j of c.teen.job) if (!bundle.teenJobs[j]) e(`teen.job: unknown teen job "${j}"`);
        if (Array.isArray(c.teen.activity)) for (const a of c.teen.activity) if (!bundle.activities[a]) e(`teen.activity: unknown team or club "${a}"`);
      }
    };
    conditions.forEach(walk);
    for (const o of outcomesOf(def)) {
      for (const eff of o.effects as Effect[]) {
        if (eff.type !== 'teen') continue;
        if (eff.jobId !== undefined && !bundle.teenJobs[eff.jobId]) e(`teen ${eff.action}: unknown teen job "${eff.jobId}"`);
        if (eff.activityId !== undefined && !bundle.activities[eff.activityId]) e(`teen ${eff.action}: unknown team or club "${eff.activityId}"`);
      }
    }
    const text = textsOf(def).join('\n');
    const uses = (value: string) => new RegExp(`\\{${value}\\}`).test(text);
    if (uses('clique') && !requiresTeen(def, (t) => t.clique === true || t.invited === true || t.clash === true || t.crowd !== undefined)) e('uses {clique} without requiring a crowd (teen: clique, invited or clash)');
    if (uses('rival') && !requiresTeen(def, (t) => t.clash === true || t.rival === true)) e('uses {rival} without requiring a rival crowd (teen: rival or clash)');
    if (uses('rule') && !requiresTeen(def, (t) => t.caught !== undefined && t.caught !== false)) e('uses {rule} without requiring teen: caught');
    if (uses('activity') && !requiresTeen(def, (t) => t.activity !== undefined && t.activity !== false)) e('uses {activity} without requiring a team or club (teen: activity)');
    if (uses('job') && !requiresTeen(def, (t) => t.job !== undefined && t.job !== false)) e('uses {job} without requiring a teen job (teen: job)');
    if (uses('school') && !required(def.requires).some((c) => 'education' in c && c.education.program !== undefined && !c.education.program.includes('none'))) e('uses {school} without requiring that you are in school (education: program)');
    // A crowd role's person is cast from your crowd: it needs one.
    for (const [role, spec] of Object.entries(def.cast ?? {})) {
      if (spec.crowd === 'yours' && !requiresTeen(def, (t) => t.clique === true || t.crowd !== undefined)) e(`cast.${role}: a role from your crowd needs requires: teen: clique`);
      if (spec.crowd === 'rival' && !requiresTeen(def, (t) => t.rival === true || t.clash === true)) e(`cast.${role}: a role from the rival crowd needs requires: teen: rival or clash`);
    }
  }

  // No romance or sexual content, ever, for anyone under the adult age. An event a person under 18 can meet: its life stages
  // include a young one and nothing in its requirements keeps it to adults.
  const young = new Set(['early', 'child', 'teen']);
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    if (!def.lifeStages.some((s) => young.has(s)) || requiresAtLeast(def.requires, adultAge)) continue;
    const e = (message: string) => err(fileOf('events', id), `${id}: ${message} (a person under ${adultAge} can meet this event: there is never romance or sexual content involving anyone under ${adultAge})`);
    if (isRomanceEvent(def, bundle)) e('is a romance event');
    for (const [role, spec] of Object.entries(def.cast ?? {})) {
      if (spec.romantic || spec.admirer) e(`cast.${role} is ${spec.romantic ? 'a potential partner' : 'an admirer'}`);
      if (spec.kind !== undefined && (isRomanticKind(spec.kind) || isPartnerKind(spec.kind))) e(`cast.${role} is a ${spec.kind}`);
    }
    for (const o of outcomesOf(def)) {
      for (const eff of o.effects as Effect[]) {
        if (eff.type === 'relationship' && eff.kind !== undefined && (isRomanticKind(eff.kind) || CHILD_KINDS.includes(eff.kind))) e(`makes someone your ${eff.kind}`);
        if (eff.type === 'infidelity' || eff.type === 'pregnancy' || (eff.type === 'introduce' && eff.result === 'romance')) e(`has a ${eff.type} effect`);
      }
    }
    for (const text of textsOf(def)) {
      const hit = text.match(ROMANCE_WORDS);
      if (hit) e(`uses romantic or sexual wording ("${hit[0]}")`);
    }
  }

  // The teen content itself: crowds, teams, jobs, rules and history lines.
  const check = (file: string, label: string, texts: readonly string[]) => {
    for (const t of texts) {
      const hit = t.match(ROMANCE_WORDS);
      if (hit) err(file, `${label}: uses romantic or sexual wording ("${hit[0]}"); there is never romance or sexual content involving anyone under ${adultAge}`);
    }
  };
  for (const [id, d] of Object.entries(bundle.cliques)) check(fileOf('cliques', id), id, [d.name, d.blurb]);
  for (const [id, d] of Object.entries(bundle.activities)) check(fileOf('activities', id), id, [d.name, d.blurb]);
  for (const [id, d] of Object.entries(bundle.teenJobs)) check(fileOf('teenJobs', id), id, [d.name, d.blurb, ...d.employers]);
  for (const [id, d] of Object.entries(bundle.houseRules)) check(fileOf('houseRules', id), id, [d.name, ...d.levels]);
  for (const [key, group] of Object.entries(bundle.text.teen.history)) check('text/teen.yaml', `history.${key}`, group.variants);
  // A crowd's name must not read as a stand-in for a real-world group: made-up words only.
  for (const [id, d] of Object.entries(bundle.cliques)) {
    if (/\b(?:goths?|jocks?|nerds?|geeks?|preps?|preppy|preppies|emos?|skaters?|hipsters?|cheerleaders?|burnouts?|ghetto|trailer|rich|poor|white|black|asian|latino|latina|hispanic|christians?|muslims?|jewish|jews|church|mosque|temple)\b/i.test(`${d.name} ${d.blurb}`)) {
      err(fileOf('cliques', id), `${id}: a crowd is made up and says nothing about race, religion, background or money (found a stereotype word)`);
    }
  }
  return errors;
}
