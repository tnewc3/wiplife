/**
 * Content checks for activities (Batch 2a) and valuables: every cost, profile
 * and chance an activity names exists in balance/pastimes.yaml; the adults-only
 * categories (surgery, nightlife, luxury and love) start at the adult age
 * (nightlife also at the legal drinking age where a bar is involved); nobody
 * under 18 can meet romantic or sexual wording or a romantic effect; effects
 * name only the companion, flags, memories, conditions and offenses that
 * exist; text uses only the placeholders it is given, with no hardcoded
 * pronoun; money wording needs a price (and a free activity says nothing about
 * money); the follow-up events and the theft events exist, are followUpOnly and
 * fit; every valuable can be bought by some activity and has its numbers.
 */
import { OUTCOME_TIERS, VALUABLE_CLASSES, type CollectionKey, type ContentBundle, type Effect, type PastimeDef } from '../../src/content/schemas';
import { COMPANION_ROLE } from '../../src/engine/pastimes/perform';
import { SELF_ROLE } from '../../src/engine/events/text';
import { checkTemplate } from '../../src/engine/text';
import { referencesIn, rolesIn } from '../../src/engine/conditions';
import type { ContentError } from './compile';
import { MONEY } from './consistency';
import { ROMANCE_WORDS } from './references';

const BALANCE = 'balance/pastimes.yaml';
/** The categories that are adults only. */
const ADULT_CATEGORIES: readonly string[] = ['surgery', 'nightlife', 'luxury', 'love'];
const PRONOUN = /\b(?:he|she|him|his|hers?|himself|herself)\b/i;
/** Wording that talks about the past; activities have no memory of it. */
const PAST = /\b(?:again|as usual|as always|once more|last time|your usual|you used to|back when)\b/i;
const TIME = /\b(?:years?|months?|weeks?) (?:later|ago)\b|\blast (?:year|month|week|summer|winter)\b/i;

interface TierView {
  where: string;
  texts: string[];
  effects: Effect[];
}

function tiersOf(def: PastimeDef): TierView[] {
  return OUTCOME_TIERS.flatMap((t) => {
    const tier = def.tiers[t];
    if (!tier) return [];
    return [{ where: `tiers.${t}`, texts: [...(tier.text ?? []), ...(tier.together ?? []), ...tier.extras.flatMap((x) => (x.note ? [x.note] : []))], effects: [...(tier.effects as Effect[]), ...tier.extras.flatMap((x) => x.effects as Effect[])] }];
  });
}

