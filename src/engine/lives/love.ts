/**
 * Love lives for the people you know (E3): dating, engagement, marriage,
 * breakups, divorce and widowhood, for adults only. A partner who isn't on
 * your People list is a summary (`PersonLife.partner`): a name, a gender, a
 * birth year and how far the relationship has come. The engine never lets
 * anyone under the adult age start a relationship (`mayStartRelationship`),
 * whatever the numbers say, and the invariants check every partner.
 */
import type { ContentBundle } from '../../content/schemas';
import { pickUnused, rollHeritage } from '../creation/family';
import { rollCanCarry } from '../family/carrying';
import { curveAt } from '../curve';
import { weightedPick } from '../random';
import { chance, nextInt, pick } from '../rng';
import { npcDeathChance } from '../systems/mortality';
import type { OutsidePartner } from '../types';
import { ask, say, usedNames, type Ctx, type Subject } from './subject';

/** Romance is for adults only: both people have to be at least the adult age. */
export function mayStartRelationship(age: number, partnerAge: number, content: ContentBundle): boolean {
  const { adultAge } = content.balance.relationships;
  return age >= adultAge && partnerAge >= adultAge;
}

/** A new partner for this person: someone their age they could be attracted to, of a gender they like. Null when they're attracted to no one. */
function newPartner(ctx: Ctx, s: Subject): OutsidePartner | null {
  const { content } = ctx;
  const rng = ctx.state.rng;
  const attracted = s.person.identity.attractedTo;
  if (attracted.length === 0) return null;
  const weights = content.balance.creation.genderCategory;
  const options = attracted.map((c) => [c, weights[c] ?? 0] as const);
  const category = options.some(([, w]) => w > 0) ? weightedPick(rng, options) : pick(rng, attracted);
  const { adultAge } = content.balance.relationships;
  const offset = ctx.bal.love.partnerAgeOffset;
  const age = Math.max(adultAge, s.age + nextInt(rng, offset.min, offset.max));
  if (!mayStartRelationship(s.age, age, content)) return null;
  const city = content.cities[s.cityId];
  const pool = city && content.names[city.countryId];
  if (!pool) return null;
  const heritage = pool.heritages[rollHeritage(rng, content, pool)]!;
  return {
    name: { first: pickUnused(rng, heritage.first[category], usedNames(ctx)), last: pick(rng, heritage.last) },
    genderCategory: category,
    birthYear: ctx.year - age,
    canCarry: rollCanCarry(rng, category, content),
    status: 'dating',
    since: ctx.year,
    statusSince: ctx.year,
  };
}

/** The love step for one adult whose partner isn't you. */
export function loveStep(ctx: Ctx, s: Subject): void {
  const { adultAge } = ctx.content.balance.relationships;
  const love = ctx.bal.love;
  const rng = ctx.state.rng;
  const life = s.life;
  if (s.age < adultAge) return;

  if (!life.partner) {
    const recent = life.ended !== undefined && ctx.year - life.ended.year <= love.afterEndYears;
    const p = curveAt(love.meet, s.age) * (recent ? love.afterEnd : 1);
    if (p <= 0 || !chance(rng, p)) return;
    const partner = newPartner(ctx, s);
    if (!partner) return;
    life.partner = partner;
    say(ctx, s, 'started_dating', { partner: partner.name.first }, 'newPartner');
    ask(ctx, s, 'newPartner');
    return;
  }

  const partner = life.partner;
  const name = partner.name.first;
  // A partner can die like anyone else.
  if (chance(rng, npcDeathChance(ctx.year - partner.birthYear, ctx.content))) {
    life.partner = null;
    life.ended = { year: ctx.year, how: 'widowed', partner: name };
    say(ctx, s, 'widowed', { partner: name });
    return;
  }
  const together = ctx.year - partner.since;
  if (partner.status === 'married') {
    if (chance(rng, curveAt(love.divorce, ctx.year - partner.statusSince))) {
      life.partner = null;
      life.ended = { year: ctx.year, how: 'divorced', partner: name };
      say(ctx, s, 'divorced', { partner: name }, 'divorce');
      ask(ctx, s, 'divorce');
    }
    return;
  }
  // Dating and engaged couples can break up (an engagement less often).
  const breakup = curveAt(love.breakup, together) * (partner.status === 'engaged' ? love.engagedBreakup : 1);
  if (chance(rng, breakup)) {
    life.partner = null;
    life.ended = { year: ctx.year, how: 'broke_up', partner: name };
    say(ctx, s, 'broke_up', { partner: name });
    return;
  }
  if (partner.status === 'dating') {
    if (together >= love.engageAfterYears && chance(rng, love.engage)) {
      partner.status = 'engaged';
      partner.statusSince = ctx.year;
      say(ctx, s, 'engaged', { partner: name }, 'engaged');
      ask(ctx, s, 'engaged');
    }
  } else if (chance(rng, love.marry)) {
    partner.status = 'married';
    partner.statusSince = ctx.year;
    say(ctx, s, 'married', { partner: name }, 'wedding');
    ask(ctx, s, 'wedding');
  }
}
