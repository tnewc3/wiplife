/**
 * Content checks for belonging (W2): the groups and faiths agree with the cities
 * and with each other; the events the belonging step queues exist, only happen
 * that way and are about a group; an event only names a group, a role or a faith
 * where it requires one; every id a condition or effect names exists; every faith
 * has a congregation and every congregation asks the same of its members (no faith
 * is made harder or easier to belong to than another); and a list of words the
 * faith writing guidance rules out (nothing mocks belief or the lack of it).
 */
import { BELONGING_TRIGGERS, type CollectionKey, type Condition, type ContentBundle, type Effect, type EventDef } from '../../src/content/schemas';
import type { ContentError } from './compile';

const REGISTRY = 'registries/belonging.yaml';
const BALANCE = 'balance/belonging.yaml';

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

/** Words the faith writing guidance rules out: they mock belief, or the lack of it, or name a religion as a thing to fear. */
const MOCKING = /\b(?:cults?|cultists?|brainwash\w*|superstiti\w*|fairy ?tales?|sheep|sheeple|zealots?|fanatic\w*|delusion\w*|delusional|primitive|backward|heathens?|infidels?|godless|bible[- ]thumpers?|holy rollers?|sky fairy|imaginary friend|religious nuts?|fundamentalist\w*|extremis\w*|terroris\w*)\b/i;

function parts(c: Condition | undefined): Condition[] {
  if (!c) return [];
  if ('all' in c) return c.all.flatMap(parts);
  return [c];
}

/** True when some required part satisfies the test. */
const requires = (def: EventDef, test: (c: Condition) => boolean) => parts(def.requires).some(test);

