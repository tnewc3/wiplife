/**
 * The organization's year (O1), once a year for someone in a crew who is home and free:
 *
 * - As a leader, each member does the job you gave them (or the one the organization picks): the take is paid in dirty
 *   money (E6a) after the members' share, heat rises, members are hurt, arrested, turned or killed (only on a dangerous
 *   job, or in a war that has been escalating), cartels supply drugs (D1) and a laundering job moves dirty money into
 *   savings. The year's results are written to the history (the year recap) and kept for the Organization screen.
 * - For everyone in a crew, the organization's world moves: rivals attack neighborhoods, fights are won or lost, a
 *   war escalates or burns out, truces lapse, allies betray, and your neighborhoods pay the leader and draw attention.
 * - The organization's code is held against you (a quiet year, too much heat, an arrest).
 *
 * Numbers: balance/orgs.yaml. Story and consequences only. Never changes the player's death: a leader's life ends only in
 * an event that follows the E6a rule.
 */
import type { ContentBundle, CrimeTrigger, OrgJobDef, OrgTextKey } from '../../content/schemas';
import { formatMoney, moneyDisplayOf } from '../country';
import { unitPrice, drugDef } from '../drugs/query';
import { earn, wholeDollars } from '../finance';
import { isIncarcerated } from '../legal';
import { clampInt } from '../random';
import { chance, nextFloat, nextInt, pick } from '../rng';
import { writeFromGroup } from '../systems/history';
import type { Id, LifeState, OrgMember, OrgRecap, OrgResult, WorldOrg } from '../types';
import { removeMember } from './crew';
import { addDirty, addHeat, loseDirty, payLevel, takeDirty } from './money';
import { ensureCity, ensureHolding, ensureRoster, holdings, memberName, myOrg, myStrength, recruitPerson, strengthOf, worldOrg } from './orgs';
import { crewDef, crewName, isLeader, kindDef } from './query';

export const money = (state: LifeState, amount: number, content: ContentBundle): string => formatMoney(Math.abs(amount), moneyDisplayOf(state, content));

type Values = Partial<Record<'crew' | 'member' | 'amount' | 'hood' | 'rival' | 'job' | 'balance' | 'count', string>>;

/** Writes one of the organization's history lines (the year recap shows it). */
export function say(state: LifeState, key: OrgTextKey, values: Values, content: ContentBundle): void {
  const crew = state.crime.crew;
  writeFromGroup(state, content.text.orgs.history[key], ['org', key], { values: { crew: crew ? crewName(content, crew.defId) : '', member: '', amount: '', hood: '', rival: '', job: '', balance: '', count: '', ...values } }, content);
}

/** The jobs your organization's kind does that this member could be given now (rank and neighborhoods allowing). */
export function jobsFor(state: LifeState, content: ContentBundle, memberId?: Id): OrgJobDef[] {
  const crew = state.crime.crew;
  const kind = crewDef(content, crew?.defId)?.kind;
  const def = kindDef(content, kind);
  if (!crew || !def) return [];
  const held = holdings(state, crew.cityId, crew.defId).length;
  const rank = memberId === undefined ? 1 : (crew.roster?.[memberId]?.rank ?? 1);
  return def.jobs.flatMap((id) => {
    const j = content.orgJobs[id];
    if (!j || j.retired || !j.kinds.includes(def.id)) return [];
    if (j.needsHood && held === 0) return [];
    if (j.minRank !== undefined && rank < j.minRank) return [];
    return [j];
  });
}

/** The job a member does when you gave them none: the first paying job of the kind they can do. */
export function defaultJob(state: LifeState, content: ContentBundle, memberId: Id): OrgJobDef | undefined {
  const jobs = jobsFor(state, content, memberId);
  return jobs.find((j) => j.effect === 'earn') ?? jobs.find((j) => j.effect === 'lie_low') ?? jobs[0];
}

