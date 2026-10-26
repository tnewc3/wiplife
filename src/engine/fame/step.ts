/**
 * The fame step (E6b, year pipeline, after the crime step and before the
 * ledger, so the year's pay is in it): as each year begins, for someone with a
 * career in arts and media:
 *
 * - Batch 4: what you did between years comes in: the shows you played are
 *   paid, and a tour you booked goes out on the road.
 * - The awards night for last year's nomination is held.
 * - The project lined up last year (or the one a contract assigns) comes out:
 *   quality, then critics' and fans' separate reception, then fame, fans,
 *   fan mood and public image, money, a nomination, a big break, and the
 *   event that tells how it went.
 * - Craft grows; without new work fame fades and a rung goes with it.
 * - The commitment you chose takes its toll on the people close to you, your
 *   health and your stress, and burnout builds or breaks.
 * - Batch 4: your band's year (chemistry, drama, members gone) or, with no
 *   band, an offer from one in your city.
 * - Fans, haters and critics turn up as people; a superfan may cross a line.
 * - The tabloids may turn a secret of yours into the news.
 * - Offers arrive: an agent, a contract, a second path, a comeback, a farewell.
 * - What the year earned is set aside for the ledger (economy.ts reads it):
 *   the work, the retainer, the cuts, a minor's share in trust, and the cost
 *   of the scene.
 *
 * For someone who has retired, royalties and fading fans. In prison, fame fades
 * and nothing else happens. Numbers: balance/fame.yaml. Events: registries/fame.yaml.
 */
import type { ContentBundle, FameKindDef, FamePathDef, FameTrigger } from '../../content/schemas';
import { curveAt } from '../curve';
import { eventWeight } from '../events/selection';
import { wholeDollars } from '../finance';
import { isIncarcerated } from '../legal';
import { possessionsValue } from '../possessions/query';
import { clampInt, weightedPick, wholeChange } from '../random';
import { chance, pick, type RngState } from '../rng';
import { ITEM_ROLE } from '../web/query';
import type { FamePathState, FamePlan, FameProject, Id, LifeState } from '../types';
import { bigBreak, breakChance, climb, contractBlock, crossBlock, endContract, fade, fadeThin, fameHistory, hasFaded, openAgents, retire } from './ladder';
import { exposableSecrets, addHeadline, exposeSecret, closestHolder, stalkerChance, stalkerYear, tabloidChance, tendFans } from './people';
import { playSeason, queueSeasonEvents, runSportsRetired } from '../sports/season';
import { applyPending } from '../sports/world';
import { allPaths, isMinorStar, kindDef, pathDef, rungDef, topRung, usualYear, workedPaths } from './query';
import { agentDef, agentTier, assignedPlan, craftGrowth, planBlock, projectTitle, releaseGross, retainer, rollWork, RECENT, type Roll } from './work';
import { bandYear } from './band';
import { socialWorked } from '../social/query';
import { runTour, strainCircle } from './grind';
import { emptyGrind } from './query';
import { genreDistance, hasGenres, offGenreFans } from './sound';

const COMMITMENT_ORDER = { back: 0, steady: 1, all: 2 } as const;

/** Queues one of a trigger's events for this year, picked by weight among those that fit now, unless one of them is already queued. */
export function queueFameEvent(state: LifeState, trigger: FameTrigger, content: ContentBundle, cast: Record<string, Id> = {}, dueYear = state.currentYear): boolean {
  const ids = content.registries.fame.triggers[trigger].events;
  const options = ids.flatMap((id) => {
    const def = content.events[id];
    if (!def || def.retired) return [];
    const weight = eventWeight(state, def, content);
    return weight > 0 ? [[def, weight] as const] : [];
  });
  if (options.length === 0) return false;
  if (state.scheduled.some((s) => ids.includes(s.eventId) && s.dueYear === dueYear)) return false;
  const def = weightedPick(state.rng, options);
  state.scheduled.push({ eventId: def.id, dueYear, cast });
  return true;
}

