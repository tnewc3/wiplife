/**
 * Organized crime, simulated and measured (O1). The criminal player (E6a) is the one that joins; here it also leads: when
 * it runs an organization it gives each member a job for the year, promotes, disciplines or cuts members now and then,
 * deals with an informant, buys from a cartel, tries for a truce in a war, sometimes an alliance, and orders an attack on
 * a neighborhood. The law-abiding careful player never joins (the E6a target). The watcher reads each year's state before and
 * after `beginYear`, so nothing here touches the engine.
 *
 * Reported: membership by type, the ranks reached by type, leadership, neighborhoods held, what leaders were paid (jobs
 * and neighborhoods), arrests, deaths (the player's and the members'), informants, fights, wars, truces, alliances, and the
 * drugs cartels supplied to dealers and gangs.
 */
import { ORG_KINDS, type ContentBundle, type OrgKind } from '../../src/content/schemas';
import { isLifeActionAvailable, type LifeActionId, type LifeActionParams } from '../../src/engine/actions';
import { holdings } from '../../src/engine/crime/orgs';
import { crewDef, isLeader, topRank } from '../../src/engine/crime/query';
import { expandCost } from '../../src/engine/crime/decisions';
import { chance, pick, type RngState } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';
import type { SimulationReport, TargetResult } from './run';

type OrgAction = [LifeActionId, LifeActionParams];

/** Chances describing the simulated player (like the other bots'), not the game. */
const POLICY = { reassign: 0.5, promote: 0.3, discipline: 0.4, cut: 0.25, alliance: 0.15, expand: 0.3, hoodsWanted: 4, lowLoyalty: 30, hotMember: 50 };

/** A leader's year: the decisions the criminal player makes between years. */
export function chooseOrgActions(life: LifeState, content: ContentBundle, rng: RngState): OrgAction[] {
  const crew = life.crime.crew;
  const out: OrgAction[] = [];
  if (!crew || !isLeader(life, content) || life.phase !== 'yearStart') return out;
  const ok = (id: LifeActionId, params: LifeActionParams): boolean => isLifeActionAvailable(life, id, params, content);
  const def = crewDef(content, crew.defId)!;
  const kind = content.orgKinds[def.kind]!;
  for (const [id, m] of Object.entries(crew.roster ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!life.people[id]?.alive) continue;
    const jobs = kind.jobs.map((j) => content.orgJobs[j]!).filter((j) => ok('org_assign_job', { personId: id, jobId: j.id }));
    if (jobs.length > 0 && (m.job === undefined || chance(rng, POLICY.reassign))) {
      const hot = m.heat > POLICY.hotMember;
      const earners = jobs.filter((j) => j.effect === 'earn' || j.effect === 'supply' || j.effect === 'launder');
      const pickFrom = hot ? jobs.filter((j) => j.effect === 'lie_low') : earners.length > 0 && chance(rng, 0.8) ? earners : jobs;
      const j = pick(rng, pickFrom.length > 0 ? pickFrom : jobs);
      out.push(['org_assign_job', { personId: id, jobId: j.id }]);
    }
    if (m.loyalty < POLICY.lowLoyalty && ok('org_discipline', { personId: id }) && chance(rng, POLICY.discipline)) out.push(['org_discipline', { personId: id }]);
    else if (m.loyalty < 15 && ok('org_cut_loose', { personId: id }) && chance(rng, POLICY.cut)) out.push(['org_cut_loose', { personId: id }]);
    else if (m.loyalty > 60 && ok('org_promote', { personId: id }) && chance(rng, POLICY.promote)) out.push(['org_promote', { personId: id }]);
  }
  if (crew.informant !== undefined) out.push(['org_informant', { way: chance(rng, 0.5) ? 'confront' : 'pay' }]);
  const orgs = life.orgs.cities[crew.cityId] ?? [];
  if (kind.buys && crew.supplier === undefined) {
    const cartel = orgs.filter((o) => ok('org_set_supplier', { orgId: o.id })).sort((a, b) => b.attitude - a.attitude)[0];
    if (cartel) out.push(['org_set_supplier', { orgId: cartel.id }]);
  }
  for (const o of orgs) {
    if (o.id === crew.defId) continue;
    if (o.status === 'war' && ok('org_move', { orgId: o.id, move: 'truce' })) out.push(['org_move', { orgId: o.id, move: 'truce' }]);
    else if (o.attitude > 0 && ok('org_move', { orgId: o.id, move: 'alliance' }) && chance(rng, POLICY.alliance)) out.push(['org_move', { orgId: o.id, move: 'alliance' }]);
  }
  const held = holdings(life, crew.cityId, crew.defId).length;
  if (held < POLICY.hoodsWanted && life.finances.dirty >= expandCost(life, content) && chance(rng, POLICY.expand)) {
    const map = life.orgs.hoods[crew.cityId] ?? {};
    const targets = Object.keys(map).sort().filter((h) => ok('org_expand', { hoodId: h }));
    const free = targets.filter((h) => map[h] === null);
    const t = free.length > 0 ? free : targets;
    if (t.length > 0) out.push(['org_expand', { hoodId: pick(rng, t) }]);
  }
  return out;
}