/** The odds a member's job works out. */
export function successChance(content: ContentBundle, m: OrgMember): number {
  const s = content.balance.orgs.jobs.success;
  return Math.min(s.max, Math.max(s.min, s.base + m.skill * s.skill + m.loyalty * s.loyalty - m.heat * s.heat));
}

function skillFactor(m: OrgMember): number {
  return 0.6 + (m.skill / 100) * 0.8;
}

/** A cartel that supplies your gang or club: one you buy from that is not at war with you. */
export function supplierOf(state: LifeState): WorldOrg | undefined {
  const crew = state.crime.crew;
  const o = crew ? worldOrg(state, crew.cityId, crew.supplier) : undefined;
  return o && o.status !== 'war' ? o : undefined;
}

/** A drug the organization moves and how many units a sum of money is worth at wholesale (D1 prices). */
function drugFor(state: LifeState, content: ContentBundle): { id: Id; price: number } | undefined {
  const ids = content.balance.orgs.supply.drugs.filter((d) => drugDef(content, d));
  if (ids.length === 0) return undefined;
  const id = pick(state.rng, ids);
  return { id, price: Math.max(1, Math.round(unitPrice(state, drugDef(content, id)!, 'dealer', 50, content) * content.balance.orgs.supply.wholesale)) };
}

interface YearCtx {
  recap: OrgRecap;
  protection: number;
  warActive: boolean;
  triggers: CrimeTrigger[];
  /** Organizations already at war with you when the year began: only a war that has been escalating kills. */
  escalated: Set<Id>;
  done: number;
  bust: number;
  lowered: boolean;
}

function variation(state: LifeState, content: ContentBundle): number {
  return 1 + content.balance.crime.jobs.variation * (nextFloat(state.rng) * 2 - 1);
}

function killMember(state: LifeState, id: Id): void {
  const person = state.people[id];
  if (!person) return;
  const affection = state.relationships[id]?.affection ?? 0;
  person.alive = false;
  person.deathYear = state.currentYear;
  removeMember(state, id);
  state.orgs.totals.killed += 1;
  if (affection >= 50) state.character.stats.stress = clampInt(state.character.stats.stress + 6, 0, 100);
}