/** What the commitment you chose costs the people around you, your health and your stress this year, and what it does to burnout. */
function commitmentToll(state: LifeState, worked: boolean, content: ContentBundle, rng: RngState): void {
  const f = state.fame;
  const b = content.balance.fame.commitment;
  const s = b.strain[f.commitment];
  // The toll is for years of work; a year with none only lets burnout ease.
  if (worked) {
    strainCircle(state, s.close, s.other, content, rng);
    const stats = state.character.stats;
    stats.health = clampInt(stats.health - wholeChange(rng, s.health), 0, 100);
    stats.stress = clampInt(stats.stress + wholeChange(rng, s.stress), 0, 100);
    stats.happiness = clampInt(stats.happiness + wholeChange(rng, s.happiness), 0, 100);
  }
  f.burnout = clampInt(f.burnout + b.burnout.perYear[f.commitment] - (worked ? 0 : b.burnout.recover), 0, 100);
}

/** Puts a plan's work out: the quality roll, the reception, and everything that moves with it. `toured`: a tour went out with it. */
function release(state: LifeState, content: ContentBundle, rng: RngState, toured: boolean): { project: FameProject; release: number } | null {
  const f = state.fame;
  let plan = f.plan;
  let assigned = false;
  if (plan && planBlock(state, plan, content) !== null) plan = null;
  if (!plan && f.contract) {
    const base = assignedPlan(state, content);
    if (base && planBlock(state, base, content) === null) {
      plan = base;
      assigned = true;
    }
  }
  f.plan = null;
  if (!plan) return null;
  const def = pathDef(content, plan.path)!;
  const path = f.paths[plan.path]!;
  const kind = kindDef(def, plan.kind)!;
  const roll = rollWork(state, plan, path, def, kind, content, rng);
  const pay = releaseGross(state, plan, path, def, kind, roll.fans, content);
  const title = plan.title ?? projectTitle(state, plan.path, content, rng);
  const project = landProject(state, content, rng, { plan, def, path, kind, roll, title, earned: pay, assigned, toured });
  // Batch 4: what you put out, by title; and the best of it, for your life summaries.
  fameHistory(state, 'released', content);
  return { project, release: pay };
}

/**
 * Lands a piece of work (a release, or a sports season): the fame it wins or
 * loses, the climb, fan mood and public image, the entry on your list of work
 * and a nomination for the awards night next year. Money is the caller's.
 */
