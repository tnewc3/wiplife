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
import { OUTCOME_TIERS, RISK_CATEGORIES, VALUABLE_CLASSES, type CollectionKey, type ContentBundle, type Effect, type PastimeDef } from '../../src/content/schemas';
import { houseEdge } from '../../src/engine/pastimes/risk';
import { COMPANION_ROLE } from '../../src/engine/pastimes/perform';
import { SELF_ROLE } from '../../src/engine/events/text';
import { checkTemplate } from '../../src/engine/text';
import { referencesIn, rolesIn } from '../../src/engine/conditions';
import type { ContentError } from './compile';
import { MONEY } from './consistency';
import { INSTRUCTION_WORDS } from './crime';
import { ROMANCE_WORDS } from './references';

const BALANCE = 'balance/pastimes.yaml';
const RISK_BALANCE = 'balance/risk.yaml';
/** The categories of crime and the black market: heat, a record and a crew tilt the odds, and loot comes in. */
const OUTLAW_CATEGORIES: readonly string[] = ['crime', 'black_market'];
/**
 * Batch 2b: risk categories stay at the level of story and consequences. On top of the words the crime content already refuses
 * (methods, tools, named products), these catch quantities, sources, ways to avoid being caught and second-person how-to.
 */
const RISK_INSTRUCTION_WORDS =
  /\b(?:doses?|dosage|milligrams?|\d+\s?(?:mg|g|ml|grams?)\b|where to (?:buy|find|get|sell)|how much to|cut (?:it )?with|dark ?web|darknet|telegram|encrypt\w*|cover your tracks|get away with it|avoid(?:ing)? (?:detection|the police|being caught)|evad(?:e|ing) (?:the )?(?:police|detection)|launder it by|card[- ]?skimm\w*|skimmers?|bump keys?|slim jim|crowbars?|jimm(?:y|ied|ying)|ignition|cash(?:ing)? out|carding|phishing|spoof\w*|keyloggers?|shell compan\w+|offshore|false name|forged?|forgery|template|laminat\w+|hologram\w*|magnetic strip\w*|barcode|serial numbers? (?:off|filed)|file the serial|disarm\w*|wire cutters?|you (?:can|should|must|need to) (?:use|buy|get|pick|steal|take|cut|mix|forge|fake|order))\b/i;
