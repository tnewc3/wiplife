/**
 * Content checks for businesses (W3): the kinds of business and the chains agree
 * with the cities, jobs and trades; the events the business step queues exist,
 * only happen that way and are about a business; an event only names a business, or
 * the people of one, where it requires one; every id a condition names exists;
 * and the balance covers every city. Brands, chains and shops are fictional.
 */
import { BUSINESS_TRIGGERS, type CollectionKey, type Condition, type ContentBundle, type Effect, type EventDef } from '../../src/content/schemas';
import type { ContentError } from './compile';

const REGISTRY = 'registries/business.yaml';
const BALANCE = 'balance/business.yaml';

function outcomesOf(def: EventDef) {
  if (def.autoOutcome) return [def.autoOutcome];
  return (def.choices ?? []).flatMap((c) => (c.outcome ? [c.outcome] : c.check ? [c.check.success, c.check.failure] : []));
}

function textsOf(def: EventDef): string[] {
  const texts = [def.title, def.text, ...(def.choices ?? []).map((c) => c.label)];
  for (const o of outcomesOf(def)) if (o.text) texts.push(o.text);
  return texts;
}

function parts(c: Condition | undefined): Condition[] {
  if (!c) return [];
  if ('all' in c) return c.all.flatMap(parts);
  return [c];
}

const requires = (def: EventDef, test: (c: Condition) => boolean) => parts(def.requires).some(test);

/** The triggers whose event is about a business that is no longer there (it failed). */
const AFTER_FAILURE = new Set(['failure', 'investorLoss']);