export function landProject(
  state: LifeState,
  content: ContentBundle,
  rng: RngState,
  input: { plan: FamePlan; def: FamePathDef; path: FamePathState; kind: FameKindDef; roll: Roll; title: string; earned: number; assigned: boolean; toured?: boolean },
): FameProject {
  const f = state.fame;
  const b = content.balance.fame;
  const { plan, def, path, kind, roll } = input;
  const toured = input.toured === true;
  const reception = roll.critics * def.criticWeight + roll.fans * (1 - def.criticWeight);

  // Fame.
  let gain = curveAt(b.gain.reception, reception);
  const scale = b.gain.rung[Math.min(path.rung, b.gain.rung.length) - 1]!;
  if (gain > 0) {
    let mult = kind.reach * scale * b.gain.commitment[f.commitment] * (plan.press ? b.gain.press : 1) * (toured ? b.gain.tour : 1) * (1 + agentTier(state, content) * b.gain.agent);
    if (f.fadedFrom !== undefined && path.rung < path.peak) mult *= b.gain.comeback;
    gain *= mult;
  } else {
    gain *= scale * 0.7;
  }
  path.fame = Math.max(0, Math.min(100, path.fame + gain));
  path.recent = [...path.recent, roll.quality].slice(-RECENT);
  path.last = state.currentYear;
  const before = path.rung;
  climb(state, plan.path, content);
  if (f.fadedFrom !== undefined && path.rung >= f.fadedFrom && path.rung > before) {
    f.totals.comebacks += 1;
    delete f.fadedFrom;
  }

  // Fan mood and public image.
  f.mood = clampInt(f.mood + b.gain.moodShare * (roll.fans - 55), 0, 100);
  const styleImage = (plan.style === 'artistic' ? 0.5 : -0.5) + (plan.risk === 'bold' ? 1 : 0);
  f.image = clampInt(f.image + b.gain.imageShare * (roll.critics - 50) + styleImage, 0, 100);

  // Batch 4: a release outside your sound: some fans leave, some new ones come.
  const distance = plan.genre !== undefined ? genreDistance(path.genre, plan.genre, content) : 0;
  if (path.genre === undefined && plan.genre !== undefined && hasGenres(content, plan.path)) path.genre = plan.genre;
  offGenreFans(state, distance, roll.fans, content);
  const band = f.band && f.band.path === plan.path ? f.band.name : undefined;
  const project: FameProject = {
    year: state.currentYear,
    path: plan.path,
    kind: plan.kind,
    title: input.title,
    style: plan.style,
    risk: plan.risk,
    tour: toured,
    press: plan.press,
    quality: roll.quality,
    critics: roll.critics,
    fans: roll.fans,
    band: roll.band,
    gain: Math.round(gain * 10) / 10,
    earned: input.earned,
    ...(input.assigned ? { assigned: true as const } : {}),
    ...(plan.genre !== undefined ? { genre: plan.genre } : {}),
    ...(distance >= content.balance.fame.sound.offGenre ? { offGenre: Math.round(distance * 100) / 100 } : {}),
    ...(plan.tracks !== undefined && plan.tracks.length > 0 ? { tracks: [...plan.tracks] } : {}),
    ...(band !== undefined ? { bandName: band } : {}),
  };
  f.projects.push(project);
  if (!def.sport && (f.best === undefined || reception > f.best.score)) {
    f.best = { title: input.title, path: plan.path, kind: plan.kind, year: state.currentYear, score: Math.round(reception * 10) / 10, ...(band !== undefined ? { bandName: band } : {}) };
  }
  if (f.projects.length > 12) f.projects.splice(0, f.projects.length - 12);
  f.totals.projects += 1;
  if (roll.band === 'flop') f.totals.flops += 1;
  else if (roll.band !== 'solid') f.totals.hits += 1;

  // A nomination, for the awards night next year.
  if (!f.nominated) {
    const awards = Object.keys(content.fameAwards)
      .sort()
      .map((id) => content.fameAwards[id]!)
      .filter((a) => !a.retired && a.path === plan.path && a.minRung <= path.rung);
    for (const award of awards) {
      const score = roll.critics * award.critics + roll.fans * (1 - award.critics);
      if (chance(rng, Math.min(0.95, curveAt(b.awards.nominate, score) * award.prestige))) {
        f.nominated = {
          awardId: award.id,
          project: project.title,
          due: state.currentYear + 1,
          score,
        };
        f.totals.nominations += 1;
        path.fame = Math.min(path.fame + b.awards.fame.nominated, path.rung < def.rungs.length ? rungDef(def, path.rung + 1).fame - 0.5 : 100);
        f.image = clampInt(f.image + b.awards.image.nominated, 0, 100);
        break;
      }
    }
  }
  return project;
}

/** Holds the awards night for last year's nomination: the work's reception decides it. */
function ceremony(state: LifeState, content: ContentBundle, rng: RngState): 'won' | 'lost' | null {
  const f = state.fame;
  const n = f.nominated;
  if (!n || n.due > state.currentYear) return null;
  delete f.nominated;
  const award = content.fameAwards[n.awardId];
  if (!award || !f.active) return null;
  const b = content.balance.fame.awards;
  const won = chance(rng, Math.min(0.95, curveAt(b.win, n.score)));
  f.ceremony = {
    year: state.currentYear,
    awardId: n.awardId,
    project: n.project,
    result: won ? 'won' : 'lost',
  };
  f.awards.push({
    awardId: n.awardId,
    year: state.currentYear,
    path: award.path,
    project: n.project,
    won,
  });
  if (f.awards.length > 30) f.awards.splice(0, f.awards.length - 30);
  const path = f.paths[award.path];
  if (won) {
    f.totals.wins += 1;
    if (path) path.fame = Math.min(100, path.fame + b.fame.won);
    f.image = clampInt(f.image + b.image.won, 0, 100);
    f.mood = clampInt(f.mood + 6, 0, 100);
    fameHistory(state, 'award', content, {
      award: award.name,
      project: n.project,
    });
  } else {
    f.image = clampInt(f.image + b.image.lost, 0, 100);
  }
  return won ? 'won' : 'lost';
}

/** Royalties for someone who has retired: a share of the top rung's year, fading. */
function royalties(state: LifeState, content: ContentBundle): number {
  const f = state.fame;
  const b = content.balance.fame.retirement;
  if (f.retired === undefined || state.currentYear - f.retired > b.years || f.main === null) return 0;
  const def = pathDef(content, f.main);
  if (!def) return 0;
  const peak = Math.max(...Object.entries(f.paths).map(([id, p]) => (content.famePaths[id] ? usualYear(state, content.famePaths[id]!, p.peak, content) : 0)));
  return wholeDollars(peak * def.royalties * Math.pow(1 - b.fade, state.currentYear - f.retired));
}