export function checkBelonging(bundle: ContentBundle, fileOf: (typeKey: CollectionKey, id: string) => string, partialEvents: boolean): ContentError[] {
  const errors: ContentError[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const reg = bundle.registries.belonging;
  const faiths = reg.faiths;
  const known = (id: string) => id === 'none' || faiths[id] !== undefined;
  const bal = bundle.balance.belonging;

  // The groups.
  const defs = Object.values(bundle.groups).filter((g) => !g.retired);
  for (const [id, g] of Object.entries(bundle.groups)) {
    const at = (m: string) => err(fileOf('groups', id), `${id}: ${m}`);
    if (g.religion !== undefined && !faiths[g.religion]) at(`unknown religion "${g.religion}" (registries/belonging.yaml faiths)`);
    for (const city of Object.keys(g.cities)) if (!bundle.cities[city]) at(`cities: unknown city "${city}"`);
    if (new Set(g.names).size !== g.names.length) at('names repeat');
    if (g.names.length < g.count.max) at(`needs at least ${g.count.max} names (its count.max)`);
    if (g.minAge < 18 && g.type !== 'faith' && g.maxAge === undefined && g.minAge < 11) at('a group open to children under 11 must be a faith community');
    if (g.maxAge !== undefined && g.maxAge >= bundle.balance.relationships.adultAge) at(`maxAge must be below the adult age ${bundle.balance.relationships.adultAge}`);
    const hay = [g.name, g.blurb, g.tradition ?? '', ...g.names, ...g.activities, ...g.ladder.map((r) => r.name)].join('\n');
    if (MOCKING.test(hay)) at('uses wording the faith writing guidance rules out');
    if (/\b(?:he|she|him|her|his|hers)\b/i.test(g.blurb)) at('blurb hardcodes a pronoun');
  }
  // Every faith has a congregation, and every congregation asks the same of its members.
  const faithDefs = defs.filter((g) => g.type === 'faith');
  for (const id of Object.keys(faiths)) {
    if (!faithDefs.some((g) => g.religion === id)) err(REGISTRY, `faith "${id}" has no congregation (src/content/groups needs a faith group for it)`);
  }
  const first = faithDefs[0];
  for (const g of faithDefs) {
    if (!first) break;
    const same = JSON.stringify([g.values, g.commitment]) === JSON.stringify([first.values, first.commitment]);
    if (!same) err(fileOf('groups', g.id), `${g.id}: asks different hours, costs or values of its members than ${first.id}; every faith community asks the same (no faith is made easier or harder to belong to)`);
    if (JSON.stringify(g.traits) !== JSON.stringify(first.traits)) err(fileOf('groups', g.id), `${g.id}: its traits differ from ${first.id}'s; congregations vary person to person and place to place, not by religion`);
  }
  for (const id of Object.keys(faiths)) if (MOCKING.test(`${faiths[id]!.name} ${faiths[id]!.adherent}`)) err(REGISTRY, `faith "${id}": wording the guidance rules out`);

  // Balance.
  for (const [type, gain] of Object.entries(bal.community.gain)) if (gain < 0) err(BALANCE, `community.gain.${type} is negative`);
  if (bal.faith.wavering >= bal.faith.devout) err(BALANCE, 'faith: wavering must be below devout');
  if (bal.groups.members.count.min > bal.groups.members.count.max) err(BALANCE, 'groups.members.count: min is greater than max');
  if (bal.groups.members.count.max > bal.groups.members.max) err(BALANCE, 'groups.members.count.max is above groups.members.max');
  if (bal.groups.invite.minAge > 17 + 1) err(BALANCE, 'groups.invite.minAge is above the teen years: invitations would never reach a youth group');
  if (bal.faith.takenAlongAge >= bundle.balance.relationships.adultAge) err(BALANCE, 'faith.takenAlongAge must be below the adult age');
  if (reg.noneWeight + Object.values(faiths).reduce((s, f) => s + f.birthWeight, 0) <= 0) err(REGISTRY, 'birth weights add up to nothing');

  // The events the belonging step queues.
  if (!partialEvents) {
    for (const trigger of BELONGING_TRIGGERS) {
      for (const id of reg.triggers[trigger].events) {
        const def = bundle.events[id];
        if (!def) {
          err(REGISTRY, `${trigger}: unknown event "${id}"`);
          continue;
        }
        const e = (m: string) => err(fileOf('events', id), `${id}: ${m}`);
        if (!def.followUpOnly) e(`answers ${trigger}, so it must be followUpOnly (the belonging step queues it)`);
        if (!def.bindGroup) e(`answers ${trigger}, so it must be about a group (bindGroup: true)`);
        if (!requires(def, (c) => 'group' in c)) e('must require a group condition');
        if (trigger === 'invite' && !requires(def, (c) => 'group' in c && c.group.member === false)) e('answers invite, so it must require { group: { member: false } }');
        if (trigger !== 'invite' && !requires(def, (c) => 'group' in c && c.group.member === true)) e(`answers ${trigger}, so it must require { group: { member: true } }`);
      }
    }
  }

  // Events.
  for (const [id, def] of Object.entries(bundle.events)) {
    if (def.retired) continue;
    const e = (m: string) => err(fileOf('events', id), `${id}: ${m}`);
    const text = textsOf(def).join('\n');
    const uses = (value: string) => new RegExp(`\\{${value}\\}`).test(text);
    const aboutGroup = requires(def, (c) => 'group' in c) && def.bindGroup === true;
    const hasFaith = requires(def, (c) => ('faith' in c && !('role' in c) && ((c.faith.strength?.gte ?? c.faith.strength?.gt ?? 0) >= 1 || (c.faith.id !== undefined && !c.faith.id.includes('none')))) || ('group' in c && c.group.religion !== undefined));
    if (def.bindGroup && !requires(def, (c) => 'group' in c)) e('bindGroup: true but it requires no group condition');
    for (const v of ['group', 'role', 'groupFaith', 'tradition']) if (uses(v) && !aboutGroup) e(`uses {${v}} without being about a group (bindGroup: true and a group condition)`);
    if (uses('role') && !requires(def, (c) => 'group' in c && c.group.member === true)) e('uses {role} without requiring that you belong to the group');
    if ((uses('groupFaith') || uses('tradition')) && !requires(def, (c) => 'group' in c && (c.group.type?.includes('faith') === true || c.group.religion !== undefined))) e('uses {groupFaith} or {tradition} without requiring a faith group');
    if ((uses('faith') || uses('adherent')) && !hasFaith) e('uses {faith} or {adherent} without requiring that you have a faith (faith: strength gte 1, or faith: id without "none")');
    if (uses('latentFaith') && !requires(def, (c) => ('faith' in c && !('role' in c) && c.faith.leaning === true) || ('discovery' in c && (c.discovery.latent ?? []).includes('faith')))) e('uses {latentFaith} without requiring a pull toward a faith (faith: leaning, or discovery: latent: [faith])');
    for (const [role, spec] of Object.entries(def.cast ?? {})) {
      if (spec.group === 'yours' && !(requires(def, (c) => 'group' in c && c.group.member === true))) e(`cast.${role}: a role from your group needs requires: group: member: true`);
    }
    // Conditions and effects name things that exist.
    const walk = (c: Condition | undefined): void => {
      if (!c) return;
      if ('all' in c) c.all.forEach(walk);
      else if ('any' in c) c.any.forEach(walk);
      else if ('not' in c) walk(c.not);
      else if ('group' in c) {
        for (const d of c.group.def ?? []) if (!bundle.groups[d]) e(`group.def: unknown group kind "${d}"`);
        for (const r of c.group.religion ?? []) if (!faiths[r]) e(`group.religion: unknown faith "${r}"`);
      } else if ('faith' in c && !('role' in c)) {
        for (const r of [...(c.faith.id ?? []), ...(c.faith.raised ?? [])]) if (!known(r)) e(`faith: unknown faith "${r}" (use "none" for no religion)`);
      } else if ('role' in c && c.faith) {
        for (const r of c.faith.id ?? []) if (!known(r)) e(`role faith: unknown faith "${r}"`);
      }
    };
    [def.requires, ...(def.weight.modifiers ?? []).map((m) => m.if), ...(def.choices ?? []).map((ch) => ch.visibleIf)].forEach(walk);
    for (const o of outcomesOf(def)) {
      for (const eff of o.effects as Effect[]) {
        if (eff.type === 'group') {
          if (eff.defId !== undefined && !bundle.groups[eff.defId]) e(`group ${eff.action}: unknown group kind "${eff.defId}"`);
          const needsGroup = ['leave', 'commit', 'promote', 'demote', 'standing'].includes(eff.action) || (eff.action === 'join' && eff.defId === undefined);
          if (needsGroup && !def.bindGroup && !requires(def, (c) => 'group' in c && c.group.member === true)) e(`group ${eff.action} needs the event to be about a group (bindGroup: true, or requires a membership)`);
          if (eff.action === 'join' && eff.defId === undefined && !def.bindGroup) e('group join needs bindGroup: true (or a defId)');
          if (eff.action === 'news' && eff.role !== undefined && !(def.cast && eff.role in def.cast)) e(`group news: role "${eff.role}" is not in the cast`);
        }
        if (eff.type === 'faith') {
          if (eff.id !== undefined && !faiths[eff.id]) e(`faith ${eff.action}: unknown faith "${eff.id}"`);
          if (eff.group && !def.bindGroup) e('faith convert group: true needs bindGroup: true');
          if (eff.group && !requires(def, (c) => 'group' in c && (c.group.type?.includes('faith') === true || c.group.religion !== undefined))) e('faith convert group: true needs a faith group (requires group: type: [faith])');
          for (const r of [eff.role, eff.who]) if (r !== undefined && !(def.cast && r in def.cast)) e(`faith ${eff.action}: role "${r}" is not in the cast`);
          if (eff.action === 'fromLatent' && !requires(def, (c) => ('faith' in c && !('role' in c) && c.faith.leaning === true) || ('discovery' in c && (c.discovery.latent ?? []).includes('faith')))) e('faith fromLatent needs the event to require the pull (faith: leaning, or discovery: latent: [faith])');
          if (eff.action === 'return' && !requires(def, (c) => 'not' in c && 'faith' in c.not)) e('faith return needs the event to require a faith you were raised in (not: faith: raised: [none])');
        }
      }
    }
    // The writing guidance.
    if (MOCKING.test(text)) e(`uses wording the faith writing guidance rules out ("${(text.match(MOCKING) ?? [''])[0]}")`);
  }
  return errors;
}