export interface KindReport {
  entered: number;
  /** Lives by the highest rank reached, in the kind's own ranks (index 0 is rank 1). */
  peak: number[];
  leaders: number;
  years: number;
  leaderYears: number;
}

export interface OrgsReport {
  player: string;
  lives: number;
  entered: number;
  byKind: Record<OrgKind, KindReport>;
  /** Years leading, and neighborhoods held in them (summed over leader years). */
  leaderYears: number;
  hoodYears: number;
  hoodMax: number;
  /** Leaders' dirty money from jobs and from neighborhoods (what the recaps showed), and what members kept. */
  jobsPaid: number;
  hoodsPaid: number;
  kept: number;
  cleaned: number;
  units: number;
  /** Member results across all leader years. */
  results: Record<string, number>;
  /** Leaders' own arrests, and lives of leaders that ended in a violent crew death. */
  leaderArrestedLives: number;
  leaderDeaths: number;
  leaderLives: number;
  /** World counters, summed at the end of each organization life. */
  world: { income: number; supplied: number; fights: number; wars: number; killed: number; informants: number; promoted: number; cut: number };
  /** Lives that made peace (a truce), made an ally, or lost a neighborhood. */
  truceLives: number;
  allianceLives: number;
  hoodLostLives: number;
  decisions: Record<string, number>;
  invariantFailures: number;
  /** Under 18 in an organization: must be none. */
  underAge: number;
  /** Member deaths in the cities of a leader, the only place the engine kills members. */
  suppliedLives: number;
}

const emptyKind = (content: ContentBundle, kind: OrgKind): KindReport => ({ entered: 0, peak: Array.from({ length: Object.values(content.crews).find((c) => c.kind === kind)?.ranks.length ?? 5 }, () => 0), leaders: 0, years: 0, leaderYears: 0 });

export function emptyOrgsReport(player: string, content: ContentBundle): OrgsReport {
  return {
    player,
    lives: 0,
    entered: 0,
    byKind: Object.fromEntries(ORG_KINDS.map((k) => [k, emptyKind(content, k)])) as Record<OrgKind, KindReport>,
    leaderYears: 0,
    hoodYears: 0,
    hoodMax: 0,
    jobsPaid: 0,
    hoodsPaid: 0,
    kept: 0,
    cleaned: 0,
    units: 0,
    results: {},
    leaderArrestedLives: 0,
    leaderDeaths: 0,
    leaderLives: 0,
    world: { income: 0, supplied: 0, fights: 0, wars: 0, killed: 0, informants: 0, promoted: 0, cut: 0 },
    truceLives: 0,
    allianceLives: 0,
    hoodLostLives: 0,
    decisions: {},
    invariantFailures: 0,
    underAge: 0,
    suppliedLives: 0,
  };
}

/** Watches one life. */
export class OrgsWatcher {
  private everIn = false;
  private lastRecap = 0;
  private kindsSeen = new Set<OrgKind>();
  private led = false;
  private truce = false;
  private ally = false;
  private lost = false;
  private supplied = false;
  private arrestsAtLead = 0;

  constructor(
    private readonly r: OrgsReport,
    private readonly content: ContentBundle,
  ) {}

