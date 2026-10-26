/**
 * Content checks for social media (Batch 8): the platforms, niches, balance
 * numbers, brands and events agree with each other; every platform has its
 * own growth model and its own way of paying; the events the social step
 * queues exist, are follow-ups and require what made them happen; events only
 * use the text values their requirements guarantee; handle suggestions are
 * handles you could type; and nothing a minor can meet is romantic, sexual or
 * suggestive, no account is opened for a minor without a parent, and a
 * minor's sponsorship is signed by one.
 */
import { SOCIAL_GROWTH_MODELS, SOCIAL_PAY_MODELS, SOCIAL_TRIGGERS, type CollectionKey, type Condition, type ContentBundle, type Effect, type EventDef } from '../../src/content/schemas';
import { handleIssue } from '../../src/engine/social/query';
import type { ContentError } from './compile';
import { ageCeiling, ageFloor, outcomesOf } from './fame';
import { ROMANCE_WORDS } from './references';

const BALANCE = 'balance/social.yaml';
const REGISTRY = 'registries/social.yaml';
const TEXT = 'text/social.yaml';

const SOCIAL_WORD = /\{(platform|handle|followerWords|niche|postNoun)\}/g;
const PARTNER_KINDS = ['partner', 'fiance', 'spouse', 'ex'];

type SocialFields = NonNullable<Extract<Condition, { social: unknown }>['social']>;

/** True when a requirement of the event guarantees what the test names. */
function requiresSocial(def: EventDef, test: (c: SocialFields) => boolean): boolean {
  const walk = (c: Condition | undefined): boolean => {
    if (!c) return false;
    if ('all' in c) return c.all.some(walk);
    if ('any' in c) return c.any.length > 0 && c.any.every(walk);
    return 'social' in c && test(c.social);
  };
  return walk(def.requires);
}

/** The relationship kinds an event's roles are required to have (in the requirements), or all the cast's own kinds. */
function castKinds(def: EventDef): string[] {
  const kinds: string[] = [];
  for (const spec of Object.values(def.cast ?? {})) if (spec.kind !== undefined) kinds.push(spec.kind);
  const walk = (c: Condition | undefined) => {
    if (!c) return;
    if ('all' in c) c.all.forEach(walk);
    else if ('any' in c) c.any.forEach(walk);
    else if ('role' in c && c.kind !== undefined) kinds.push(...c.kind);
  };
  walk(def.requires);
  return kinds;
}

