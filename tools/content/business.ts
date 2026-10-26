/**
 * Content checks for businesses (W3): the kinds of business and the chains agree
 * with the cities, jobs and trades; the events the business step queues exist,
 * only happen that way and are about a business; an event only names a business, or
 * the people of one, where it requires one; every id a condition names exists;
 * and the balance covers every city. Brands, chains and shops are fictional.
 */
import { BUSINESS_TRIGGERS, type CollectionKey, type Condition, type ContentBundle, type Effect, type EventDef } from '../../src/content/schemas';
import type { ContentError } from './compile';
import { parityFigures } from '../../src/engine/business/parity';
import { productsOf, defaultLineIds } from '../../src/engine/business/products';

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

/** B2: the lines, supply pools and roles of a kind: ids exist, the shares and wages keep W3's totals, and the default lines reproduce W3's revenue and supplies. */
function checkDepth(bundleRef: ContentBundle, d: ContentBundle['businesses'][string], at: (m: string) => void): void {
  const reg = bundleRef.registries.business;
  const bal = bundleRef.balance.business;
  const seen = new Set<string>();
  for (const p of d.products) {
    if (seen.has(p.id)) at(`products: "${p.id}" twice`);
    seen.add(p.id);
    if (!reg.trends[p.trend]) at(`${p.id}: unknown trend "${p.trend}"`);
    if (p.type === 'goods') {
      if (p.supplier === undefined || !reg.suppliers[p.supplier]) at(`${p.id}: a goods line needs a known supplier category`);
      if (p.pool) at(`${p.id}: goods have no supply pool`);
    } else {
      const pool = p.pool ? d.pools.find((x) => x.id === p.pool!.id) : undefined;
      if (!pool) at(`${p.id}: a service needs a supply pool of the kind`);
      if (p.supplier !== undefined) at(`${p.id}: a service takes its supplier from its pool`);
    }
    if (/\b(?:he|she|him|her|his|hers)\b/i.test(p.name)) at(`${p.id}: name hardcodes a pronoun`);
    if (!(['budget', 'standard', 'premium'] as const).some((s) => productsOf(d, s).some((x) => x.id === p.id))) at(`${p.id}: sold in no style`);
  }
  for (const pool of d.pools) if (!reg.suppliers[pool.supplier]) at(`pool ${pool.id}: unknown supplier category "${pool.supplier}"`);
  if (d.lineMode === 'services' && d.products.some((p) => p.type !== 'service')) at('a services kind sells only services');
  if (d.lineMode !== 'services' && d.products.some((p) => p.type !== 'goods')) at('a menu or shop sells only goods');
  for (const style of ['budget', 'standard', 'premium'] as const) {
    const ids = defaultLineIds(d, style, bundleRef);
    if (ids.length === 0) at(`${style}: no default lines`);
    if (d.lineMode === 'choose' && productsOf(d, style).length < bal.products.maxLines[style]) at(`${style}: the shop's line limit (${bal.products.maxLines[style]}) is more than its catalogue`);
    const p = parityFigures(d, style, 'houston', bundleRef);
    if (Math.abs(p.revenue - 1) > bal.products.parity) at(`${style}: default lines make ${(p.revenue * 100).toFixed(1)}% of W3's revenue`);
    if (Math.abs(p.supplies - 1) > bal.products.parity) at(`${style}: default lines make ${(p.supplies * 100).toFixed(1)}% of W3's supplies (adjust the style's costScale)`);
    if (Math.abs(p.staffed - 1) > 0.02) at(`${style}: the normal headcount staffs ${(p.staffed * 100).toFixed(0)}% of the need`);
  }
  // Roles.
  const crew = d.roles.filter((r) => r.manager !== true);
  const managers = d.roles.filter((r) => r.manager === true);
  if (managers.length !== 1) at('needs exactly one location manager role (manager: true)');
  if (managers[0] && managers[0].share !== 0) at('the location manager role has no share of the headcount');
  const total = crew.reduce((s, r) => s + r.share, 0);
  if (Math.abs(total - 1) > 0.001) at(`roles: shares add up to ${total.toFixed(3)}, not 1`);
  const pay = crew.reduce((s, r) => s + r.share * r.wage, 0);
  if (Math.abs(pay - 1) > 0.03) at(`roles: the share-weighted wage multiple is ${pay.toFixed(3)}, not 1 (W3's payroll)`);
  if (crew.filter((r) => r.craft === true).length !== 1) at('needs exactly one craft role');
  if (d.license && !crew.some((r) => r.licensed === true)) at('a licensed business needs a licensed role');
  if (new Set(d.roles.map((r) => r.id)).size !== d.roles.length) at('role ids repeat');
  for (const r of d.roles) if (r.min > r.max) at(`${r.id}: min is above max`);
}

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
    checkDepth(bundle, d, at);
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
  const values = ['business', 'bizType', 'bizCity', 'bizStyle', 'bizTitle', 'product', 'supplier', 'location', 'locCity'];
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
        crew: (c) => 'business' in c && c.business.crew !== undefined && c.business.namedRoom === true,
        franchisee: (c) => 'business' in c && c.business.franchises !== undefined,
        locationManager: (c) => 'business' in c && c.business.hasLocationManager === true,
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
        if (eff.role !== undefined && def.cast?.[eff.role] && ['staffQuit', 'staffFire', 'staffRaise', 'staffMorale', 'theft', 'transfer', 'appoint'].includes(eff.action) && def.cast[eff.role]!.business === undefined) e(`business ${eff.action}: role "${eff.role}" must be a business role (cast: { business: staff | manager | licensed })`);
      }
    }
  }
  return errors;
}