/** Step: the fame year. */
export function runFame(state: LifeState, content: ContentBundle): void {
  const f = state.fame;
  const rng = state.rng;
  const year = state.currentYear;
  const b = content.balance.fame;
  // Batch 6: a change of teams the player asked for (moved teams, teams added or removed) takes effect as the season begins.
  applyPending(state, content);
  f.income = { year, gross: 0, agent: 0, company: 0, trust: 0, scene: 0, tour: 0 };
  if (f.ceremony && f.ceremony.year !== year) delete f.ceremony;
  // Batch 4: what was done between years comes in now: the shows' pay, and the tour that goes out.
  const grind = f.grind;
  f.grind = emptyGrind(year);
  f.played = { year, shows: grind.shows, tour: null, ...(grind.lastShow ? { lastShow: grind.lastShow } : {}) };
  f.headlines = f.headlines.filter((h) => year - h.year <= b.tabloids.keep);

  // Someone who has retired: royalties, and fans who drift off.
  if (!f.active) {
    if (f.retired === undefined) return;
    const paid = royalties(state, content);
    f.totals.earned += paid;
    f.fans = Math.round(f.fans * (1 - b.retirement.fans));
    tendFans(state, content, rng);
    if (f.stalker) stalkerYear(state, content, rng);
    settleIncome(state, paid, content);
    // E6c: a retired athlete's years go on (the Hall of Fame ballot, worn joints).
    runSportsRetired(state, content);
    // A retired star may be asked back (an event, never silently).
    const gone = year - f.retired;
    if (state.housing.kind !== 'incarcerated' && chance(rng, curveAt(b.comeback.chance, gone))) queueFameEvent(state, 'comeback', content);
    return;
  }

  const prison = isIncarcerated(state);
  const events: FameTrigger[] = [];
  let sportsBreak = false;
  const minor = isMinorStar(state, content);
  if (minor && COMMITMENT_ORDER[f.commitment] > COMMITMENT_ORDER[b.commitment.minorsMax]) f.commitment = b.commitment.minorsMax;

  // A contract that has run its course.
  if (f.contract && f.contract.until < year) {
    endContract(state, 'ended', content);
    events.push('contractEnd');
  }

  // The awards night.
  const night = ceremony(state, content, rng);
  if (night) events.push(night);

  // Batch 4: a tour booked between years goes out as the year begins.
  const tour = !prison && grind.tour ? runTour(state, grind.tour, content, rng) : null;
  if (tour && grind.tour) f.played.tour = grind.tour.size;

  // The work: a project lined up (arts and media), and a season if you play a sport (E6c).
  const sportOut = prison ? null : playSeason(state, content, rng);
  const planOut = prison ? null : release(state, content, rng, tour !== null);
  const out = planOut;
  // Batch 8: a year of posting is a year of work in the social media career.
  const posted = !prison && socialWorked(state) && f.paths.social !== undefined && workedPaths(state).includes('social');
  const worked = planOut !== null || sportOut?.project !== undefined || tour !== null || posted;
  const project = planOut?.project;
  const seasonProject = sportOut?.project;
  if (prison) f.plan = null;
  if (project) events.push(project.band);
  const playedIds = new Set([project?.path, seasonProject?.path, tour?.path, posted ? 'social' : undefined].filter((p): p is string => p !== undefined));
  if (project?.offGenre !== undefined) events.push('offGenre');

  // Craft, fading, and the climb or the fall.
  for (const id of workedPaths(state)) {
    const def = pathDef(content, id);
    const path = f.paths[id]!;
    if (!def) continue;
    const wasWorked = playedIds.has(id);
    path.craft = Math.min(100, Math.round((path.craft + craftGrowth(state, def, path, wasWorked, content)) * 10) / 10);
    const lost = wasWorked ? fadeThin(state, id, content) : fade(state, id, content);
    if (lost) events.push('fade');
  }
  const main = f.main === null ? undefined : f.paths[f.main];

  // A big break.
  const breaker = project ?? seasonProject;
  if (breaker && chance(rng, breakChance(state, breaker.path, content, breaker.press, breaker.tour)) && bigBreak(state, breaker.path, content, rng) > 0) {
    if (seasonProject && breaker === seasonProject) sportsBreak = true;
    else events.unshift('bigBreak');
  }

  // The toll of the life you chose, and burnout.
  commitmentToll(state, worked, content, rng);
  if (f.burnout >= 60 && chance(rng, curveAt(b.commitment.burnout.risk, f.burnout))) {
    f.totals.burnouts += 1;
    f.burnout = b.commitment.burnout.after;
    f.commitment = 'back';
    state.flags.fame_burned_out = true;
    state.character.stats.health = clampInt(state.character.stats.health - 6, 0, 100);
    state.character.stats.happiness = clampInt(state.character.stats.happiness - 6, 0, 100);
    fameHistory(state, 'burnout', content);
    events.unshift('burnout');
  }

  // Fans: how many, how they feel, how you are seen.
  if (main) {
    const target = curveAt(b.gain.fansAt, main.fame) * (1 - b.gain.moodFans + (b.gain.moodFans * 2 * f.mood) / 100);
    f.fans = Math.max(0, Math.round(f.fans + (target - f.fans) * b.gain.fansFollow));
    if (!worked) {
      f.fans = Math.round(f.fans * (1 - b.fade.fans));
      f.mood = clampInt(Math.min(f.mood, Math.max(40, f.mood - b.fade.mood)), 0, 100);
    } else {
      f.mood = clampInt(f.mood + (55 - f.mood) * 0.08, 0, 100);
    }
    f.image = clampInt(f.image + (50 - f.image) * 0.06, 0, 100);
  }

  // The scene: the life that goes with it.
  const sc = b.scene;
  f.image = clampInt(f.image + sc.image[f.scene], 0, 100);
  state.character.stats.happiness = clampInt(state.character.stats.happiness + wholeChange(rng, sc.happiness[f.scene]), 0, 100);
  if (possessionsValue(state) >= sc.perks.value) {
    f.image = clampInt(f.image + sc.perks.image, 0, 100);
    state.character.stats.happiness = clampInt(state.character.stats.happiness + wholeChange(rng, sc.perks.happiness), 0, 100);
  }

  // People. Batch 4: your band's year, or an offer from a band in your city.
  const bandEvents = prison ? [] : bandYear(state, content, rng);
  tendFans(state, content, rng);
  if (!prison) {
    if (chance(rng, stalkerChance(state, content))) events.push('stalker');
    const next = stalkerYear(state, content, rng);
    if (next && !events.includes('stalker')) events.push('stalker');
  }
  const fans = f.people;
  if (fans.super.length + fans.hater.length + fans.critic.length > 0 && (project ?? seasonProject) && chance(rng, 0.2)) {
    const options: FameTrigger[] = [];
    if (fans.super.length > 0) options.push('superfan');
    if (fans.hater.length > 0) options.push('hater');
    if (fans.critic.length > 0) options.push('critic');
    events.push(pick(rng, options));
  }

  // The tabloids: above a set fame, a secret about you may become the news; a lively scene gives them stories of their own.
  if (!prison && main && main.fame >= b.tabloids.minFame && state.character.age >= b.tabloids.minAge) {
    const secrets = exposableSecrets(state, content);
    if (secrets.length > 0 && chance(rng, tabloidChance(state, content))) {
      const item = pick(rng, secrets);
      if (exposeSecret(state, item, content, rng) !== null) {
        const npc = closestHolder(state, item);
        queueFameEvent(state, 'tabloid', content, npc ? { npc, [ITEM_ROLE]: item.id } : {});
      }
    } else if (chance(rng, sc.scandal[f.scene] * (main.fame / 100))) {
      addHeadline(state, 'scandal', content, rng);
      f.totals.scandals += 1;
      f.image = clampInt(f.image - b.tabloids.hit.image * 0.5, 0, 100);
      f.mood = clampInt(f.mood - b.tabloids.hit.mood * 0.5, 0, 100);
      events.push('scandal');
    }
  }

  // Offers and turning points.
  if (!prison && main) {
    const top = topRung(state);
    const tier = agentTier(state, content);
    if (openAgents(state, content).length > 0 && chance(rng, curveAt(b.agents.offer, top))) events.push('agent');
    if (contractBlock(state, content) === null && chance(rng, Math.min(0.9, curveAt(b.contracts.offer, top) * (1 + tier * b.agents.doors)))) events.push('contract');
    if (f.second === null && allPaths(content).some((p) => crossBlock(state, p.id, content) === null) && chance(rng, 0.12)) events.push('crossover');
    const def = pathDef(content, f.main);
    // Sports have their own retirement, decline and comeback events (E6c).
    if (!def?.sport) {
      if (def && state.character.age >= def.retire.from && chance(rng, curveAt(def.retire.chance, state.character.age))) events.push('retire');
      const gap = year - main.last;
      if (hasFaded(state) && gap >= 2 && chance(rng, curveAt(b.comeback.chance, gap))) events.push('comeback');
    }
    if (tour && chance(rng, 0.35)) events.push('tour');
    if (tour && chance(rng, 0.3)) events.push('tourHome');
    if (project?.press && chance(rng, 0.3)) events.push('press');
  }

  // A career that never got going: nothing put out for years on the first rung, and it has simply ended.
  if (main && main.rung === 1 && year - main.last >= b.fade.dormant && f.contract === null) retire(state, content);

  // What the year earned, for the ledger (Batch 4: with the shows played between years, and a tour's takings and its cost).
  const gross = (out ? out.project.earned : 0) + (sportOut?.earned ?? 0) + (prison ? 0 : retainer(state, content)) + grind.showPay + (tour?.revenue ?? 0);
  f.totals.earned += gross;
  settleIncome(state, gross, content, out?.release ?? 0);
  f.income.tour = tour?.cost ?? 0;

  // The sports events (E6c): the season's own, then the shared turning points are queued above.
  if (sportOut) queueSeasonEvents(state, content, sportOut.triggers, sportsBreak);

  // Batch 4: the band's drama is about one member (the step names them); it waits its turn with the rest.
  for (const e of bandEvents) {
    if (e.trigger === 'bandOffer') events.push('bandOffer');
    else if (queueFameEvent(state, e.trigger, content, e.cast)) break;
  }

  // Queue the events, most pressing first, up to the cap (the release's own event always comes).
  let room = b.events.maxQueued;
  const seen = new Set<FameTrigger>();
  for (const trigger of events) {
    if (seen.has(trigger)) continue;
    seen.add(trigger);
    const isRelease = project !== undefined && trigger === project.band;
    if (room <= 0 && !isRelease) continue;
    if (queueFameEvent(state, trigger, content) && !isRelease) room -= 1;
  }
}