  /** A decision taken. */
  decided(actionId: string): void {
    this.r.decisions[actionId] = (this.r.decisions[actionId] ?? 0) + 1;
  }

  observe(before: LifeState, after: LifeState): void {
    const { r } = this;
    const crew = after.crime.crew;
    const adultAge = this.content.balance.relationships.adultAge;
    if (crew && after.character.age < adultAge) r.underAge++;
    if (!crew) return;
    const def = crewDef(this.content, crew.defId);
    if (!def) return;
    const k = r.byKind[def.kind];
    if (!this.everIn) {
      this.everIn = true;
      r.entered++;
    }
    if (!this.kindsSeen.has(def.kind)) {
      this.kindsSeen.add(def.kind);
      k.entered++;
    }
    k.years++;
    const peakIndex = Math.min(k.peak.length, Math.max(1, after.crime.peak));
    void peakIndex;
    if (isLeader(after, this.content)) {
      if (!this.led) {
        this.led = true;
        this.arrestsAtLead = before.crime.totals.arrests;
        r.leaderLives++;
        k.leaders++;
      }
      r.leaderYears++;
      k.leaderYears++;
      const held = holdings(after, crew.cityId, crew.defId).length;
      r.hoodYears += held;
      r.hoodMax = Math.max(r.hoodMax, held);
      const recap = crew.recap;
      if (recap && recap.year === after.currentYear && recap.year !== this.lastRecap) {
        this.lastRecap = recap.year;
        r.jobsPaid += recap.jobs;
        r.hoodsPaid += recap.hoods;
        r.kept += recap.kept;
        r.cleaned += recap.cleaned;
        r.units += recap.units;
        if (recap.units > 0) this.supplied = true;
        for (const x of recap.results) r.results[x.outcome] = (r.results[x.outcome] ?? 0) + 1;
        if (recap.notes.some((n) => n.startsWith('Lost '))) this.lost = true;
      }
    }
    const orgs = after.orgs.cities[crew.cityId] ?? [];
    if (orgs.some((o) => o.status === 'truce')) this.truce = true;
    if (orgs.some((o) => o.status === 'allied')) this.ally = true;
  }

  finish(life: LifeState): void {
    const { r } = this;
    r.lives++;
    if (!this.everIn && life.crime.past.length === 0) return;
    const best = (kind: OrgKind): number => 0 * kind.length;
    void best;
    const ranks = [...life.crime.past.map((p) => ({ crew: p.crewId, rank: p.topRank })), ...(life.crime.crew ? [{ crew: life.crime.crew.defId, rank: life.crime.peak }] : [])];
    for (const x of ranks) {
      const def = crewDef(this.content, x.crew);
      if (!def) continue;
      const k = r.byKind[def.kind];
      k.peak[Math.min(k.peak.length, Math.max(1, x.rank)) - 1]!++;
    }
    const w = life.orgs.totals;
    for (const key of Object.keys(r.world) as (keyof OrgsReport['world'])[]) r.world[key] += w[key];
    if (this.truce) r.truceLives++;
    if (this.ally) r.allianceLives++;
    if (this.lost) r.hoodLostLives++;
    if (this.supplied) r.suppliedLives++;
    if (this.led) {
      if (life.crime.totals.arrests > this.arrestsAtLead) r.leaderArrestedLives++;
      if (life.death && this.content.registries.crime.deathCauses.includes(life.death.causeId)) r.leaderDeaths++;
    }
    void topRank;
  }
}

const pct = (n: number, d: number) => (d === 0 ? '0.0%' : `${((100 * n) / d).toFixed(1)}%`);
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const per = (n: number, d: number, digits = 1) => (d === 0 ? '0' : (n / d).toFixed(digits));