export function checkSocial(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const b = bundle.balance.social;
  const t = bundle.text.social;
  const independence = bundle.balance.economy.independenceAge;
  const { adultAge } = bundle.balance.relationships;
  const platforms = Object.values(bundle.platforms).filter((p) => !p.retired);
  const path = bundle.famePaths.social;

  // Platforms: each has its own growth model and its own way of paying, numbers of its own, and a way in that exists.
  for (const model of SOCIAL_GROWTH_MODELS) if (platforms.filter((p) => p.growth === model).length !== 1) err('platforms/', `growth model "${model}" must belong to exactly one platform (each platform grows its own way)`);
  for (const model of SOCIAL_PAY_MODELS) if (platforms.filter((p) => p.pay === model).length !== 1) err('platforms/', `pay model "${model}" must belong to exactly one platform (each platform pays its own way)`);
  for (const p of platforms) {
    const file = fileOf('platforms', p.id);
    if (!b.platforms[p.id]) err(BALANCE, `platforms.${p.id}: numbers for the platform ${p.id}`);
    if (p.minAge < 13) err(file, `${p.id}: platforms start at 13`);
    if (path && p.minAge < path.minAge) err(file, `${p.id}: joins younger than the social media career allows (${path.minAge})`);
    for (const r of p.routes) if (!path?.routes.some((x) => x.id === r)) err(file, `${p.id}: unknown route "${r}" of the social media career`);
  }
  for (const id of Object.keys(b.platforms)) if (!bundle.platforms[id]) err(BALANCE, `platforms.${id}: no such platform`);
  for (const [country, age] of Object.entries(b.age.byCountry)) {
    if (!bundle.countries[country]) err(BALANCE, `age.byCountry.${country}: no such country`);
    if (age < 13) err(BALANCE, `age.byCountry.${country}: nobody under 13 joins a platform`);
  }
  if (b.age.default < 13) err(BALANCE, 'age.default: nobody under 13 joins a platform');
  if (path) {
    for (const r of path.routes) if (!platforms.some((p) => p.routes.includes(r.id))) err(fileOf('famePaths', 'social'), `route "${r.id}" starts at no platform (list it in a platform's routes)`);
  }
  if (b.budget.minorShare > b.budget.casualShare + 0.5) err(BALANCE, 'budget.minorShare: a minor does not post more than an adult');
  if (!(b.private.growth <= 1 && b.private.find <= 1)) err(BALANCE, 'private: a private account does not grow or get found more than a public one');
  if (b.sponsor.tier.some((x, i) => i > 0 && x < b.sponsor.tier[i - 1]!)) err(BALANCE, 'sponsor.tier must grow with the brand');
  if (!(b.sponsor.terms.tough <= b.sponsor.terms.standard && b.sponsor.terms.standard <= b.sponsor.terms.generous)) err(BALANCE, 'sponsor.terms must grow from tough to generous');
  const hasBound = (curve: readonly { at: number; x: number }[]) => curve.every((p, i) => i === 0 || p.x >= curve[i - 1]!.x);
  for (const [name, curve] of [['gain.quality', b.gain.quality], ['fame.at', b.fame.at], ['engagement.factor', b.engagement.factor], ['viral.chance', b.viral.chance]] as const) {
    if (!hasBound(curve)) err(BALANCE, `${name}: must not fall as it goes on`);
  }
  if (path && b.fame.at[b.fame.at.length - 1]!.x > 100) err(BALANCE, 'fame.at: fame is at most 100');
  if (b.collab.minAge < 13) err(BALANCE, 'collab.minAge: nobody under 13');

  // Niches: talents exist.
  for (const n of Object.values(bundle.niches)) for (const talent of n.talents) if (!bundle.talents[talent]) err(fileOf('niches', n.id), `${n.id}: unknown talent "${talent}"`);

  // Brands: every tier of the social media path has a fictional brand, and no company, agent or award borrows a platform's name.
  if (path) for (const tier of [1, 2, 3]) if (!Object.values(bundle.fameCompanies).some((c) => c.path === 'social' && c.kind === 'brand' && c.tier === tier && !c.retired)) err('studios/', `social: a brand at tier ${tier} (sponsorships)`);
  const real = platforms.flatMap((p) => p.name.toLowerCase().split('/').map((part) => part.trim())).filter((name) => name.length >= 4);
  for (const c of Object.values(bundle.fameCompanies)) {
    if (real.some((name) => c.name.toLowerCase().includes(name))) err(fileOf('fameCompanies', c.id), `${c.id}: a company, brand or network uses a platform's name; only the platforms use real names`);
  }

  // Text: handle suggestions are handles you could type; the lists are made of lower case words.
  for (const first of t.handleWords.first) {
    for (const second of t.handleWords.second) {
      const handle = `${first}${second}10`;
      const issue = handleIssue(handle, bundle);
      if (issue) err(TEXT, `handleWords: "${handle}" is not an allowed handle (${issue})`);
      if (handle.length + 1 > b.handle.max) err(TEXT, `handleWords: "${handle}" is longer than a handle may be`);
    }
  }
  for (const w of t.reserved) if (w.length < b.handle.min) err(TEXT, `reserved: "${w}" is shorter than any handle`);
  t.followers.forEach((l, i) => {
    if (i === 0 && l.from !== 0) err(TEXT, 'followers: the first line must start at 0');
    if (i > 0 && l.from <= t.followers[i - 1]!.from) err(TEXT, 'followers: lines must be in increasing order');
  });
  t.engagement.forEach((l, i) => {
    if (i === 0 && l.from !== 0) err(TEXT, 'engagement: the first line must start at 0');
    if (i > 0 && l.from <= t.engagement[i - 1]!.from) err(TEXT, 'engagement: lines must be in increasing order');
  });

  // The events the social step queues.
  if (!partialEvents) {
    for (const trigger of SOCIAL_TRIGGERS) {
      for (const id of bundle.registries.social.triggers[trigger].events) {
        const def = bundle.events[id];
        if (!def) {
          err(REGISTRY, `${trigger}: unknown event "${id}"`);
          continue;
        }
        if (!def.followUpOnly) err(fileOf('events', id), `${id}: answers ${trigger}, so it must be followUpOnly (the social step queues it)`);
        if (!requiresSocial(def, (c) => c.happened?.includes(trigger) === true)) err(fileOf('events', id), `${id}: answers ${trigger}, so it must require { social: { happened: [${trigger}] } }`);
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
    const texts = [def.title, def.text, ...(def.choices ?? []).map((c) => c.label), ...outcomes.flatMap((o) => [o.text ?? '', ...(o.effects as Effect[]).flatMap((x) => (x.type === 'history' ? [x.text] : []))])];
    const usesWord = texts.some((x) => x.match(SOCIAL_WORD) !== null);
    SOCIAL_WORD.lastIndex = 0;
    const usesSocial = def.category.startsWith('social') || effects.some((x) => x.type === 'social') || requiresSocial(def, () => true) || usesWord;
    if (!usesSocial) continue;
    const floor = ageFloor(def.requires);
    const ceiling = ageCeiling(def.requires);
    const reachableByMinor = def.lifeStages.some((s) => young.has(s)) && floor < independence;

    // Text values need an account.
    if (usesWord && !requiresSocial(def, (c) => c.account === true || c.creator === true || c.platform !== undefined)) e('uses {platform}, {handle}, {followerWords}, {niche} or {postNoun} without requiring an account: { social: { account: true } }');

    // Nothing a minor can meet is romantic, sexual or suggestive, and nobody under 18 has a partner or an ex to find a post.
    for (const [role, spec] of Object.entries(def.cast ?? {})) if (spec.romantic || spec.admirer) e(`cast.${role}: social media content has no romantic roles`);
    if (def.category === 'romance' || def.category === 'partner') e('social media content is not romance');
    if (reachableByMinor) {
      for (const x of texts) if (ROMANCE_WORDS.test(x.replace(/\{[^}]*\}/g, ''))) e(`can be met by someone under ${independence}, so it can't use romantic or sexual words ("${x.match(ROMANCE_WORDS)![0]}")`);
      if (castKinds(def).some((k) => PARTNER_KINDS.includes(k))) e(`can be met by someone under ${independence}, so it can't be about a partner or an ex`);
    }
    if (castKinds(def).some((k) => PARTNER_KINDS.includes(k)) && (floor < adultAge || def.lifeStages.some((s) => young.has(s)))) e(`is about a partner or an ex, so it requires { age: { gte: ${adultAge} } } and no young life stage`);
    if (castKinds(def).includes('boss') && floor < 16) e('is about a boss, so it requires { age: { gte: 16 } }');

    // An account for a minor has a parent in it; a minor's sponsorship is signed by one.
    const hasParent = castKinds(def).some((k) => k === 'parent' || k === 'stepparent') || Object.values(def.cast ?? {}).some((s) => s.kind === 'parent' || s.kind === 'stepparent');
    const parentRequired = (c: Condition | undefined): boolean => {
      if (!c) return false;
      if ('all' in c) return c.all.some(parentRequired);
      if ('any' in c) return c.any.length > 0 && c.any.every(parentRequired);
      return ('relative' in c && (c.relative.kind === 'parent' || c.relative.kind === 'stepparent') && c.relative.alive === true) || ('age' in c && !('role' in c) && (c.age.gte ?? 0) >= independence);
    };
    const opens = effects.some((x) => x.type === 'social' && x.action === 'open');
    if (opens && floor < independence && !hasParent && !parentRequired(def.requires)) e(`opens an account for someone who can be under ${independence}: cast the parent who says yes, or require a living parent`);
    if (opens && floor < 13) e('opens an account for someone under 13: require { age: { gte: 13 } }');
    if (effects.some((x) => x.type === 'social' && x.action === 'sponsor') && floor < adultAge) {
      if (!hasParent) e(`signs a sponsorship, so it requires { age: { gte: ${adultAge} } } or casts the parent who signs for a minor`);
      if (ceiling >= adultAge) e('signs for a minor, so it requires { age: { lte: 17 } }');
    }
  }
  return errors;
}