/** One member's year of work. */
function memberYear(state: LifeState, content: ContentBundle, id: Id, m: OrgMember, ctx: YearCtx): OrgResult {
  const b = content.balance.orgs;
  const crew = state.crime.crew!;
  m.heat = clampInt(m.heat - b.jobs.memberHeat.decay, 0, 100);
  const name = memberName(state, id);
  if (m.jailed !== undefined) {
    if (m.jailed >= state.currentYear) return { id, name, job: m.job ?? '', outcome: 'idle', amount: 0 };
    delete m.jailed;
  }
  const options = jobsFor(state, content, id);
  const job = options.find((j) => j.id === m.job) ?? defaultJob(state, content, id);
  if (!job) return { id, name, job: '', outcome: 'idle', amount: 0 };
  const d = b.jobs.danger[job.danger];
  const mult = 1 + (m.heat / 100) * b.jobs.heatScale + (ctx.warActive ? b.jobs.warScale : 0);
  // Death only on a clearly dangerous job, or in a war that has been escalating.
  const killed = job.danger === 'high' || ctx.warActive ? Math.min(0.5, d.killed * mult) : 0;
  const result = (outcome: OrgResult['outcome'], amount = 0): OrgResult => ({ id, name, job: job.id, outcome, amount });
  const rel = state.relationships[id];

  if (job.effect !== 'lie_low' && chance(state.rng, killed) && ctx.recap.results.every((r) => r.outcome !== 'killed')) {
    killMember(state, id);
    say(state, 'memberKilled', { member: name }, content);
    return result('killed');
  }
  if (job.effect !== 'lie_low' && chance(state.rng, Math.min(0.6, d.arrest * mult))) {
    m.jailed = state.currentYear + nextInt(state.rng, 0, 2);
    m.heat = clampInt(m.heat + b.jobs.memberHeat[job.danger], 0, 100);
    say(state, 'memberArrested', { member: name }, content);
    if (rel) rel.affection = clampInt(rel.affection - 2, 0, 100);
    if (crew.informant === undefined && m.loyalty < b.decisions.informantLoyalty && state.crime.investigation !== undefined && chance(state.rng, 0.5)) {
      crew.informant = id;
      state.orgs.totals.informants += 1;
      say(state, 'memberTurned', { member: name }, content);
      ctx.triggers.push('discipline');
    }
    ctx.bust += 1;
    return result('arrested');
  }
  const hurt = job.effect !== 'lie_low' && chance(state.rng, Math.min(0.6, d.injury * mult));
  const works = !hurt && chance(state.rng, successChance(content, m));
  const share = works ? 1 : b.jobs.failShare;
  if (job.effect !== 'lie_low') m.heat = clampInt(m.heat + b.jobs.memberHeat[job.danger], 0, 100);
  if (hurt) {
    m.loyalty = clampInt(m.loyalty - 3, 0, 100);
    say(state, 'memberHurt', { member: name }, content);
  }
  let amount = 0;
  switch (job.effect) {
    case 'earn':
    case 'supply': {
      const size = content.balance.crime.jobs.sizes[job.size ?? 'small'];
      let take: number;
      if (job.effect === 'supply') {
        const drug = drugFor(state, content);
        const units = Math.max(1, Math.round(b.supply.units[job.danger] * skillFactor(m)));
        take = drug ? units * drug.price * payLevel(state, content) * share : 0;
        if (works) {
          ctx.recap.units += units;
          state.orgs.totals.supplied += units;
        }
      } else {
        take = size.payout * payLevel(state, content) * skillFactor(m) * variation(state, content) * share;
        const buys = kindDef(content, crewDef(content, crew?.defId)?.kind)?.buys === true;
        if (job.drug && buys) {
          const supplier = supplierOf(state);
          if (supplier) {
            const drug = drugFor(state, content);
            const cartel = take * b.supply.cartelShare;
            take -= cartel;
            if (drug && works) {
              const u = Math.max(1, Math.round(cartel / drug.price));
              ctx.recap.units += u;
              state.orgs.totals.supplied += u;
            }
          } else take *= b.jobs.noSupplier;
        }
      }
      amount = wholeDollars(take);
      const keep = wholeDollars(amount * b.cut[crew.cut ?? 'fair'].keep);
      addDirty(state, keep);
      ctx.recap.jobs += keep;
      ctx.recap.kept += amount - keep;
      addHeat(state, Math.round(size.heat * b.jobs.leaderHeat * (works ? 1 : 0.6)));
      state.crime.jobs.count += 1;
      state.crime.totals.jobs += 1;
      break;
    }
    case 'launder': {
      const size = content.balance.crime.jobs.sizes[job.size ?? 'small'];
      const want = wholeDollars(size.payout * payLevel(state, content) * skillFactor(m) * share);
      const amt = Math.min(state.finances.dirty, want);
      amount = amt;
      if (amt > 0 && works) {
        takeDirty(state, amt);
        const cleaned = wholeDollars(amt * b.jobs.launder.keep);
        earn(state, cleaned);
        state.crime.totals.cleaned += cleaned;
        state.crime.totals.fees += amt - cleaned;
        ctx.recap.cleaned += cleaned;
        say(state, 'laundered', { amount: money(state, cleaned, content) }, content);
      } else if (amt > 0) {
        const l = content.balance.crime.dirty.laundering;
        loseDirty(state, wholeDollars(amt * l.lost));
        addHeat(state, l.flaggedHeat);
      }
      break;
    }
    case 'protect':
      ctx.protection += works ? m.skill : m.skill / 2;
      break;
    case 'recruit':
      if (works && chance(state.rng, b.jobs.recruit.chance)) {
        const made = recruitPerson(state, content, b.jobs.recruit.loyalty + m.loyalty / 4);
        if (made !== null) {
          amount = 1;
          say(state, 'recruited', { member: name, count: '1' }, content);
        }
      }
      break;
    case 'lie_low':
      if (!ctx.lowered) {
        addHeat(state, -b.jobs.lieLow.you);
        ctx.lowered = true;
      }
      m.heat = clampInt(m.heat - b.jobs.lieLow.member, 0, 100);
      break;
  }
  if (job.effect !== 'lie_low' && job.effect !== 'protect') {
    if (works) ctx.done += 1;
    else ctx.bust += 1;
  }
  if (works) {
    m.skill = clampInt(m.skill + b.roster.grow, 0, 100);
    m.loyalty = clampInt(m.loyalty + 1, 0, 100);
    if (rel) rel.affection = clampInt(rel.affection + 1, 0, 100);
  } else if (!hurt) {
    m.loyalty = clampInt(m.loyalty - 2, 0, 100);
  }
  return result(hurt ? 'hurt' : works ? 'done' : 'bust', amount);
}

