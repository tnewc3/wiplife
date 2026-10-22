/**
 * Athletic scholarships (Batch 5). In the last years of high school, college programs recruit you by what they see: your
 * rating, your fame, your grades and how much the program needs a player at your position. A program that likes you makes an
 * offer, a share of tuition (a full ride for the best, where the country allows it: countries/*.yaml `athletics`). Accepting
 * is an admission to that program (through the education system); its share is taken off the tuition bill with merit and need
 * aid, and the rest is paid or borrowed as ever. It lasts while you are on the program's team and keep the grade floor: a
 * year under the floor is a warning, a second loses your eligibility (and your place on the team), and leaving the team ends it.
 *
 * Numbers: balance/sports.yaml scholarship; per country: countries/*.yaml athletics.
 */
import type { ContentBundle, FamePathDef, SportDef, SportsTrigger, Tier } from '../../content/schemas';
import { countryOf } from '../country';
import { admit, applicationGpa, inFinalYear } from '../education';
import { createRng, nextFloat, chance, type RngState } from '../rng';
import type { LifeState } from '../types';
import { recentRating } from './query';
import { prospectRating } from './rating';
import { sportsHistory } from './text';

type SportPath = FamePathDef & { sport: SportDef };

const TIERS: readonly Tier[] = ['community', 'state', 'elite'];

/** The country's rules for athletic scholarships where you live. */
export function aidRules(state: LifeState, content: ContentBundle) {
  return countryOf(state, content).athletics.scholarships;
}

/** A program's need for your position this year, in recruiting points (stable for a life, a year and a program). */
export function programNeed(state: LifeState, tier: Tier, content: ContentBundle): number {
  const u = nextFloat(createRng(`${state.seed}:recruit:${state.currentYear}:${tier}:${state.sports.position ?? ''}`));
  return Math.round((u * 2 - 1) * content.balance.sports.scholarship.need * 10) / 10;
}

/** What a recruiter sees of you for a program: rating, fame, grades and need. */
export function recruitScore(state: LifeState, def: SportPath, tier: Tier, content: ContentBundle): number {
  const S = content.balance.sports.scholarship;
  const rating = state.sports.seasons.length > 0 ? recentRating(state) : prospectRating(state, def, content);
  const fame = state.fame.paths[def.id]?.fame ?? 0;
  const gpa = applicationGpa(state, 'college', content);
  return S.score.rating * rating + S.score.fame * fame + S.score.gpa * (gpa - 2) + S.score.need * programNeed(state, tier, content);
}

/** The share of tuition an offer from this program would pay at this recruiting score (0 under the score where offers begin). */
export function offerShare(state: LifeState, tier: Tier, score: number, content: ContentBundle): number {
  const S = content.balance.sports.scholarship;
  const t = S.tiers[tier];
  if (score < t.from) return 0;
  const top = aidRules(state, content).maxShare;
  const x = Math.min(1, (score - t.from) / Math.max(1, t.full - t.from));
  return Math.round((S.minShare + (top - S.minShare) * x) * 100) / 100;
}

/** Whether recruiting is open to you now: an athlete of an age to be recruited, in a country that gives them, not yet holding one. */
export function recruitingOpen(state: LifeState, def: SportPath, content: ContentBundle): boolean {
  const S = content.balance.sports.scholarship;
  const age = state.character.age;
  const s = state.sports;
  if (!aidRules(state, content).available || s.scholarship !== null || age < S.ages.from || age > S.ages.to) return false;
  return state.fame.main === def.id && state.fame.active && state.education.current?.program === 'high';
}

/** The offers on the table now (made this year or last). */
export function liveOffers(state: LifeState): LifeState['sports']['offers'] {
  return state.sports.offers.filter((o) => state.currentYear - o.year <= 1);
}

/** Why you can't take an offer from this program, or null. */
export function acceptBlock(state: LifeState, tier: Tier): 'none' | 'held' | 'school' | 'prison' | null {
  if (state.housing.kind === 'incarcerated') return 'prison';
  if (state.sports.scholarship !== null) return 'held';
  if (!liveOffers(state).some((o) => o.tier === tier)) return 'none';
  const edu = state.education.current;
  // You have to be able to start: in high school (finishing it), or free to start.
  if (edu && edu.program !== 'high' && edu.program !== 'college') return 'school';
  return null;
}