export function formatOrgs(r: OrgsReport, content: ContentBundle): string[] {
  const lines: string[] = ['', `Organized crime (O1) — ${r.player} player:`];
  lines.push(`  lives ${r.lives}; joined an organization: ${r.entered} (${pct(r.entered, r.lives)})`);
  if (r.entered === 0) return lines;
  for (const kind of ORG_KINDS) {
    const k = r.byKind[kind];
    lines.push(`  ${content.orgKinds[kind]?.name ?? kind}: joined ${k.entered}; highest rank ${k.peak.map((n, i) => `${i + 1}: ${n}`).join(', ')}; led ${k.leaders} (${pct(k.leaders, Math.max(1, k.entered))}); ${k.years} years in, ${k.leaderYears} leading`);
  }
  lines.push(`  leadership: ${r.leaderLives} lives led (${pct(r.leaderLives, r.entered)} of joiners), ${r.leaderYears} leader years; neighborhoods held ${per(r.hoodYears, r.leaderYears, 2)} on average (most ${r.hoodMax})`);
  lines.push(`  leader income a leader year: jobs ${dollars(r.jobsPaid / Math.max(1, r.leaderYears))}, neighborhoods ${dollars(r.hoodsPaid / Math.max(1, r.leaderYears))}, members kept ${dollars(r.kept / Math.max(1, r.leaderYears))}, cleaned into savings ${dollars(r.cleaned / Math.max(1, r.leaderYears))}`);
  lines.push(`  member results (all leader years): ${Object.entries(r.results).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`);
  lines.push(`  law and death: leaders arrested ${pct(r.leaderArrestedLives, r.leaderLives)}; leaders who died a crew death ${pct(r.leaderDeaths, r.leaderLives)}; members killed ${r.world.killed}; informants ${r.world.informants}`);
  lines.push(`  world: ${r.world.fights} fights, ${r.world.wars} wars, truces in ${pct(r.truceLives, r.entered)} of lives, alliances in ${pct(r.allianceLives, r.entered)}, lost a neighborhood in ${pct(r.hoodLostLives, r.entered)}; ${r.world.promoted} members promoted, ${r.world.cut} cut loose`);
  lines.push(`  supply: ${r.world.supplied} units supplied by cartels to dealers and gangs (${r.units} by the player's own organization), in ${pct(r.suppliedLives, r.entered)} of lives`);
  lines.push(`  decisions: ${Object.entries(r.decisions).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}; under 18 in an organization: ${r.underAge}`);
  return lines;
}

/** The O1 targets (balance/targets.yaml, orgs): the careful player must never join; the criminal player is judged on the rest. */
export function orgsTargets(report: SimulationReport, content: ContentBundle): TargetResult[] {
  const t = content.balance.targets.orgs;
  const r = report.orgs;
  const out: TargetResult[] = [];
  const range = (label: string, value: number, goal: { min?: number | undefined; max?: number | undefined }, fmt: (n: number) => string = (n) => n.toFixed(3)) => {
    const met = (goal.min === undefined || value >= goal.min) && (goal.max === undefined || value <= goal.max);
    out.push({ label, value: fmt(value), short: fmt(value), goal: `${goal.min !== undefined ? fmt(goal.min) : ''}–${goal.max !== undefined ? fmt(goal.max) : ''}`, met });
  };
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  range('lives under 18 in an organization', r.underAge, t.underAge, (n) => n.toFixed(0));
  range('invariant failures about organizations', r.invariantFailures, t.invariantFailures, (n) => n.toFixed(0));
  if (report.player === 'careful') return out;
  if (report.player !== 'criminal') return out;
  for (const kind of ORG_KINDS) range(`lives that joined a ${content.orgKinds[kind]?.name.toLowerCase() ?? kind}`, r.byKind[kind].entered, t.eachKindJoined, (n) => n.toFixed(0));
  range('joiners that led an organization', share(r.leaderLives, r.entered), t.leaders);
  range('neighborhoods held in a leader year', share(r.hoodYears, r.leaderYears), t.hoodsHeld, (n) => n.toFixed(2));
  range('leader years with a job result that was a death', share(r.results.killed ?? 0, Math.max(1, Object.values(r.results).reduce((a, b) => a + b, 0))), t.memberDeathShare);
  range('leaders arrested at least once while leading', share(r.leaderArrestedLives, r.leaderLives), t.leaderArrested);
  range('leaders that died a crew death', share(r.leaderDeaths, r.leaderLives), t.leaderDeaths);
  range('units cartels supplied to dealers and gangs', r.world.supplied, t.supplied, (n) => n.toFixed(0));
  range('lives with a truce', share(r.truceLives, r.entered), t.truce);
  return out;
}
