/**
 * W6 content checks (docs/expansion.md, W6 and the second-wave writing guidance): the events emigration queues exist
 * and are the right kind, receipts are cast-free, and emigration events stay at the level of story: no wording that
 * would work as instructions for crossing a border or getting documents, and no slurs or dehumanizing labels.
 */
import type { CollectionKey, ContentBundle } from '../../src/content/schemas';
import type { ContentError } from './compile';

export const IMMIGRATION_CATEGORIES = ['emigration', 'abroad', 'undocumented'] as const;
const RECEIPT_GROUPS = ['applied', 'arrived', 'turnedBack', 'returned'] as const;
const ADULT_STAGES = ['youngAdult', 'adult', 'senior'];

/** Wording that would read as how-to, in an event about crossing, documents or evading enforcement. */
const INSTRUCTIONS = /\b(?:forg(?:e|ed|es|ing|ery)|counterfeit|fake (?:papers|documents|passport|passports|visa|visas|ids?)|false (?:papers|documents|passport)|smuggl\w+|coyotes?|traffickers?|bribe[sd]? (?:a|an|the) (?:officer|guard|agent|official)|evade[sd]? (?:the )?(?:border|checkpoint|agents?|immigration)|sneak(?:ed|ing)? (?:across|past|through)|border (?:crossing|route)s? (?:at|near|through)|step[- ]by[- ]step)\b/i;
/** Labels that dehumanize, and jokes at someone's expense. */
const DEHUMANIZING = /\b(?:illegals?|illegal aliens?|aliens?|anchor babies|wetbacks?|invaders?|vermin|infest\w*|go back where you came from|your people)\b/i;

export function checkImmigration(bundle: ContentBundle, fileOf: (key: CollectionKey, id: string) => string, partial: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const reg = bundle.registries.immigration;
  const file = 'registries/immigration.yaml';
  for (const [kind, groups] of [['triggers', reg.triggers], ['yearly', reg.yearly]] as const) {
    for (const [group, ids] of Object.entries(groups)) {
      if (new Set(ids).size !== ids.length) err(file, `duplicate event in ${kind}.${group}`);
      for (const id of ids) {
        const e = bundle.events[id];
        if (!e) { if (!partial) err(file, `unknown event ${id} in ${kind}.${group}`); continue; }
        if (!e.followUpOnly) err(file, `${id} must be a follow-up event`);
        if (!(IMMIGRATION_CATEGORIES as readonly string[]).includes(e.category)) err(file, `${id} must be in an emigration category`);
      }
      if (kind === 'triggers' && (RECEIPT_GROUPS as readonly string[]).includes(group)) {
        const receipt = bundle.events[ids[0]!];
        if (receipt && (receipt.cast || !receipt.autoOutcome)) err(file, `${group} needs a cast-free automatic receipt first`);
      }
    }
  }
  for (const id of bundle.balance.immigration.undocumented.supportGroups) if (!bundle.groups[id]) err('balance/immigration.yaml', `unknown support group ${id}`);
  for (const e of Object.values(bundle.events)) {
    if (e.retired || !(IMMIGRATION_CATEGORIES as readonly string[]).includes(e.category)) continue;
    const f = fileOf('events', e.id);
    if (!e.lifeStages.every((s) => ADULT_STAGES.includes(s))) err(f, `${e.id}: emigration events are for adults`);
    const texts = [e.title, e.text, ...(e.choices ?? []).flatMap((c) => [c.label, c.outcome?.text ?? '', c.check?.success.text ?? '', c.check?.failure.text ?? '']), e.autoOutcome?.text ?? ''];
    for (const t of texts) {
      if (INSTRUCTIONS.test(t)) err(f, `${e.id}: reads as instructions ("${t.match(INSTRUCTIONS)![0]}"); emigration stays at the level of story`);
      if (DEHUMANIZING.test(t)) err(f, `${e.id}: dehumanizing wording ("${t.match(DEHUMANIZING)![0]}")`);
    }
  }
  return errors;
}
