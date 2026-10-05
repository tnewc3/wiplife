/**
 * Moving, having children and growing up for the people you know (E3). A
 * person's children are a summary (a first name and a birth year, kept off
 * your People list). Couples have them by the same fertility curves your own
 * family uses (balance/family.yaml). A minor coming of age is news, and may
 * leave for another city.
 */
import { rollGenderCategory } from '../creation/character';
import { pickUnused, rollHeritage } from '../creation/family';
import { curveAt, powInt } from '../curve';
import { carrierFactorFor } from '../family/carrying';
import { chance, pick } from '../rng';
import { whereabouts } from '../presence';
import type { Id } from '../types';
import { isJailed } from './model';
import { ask, say, usedNames, type Ctx, type Subject } from './subject';

/** An active city other than `avoid`, picked at random. */
function anotherCity(ctx: Ctx, avoid: Id): Id {
  const options = Object.keys(ctx.content.cities)
    .sort()
    .filter((id) => id !== avoid && !ctx.content.cities[id]!.retired);
  return options.length > 0 ? pick(ctx.state.rng, options) : avoid;
}

/** Moving: an adult who doesn't live with you may move to another city, now and then. */
export function movingStep(ctx: Ctx, s: Subject): void {
  const { adultAge } = ctx.content.balance.relationships;
  const rng = ctx.state.rng;
  const yours = ctx.view.character.cityId;
  if (s.age < adultAge || isJailed(s.life) || s.life.care === 'home') return;
  if (whereabouts(ctx.view, s.id, ctx.content) === 'household') return;
  if (!chance(rng, curveAt(ctx.bal.moving.rate, s.age))) return;
  const from = s.cityId;
  // Someone elsewhere may come to your city; someone in it moves on.
  const toYou = from !== yours && chance(rng, ctx.bal.moving.towardYou);
  const to = toYou ? yours : anotherCity(ctx, from);
  if (to === from) return;
  s.cityId = to;
  const city = ctx.content.cities[to]?.name ?? to;
  if (to === yours) {
    say(ctx, s, 'moved_near', { city }, 'moveToYou');
    ask(ctx, s, 'moveToYou');
  } else {
    say(ctx, s, 'moved', { city }, from === yours ? 'moveAway' : undefined);
    if (from === yours) ask(ctx, s, 'moveAway');
  }
}

/** Children: a couple may have a baby; a child who turns 18 is news. */
export function childrenStep(ctx: Ctx, s: Subject): void {
  const { adultAge } = ctx.content.balance.relationships;
  const rng = ctx.state.rng;
  const life = s.life;
  const children = ctx.bal.children;
  for (const kid of life.children) {
    if (ctx.year - kid.birthYear === adultAge) say(ctx, s, 'child_grew', { child: kid.first });
  }
  const partner = life.partner;
  if (!partner || life.children.length >= children.max || s.age < adultAge) return;
  // One of them has to be able to carry a pregnancy; with two, the younger does.
  const partnerAge = ctx.year - partner.birthYear;
  const mine = s.person.canCarry ? s.age : null;
  const theirs = partner.canCarry ? partnerAge : null;
  if (mine === null && theirs === null) return;
  const iCarry = mine !== null && (theirs === null || mine <= theirs);
  const factor = carrierFactorFor(iCarry ? s.age : partnerAge, iCarry ? partnerAge : s.age, ctx.content);
  const p = children.tryShare[partner.status] * powInt(children.perChild, life.children.length) * ctx.content.balance.family.fertility.tryChance * factor;
  if (!(p > 0) || !chance(rng, p)) return;
  const pool = ctx.content.names[ctx.content.cities[s.cityId]?.countryId ?? ''];
  if (!pool) return;
  const category = rollGenderCategory(rng, ctx.content);
  const heritage = pool.heritages[rollHeritage(rng, ctx.content, pool)]!;
  const first = pickUnused(rng, heritage.first[category], usedNames(ctx));
  life.children.push({ first, birthYear: ctx.year });
  say(ctx, s, 'had_child', { child: first }, 'newBaby');
  ask(ctx, s, 'newBaby');
}

/** Growing up: turning 18 is news, and may mean leaving for another city. */
export function growingStep(ctx: Ctx, s: Subject): void {
  const { adultAge } = ctx.content.balance.relationships;
  if (s.age !== adultAge) return;
  say(ctx, s, 'came_of_age', {}, 'cameOfAge');
  ask(ctx, s, 'cameOfAge');
  if (s.life.care === 'home' || whereabouts(ctx.view, s.id, ctx.content) === 'household') {
    // Still under your roof (a sibling in your parents' home you share): they leave only when they're out of the household.
    if (ctx.year - s.person.birthYear < ctx.content.balance.economy.independenceAge) return;
  }
  if (!chance(ctx.state.rng, ctx.bal.growing.moveAway)) return;
  const to = anotherCity(ctx, s.cityId);
  if (to === s.cityId) return;
  s.cityId = to;
  say(ctx, s, 'moved_out', { city: ctx.content.cities[to]?.name ?? to });
}