export function checkBusiness(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const bal = bundle.balance.business;
  const reg = bundle.registries.business;

  // The kinds of business.
  const seenNames = new Map<string, string>();
  for (const [id, d] of Object.entries(bundle.businesses)) {
    const at = (m: string) => err(fileOf('businesses', id), `${id}: ${m}`);
    if (d.occupation !== undefined && !bundle.jobs[d.occupation]) at(`occupation: unknown job "${d.occupation}"`);
    if (d.license) {
      if (!bundle.trades[d.license.trade]) at(`license.trade: unknown trade "${d.license.trade}"`);
      if (!bundle.jobs[d.license.job]) at(`license.job: unknown job "${d.license.job}"`);
      if (d.occupation === undefined) at('a licensed business needs an occupation (its workers hold the licence by working in it)');
    }
    if (new Set(d.names).size !== d.names.length) at('names repeat');
    for (const n of d.names) {
      const other = seenNames.get(n.toLowerCase());
      if (other && other !== id) at(`the name "${n}" is also used by ${other}`);
      seenNames.set(n.toLowerCase(), id);
    }
    if (/\b(?:he|she|him|her|his|hers)\b/i.test(d.blurb)) at('blurb hardcodes a pronoun');
    // A premium style costs more than a budget one, and earns more per customer.
    const s = d.styles;
    if (!(s.budget.startup < s.standard.startup && s.standard.startup < s.premium.startup)) at('startup costs must rise from budget to premium');
    if (!(s.budget.spend < s.standard.spend && s.standard.spend < s.premium.spend)) at('spend per customer must rise from budget to premium');
    if (!(s.budget.demand >= s.standard.demand && s.standard.demand >= s.premium.demand)) at('demand must not rise from budget to premium (fewer, pricier customers)');
    if (!(s.budget.quality <= s.standard.quality && s.standard.quality <= s.premium.quality)) at('quality must not fall from budget to premium');
    for (const style of ['budget', 'standard', 'premium'] as const) {
      if (s[style].demand > s[style].capacity * 1.5) at(`${style}: demand is far above what one location can serve`);
    }
  }

  // The chains.
  for (const [id, c] of Object.entries(bundle.chains)) {
    const at = (m: string) => err(fileOf('chains', id), `${id}: ${m}`);
    if (!bundle.businesses[c.type]) at(`type: unknown business "${c.type}"`);
    for (const city of c.cities) if (!bundle.cities[city]) at(`cities: unknown city "${city}"`);
    if (c.locations.min > c.locations.max) at('locations: min is greater than max');
    if (c.locations.max > bal.limits.locations) at(`locations.max is above the limit of ${bal.limits.locations} locations`);
    if (new Set(c.cities).size !== c.cities.length) at('cities repeat');
  }

  // Balance.
  // (A city with no numbers of its own is an average one: size, wealth and competition of 1.)
  for (const city of Object.keys(bal.cities)) if (!bundle.cities[city]) err(BALANCE, `cities: unknown city "${city}"`);
  if (bal.limits.minAge < bundle.balance.economy.independenceAge) err(BALANCE, 'limits.minAge is below the independence age');
  if (bal.funding.minAge < bundle.balance.economy.independenceAge) err(BALANCE, 'funding.minAge is below the independence age');
  const q = bal.staff.quit;
  for (let i = 1; i < q.length; i++) {
    if (q[i]!.at <= q[i - 1]!.at) err(BALANCE, 'staff.quit: points must rise in `at`');
    if (q[i]!.x > q[i - 1]!.x) err(BALANCE, 'staff.quit: a happier worker must not be likelier to quit');
  }
  if (bal.funding.investors.maxTotal + 100 - bal.funding.investors.maxTotal < 100) err(BALANCE, 'funding.investors.maxTotal is above 100');
  for (const share of bal.funding.cofounder.shares) if (share >= 50 + 1) err(BALANCE, 'funding.cofounder.shares: a co-founder cannot hold more than half');
  for (const key of Object.keys(reg.listingTraits)) if (/\b(?:he|she|him|her|his|hers)\b/i.test(reg.listingTraits[key]!.text)) err(REGISTRY, `listingTraits.${key}: hardcodes a pronoun`);
  for (const [city, c] of Object.entries(bal.cities)) if (c.competition <= 0) err(BALANCE, `cities.${city}.competition must be positive`);

  // The events the business step queues.
  if (!partialEvents) {
    for (const trigger of BUSINESS_TRIGGERS) {
      for (const id of reg.triggers[trigger].events) {
        const def = bundle.events[id];
        if (!def) {
          err(REGISTRY, `${trigger}: unknown event "${id}"`);
          continue;
        }
        const e = (m: string) => err(fileOf('events', id), `${id}: ${m}`);
        if (!def.followUpOnly) e(`answers ${trigger}, so it must be followUpOnly (the business step queues it)`);
        if (AFTER_FAILURE.has(trigger)) {
          if (def.bindBusiness) e(`answers ${trigger}, so it is about a business that is gone: it must not bind one`);
          if (!requires(def, (c) => 'business' in c && c.business.failedWithin !== undefined)) e(`answers ${trigger}, so it must require { business: { failedWithin } }`);
        } else {
          if (!def.bindBusiness) e(`answers ${trigger}, so it must be about a business (bindBusiness: true)`);
          if (!requires(def, (c) => 'business' in c && c.business.owned === true)) e('must require { business: { owned: true } }');
        }
      }
    }
  }

  // Events.
  const values = ['business', 'bizType', 'bizCity', 'bizStyle', 'bizTitle'];
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const e = (m: string) => err(fileOf('events', id), `${id}: ${m}`);
    const text = textsOf(def).join('\n');
    const aboutBusiness = def.bindBusiness === true && requires(def, (c) => 'business' in c && c.business.owned === true);
    const owns = requires(def, (c) => 'business' in c && c.business.owned === true);
    if (def.bindBusiness && !owns) e('bindBusiness: true but it requires no business: { owned: true }');
    for (const v of values) {
      if (new RegExp(`\\{${v}\\}`).test(text) && !aboutBusiness) e(`uses {${v}} without being about a business (bindBusiness: true and a business: { owned: true } condition)`);
    }
    for (const [role, spec] of Object.entries(def.cast ?? {})) {
      if (spec.business === undefined) continue;
      if (!owns) e(`cast.${role}: a role from your business needs requires: business: owned: true`);
      const need: Record<string, (c: Condition) => boolean> = {
        investor: (c) => 'business' in c && c.business.investors === true,
        cofounder: (c) => 'business' in c && c.business.cofounder === true,
        manager: (c) => 'business' in c && c.business.manager === true,
        licensed: (c) => 'business' in c && c.business.needsLicense !== false,
        staff: (c) => 'business' in c && c.business.staff !== undefined,
      };
      const test = need[spec.business];
      if (test && spec.business !== 'licensed' && !requires(def, test)) e(`cast.${role}: the ${spec.business} role needs the event to require that the business has one (business: ${spec.business === 'staff' ? 'staff' : spec.business === 'manager' ? 'manager: true' : spec.business + ': true'})`);
    }
    const walk = (c: Condition | undefined): void => {
      if (!c) return;
      if ('all' in c) c.all.forEach(walk);
      else if ('any' in c) c.any.forEach(walk);
      else if ('not' in c) walk(c.not);
      else if ('business' in c) {
        for (const t of c.business.type ?? []) if (!bundle.businesses[t]) e(`business.type: unknown kind "${t}"`);
        if (c.business.licensed !== undefined && !c.business.type && !c.business.needsLicense) {
          // licensed: a business that needs no licence never fits; the event should name a kind that does.
          const licensedKinds = Object.values(bundle.businesses).filter((b) => b.license).map((b) => b.id);
          if (!def.followUpOnly && licensedKinds.length > 0 && !(c.business.type ?? []).length) e('business.licensed needs business.type naming a kind that needs a licence (or needsLicense: true)');
        }
      }
    };
    [def.requires, ...(def.weight.modifiers ?? []).map((m) => m.if), ...(def.choices ?? []).map((ch) => ch.visibleIf)].forEach(walk);
    for (const o of outcomesOf(def)) {
      for (const eff of o.effects as Effect[]) {
        if (eff.type !== 'business') continue;
        if (!owns) e(`business ${eff.action}: needs requires: business: owned: true`);
        if (eff.role !== undefined && !(def.cast && eff.role in def.cast)) e(`business ${eff.action}: role "${eff.role}" is not in the cast`);
        if (eff.role !== undefined && def.cast?.[eff.role] && ['buyout'].includes(eff.action) && !['investor', 'cofounder'].includes(def.cast[eff.role]!.business ?? '')) e('business buyout needs an investor or co-founder role (cast: { business: investor | cofounder })');
        if (eff.role !== undefined && def.cast?.[eff.role] && ['staffQuit', 'staffFire', 'staffRaise', 'staffMorale', 'theft'].includes(eff.action) && def.cast[eff.role]!.business === undefined) e(`business ${eff.action}: role "${eff.role}" must be a business role (cast: { business: staff | manager | licensed })`);
      }
    }
  }
  return errors;
}