/** The categories that are adults only. */
const ADULT_CATEGORIES: readonly string[] = ['surgery', 'nightlife', 'luxury', 'love'];
const PRONOUN = /\b(?:he|she|him|his|hers?|himself|herself)\b/i;
/** Wording that talks about the past; activities have no memory of it. */
/** The kinds of people an event opened by an activity a minor can do may cast: people already in the life. */
const MINOR_SAFE_KINDS: readonly string[] = ['friend', 'parent', 'sibling', 'grandparent', 'relative'];
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
    return [{ where: `tiers.${t}`, texts: [...(tier.text ?? []), ...(tier.together ?? []), ...(tier.settle ?? []), ...tier.extras.flatMap((x) => (x.note ? [x.note] : []))], effects: [...(tier.effects as Effect[]), ...tier.extras.flatMap((x) => x.effects as Effect[])] }];
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
    const risk = bundle.balance.risk;
    const isRisk = (RISK_CATEGORIES as readonly string[]).includes(def.category);
    if (price === undefined) err(`unknown cost "${def.cost}" (balance/pastimes.yaml costs)`);
    if (def.profile !== undefined && !b.profiles[def.profile]) err(`unknown profile "${def.profile}" (balance/pastimes.yaml profiles)`);
    for (const city of def.cities ?? []) if (!bundle.cities[city]) err(`unknown city "${city}"`);
    if (ADULT_CATEGORIES.includes(def.category) && def.minAge < adultAge) err(`${def.category} is adults only: minAge must be at least ${adultAge}`);
    if (def.category === 'nightlife' && def.minAge < adultAge) err(`nightlife is adults only: minAge must be at least ${adultAge}`);
    if (def.category === 'love' && def.requires === undefined && def.companion !== 'required') err('a love activity needs requires (single) or a partner who comes along');
    if (def.buys !== undefined && !bundle.valuables[def.buys]) err(`buys: unknown valuable "${def.buys}"`);
    if ((def.category === 'luxury') !== (def.buys !== undefined)) err('only a luxury activity buys a valuable, and every luxury activity does');
    if (def.quality && def.category !== 'surgery' && def.category !== 'lawsuits') err('price tiers (quality) are for surgery and lawyers');
    if (def.category === 'surgery' && !def.quality) err('surgery has price tiers: quality: true');
    if (def.category === 'nightlife' && def.legalAge === undefined && def.tiers.backfire !== undefined && JSON.stringify(def.tiers).includes('alcohol_addiction')) err('drinking needs legalAge: drinking');
    if (def.requires) {
      for (const role of rolesIn(def.requires)) err(`requires: roles are not available here (got "${role}")`);
      const refs = referencesIn(def.requires);
      for (const f of refs.flags) if (!flags[f]) err(`requires: flag "${f}" is not in registries/flags.yaml`);
      for (const t of refs.memories) if (!tags[t]) err(`requires: memory "${t}" is not in registries/memories.yaml`);
    }

    // Batch 2b: the rules of each risk category.
    const mechanicOf: Record<string, string> = { crime: 'roll', black_market: 'roll', gambling: 'gamble', lawsuits: 'lawsuit', identity: 'name', loans: 'loan' };
    if (isRisk && def.mechanic !== mechanicOf[def.category]) err(`${def.category} activities use mechanic: ${mechanicOf[def.category]}`);
    if (!isRisk && def.mechanic !== 'roll') err(`mechanic: ${def.mechanic} is for the risk categories`);
    if (INSTRUCTION_WORDS.test(`${def.label} ${def.blurb}`) || RISK_INSTRUCTION_WORDS.test(`${def.label} ${def.blurb}`)) err('stays at the level of story (found instruction wording in the label or blurb)');
    if (def.mechanic === 'gamble') {
      const game = def.game !== undefined ? risk.games[def.game] : undefined;
      if (!game) err(`unknown game "${def.game}" (balance/risk.yaml games)`);
      else {
        if (houseEdge(game) < game.minEdge) errors.push({ file: RISK_BALANCE, message: `games.${def.game}: the house keeps ${(houseEdge(game) * 100).toFixed(1)}% on average; it must keep at least ${(game.minEdge * 100).toFixed(1)}%` });
        for (const o of game.outcomes) if (def.tiers[o.tier] === undefined) err(`tiers.${o.tier} is needed: the game ${def.game} pays out as ${o.tier}`);
        for (const t of OUTCOME_TIERS) if (def.tiers[t] !== undefined && !game.outcomes.some((o) => o.tier === t)) err(`tiers.${t} is never reached: the game ${def.game} does not pay out as ${t}`);
      }
      if (def.legalAge !== 'gambling') err('gambling follows the legal gambling age: legalAge: gambling');
    }
    if (def.mechanic === 'loan') {
      const product = def.loan !== undefined ? risk.loans[def.loan] : undefined;
      if (!product) err(`unknown loan "${def.loan}" (balance/risk.yaml loans)`);
      if (def.minAge < bundle.balance.economy.independenceAge) err(`a loan is for people who can take on debt: minAge must be at least ${bundle.balance.economy.independenceAge}`);
      if (Object.keys(def.tiers).some((t) => t !== 'good')) err('a loan has one outcome: tiers.good (the lender decides before you ask)');
    }
    if (def.mechanic === 'name') {
      if (Object.keys(def.tiers).some((t) => t !== 'good')) err('a name change has one outcome: tiers.good');
      if (def.nameChange === 'partner' && !JSON.stringify(def.requires ?? {}).includes('"romance"')) err('taking a partner\'s name needs requires: romance');
      if (def.nameChange === 'former' && !JSON.stringify(def.requires ?? {}).includes('changed_name')) err('going back to a former name needs requires: flag changed_name');
      if (def.minAge > risk.identity.minorAge) err(`minAge must be at most ${risk.identity.minorAge}, the youngest age with a parent's agreement`);
      if (def.minAge < risk.identity.minorAge) err(`minAge must be at least ${risk.identity.minorAge}, the youngest age with a parent's agreement`);
    }
    if (def.mechanic === 'lawsuit') {
      if (def.minAge < adultAge) err(`a lawsuit is for adults: minAge must be at least ${adultAge}`);
      if ((def.evidence?.length ?? 0) < 2) err('a lawsuit needs at least two pieces of evidence to weigh');
      for (const c of def.evidence ?? []) {
        const refs = referencesIn(c);
        for (const f of refs.flags) if (!flags[f]) err(`evidence: flag "${f}" is not in registries/flags.yaml`);
        for (const t of refs.memories) if (!tags[t]) err(`evidence: memory "${t}" is not in registries/memories.yaml`);
        for (const role of rolesIn(c)) if (role !== COMPANION_ROLE) err(`evidence: the only role is "${COMPANION_ROLE}" (the ex you are suing)`);
        if (rolesIn(c).length > 0 && def.companion !== 'required') err('evidence about the companion needs a companion: required');
      }
      if (def.companion === 'required' && JSON.stringify(def.companionKinds) !== '["ex"]') err('a lawsuit against a person is against an ex: companionKinds: [ex]');
      if (def.tiers.great?.money === undefined || def.tiers.good.money === undefined) err('a won lawsuit pays: tiers.great.money and tiers.good.money');
    }
    if (OUTLAW_CATEGORIES.includes(def.category)) {
      for (const [tierId, tier] of Object.entries(def.tiers)) {
        const legals = [...(tier?.effects ?? []), ...(tier?.extras.flatMap((x) => x.effects) ?? [])].filter((e) => e.type === 'legal') as Extract<Effect, { type: 'legal' }>[];
        const serious = legals.filter((e) => bundle.offenses[e.offenseId] !== undefined && (bundle.offenses[e.offenseId]!.class !== 'misdemeanor' || bundle.offenses[e.offenseId]!.severity > 1));
        // Teens only do the petty ones (a misdemeanor of the lowest severity), with juvenile handling and no dirty money.
        if (def.minAge < adultAge && (serious.length > 0 || tier?.money?.mode === 'dirty')) err(`tiers.${tierId}: a minor can only do petty crime (a misdemeanor of severity 1, no dirty money); make minAge ${adultAge}`);
        if (tier?.money && !['earn', 'dirty'].includes(tier.money.mode)) err(`tiers.${tierId}.money: crime and the black market only bring money in`);
      }
      const caught = (['bad', 'backfire'] as const).filter((t) => def.tiers[t] !== undefined);
      const legalTiers = caught.filter((t) => def.tiers[t]!.effects.some((e) => e.type === 'legal'));
      if (!def.tiers.bad || legalTiers.length === 0) err('a crime ends in the law somewhere: the caught tiers (bad, backfire) need a legal effect');
      if (def.category === 'crime' && (def.cost !== 'nothing')) err('crime costs nothing up front: cost: nothing');
    }
    if (isRisk) {
      for (const [tierId, tier] of Object.entries(def.tiers)) {
        if (!tier) continue;
        if (tier.money && risk.amounts[tier.money.key] === undefined) err(`tiers.${tierId}.money: unknown amount "${tier.money.key}" (balance/risk.yaml amounts)`);
        if (tier.money?.mode === 'dirty' && !OUTLAW_CATEGORIES.includes(def.category)) err(`tiers.${tierId}.money: only crime and the black market pay dirty money`);
        if (tier.money?.mode === 'loss' && def.category !== 'lawsuits') err(`tiers.${tierId}.money: only a lawsuit has court costs`);
        if (tier.money && def.category === 'gambling') err(`tiers.${tierId}.money: gambling pays by its game table`);
        const effects = [...tier.effects, ...tier.extras.flatMap((x) => x.effects)] as Effect[];
        for (const x of effects) {
          if (x.type === 'crime' && x.action !== 'heat') err(`tiers.${tierId}: a crime effect here can only add heat`);
          if (x.type === 'crime' && !OUTLAW_CATEGORIES.includes(def.category) && def.category !== 'loans') err(`tiers.${tierId}: only crime, the black market and a loan shark add heat`);
        }
        const hasLegal = effects.some((x) => x.type === 'legal');
        const paysOut = def.mechanic === 'gamble' || tier.money !== undefined || def.mechanic === 'loan';
        for (const t of [...(tier.text ?? []), ...(tier.together ?? []), ...(tier.settle ?? [])]) {
          if (t.includes('{sentence}') && !hasLegal) err(`tiers.${tierId}: {sentence} without a legal effect`);
          if (t.includes('{amount}') && !paysOut) err(`tiers.${tierId}: {amount} in an outcome that moves no money`);
          if (t.includes('{rate}') && def.mechanic !== 'loan') err(`tiers.${tierId}: {rate} is for loans`);
          if (t.includes('{cost}') && def.mechanic === 'loan' && risk.loans[def.loan ?? '']?.fee === 0) err(`tiers.${tierId}: {cost} in a loan with no fee`);
          if (hasLegal && !t.includes('{sentence}') && def.mechanic === 'roll' && (tierId === 'bad' || tierId === 'backfire')) err(`tiers.${tierId}: the caught outcome should say what the court gave you ({sentence})`);
          if (INSTRUCTION_WORDS.test(t) || RISK_INSTRUCTION_WORDS.test(t)) err(`tiers.${tierId}: stays at the level of story and consequences (found instruction wording: "${(t.match(INSTRUCTION_WORDS) ?? t.match(RISK_INSTRUCTION_WORDS))![0]}")`);
        }
      }
    }

    const hasCompanion = def.companion !== 'none';
    const roles = hasCompanion ? [SELF_ROLE, COMPANION_ROLE] : [SELF_ROLE];
    const reachableByMinor = def.minAge < adultAge;
    for (const view of tiersOf(def)) {
      const e = (message: string) => err(`${view.where}: ${message}`);
      view.texts.forEach((t, i) => {
        for (const message of checkTemplate(t, { roles, values: isRisk ? ['age', 'cost', 'amount', 'rate', 'sentence'] : ['age', 'cost'], money: true })) e(`text[${i}]: ${message}`);
        const bare = t.replace(/\{[^}]*\}/g, '');
        if (PRONOUN.test(bare)) e(`text[${i}]: hardcoded pronoun; use placeholders ("${t.slice(0, 40)}")`);
        if (PAST.test(bare)) e(`text[${i}]: words about the past ("${bare.match(PAST)![0]}"): an activity doesn't know what you did before`);
        if (TIME.test(bare)) e(`text[${i}]: a fixed time phrase ("${bare.match(TIME)![0]}")`);
        if (reachableByMinor && ROMANCE_WORDS.test(bare)) e(`text[${i}]: can be done by someone under ${adultAge}, so it can't use romantic or sexual words ("${bare.match(ROMANCE_WORDS)![0]}")`);
        if (t.includes('{cost}') && price === 0 && def.mechanic !== 'loan') e(`text[${i}]: {cost} in a free activity`);
        // A free activity says nothing about money, unless its outcome moves money (loot, winnings, a loan).
        if (price === 0 && !isRisk && MONEY.test(bare)) e(`text[${i}]: talks about money, but this activity is free (${bare.match(MONEY)![0]})`);
        if (price === 0 && isRisk && MONEY.test(bare) && !t.includes('{amount}') && !t.includes('{cost}') && def.mechanic !== 'name') e(`text[${i}]: talks about money without showing an amount (${bare.match(MONEY)![0]})`);
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
        if (effect.type === 'legal' && !isRisk && reachableByMinor) e(`${where}: not for an activity a minor can do`);
        if (effect.type === 'infidelity' && def.category !== 'nightlife') e(`${where}: only nightlife can be unfaithful`);
        if (effect.type === 'relationship' && (effect.kind !== undefined || effect.status !== undefined)) e(`${where}: an activity can't change what a relationship is`);
        if (effect.type === 'history') {
          for (const message of checkTemplate(effect.text, { roles, values: ['age', 'cost'], money: true })) e(`history text: ${message}`);
          if (PRONOUN.test(effect.text.replace(/\{[^}]*\}/g, ''))) e('history text: hardcoded pronoun');
        }
        if (reachableByMinor && (effect.type === 'infidelity' || (effect.type === 'legal' && !OUTLAW_CATEGORIES.includes(def.category)) || (effect.type === 'health' && bundle.conditions[effect.conditionId]?.kind === 'addiction'))) e(`${where}: not for an activity a minor can do`);
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
          // A1: an activity a minor can do opens only events that are safe for a minor: no romance category, nobody new cast (only
          // people already in the life, as friends and family), and no romantic or sexual words anywhere in the event.
          if (reachableByMinor) {
            if (bundle.registries.categories.categories[ev.category]?.romance) e(`"${eventId}": an activity a minor can do can't open a romance event`);
            for (const [role, c] of Object.entries(ev.cast ?? {})) {
              if (c.createIfMissing || c.romantic || (c.kind === undefined || !MINOR_SAFE_KINDS.includes(c.kind))) e(`"${eventId}": an activity a minor can do can't open an event that casts "${role}" (only friends and family already in the life)`);
            }
            const spoken = JSON.stringify(ev).replace(/\{[^}]*\}/g, '');
            if (ROMANCE_WORDS.test(spoken)) e(`"${eventId}": an activity a minor can do can't open an event with romantic or sexual words ("${spoken.match(ROMANCE_WORDS)![0]}")`);
          }
        }
      }
    }
    if (def.category === 'surgery') {
      const complication = Object.values(def.tiers).some((t) => t?.extras.some((x) => b.chances[x.chance]?.quality === true));
      if (!complication) err('surgery needs a complication chance that depends on the surgeon (a chance with quality: true)');
    }
  }
  for (const key of Object.keys(b.costs)) if (!costKeysUsed.has(key)) errors.push({ file: BALANCE, message: `costs.${key}: no activity uses it` });
  // Batch 2b: balance and content agree.
  const risk = bundle.balance.risk;
  const used = Object.values(bundle.pastimes).filter((p) => !p.retired);
  for (const key of Object.keys(risk.games)) if (!used.some((p) => p.game === key)) errors.push({ file: RISK_BALANCE, message: `games.${key}: no activity plays it` });
  for (const key of Object.keys(risk.loans)) if (!used.some((p) => p.loan === key)) errors.push({ file: RISK_BALANCE, message: `loans.${key}: no activity offers it` });
  for (const key of Object.keys(risk.amounts)) if (!used.some((p) => Object.values(p.tiers).some((t) => t?.money?.key === key))) errors.push({ file: RISK_BALANCE, message: `amounts.${key}: no outcome uses it` });
  if (!bundle.offenses[risk.fakeId.offense]) errors.push({ file: RISK_BALANCE, message: `fakeId.offense: unknown offense "${risk.fakeId.offense}"` });
  if (!flags.fake_id) errors.push({ file: 'registries/flags.yaml', message: 'fake_id: the fake ID flag must be registered' });
  if (!flags.changed_name) errors.push({ file: 'registries/flags.yaml', message: 'changed_name: the name change flag must be registered' });
  for (const [key, p] of Object.entries(risk.loans)) {
    const eco = bundle.balance.economy;
    if (p.kind === 'shark' && p.fee > 0) errors.push({ file: RISK_BALANCE, message: `loans.${key}: a shark's price is its rate, not a fee` });
    if (eco.interest.debts[p.kind] === undefined || eco.debts.termYears[p.kind] === undefined) errors.push({ file: RISK_BALANCE, message: `loans.${key}: economy.yaml has no rate or term for "${p.kind}"` });
  }
  const eco = bundle.balance.economy;
  if (!(eco.interest.debts.bank < eco.interest.debts.payday && eco.interest.debts.payday < eco.interest.debts.shark)) errors.push({ file: 'balance/economy.yaml', message: 'interest.debts: a bank loan costs less than a payday loan, which costs less than a loan shark\'s' });
  const stakes = Object.values(risk.stakes).map((s) => s.price);
  if (stakes.some((v, i) => i > 0 && v <= stakes[i - 1]!)) errors.push({ file: RISK_BALANCE, message: 'stakes: low, medium and high must grow in price' });
  for (const route of ['settle', 'trial'] as const) if (!risk.lawsuits.routes[route]) errors.push({ file: RISK_BALANCE, message: `lawsuits.routes.${route} is missing` });
  for (const key of ['lawsuit_settlement', 'lawsuit_judgment', 'lawsuit_defense']) if (!eco.costs[key]) errors.push({ file: 'balance/economy.yaml', message: `costs.${key} is needed by the lawsuit events` });

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

  // A1: the Activities tab. Every option names an activity that exists; every activity of the tab has something to offer; dating (and any
  // adults-only activity) is adults only in every option; a look change belongs to the salon or shopping; a hobby names a real talent.
  const hubs = bundle.registries.activities.activities;
  const adult = bundle.balance.relationships.adultAge;
  for (const hub of hubs) {
    if (!bundle.registries.icons.icons[hub.icon]) errors.push({ file: 'registries/activities.yaml', message: `${hub.id}: unknown icon "${hub.icon}" (registries/icons.yaml)` });
    if (hub.adultsOnly && hub.minAge < adult) errors.push({ file: 'registries/activities.yaml', message: `${hub.id}: adultsOnly needs minAge ${adult} or more` });
    const options = Object.values(bundle.pastimes).filter((p) => !p.retired && p.hub === hub.id);
    if (['options', 'vacation', 'hobbies'].includes(hub.kind) && options.length < 1) errors.push({ file: 'registries/activities.yaml', message: `${hub.id}: needs at least 1 option (found ${options.length})` });
    if (['doctor', 'own_thing', 'link'].includes(hub.kind) && options.length > 0) errors.push({ file: 'registries/activities.yaml', message: `${hub.id}: a ${hub.kind} activity has a sheet of its own and takes no options` });
  }
  // U2: the categories of the hub have an icon, and a threshold they ask for exists; everything the tab holds can be reached.
  for (const category of bundle.registries.activities.categories) {
    if (!bundle.registries.icons.icons[category.icon]) errors.push({ file: 'registries/activities.yaml', message: `category ${category.id}: unknown icon "${category.icon}" (registries/icons.yaml)` });
    if (category.needs !== undefined && bundle.balance.activities.thresholds[category.needs] === undefined) errors.push({ file: 'registries/activities.yaml', message: `category ${category.id}: needs "${category.needs}", which balance/activities.yaml thresholds does not have` });
    if (!bundle.registries.activities.activities.some((a) => a.category === category.id)) errors.push({ file: 'registries/activities.yaml', message: `category ${category.id}: has no activity` });
  }
  for (const [id, def] of Object.entries(bundle.pastimes)) {
    if (def.retired) continue;
    const file = fileOf('pastimes', id);
    const err = (message: string) => errors.push({ file, message: `${id}: ${message}` });
    if (def.hub === undefined) err('no hub: every activity belongs to an activity of the Activities hub (registries/activities.yaml), so that it can be reached');
    const hub = def.hub === undefined ? undefined : hubs.find((h) => h.id === def.hub);
    if (def.hub !== undefined && !hub) err(`unknown hub "${def.hub}" (registries/activities.yaml)`);
    if (hub?.adultsOnly && def.minAge < adult) err(`${hub.label} is adults only: minAge must be at least ${adult}`);
    if (hub?.adultsOnly && hub.id === 'dating' && def.category !== 'love') err('every option of Dating is in the love category');
    if (def.look !== undefined && !['salon_spa', 'shopping'].includes(def.category)) err('a look change belongs to the salon or shopping');
    if (def.look !== undefined && def.companion !== 'none') err('a look change is chosen alone: companion: none');
    if (def.hobby && (hub?.kind !== 'hobbies' || def.category !== 'hobby')) err('a hobby is an option of Hobbies, in the hobby category');
    if (def.hobby?.talent !== undefined && !bundle.talents[def.hobby.talent]) err(`unknown talent "${def.hobby.talent}"`);
    if (hub?.kind === 'hobbies' && !def.hobby) err('an option of Hobbies has a hobby');
    if (def.hobby) {
      for (const flagKey of [`practiced_${id}`, `skilled_${id}`]) if (!flags[flagKey]) err(`flag "${flagKey}" is not in registries/flags.yaml`);
      if (def.hobby.skill.great < def.hobby.skill.good || def.hobby.skill.good < def.hobby.skill.neutral) err('hobby skill must not fall as the outcome gets better');
    }
  }
  if (bundle.balance.activities.hobbies.skilledAt > 100) errors.push({ file: 'balance/activities.yaml', message: 'hobbies.skilledAt is out of range' });
  const levels = bundle.balance.activities.hobbies.levels;
  if (levels.some((v, i) => i > 0 && v <= levels[i - 1]!)) errors.push({ file: 'balance/activities.yaml', message: 'hobbies.levels must grow' });

  // Every category has at least 5 activities.
  const counts = new Map<string, number>();
  for (const def of Object.values(bundle.pastimes)) if (!def.retired) counts.set(def.category, (counts.get(def.category) ?? 0) + 1);
  for (const category of ['mind_body', 'salon_spa', 'surgery', 'shopping', 'movies', 'nightlife', 'outdoor', 'luxury', 'love', 'social', 'hobby', ...RISK_CATEGORIES]) {
    if ((counts.get(category) ?? 0) < 5) errors.push({ file: 'pastimes/', message: `${category}: at least 5 activities are required (Batch 2a and 2b acceptance), found ${counts.get(category) ?? 0}` });
  }
  return errors;
}