/** The members' yearly pull: loyalty moves with your cut and with how much work they were given. */
function loyaltyYear(state: LifeState, content: ContentBundle, results: OrgResult[]): void {
  const crew = state.crime.crew!;
  const b = content.balance.orgs;
  const cut = b.cut[crew.cut ?? 'fair'].loyalty;
  for (const [id, m] of Object.entries(crew.roster ?? {})) {
    const r = results.find((x) => x.id === id);
    m.loyalty = clampInt(m.loyalty + cut - (r?.outcome === 'idle' ? b.roster.idleLoyalty : 0), 0, 100);
  }
}

/** Members who walk away (loyalty gone) or drift to the police. */
function departures(state: LifeState, content: ContentBundle, ctx: YearCtx): void {
  const crew = state.crime.crew!;
  const b = content.balance.orgs;
  for (const [id, m] of Object.entries(crew.roster ?? {})) {
    if (m.loyalty > 5 || !chance(state.rng, 0.5)) continue;
    const name = memberName(state, id);
    removeMember(state, id);
    say(state, 'memberQuit', { member: name }, content);
    ctx.recap.results.push({ id, name, job: m.job ?? '', outcome: 'quit', amount: 0 });
    if (chance(state.rng, 0.3) && crew.informant === undefined && state.crime.investigation) {
      // (They are no longer in the crew, so they can't be the informant; the police simply learn a little.)
      addHeat(state, b.decisions.cutLoose.heat);
    }
  }
}

// ---- Territory and rivals --------------------------------------------------------------------------------------------

function fightRoll(state: LifeState, content: ContentBundle, mine: number, theirs: number): boolean {
  const luck = content.balance.orgs.territory.luck;
  return mine + luck * (nextFloat(state.rng) * 2 - 1) >= theirs + luck * (nextFloat(state.rng) * 2 - 1);
}

/** Members hurt or killed in a fight; death only once the war is at its height. */
function casualties(state: LifeState, content: ContentBundle, ctx: YearCtx, org: WorldOrg): void {
  const crew = state.crime.crew!;
  const f = content.balance.orgs.territory.fight;
  const ids = Object.keys(crew.roster ?? {}).sort();
  if (ids.length === 0) return;
  const id = pick(state.rng, ids);
  const name = memberName(state, id);
  if (ctx.escalated.has(org.id) && org.war >= content.balance.orgs.war.at && ctx.recap.results.every((r) => r.outcome !== 'killed') && chance(state.rng, f.killed)) {
    killMember(state, id);
    say(state, 'memberKilled', { member: name }, content);
    ctx.recap.results.push({ id, name, job: '', outcome: 'killed', amount: 0 });
  } else if (chance(state.rng, f.hurt)) {
    say(state, 'memberHurt', { member: name }, content);
    ctx.recap.results.push({ id, name, job: '', outcome: 'hurt', amount: 0 });
  }
}

function startWar(state: LifeState, content: ContentBundle, ctx: YearCtx, org: WorldOrg): void {
  const crew = state.crime.crew!;
  if (org.status === 'war') return;
  org.status = 'war';
  delete org.truceSince;
  if (crew.war === undefined) crew.war = org.id;
  state.orgs.totals.wars += 1;
  say(state, 'warStarted', { rival: org.name }, content);
  ctx.recap.notes.push(`At war with ${org.name}.`);
  ctx.triggers.push('war');
}