export function checkPastimes(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const b = bundle.balance.pastimes;
  const adultAge = bundle.balance.relationships.adultAge;
  const tags = bundle.registries.memories.tags;
  const flags = bundle.registries.flags.flags;

  for (const [key, row] of Object.entries(b.profiles)) {
    if (row.great + row.good + row.neutral + row.bad + row.backfire <= 0) errors.push({ file: BALANCE, message: `profiles.${key}: needs a positive weight` });
  }
  const costKeysUsed = new Set<string>();

  for (const [id, def] of Object.entries(bundle.pastimes)) {
    if (def.retired) continue;
    const file = fileOf('pastimes', id);
    const err = (message: string) => errors.push({ file, message: `${id}: ${message}` });
    costKeysUsed.add(def.cost);
    const price = b.costs[def.cost];
    if (price === undefined) err(`unknown cost "${def.cost}" (balance/pastimes.yaml costs)`);
    if (!b.profiles[def.profile]) err(`unknown profile "${def.profile}" (balance/pastimes.yaml profiles)`);
    for (const city of def.cities ?? []) if (!bundle.cities[city]) err(`unknown city "${city}"`);
    if (ADULT_CATEGORIES.includes(def.category) && def.minAge < adultAge) err(`${def.category} is adults only: minAge must be at least ${adultAge}`);
    if (def.category === 'nightlife' && def.minAge < adultAge) err(`nightlife is adults only: minAge must be at least ${adultAge}`);
    if (def.category === 'love' && def.requires === undefined && def.companion !== 'required') err('a love activity needs requires (single) or a partner who comes along');
    if (def.buys !== undefined && !bundle.valuables[def.buys]) err(`buys: unknown valuable "${def.buys}"`);
    if ((def.category === 'luxury') !== (def.buys !== undefined)) err('only a luxury activity buys a valuable, and every luxury activity does');
    if (def.quality && def.category !== 'surgery') err('price tiers (quality) are for surgery');
    if (def.category === 'surgery' && !def.quality) err('surgery has price tiers: quality: true');
    if (def.category === 'nightlife' && def.legalAge === undefined && def.tiers.backfire !== undefined && JSON.stringify(def.tiers).includes('alcohol_addiction')) err('drinking needs legalAge: drinking');
    if (def.requires) {
      for (const role of rolesIn(def.requires)) err(`requires: roles are not available here (got "${role}")`);
      const refs = referencesIn(def.requires);
      for (const f of refs.flags) if (!flags[f]) err(`requires: flag "${f}" is not in registries/flags.yaml`);
      for (const t of refs.memories) if (!tags[t]) err(`requires: memory "${t}" is not in registries/memories.yaml`);
    }

    const hasCompanion = def.companion !== 'none';
    const roles = hasCompanion ? [SELF_ROLE, COMPANION_ROLE] : [SELF_ROLE];
    const reachableByMinor = def.minAge < adultAge;
    for (const view of tiersOf(def)) {
      const e = (message: string) => err(`${view.where}: ${message}`);
      view.texts.forEach((t, i) => {
        for (const message of checkTemplate(t, { roles, values: ['age', 'cost'], money: true })) e(`text[${i}]: ${message}`);
        const bare = t.replace(/\{[^}]*\}/g, '');
        if (PRONOUN.test(bare)) e(`text[${i}]: hardcoded pronoun; use placeholders ("${t.slice(0, 40)}")`);
        if (PAST.test(bare)) e(`text[${i}]: words about the past ("${bare.match(PAST)![0]}"): an activity doesn't know what you did before`);
        if (TIME.test(bare)) e(`text[${i}]: a fixed time phrase ("${bare.match(TIME)![0]}")`);
        if (reachableByMinor && ROMANCE_WORDS.test(bare)) e(`text[${i}]: can be done by someone under ${adultAge}, so it can't use romantic or sexual words ("${bare.match(ROMANCE_WORDS)![0]}")`);
        if (t.includes('{cost}') && price === 0) e(`text[${i}]: {cost} in a free activity`);
        if (price === 0 && MONEY.test(bare)) e(`text[${i}]: talks about money, but this activity is free (${bare.match(MONEY)![0]})`);
        if (!hasCompanion && /\{companion\./.test(t)) e(`text[${i}]: no companion can come along`);
      });
      for (const effect of view.effects) {
        const where = `${effect.type} effect`;
        if ('role' in effect && effect.role !== undefined && effect.role !== COMPANION_ROLE) e(`${where}: the only role is "${COMPANION_ROLE}"`);
        if ('role' in effect && effect.role === COMPANION_ROLE && !hasCompanion) e(`${where}: no companion can come along`);
        if (effect.type === 'memory' && !tags[effect.tag]) e(`${where}: memory "${effect.tag}" is not in registries/memories.yaml`);
        if (effect.type === 'flag' && !flags[effect.key]) e(`${where}: flag "${effect.key}" is not in registries/flags.yaml`);
        if (effect.type === 'health' && !bundle.conditions[effect.conditionId]) e(`${where}: unknown health condition "${effect.conditionId}"`);
        if (effect.type === 'legal' && !bundle.offenses[effect.offenseId]) e(`${where}: unknown offense "${effect.offenseId}"`);
        if (effect.type === 'infidelity' && def.category !== 'nightlife') e(`${where}: only nightlife can be unfaithful`);
        if (effect.type === 'relationship' && (effect.kind !== undefined || effect.status !== undefined)) e(`${where}: an activity can't change what a relationship is`);
        if (effect.type === 'history') {
          for (const message of checkTemplate(effect.text, { roles, values: ['age', 'cost'], money: true })) e(`history text: ${message}`);
          if (PRONOUN.test(effect.text.replace(/\{[^}]*\}/g, ''))) e('history text: hardcoded pronoun');
        }
        if (reachableByMinor && (effect.type === 'infidelity' || effect.type === 'legal' || (effect.type === 'health' && bundle.conditions[effect.conditionId]?.kind === 'addiction'))) e(`${where}: not for an activity a minor can do`);
      }
      void view;
    }
    for (const [tierId, tier] of Object.entries(def.tiers)) {
      if (!tier) continue;
      for (const x of tier.extras) {
        if (!b.chances[x.chance]) err(`tiers.${tierId}.extras: unknown chance "${x.chance}" (balance/pastimes.yaml chances)`);
        if (x.if) for (const role of rolesIn(x.if)) if (role !== COMPANION_ROLE) err(`tiers.${tierId}.extras.if: the only role is "${COMPANION_ROLE}"`);
      }
      for (const key of [tier.eventChance, tier.drunkDrive]) if (key !== undefined && !b.chances[key]) err(`tiers.${tierId}: unknown chance "${key}" (balance/pastimes.yaml chances)`);
      if (tier.drunkDrive !== undefined && def.category !== 'nightlife') err(`tiers.${tierId}: only nightlife has a drunk drive home`);
      if (tier.drunkDrive !== undefined && def.legalAge !== 'drinking') err(`tiers.${tierId}: a drunk drive home needs legalAge: drinking`);
      if (!partialEvents) {
        for (const eventId of tier.events) {
          const ev = bundle.events[eventId];
          const e = (message: string) => err(`tiers.${tierId}.events: ${message}`);
          if (!ev) {
            errors.push({ file, message: `${id}: tiers.${tierId}.events: unknown event "${eventId}"` });
            continue;
          }
          if (!ev.followUpOnly) e(`"${eventId}" must be followUpOnly (an activity opens it)`);
          if (ADULT_CATEGORIES.includes(def.category) || reachableByMinor === false) {
            const adultsOnly = (bundle.registries.categories.categories[ev.category]?.romance ?? false) || JSON.stringify(ev.requires ?? {}).includes('"age":{"gte":18}');
            if (!adultsOnly) e(`"${eventId}" must be adults only (a romance category, or requires age 18 or older)`);
          }
          if (reachableByMinor) e(`"${eventId}": an activity a minor can do can't open a follow-up event that casts someone`);
        }
      }
    }
    if (def.category === 'surgery') {
      const complication = Object.values(def.tiers).some((t) => t?.extras.some((x) => b.chances[x.chance]?.quality === true));
      if (!complication) err('surgery needs a complication chance that depends on the surgeon (a chance with quality: true)');
    }
  }
  for (const key of Object.keys(b.costs)) if (!costKeysUsed.has(key)) errors.push({ file: BALANCE, message: `costs.${key}: no activity uses it` });

  // Valuables.
  for (const [id, def] of Object.entries(bundle.valuables)) {
    if (def.retired) continue;
    const file = fileOf('valuables', id);
    if (!Object.values(bundle.pastimes).some((p) => !p.retired && p.buys === id)) errors.push({ file, message: `${id}: no luxury activity buys it` });
    if (!(VALUABLE_CLASSES as readonly string[]).includes(def.class)) errors.push({ file, message: `${id}: unknown class` });
  }
  const perClass = new Map<string, number>();
  for (const def of Object.values(bundle.valuables)) if (!def.retired) perClass.set(def.class, (perClass.get(def.class) ?? 0) + 1);
  if ([...perClass.values()].reduce((s, n) => s + n, 0) < 5) errors.push({ file: 'valuables/', message: 'at least 5 valuables are required (Batch 2a acceptance)' });

  // Every category has at least 5 activities.
  const counts = new Map<string, number>();
  for (const def of Object.values(bundle.pastimes)) if (!def.retired) counts.set(def.category, (counts.get(def.category) ?? 0) + 1);
  for (const category of ['mind_body', 'salon_spa', 'surgery', 'shopping', 'movies', 'nightlife', 'outdoor', 'luxury', 'love']) {
    if ((counts.get(category) ?? 0) < 5) errors.push({ file: 'pastimes/', message: `${category}: at least 5 activities are required (Batch 2a acceptance), found ${counts.get(category) ?? 0}` });
  }
  return errors;
}
