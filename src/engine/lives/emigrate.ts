/**
 * Emigration for the people you know (W6, in E3's yearly step): an adult who lives apart from you may move to
 * another country, with papers or without; some years later they may take up its citizenship. A move is news,
 * and may ask something of you (a farewell, then, a year on, help with the costs of their papers). Rates are in
 * balance/immigration.yaml (people).
 */
import { citiesOfCountry, countryIdOfCity, activeCountries } from '../country';
import { whereabouts } from '../presence';
import { chance, createRng, pick } from '../rng';
import { isJailed } from './model';
import { ask, say, type Ctx, type Subject } from './subject';

/** Returns true when they left this year (so they do not also move across town). */
export function emigrationStep(ctx: Ctx, s: Subject): boolean {
  const b = ctx.content.balance.immigration.people;
  const { adultAge } = ctx.content.balance.relationships;
  // Its own stream, from the life's seed: whether someone you know emigrates must not shift the draws of everything after it.
  const rng = createRng(`${ctx.state.seed}:emigrate:${s.id}:${ctx.year}`);
  const life = s.life;
  if (s.age < adultAge || isJailed(life) || life.care === 'home' || s.person.tags.includes('staff')) return false;
  if (whereabouts(ctx.view, s.id, ctx.content) === 'household') return false;
  const em = life.emigrated;
  if (em) {
    const years = ctx.year - em.year;
    if (years === 1) ask(ctx, s, 'emigrantAsks');
    const here = countryIdOfCity(s.cityId, ctx.content);
    if (years >= b.naturalizeYears && em.papers && !s.citizenships.includes(here) && chance(rng, b.naturalizeChance)) {
      s.citizenships.push(here);
      say(ctx, s, 'became_citizen', { country: ctx.content.countries[here]?.name ?? '' });
    }
    return false;
  }
  // (A partner or child of yours is the family step's; the older generation stays put.)
  if (!['friend', 'sibling', 'relative', 'ex', 'acquaintance', 'classmate', 'coworker', 'boss', 'child', 'stepchild', 'grandchild'].includes(s.rel.kind)) return false;
  if (!chance(rng, b.yearlyChance)) return false;
  const here = countryIdOfCity(s.cityId, ctx.content);
  const yours = countryIdOfCity(ctx.view.character.cityId, ctx.content);
  const others = activeCountries(ctx.content).map((c) => c.id).filter((c) => c !== here);
  if (others.length === 0) return false;
  const to = yours !== here && chance(rng, b.towardYourCountry) ? yours : pick(rng, others);
  const city = pick(rng, citiesOfCountry(to, ctx.content));
  const from = s.cityId;
  s.cityId = city;
  life.emigrated = { year: ctx.year, countryId: to, from, papers: !chance(rng, b.undocumentedShare) };
  say(ctx, s, 'emigrated', { city: ctx.content.cities[city]?.name ?? city, country: ctx.content.countries[to]?.name ?? '' }, 'emigrates');
  ask(ctx, s, 'emigrates');
  return true;
}