function afterFight(state: LifeState, content: ContentBundle, ctx: YearCtx, org: WorldOrg, won: boolean, hood: Id): void {
  const f = content.balance.orgs.territory.fight;
  const w = content.balance.orgs.war;
  const crew = state.crime.crew!;
  const hoodName = content.cities[crew.cityId]?.neighborhoods?.find((h) => h.id === hood)?.name ?? hood;
  state.orgs.totals.fights += 1;
  org.war = clampInt(org.war + (won ? f.warWin : f.warLose), 0, 100);
  org.attitude = clampInt(org.attitude + w.attitude.fight, -100, 100);
  addHeat(state, won ? f.winHeat : f.loseHeat);
  if (!won) {
    state.orgs.hoods[crew.cityId]![hood] = org.id;
    say(state, 'hoodLost', { hood: hoodName, rival: org.name }, content);
    ctx.recap.notes.push(`Lost ${hoodName} to ${org.name}.`);
    if (chance(state.rng, f.hurt)) state.character.stats.health = clampInt(state.character.stats.health - 6, 0, 100);
  } else {
    say(state, 'fightWon', { hood: hoodName, rival: org.name }, content);
    ctx.recap.notes.push(`Held ${hoodName} against ${org.name}.`);
  }
  if (org.war >= w.at) startWar(state, content, ctx, org);
  casualties(state, content, ctx, org);
  if (chance(state.rng, content.balance.orgs.events.contest)) ctx.triggers.push('contest');
}