/** The major the program gives you when you take an offer (the first in alphabetical order; change it from the school card). */
function defaultMajor(content: ContentBundle): string {
  return Object.values(content.majors)
    .filter((m) => !m.retired)
    .sort((a, b) => a.name.localeCompare(b.name))[0]!.id;
}

/** You accept the offer: admission to the program, and the share it pays. */
export function acceptOffer(state: LifeState, tier: Tier, content: ContentBundle): boolean {
  if (acceptBlock(state, tier) !== null) return false;
  const offer = liveOffers(state).find((o) => o.tier === tier)!;
  const s = state.sports;
  admit(state, { program: 'college', tier, majorId: defaultMajor(content) }, content);
  s.scholarship = { tier, share: offer.share, since: state.currentYear, warned: 0 };
  s.offers = [];
  s.totals.scholarships += 1;
  state.flags.recruited_athlete = true;
  sportsHistory(state, 'scholarship', content);
  return true;
}

/** You turn the offers down. */
export function declineOffers(state: LifeState): void {
  state.sports.offers = [];
}

/** The scholarship ends (you left the team, lost your eligibility, never took up the place, or went pro). */
export function endScholarship(state: LifeState, content: ContentBundle): void {
  const s = state.sports;
  if (!s.scholarship) return;
  sportsHistory(state, 'scholarshipEnded', content);
  s.scholarship = null;
}

/** About to be a student in the scholarship's program: enrolled in it, or in your last year of high school with the place to take up. */
export function scholarshipStarting(state: LifeState): boolean {
  const sch = state.sports.scholarship;
  if (!sch) return false;
  const edu = state.education;
  if (edu.current?.program === 'college' && edu.current.tier === sch.tier) return true;
  const a = edu.admission;
  return a !== null && a.program === 'college' && a.tier === sch.tier && (edu.current === null || (edu.current.program === 'high' && inFinalYear(state)));
}

/**
 * The yearly part, after the season: eligibility and the grade floor for a scholarship you hold, and (while recruiting is open)
 * new offers. Adds the triggers for the events the year calls for.
 */
export function scholarshipStep(state: LifeState, def: SportPath, content: ContentBundle, rng: RngState, triggers: SportsTrigger[]): void {
  const s = state.sports;
  const S = content.balance.sports.scholarship;
  const sch = s.scholarship;
  const year = state.currentYear;
  const edu = state.education.current;

  if (sch) {
    const enrolled = edu?.program === 'college' && edu.tier === sch.tier;
    const onTeam = s.team !== null && s.team.level === 'college' && !s.teamless;
    if (enrolled) {
      // Gone from the team (aged out, signed, quit): the scholarship ends with it.
      if (!onTeam) {
        endScholarship(state, content);
        s.totals.scholarshipsLost += 1;
        return;
      }
      if (edu.gpa < S.floor) {
        sch.warned += 1;
        if (sch.warned > S.warnYears) {
          endScholarship(state, content);
          s.totals.scholarshipsLost += 1;
          // Without eligibility you are off the team.
          s.team = null;
          s.teamless = true;
          triggers.push('scholarshipLost');
        } else {
          triggers.push('probation');
        }
      } else {
        sch.warned = 0;
      }
    } else if (!scholarshipStarting(state) && year > sch.since + 1) {
      // The place was never taken up (the diploma did not come, the admission was withdrawn).
      endScholarship(state, content);
    }
    return;
  }

  // Offers fade.
  s.offers = liveOffers(state);
  if (!recruitingOpen(state, def, content)) return;
  const rules = aidRules(state, content);
  const made: LifeState['sports']['offers'] = [];
  for (const tier of TIERS) {
    if (!rules.tiers.includes(tier) || s.offers.some((o) => o.tier === tier)) continue;
    const share = offerShare(state, tier, recruitScore(state, def, tier, content), content);
    if (share > 0 && chance(rng, S.chance)) made.push({ year, tier, share });
  }
  if (made.length > 0) {
    s.offers = [...s.offers, ...made];
    triggers.push('recruited');
  }
}

