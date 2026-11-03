/**
 * Content checks for drugs (D1): the events the drugs step queues exist and only happen that way; drug names, blurbs, text
 * and events stay at the level of story and consequences (no methods, doses, sourcing or ways to avoid the police: real drug
 * names are fine); the trade is for adults; an overdose death needs a warning sign; drugs, operations, offenses, cities and
 * the balance agree with each other.
 */
import { DRUG_TRIGGERS, type CollectionKey, type Condition, type ContentBundle, type Effect, type EventDef } from '../../src/content/schemas';
import type { ContentError } from './compile';

const REGISTRY = 'registries/drugs.yaml';

/** Words that would turn a story into instructions: methods, doses, sourcing, ways around the law. Drug names are fine. */
export const D1_INSTRUCTION_WORDS =
  /\b(?:how to|step[- ]by[- ]step|tutorial|here'?s how|recipe|synthesi[sz]\w*|precursor\w*|\d+\s?(?:mg|milligrams?|ml|mcg)|dosage|dose chart|inject\w*|snort\w*|needles?|syringes?|cook(?:ing)? (?:it|up)|purif\w*|extraction|smuggl\w*|evad\w*|avoid (?:detection|the police|getting caught)|beat a (?:drug )?test|clean urine|fake (?:a )?test|launder\w* tips|burner phone|vpn|crypto\w*|bitcoin|dark ?web)\b/i;

/** The event categories of the drugs system. */
const TRADE_CATEGORIES = ['drugdeal', 'druglaw'];
/** Effects that only an adult can have. */
const ADULT_EFFECTS: readonly string[] = ['dealer', 'stop', 'customers', 'standing', 'charge'];

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

function requiresDrugs(def: EventDef, test: (c: NonNullable<Extract<Condition, { drugs: unknown }>['drugs']>) => boolean): boolean {
  return required(def.requires).some((c) => 'drugs' in c && test(c.drugs));
}

export function checkDrugs(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const b = bundle.balance.drugs;

  // The drugs.
  for (const def of Object.values(bundle.drugs)) {
    const file = fileOf('drugs', def.id);
    if (D1_INSTRUCTION_WORDS.test(`${def.name} ${def.noun} ${def.blurb}`)) err(file, `${def.id}: drugs stay at the level of story (found instruction wording)`);
    for (const city of Object.keys(def.cities ?? {})) if (!bundle.cities[city]) err(file, `${def.id}: cities: unknown city "${city}"`);
    if ((def.produce ?? []).length > 0 && !Object.values(bundle.operations).some((o) => !o.retired && o.drugs.includes(def.id) && def.produce!.includes(o.kind))) err(file, `${def.id}: produce lists a kind of operation that makes nothing of it`);
  }
  for (const def of Object.values(bundle.operations)) {
    const file = fileOf('operations', def.id);
    if (D1_INSTRUCTION_WORDS.test(`${def.name} ${def.blurb} ${def.names.join(' ')}`)) err(file, `${def.id}: operations are business abstractions (found instruction wording)`);
    for (const id of def.drugs) {
      const drug = bundle.drugs[id];
      if (!drug) err(file, `${def.id}: drugs: unknown drug "${id}"`);
      else if (!drug.produce?.includes(def.kind)) err(file, `${def.id}: ${id} does not list "${def.kind}" in produce`);
    }
    if (def.quality.start > def.quality.max) err(file, `${def.id}: quality start is above its maximum`);
  }
  for (const [key, group] of Object.entries(bundle.text.drugs.history)) {
    for (const v of group.variants) if (D1_INSTRUCTION_WORDS.test(v)) err('text/drugs.yaml', `history.${key}: drugs stay at the level of story (found instruction wording)`);
  }
  for (const [key, v] of Object.entries(bundle.text.drugs.notes)) if (D1_INSTRUCTION_WORDS.test(v)) err('text/drugs.yaml', `notes.${key}: drugs stay at the level of story (found instruction wording)`);

  // The balance names real things.
  for (const id of [...b.legal.possession, b.legal.intent, b.legal.dealing, b.legal.trafficking, b.legal.manufacturing]) if (!bundle.offenses[id]) err('balance/drugs.yaml', `legal: unknown offense "${id}"`);
  if (!bundle.drugs[b.enhancers.drug] || bundle.drugs[b.enhancers.drug]!.category !== 'enhancer') err('balance/drugs.yaml', `enhancers.drug: "${b.enhancers.drug}" must be a drug of the enhancer category`);
  for (const id of b.recovery.activities) if (!bundle.pastimes[id]) err('balance/drugs.yaml', `recovery.activities: unknown activity "${id}"`);
  if (!bundle.drugs[b.legacyDrug]) err('balance/drugs.yaml', `legacyDrug: unknown drug "${b.legacyDrug}"`);
  if (!bundle.conditions.drug_addiction) err('conditions/', 'D1 needs the drug_addiction condition');
  // Severity climbs with the ladder: each possession offense is at least as serious as the one before, and what follows is more serious than possession.
  const sev = b.legal.possession.map((id) => bundle.offenses[id]?.severity ?? 0);
  for (let i = 1; i < sev.length; i++) if (sev[i]! < sev[i - 1]!) err('balance/drugs.yaml', 'legal.possession: severity must not fall as the drug gets more serious');
  const ladder = [b.legal.possession.at(-1)!, b.legal.intent, b.legal.dealing, b.legal.trafficking, b.legal.manufacturing].map((id) => bundle.offenses[id]?.severity ?? 0);
  if (!(ladder[1]! >= ladder[0]! && ladder[3]! >= ladder[1]! && ladder[4]! >= ladder[3]!)) err('balance/drugs.yaml', 'legal: intent, trafficking and manufacturing must be at least as serious as possession');
  if (b.ages.adult < 18) err('balance/drugs.yaml', 'ages.adult: buying, dealing and making are for adults');
  if (b.ages.use >= b.ages.adult + 5) err('balance/drugs.yaml', 'ages.use is above the adult age');

  // The events the drugs step queues.
  if (!partialEvents) {
    for (const trigger of DRUG_TRIGGERS) {
      for (const id of bundle.registries.drugs.triggers[trigger].events) {
        const def = bundle.events[id];
        if (!def) {
          err(REGISTRY, `${trigger}: unknown event "${id}"`);
          continue;
        }
        const e = (message: string) => err(fileOf('events', id), `${id}: ${message}`);
        if (!def.followUpOnly) e(`answers ${trigger}, so it must be followUpOnly (the drugs step queues it)`);
        if ((trigger === 'scare' || trigger === 'er') && !requiresDrugs(def, (c) => c.signs?.gte !== undefined && c.signs.gte >= 1)) e(`answers ${trigger}, so it must require a warning sign ({ drugs: { signs: { gte: 1 } } })`);
        if (trigger === 'tempted' && !requiresDrugs(def, (c) => c.recovering === true)) e('answers tempted, so it must require { drugs: { recovering: true } }');
        if ((trigger === 'customer' || trigger === 'rival' || trigger === 'snitch') && !requiresDrugs(def, (c) => c.dealing === true)) e(`answers ${trigger}, so it must require { drugs: { dealing: true } }`);
        if ((trigger === 'raid' || trigger === 'fire') && !requiresDrugs(def, (c) => c.ops?.gte !== undefined && c.ops.gte >= 1) && trigger === 'fire') e('answers fire, so it must require an operation');
      }
    }
    for (const cause of bundle.registries.drugs.deathCauses) if (!bundle.causes[cause]) err(REGISTRY, `deathCauses: unknown cause of death "${cause}"`);
  }

  // Every event.
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const file = fileOf('events', id);
    const e = (message: string) => err(file, `${id}: ${message}`);
    const touches = outcomesOf(def).flatMap((o) => (o.effects as Effect[]).filter((x): x is Extract<Effect, { type: 'drugs' }> => x.type === 'drugs'));
    const isDrugEvent = def.category === 'drugs' || TRADE_CATEGORIES.includes(def.category) || touches.length > 0;
    if (!isDrugEvent) continue;
    if (D1_INSTRUCTION_WORDS.test(`${def.title} ${def.text} ${JSON.stringify(def.choices ?? def.autoOutcome)}`)) e('drugs stay at the level of story (found instruction wording)');
    // The trade is for adults.
    if (TRADE_CATEGORIES.includes(def.category) && !requiresAtLeast(def.requires, 18)) e('the trade and the police side of it are for adults: require age 18');
    for (const t of touches) if (ADULT_EFFECTS.includes(t.action) && !requiresAtLeast(def.requires, 18)) e(`the ${t.action} effect is for adults: require age 18`);
    // No teen buys, deals or makes: only use (an offer) is open from the use age.
    if (touches.some((t) => t.action === 'use') && !requiresAtLeast(def.requires, b.ages.use)) e(`taking a drug needs age ${b.ages.use} or more`);
    // Deaths: only the engine's overdose, after a warning sign. An event never kills with a drug.
    for (const o of outcomesOf(def)) {
      for (const x of o.effects as Effect[]) if (x.type === 'death' && bundle.registries.drugs.deathCauses.includes(x.cause)) e('an overdose death comes from the drugs step after warning signs, never from an event');
    }
    // Text that names a past with drugs must be backed by it.
    if (/\b(?:you (?:were|used to be|are) (?:using|hooked|addicted)|your (?:habit|dealer|stash))\b/i.test(`${def.text}`) && def.category === 'drugs' && !requiresDrugs(def, (c) => c.tried === true || c.addicted !== undefined || c.dependence !== undefined || c.recovering !== undefined || c.dealer !== undefined || c.signs !== undefined)) {
      e('names a past with drugs, so it must require it ({ drugs: ... })');
    }
  }
  return errors;
}