/** Rivals attack your neighborhoods; unheld ones are taken by someone; wars burn out; truces lapse; allies betray. */
function worldYear(state: LifeState, content: ContentBundle, ctx: YearCtx): void {
  const crew = state.crime.crew!;
  const b = content.balance.orgs;
  const orgs = ensureCity(state, content, crew.cityId);
  const mine = myOrg(state);
  if (!mine) return;
  const hoods = state.orgs.hoods[crew.cityId]!;
  for (const o of orgs) {
    if (o.id === mine.id) continue;
    o.strength = clampInt(o.strength + nextInt(state.rng, -b.world.drift, b.world.drift), 5, 95);
    if (o.status === 'neutral') o.attitude = clampInt(o.attitude + (o.attitude < 0 ? b.war.attitude.peace : -b.war.attitude.peace / 2), -100, 100);
    // Wars burn out.
    if (o.war > 0) o.war = clampInt(o.war - b.war.decay, 0, 100);
    if (o.status === 'war' && o.war < b.war.at) {
      o.status = 'neutral';
      if (crew.war === o.id) delete crew.war;
      say(state, 'warEnded', { rival: o.name }, content);
      ctx.recap.notes.push(`The war with ${o.name} ended.`);
    }
    if (o.status === 'truce' && o.truceSince !== undefined && state.currentYear - o.truceSince >= b.war.truceYears && chance(state.rng, b.war.truceBreak)) {
      o.status = 'neutral';
      delete o.truceSince;
      say(state, 'truceLapsed', { rival: o.name }, content);
    }
    if (o.status === 'allied' && chance(state.rng, b.war.betrayal)) {
      o.status = 'war';
      o.war = b.war.at + 10;
      o.attitude = clampInt(o.attitude + b.war.attitude.betrayal, -100, 100);
      if (crew.war === undefined) crew.war = o.id;
      state.orgs.totals.wars += 1;
      say(state, 'betrayed', { rival: o.name }, content);
      ctx.recap.notes.push(`${o.name} betrayed you.`);
      ctx.triggers.push('betrayal');
    }
  }
  if (!crew.war) ctx.warActive = false;
  // Your order to take a neighborhood.
  const plan = crew.plan?.expand;
  if (plan !== undefined) {
    delete crew.plan;
    if (plan in hoods && hoods[plan] !== mine.id) {
      const owner = worldOrg(state, crew.cityId, hoods[plan] ?? undefined);
      const hoodName = content.cities[crew.cityId]?.neighborhoods?.find((h) => h.id === plan)?.name ?? plan;
      const theirs = owner ? strengthOf(state, content, owner) : b.world.strength.mean * 0.5;
      const won = fightRoll(state, content, myStrength(state, content), theirs);
      if (won) {
        hoods[plan] = mine.id;
        say(state, 'hoodGained', { hood: hoodName }, content);
        ctx.recap.notes.push(`Took ${hoodName}.`);
        if (owner) {
          owner.war = clampInt(owner.war + b.territory.fight.warWin, 0, 100);
          owner.attitude = clampInt(owner.attitude + b.war.attitude.fight, -100, 100);
          if (owner.war >= b.war.at) startWar(state, content, ctx, owner);
          casualties(state, content, ctx, owner);
        }
        addHeat(state, b.territory.fight.winHeat);
      } else {
        ctx.recap.notes.push(`Your attack on ${hoodName} failed.`);
        addHeat(state, b.territory.fight.loseHeat);
        if (owner) {
          owner.attitude = clampInt(owner.attitude + b.war.attitude.fight, -100, 100);
          casualties(state, content, ctx, owner);
        }
      }
      state.orgs.totals.fights += 1;
    }
  }
  // Rivals attack the neighborhoods you hold.
  const held = holdings(state, crew.cityId, mine.id);
  for (const o of orgs) {
    if (o.id === mine.id || o.status === 'allied' || o.status === 'truce') continue;
    const mineS = myStrength(state, content);
    const ownS = strengthOf(state, content, o);
    if (held.length === 0) break;
    const a = b.territory.attack;
    const p = Math.min(a.cap, a.base * (1 + (a.hostile * Math.max(0, -o.attitude)) / 100) * (o.status === 'war' ? a.war : 1) * ((2 * ownS) / (ownS + mineS + 1)));
    if (!chance(state.rng, p)) continue;
    const alive = holdings(state, crew.cityId, mine.id);
    if (alive.length === 0) break;
    const target = pick(state.rng, alive);
    const allies = orgs.filter((x) => x.status === 'allied' && x.id !== o.id).length * b.war.allyStrength;
    const won = fightRoll(state, content, mineS + ctx.protection * b.territory.protect + allies, ownS);
    afterFight(state, content, ctx, o, won, target);
  }
  // Others settle unheld neighborhoods among themselves.
  for (const o of orgs) {
    if (o.id === mine.id || !chance(state.rng, 0.12)) continue;
    const free = Object.keys(hoods).filter((h) => hoods[h] === null).sort();
    if (free.length > 0) hoods[pick(state.rng, free)] = o.id;
  }
  if (crew.war !== undefined && worldOrg(state, crew.cityId, crew.war)?.status !== 'war') delete crew.war;
  const warOrg = worldOrg(state, crew.cityId, crew.war);
  if (warOrg && crew.rival !== undefined && warOrg.defId === crew.rival) state.crime.rivalry = Math.max(state.crime.rivalry, Math.round(warOrg.war));
}

/** Your neighborhoods pay the leader (dirty money) and draw attention. */
function territoryIncome(state: LifeState, content: ContentBundle, ctx: YearCtx): void {
  const crew = state.crime.crew!;
  const t = content.balance.orgs.territory;
  const mine = holdings(state, crew.cityId, crew.defId);
  const hoods = content.cities[crew.cityId]?.neighborhoods ?? [];
  let total = 0;
  let attention = 0;
  for (const id of mine) {
    const h = hoods.find((x) => x.id === id);
    if (!h) continue;
    total += t.income[h.income - 1]! * payLevel(state, content);
    attention += h.attention;
  }
  const paid = wholeDollars(total * t.leaderShare);
  ctx.recap.hoodCount = mine.length;
  ctx.recap.hoods = paid;
  if (paid > 0) {
    addDirty(state, paid);
    state.orgs.totals.income += paid;
    addHeat(state, Math.round((attention / 10) * t.heatPer10));
  }
}