/** Sets the year's pay aside for the ledger: the agent's cut, the company's share, a minor's share held in trust, and what the scene costs. */
function settleIncome(state: LifeState, gross: number, content: ContentBundle, release = 0): void {
  const f = state.fame;
  const agent = agentDef(state, content);
  const cut = agent ? wholeDollars(gross * agent.cut) : 0;
  const company = f.contract ? wholeDollars(release * f.contract.share) : 0;
  const net = Math.max(0, gross - cut - company);
  let trust = 0;
  if (isMinorStar(state, content) && net > 0) {
    trust = wholeDollars(net * content.balance.fame.minors.trust);
    if (trust > 0) {
      const held = state.finances.trust;
      state.finances.trust = {
        balance: wholeDollars((held?.balance ?? 0) + trust),
        releaseAge: held?.releaseAge ?? content.balance.economy.independenceAge,
      };
    }
  }
  const scene = isMinorStar(state, content) || !f.active ? 0 : wholeDollars(Math.max(0, net - trust) * content.balance.fame.scene.cost[f.scene]);
  f.income = {
    year: state.currentYear,
    gross: wholeDollars(gross),
    agent: cut,
    company,
    trust,
    scene,
    tour: 0,
  };
}

/** What the ledger counts as the year's fame income: the work and the retainer, less the cuts and a minor's share in trust. */
export function fameIncome(state: LifeState): number {
  const i = state.fame.income;
  return i.year === state.currentYear ? Math.max(0, i.gross - i.agent - i.company - i.trust) : 0;
}

/** What the scene costs this year (charged with living costs). */
export function sceneCost(state: LifeState): number {
  const i = state.fame.income;
  return i.year === state.currentYear ? i.scene : 0;
}

/** Batch 4: what this year's tour cost to put on (charged with living costs). */
export function tourCost(state: LifeState): number {
  const i = state.fame.income;
  return i.year === state.currentYear ? i.tour : 0;
}
