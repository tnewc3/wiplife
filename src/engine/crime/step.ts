/**
 * The crime step (E6a, year pipeline, after the legal step): as each year
 * begins, for someone in a crew or still carrying heat from one:
 *
 * - Heat falls (faster after a quiet year, or once you are out). The year's job
 *   count rolls over. In prison, standing is lost and that is all.
 * - In a crew: living far from it freezes your rank, fades your standing to a
 *   floor and grows what the crew suspects (an event may reach out, and after
 *   years away it writes you off); coming home restores part of your standing; a year with no job costs standing; life in a crew wears on
 *   you; the rival feeling settles; the crew is kept staffed; with an
 *   investigation open, a member may turn informant.
 * - The police (legal.ts): an investigation may open, an arrest may happen,
 *   and an open investigation goes cold or lapses.
 * - Events are queued for this year (up to balance jobs.maxQueued), most
 *   serious first: an arrest, an investigation, being pushed out, a stash
 *   raided or stolen, a promotion, trouble with the rival crew, an informant,
 *   the past catching up with someone who left, a higher rank's yearly cut, then the year's jobs.
 *
 * Numbers: balance/crime.yaml. The events: registries/crime.yaml.
 */
import type { ContentBundle, CrimeTrigger } from '../../content/schemas';
import { curveAt } from '../curve';
import { eventWeight } from '../events/selection';
import { arrestChance, investigationChance, isIncarcerated } from '../legal';
import { clampInt, weightedPick } from '../random';
import { chance, nextInt, pick } from '../rng';
import { applyStatEffects } from '../systems/economy';
import type { Id, LifeState } from '../types';
import { leaveCrew, staffCrew } from './crew';
import { closeInvestigation, openInvestigation } from './money';
import { crimeYears, inCrew, isFormer, liveMembers } from './query';

/** Queues one of a trigger's events for this year, picked by weight among those that fit, unless one of them is already queued. */
export function queueCrimeEvent(state: LifeState, trigger: CrimeTrigger, content: ContentBundle, dueYear = state.currentYear): boolean {
  const ids = content.registries.crime.triggers[trigger].events;
  const options = ids.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return false;
  if (state.scheduled.some((s) => ids.includes(s.eventId) && s.dueYear === dueYear)) return false;
  const def = weightedPick(state.rng, options);
  state.scheduled.push({ eventId: def.id, dueYear, cast: {} });
  return true;
}

/** Rolls the year's job count over: the year that has just ended becomes `last`. Returns the jobs done in it. */
function rollJobs(state: LifeState): number {
  const jobs = state.crime.jobs;
  const done = jobs.year === state.currentYear - 1 ? jobs.count : 0;
  if (jobs.year !== state.currentYear) state.crime.jobs = { year: state.currentYear, count: 0, last: done };
  return done;
}

function decayHeat(state: LifeState, done: number, content: ContentBundle): void {
  const h = content.balance.crime.heat;
  const quiet = done === 0;
  const former = !inCrew(state);
  let share = h.decay.share + (quiet ? h.quietShare : 0);
  if (former) share *= h.formerDecay;
  const next = state.crime.heat - state.crime.heat * Math.min(0.95, share) - h.decay.flat;
  state.crime.heat = clampInt(next, 0, 100);
  // What follows you out never fully goes while it's recent, but it can't stay above the limit.
  if (former) state.crime.heat = Math.min(state.crime.heat, content.balance.crime.past.heatLimit);
}

function runInvestigation(state: LifeState, content: ContentBundle): void {
  const inv = state.crime.investigation;
  if (!inv) return;
  const p = content.balance.crime.police;
  if (inv.until < state.currentYear || (state.crime.heat < p.coldBelow && chance(state.rng, p.coldChance))) {
    closeInvestigation(state, content);
  }
}