/** The organization holds you to its code: a quiet year, too much heat, an arrest. */
export function applyCodes(state: LifeState, content: ContentBundle, year: { arrested: boolean; done: number }): void {
  const crew = state.crime.crew;
  const def = kindDef(content, crewDef(content, crew?.defId)?.kind);
  if (!crew || !def) return;
  for (const code of def.codes) {
    const broken = code.check === 'idle' ? year.done === 0 && state.crime.jobs.count === 0 : code.check === 'arrest' ? year.arrested : state.crime.heat > (code.over ?? 100);
    if (!broken) continue;
    state.crime.standing = clampInt(state.crime.standing - code.standing, 0, 100);
    say(state, 'codeBroken', {}, content);
  }
}

export interface OrgYear {
  triggers: CrimeTrigger[];
}

/** The organization's year. */
export function runOrgYear(state: LifeState, content: ContentBundle): OrgYear {
  const crew = state.crime.crew;
  const out: OrgYear = { triggers: [] };
  if (!crew || isIncarcerated(state)) return out;
  const b = content.balance.orgs;
  ensureCity(state, content, crew.cityId);
  ensureHolding(state, content);
  ensureRoster(state, content);
  const leader = isLeader(state, content);
  const ctx: YearCtx = {
    recap: { year: state.currentYear, results: [], jobs: 0, hoods: 0, hoodCount: 0, kept: 0, cleaned: 0, units: 0, notes: [] },
    protection: 0,
    warActive: crew.war !== undefined,
    triggers: out.triggers,
    escalated: new Set((state.orgs.cities[crew.cityId] ?? []).filter((o) => o.status === 'war' && o.war >= b.war.at).map((o) => o.id)),
    done: 0,
    bust: 0,
    lowered: false,
  };
  if (leader) {
    const roster = crew.roster!;
    for (const id of Object.keys(roster).sort()) {
      const m = roster[id]!;
      if (!state.people[id]?.alive) continue;
      ctx.recap.results.push(memberYear(state, content, id, m, ctx));
    }
    loyaltyYear(state, content, ctx.recap.results);
    departures(state, content, ctx);
  }
  worldYear(state, content, ctx);
  if (leader) {
    territoryIncome(state, content, ctx);
    const s = b.jobs.standing;
    state.crime.standing = clampInt(state.crime.standing + Math.min(s.max, ctx.done * s.done) - ctx.bust * s.bust, 0, 100);
    state.character.stats.stress = clampInt(state.character.stats.stress + b.decisions.leaderStress, 0, 100);
    const r = ctx.recap;
    if (r.jobs > 0) say(state, 'yearTake', { amount: money(state, r.jobs, content), balance: money(state, state.finances.dirty, content) }, content);
    if (r.hoods > 0) say(state, 'hoodsPay', { count: String(r.hoodCount), amount: money(state, r.hoods, content), balance: money(state, state.finances.dirty, content) }, content);
    if (r.units > 0) say(state, 'supplied', { count: String(r.units), amount: money(state, r.jobs, content) }, content);
    if (r.jobs === 0 && r.hoods === 0 && r.results.every((x) => x.outcome === 'idle' || x.outcome === 'done' || x.outcome === 'bust')) say(state, 'yearQuiet', {}, content);
    crew.recap = r;
    // Troubles among the members the leader has to decide about.
    const low = Object.entries(crew.roster ?? {}).some(([, m]) => m.loyalty < b.decisions.informantLoyalty);
    if (low && chance(state.rng, b.events.discipline)) out.triggers.push('discipline');
    if (kindDef(content, crewDef(content, crew.defId)?.kind)?.supplies && chance(state.rng, b.events.supply)) out.triggers.push('supply');
  }
  // A truce is offered when the war has gone on.
  const warOrg = worldOrg(state, crew.cityId, crew.war);
  if (warOrg && chance(state.rng, b.events.truce)) out.triggers.push('truce');
  return out;
}
