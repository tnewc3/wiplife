/**
 * What the Organization screen shows (O1): the overview of the organization you are in, its members (each a person
 * with skill, loyalty, heat and a job), the neighborhoods of your city and who holds them, the rival organizations,
 * and what last year brought. Read-only; the numbers are bands the UI turns into words (labels.ts).
 */
import type { CutLevel, Id, LifeState } from '../types';
import type { ContentBundle, OrgKind } from '../../content/schemas';
import { bandOf } from './query';
import { assignBlock, disciplineBlock, cutBlock, expandBlock, expandCost, informantBlock, leadBlock, moveBlock, moveOdds, promoteBlock, supplierBlock, type LeadBlock } from './decisions';
import { holdings, memberName, myOrg, myStrength, strengthOf, worldOrg } from './orgs';
import { jobsFor } from './orgYear';
import { crewDef, crewName, isLeader, kindDef, rankTitle, topRank } from './query';

export interface OrgJobOption {
  id: Id;
  name: string;
  blurb: string;
  effect: string;
  danger: string;
}

export interface OrgMemberView {
  id: Id;
  name: string;
  rank: number;
  rankTitle: string;
  skill: number;
  skillBand: number;
  loyalty: number;
  loyaltyBand: number;
  heat: number;
  jobId: Id | null;
  jobName: string;
  jobs: OrgJobOption[];
  jailed: boolean;
  informant: boolean;
  canAssign: boolean;
  canPromote: boolean;
  canDiscipline: boolean;
  canCut: boolean;
}

export interface OrgHoodView {
  id: Id;
  name: string;
  income: number;
  attention: number;
  holder: 'you' | 'rival' | 'none';
  holderName: string;
  canExpand: boolean;
}

export interface OrgRivalView {
  id: Id;
  name: string;
  kind: OrgKind;
  kindName: string;
  strengthBand: number;
  attitudeBand: number;
  status: 'neutral' | 'war' | 'truce' | 'allied';
  war: number;
  supplies: boolean;
  isSupplier: boolean;
  canTruce: boolean;
  canAlly: boolean;
  canSupply: boolean;
  /** 0 (poor) to 2 (good): how a move toward it would be taken. */
  odds: number;
  hoods: number;
}

export interface OrgResultView {
  id: Id;
  name: string;
  jobName: string;
  outcome: string;
  amount: number;
}

export interface OrgRecapView {
  year: number;
  results: OrgResultView[];
  jobs: number;
  hoods: number;
  hoodCount: number;
  kept: number;
  cleaned: number;
  units: number;
  notes: string[];
}

export interface OrgView {
  /** Show the screen's entry: in an organization. */
  show: boolean;
  leader: boolean;
  /** You can use the leader's decisions now (home, free). */
  canLead: boolean;
  block: LeadBlock | null;
  kind: OrgKind;
  kindName: string;
  name: string;
  city: string;
  rank: number;
  ranks: number;
  rankTitle: string;
  strength: number;
  strengthBand: number;
  members: OrgMemberView[];
  hoodCount: number;
  yearlyIncome: number;
  cut: CutLevel;
  supplier: { id: Id; name: string } | null;
  /** Cartels in the city you could buy from. */
  suppliers: { id: Id; name: string }[];
  /** For a gang or a club: buys its drugs from a cartel. */
  buys: boolean;
  /** Is a cartel: supplies the drugs. */
  supplies: boolean;
  war: { id: Id; name: string } | null;
  codes: string[];
  initiation: { name: string; blurb: string; done: boolean };
  informant: { id: Id; name: string } | null;
  canConfront: boolean;
  canPay: boolean;
  dirty: number;
  expandCost: number;
  hoods: OrgHoodView[];
  rivals: OrgRivalView[];
  recap: OrgRecapView | null;
}

const EMPTY_BLOCK = null;