/** Step: the crime career's year. */
export function runCrime(state: LifeState, content: ContentBundle): void {
  const crime = state.crime;
  const b = content.balance.crime;
  const done = rollJobs(state);
  if (!inCrew(state) && crime.heat === 0 && !crime.investigation && !isFormer(state) && state.finances.dirty === 0) return;

  if (isIncarcerated(state)) {
    decayHeat(state, 0, content);
    if (crime.crew) crime.standing = clampInt(crime.standing - b.standing.idleLoss, 0, 100);
    runInvestigation(state, content);
    return;
  }

  decayHeat(state, done, content);
  runInvestigation(state, content);

  const crew = crime.crew;
  const top = b.ranks.length;
  let pushedOut = false;
  let away = false;
  let returned = false;
  if (crew) {
    crime.totals.years += 1;
    if (crew.cityId !== state.character.cityId) {
      // Living far from the crew: your rank stays, your standing fades to a floor, and what the crew suspects grows.
      const a = (crew.away ??= { since: state.currentYear, standing: crime.standing, suspicion: b.away.suspicion.start });
      crime.awayYears += 1;
      crime.standing = clampInt(Math.max(Math.min(crime.standing, b.away.floor), crime.standing - b.away.standingLoss), 0, 100);
      crime.lowYears = 0;
      a.suspicion = clampInt(a.suspicion + b.away.suspicion.perYear + b.away.suspicion.perHeat * Math.max(0, crime.heat - 50) + (crime.investigation ? b.away.suspicion.investigated : 0), 0, 100);
      away = true;
    } else {
      crime.awayYears = 0;
      if (crew.away) {
        // Home again: part of the standing you left with comes back, less what the crew thinks of how you left.
        const back = Math.round(crew.away.standing * b.away.back.standing - crew.away.suspicion * b.away.back.suspicionWeight);
        crime.standing = clampInt(Math.max(crime.standing, back), 0, 100);
        delete crew.away;
        crew.returned = state.currentYear;
        returned = true;
      }
      crime.standing = clampInt(crime.standing - b.standing.slide, 0, 100);
      if (done === 0) crime.standing = clampInt(crime.standing - b.standing.idleLoss, 0, 100);
      staffCrew(state, content);
    }
    if (!away) {
      applyStatEffects(state, { stress: { perYear: b.ranks[crime.rank - 1]!.stress + b.life.stress, limit: b.life.stressLimit } });
      crime.lowYears = crime.standing <= b.standing.lowAt ? crime.lowYears + 1 : 0;
      pushedOut = crime.lowYears >= b.standing.lowYears;
    }
    if (crew.rival && !away) crime.rivalry = clampInt(crime.rivalry + (b.rivalry.settle.at - crime.rivalry) * b.rivalry.settle.share, 0, 100);
    if (!away && crime.investigation && crew.informant === undefined && chance(state.rng, b.police.informantChance)) {
      const members = liveMembers(state, crew).filter((id) => id !== crew.leader || crime.rank < top);
      if (members.length > 0) crew.informant = pick(state.rng, members);
    }
  }

  // The police.
  let arrested = false;
  let investigationOpened = false;
  if (crime.heat > 0 || crime.investigation) {
    arrested = chance(state.rng, arrestChance(state, content));
    if (!arrested && chance(state.rng, investigationChance(state, content))) investigationOpened = openInvestigation(state, content);
  }

  // Events, most serious first.
  let room = b.jobs.maxQueued;
  const queue = (trigger: CrimeTrigger): void => {
    if (room > 0 && queueCrimeEvent(state, trigger, content)) room -= 1;
  };
  if (arrested) {
    crime.totals.arrests += 1;
    queue('arrest');
  } else if (investigationOpened) queue('investigation');
  if (pushedOut) queue('pushedOut');
  if (state.finances.dirty > b.dirty.stash.above) {
    if (chance(state.rng, curveAt(b.dirty.stash.raid, crime.heat))) queue('raid');
    else if (chance(state.rng, b.dirty.stash.theft)) queue('theft');
  }
  if (crew && away) {
    // The crew reaches out, or writes you off; never silently.
    if (crime.awayYears >= b.away.cutLooseYears) {
      if (!queueCrimeEvent(state, 'awayCut', content)) leaveCrew(state, 'drifted', content);
    } else if (room > 0 && chance(state.rng, curveAt(b.away.reachChance, crew.away!.suspicion))) queue('away');
  } else if (crew) {
    if (returned) queue('back');
    if (!arrested && b.ranks[crime.rank - 1]!.cut) queue('cut');
    const next = b.ranks[crime.rank];
    if (next?.reach && crime.standing >= next.reach.standing && state.currentYear - crime.rankSince >= next.reach.years && chance(state.rng, next.reach.chance)) queue('promotion');
    if (crew.rival && chance(state.rng, curveAt(b.rivalry.eventChance, crime.rivalry))) queue('rival');
    if (crew.informant !== undefined && chance(state.rng, 0.5)) queue('informant');
  } else if (isFormer(state) && chance(state.rng, curveAt(b.past.eventChance, crimeYears(state)))) queue('past');

  // This year's jobs, from what the registry offers and the rank allows.
  if (crew && !away && !arrested && room > 0) {
    const range = b.jobs.perYear[crime.rank - 1]!;
    const n = Math.min(room, nextInt(state.rng, range.min, range.max));
    const taken = new Set<Id>();
    for (let i = 0; i < n; i++) {
      const options = content.registries.crime.jobs.flatMap((id) => {
        const def = content.events[id];
        if (!def || def.retired || taken.has(id)) return [];
        const weight = eventWeight(state, def, content);
        return weight > 0 ? [[def, weight] as const] : [];
      });
      if (options.length === 0) break;
      const def = weightedPick(state.rng, options);
      taken.add(def.id);
      state.scheduled.push({ eventId: def.id, dueYear: state.currentYear, cast: {} });
    }
  }
}