export function getOrgView(state: LifeState, content: ContentBundle): OrgView | null {
  const crew = state.crime.crew;
  const def = crewDef(content, crew?.defId);
  const kind = kindDef(content, def?.kind);
  const mine = myOrg(state);
  if (!crew || !def || !kind) return null;
  const b = content.balance.orgs;
  const leader = isLeader(state, content);
  const block = leadBlock(state, content);
  const city = content.cities[crew.cityId];
  const members: OrgMemberView[] = (crew.members ?? [])
    .filter((id) => crew.roster?.[id] && state.people[id]?.alive)
    .sort()
    .map((id) => {
      const m = crew.roster![id]!;
      const options = jobsFor(state, content, id);
      return {
        id,
        name: memberName(state, id),
        rank: m.rank,
        rankTitle: rankTitle(content, crew.defId, m.rank),
        skill: m.skill,
        skillBand: bandOf(m.skill, b.bands.member),
        loyalty: m.loyalty,
        loyaltyBand: bandOf(m.loyalty, b.bands.member),
        heat: m.heat,
        jobId: m.job ?? null,
        jobName: content.orgJobs[m.job ?? '']?.name ?? '',
        jobs: options.map((j) => ({ id: j.id, name: j.name, blurb: j.blurb, effect: j.effect, danger: j.danger })),
        jailed: m.jailed !== undefined && m.jailed >= state.currentYear,
        informant: crew.informant === id,
        canAssign: options.length > 0 && assignBlock(state, content, id, options[0]!.id) === EMPTY_BLOCK,
        canPromote: promoteBlock(state, content, id) === EMPTY_BLOCK,
        canDiscipline: disciplineBlock(state, content, id) === EMPTY_BLOCK,
        canCut: cutBlock(state, content, id) === EMPTY_BLOCK,
      };
    });
  const hoodDefs = city?.neighborhoods ?? [];
  const holdMap = state.orgs.hoods[crew.cityId] ?? {};
  const hoods: OrgHoodView[] = hoodDefs.map((h) => {
    const owner = holdMap[h.id] ?? null;
    return {
      id: h.id,
      name: h.name,
      income: h.income,
      attention: h.attention,
      holder: owner === null ? 'none' : owner === crew.defId ? 'you' : 'rival',
      holderName: owner === null ? '' : (worldOrg(state, crew.cityId, owner)?.name ?? ''),
      canExpand: expandBlock(state, content, h.id) === EMPTY_BLOCK,
    };
  });
  const orgs = state.orgs.cities[crew.cityId] ?? [];
  const rivals: OrgRivalView[] = orgs
    .filter((o) => o.id !== crew.defId)
    .map((o) => {
      const truce = moveBlock(state, content, o.id, 'truce') === EMPTY_BLOCK;
      const ally = moveBlock(state, content, o.id, 'alliance') === EMPTY_BLOCK;
      const odds = moveOdds(o, o.status === 'war' ? 'truce' : 'alliance', content);
      return {
        id: o.id,
        name: o.name,
        kind: o.kind,
        kindName: content.orgKinds[o.kind]?.name ?? o.kind,
        strengthBand: bandOf(strengthOf(state, content, o), b.bands.strength),
        attitudeBand: bandOf(o.attitude, b.bands.attitude),
        status: o.status,
        war: o.war,
        supplies: content.orgKinds[o.kind]?.supplies === true,
        isSupplier: crew.supplier === o.id,
        canTruce: truce,
        canAlly: ally,
        canSupply: kind.buys === true && supplierBlock(state, content, o.id) === EMPTY_BLOCK,
        odds: odds < 0.25 ? 0 : odds < 0.5 ? 1 : 2,
        hoods: holdings(state, crew.cityId, o.id).length,
      };
    })
    .sort((a, c) => (a.status === 'war' ? -1 : 0) - (c.status === 'war' ? -1 : 0) || (a.name < c.name ? -1 : 1));
  const warOrg = worldOrg(state, crew.cityId, crew.war);
  const informant = crew.informant;
  const r = crew.recap;
  const held = holdings(state, crew.cityId, crew.defId);
  const yearly = Math.round(held.reduce((sum, id) => sum + (b.territory.income[(hoodDefs.find((h) => h.id === id)?.income ?? 1) - 1] ?? 0), 0) * b.territory.leaderShare * (city?.salaryMultiplier ?? 1));
  return {
    show: true,
    leader,
    canLead: block === null,
    block,
    kind: def.kind,
    kindName: kind.name,
    name: crewName(content, crew.defId),
    city: city?.name ?? '',
    rank: state.crime.rank,
    ranks: topRank(content, crew.defId),
    rankTitle: rankTitle(content, crew.defId, state.crime.rank),
    strength: Math.round(myStrength(state, content)),
    strengthBand: bandOf(myStrength(state, content), b.bands.strength),
    members,
    hoodCount: held.length,
    yearlyIncome: yearly,
    cut: crew.cut ?? 'fair',
    supplier: crew.supplier !== undefined && mine ? { id: crew.supplier, name: worldOrg(state, crew.cityId, crew.supplier)?.name ?? '' } : null,
    suppliers: orgs.filter((o) => content.orgKinds[o.kind]?.supplies && o.id !== crew.defId).map((o) => ({ id: o.id, name: o.name })),
    buys: kind.buys === true,
    supplies: kind.supplies === true,
    war: warOrg ? { id: warOrg.id, name: warOrg.name } : null,
    codes: kind.codes.map((c) => c.text),
    initiation: { name: kind.initiation.name, blurb: kind.initiation.blurb, done: crew.initiated === true || state.crime.rank >= kind.initiation.rank },
    informant: informant !== undefined ? { id: informant, name: memberName(state, informant) } : null,
    canConfront: informantBlock(state, content, 'confront') === EMPTY_BLOCK,
    canPay: informantBlock(state, content, 'pay') === EMPTY_BLOCK,
    dirty: state.finances.dirty,
    expandCost: expandCost(state, content),
    hoods,
    rivals,
    recap: r
      ? {
          year: r.year,
          results: r.results.map((x) => ({ id: x.id, name: x.name, jobName: content.orgJobs[x.job]?.name ?? '', outcome: x.outcome, amount: x.amount })),
          jobs: r.jobs,
          hoods: r.hoods,
          hoodCount: r.hoodCount,
          kept: r.kept,
          cleaned: r.cleaned,
          units: r.units,
          notes: r.notes,
        }
      : null,
  };
}
