/**
 * The simulated player's family (E2a): whether it wants children and how, and
 * the parenting style it brings (warm or cold, strict or relaxed, involved
 * or absent, fixed for the life so the run can show what each does to the
 * children), plus what the run measures about children: births per life,
 * adoption, IVF and surrogacy, miscarriage and child death, custody, how
 * parenting style shapes children, and how children's starting values sit
 * between their parents'. Like the other player models, these chances
 * describe the simulated player, not the game, so they live here and not in
 * the balance files.
 */
import type { ActionId, ContentBundle } from '../../src/content/schemas';
import type { LifeActionId, LifeActionParams } from '../../src/engine/actions';
import { livingChildren } from '../../src/engine/family/children';
import { availableInteractions } from '../../src/engine/interactions/availability';
import { weightedPick } from '../../src/engine/random';
import { chance, pick, type RngState } from '../../src/engine/rng';
import type { LifeState } from '../../src/engine/types';
import type { InteractionPlan } from './interactions';

/** What a simulated player does as a parent, fixed for the life. */
export interface FamilyProfile {
  wantsKids: boolean;
  /** Most children it plans to have. */
  maxKids: number;
  warm: boolean;
  strict: boolean;
  involved: boolean;
  /** Tries adoption, IVF and surrogacy when it can't conceive (or doesn't try). */
  openToProcesses: boolean;
}

export function rollFamilyProfile(rng: RngState): FamilyProfile {
  return {
    wantsKids: chance(rng, 0.85),
    maxKids: weightedPick(rng, [[1, 3], [2, 5], [3, 2]] as const),
    warm: chance(rng, 0.5),
    strict: chance(rng, 0.5),
    involved: chance(rng, 0.5),
    openToProcesses: chance(rng, 0.7),
  };
}

const FAMILY_YEARS = { min: 22, max: 47 };

/** How many children it has, is expecting or is waiting for. */
function kidsSoFar(life: LifeState): number {
  return livingChildren(life, false).length + (life.family.pregnancy ? 1 : 0) + (life.family.process ? 1 : 0);
}

/** The family actions the simulated player takes this year: trying for a baby, and starting a process. */
export function chooseFamilyActions(
  life: LifeState,
  rng: RngState,
  profile: FamilyProfile,
): { person: [ActionId, string][]; life: [LifeActionId, LifeActionParams][] } {
  const out = { person: [] as [ActionId, string][], life: [] as [LifeActionId, LifeActionParams][] };
  const age = life.character.age;
  // An heir (E2b) begins mid-life: their window to raise a family starts and runs on from where they began.
  const startAge = typeof life.inputLog[0]?.payload.startAge === 'number' ? life.inputLog[0].payload.startAge : 0;
  const window = { min: Math.max(FAMILY_YEARS.min, startAge), max: Math.max(FAMILY_YEARS.max, startAge + 12) };
  if (!profile.wantsKids || age < window.min || age > window.max) return out;
  if (kidsSoFar(life) >= profile.maxKids || life.family.pregnancy || life.family.process) return out;
  const partners = Object.values(life.relationships).filter((r) => ['spouse', 'fiance', 'partner'].includes(r.kind) && r.status === 'active' && life.people[r.personId]?.alive);
  const stuck = life.family.attempts >= 2;
  for (const rel of partners) if (chance(rng, rel.kind === 'spouse' ? 0.4 : 0.15)) out.person.push(['try_for_baby', rel.personId]);
  if (profile.openToProcesses) {
    if (chance(rng, stuck ? 0.25 : partners.length === 0 ? 0.015 : 0.006)) out.life.push([pick(rng, ['start_ivf', 'start_ivf', 'start_ivf', 'start_surrogacy'] as LifeActionId[]), {}]);
    if (chance(rng, stuck ? 0.1 : 0.008)) out.life.push(['start_adoption', {}]);
  }
  return out;
}

/** The parenting interactions the simulated player does this year, by its style. */
export function chooseParentingPlans(life: LifeState, content: ContentBundle, rng: RngState, profile: FamilyProfile, careless: boolean): InteractionPlan[] {
  const plans: InteractionPlan[] = [];
  for (const kid of livingChildren(life, true)) {
    const age = life.currentYear - kid.birthYear;
    if (age >= content.balance.relationships.adultAge) continue;
    const available = availableInteractions(life, kid.id, content).filter((d) => d.group === 'parenting');
    if (available.length === 0) continue;
    const ids = new Set(available.map((d) => d.id));
    const add = (id: string) => ids.has(id) && plans.push({ interactionId: id, personId: kid.id });
    if (careless) {
      // No plan: now and then, something at random.
      if (chance(rng, 0.6)) plans.push({ interactionId: pick(rng, available).id, personId: kid.id });
      continue;
    }
    const times = profile.involved ? 3 : chance(rng, 0.15) ? 1 : 0;
    for (let i = 0; i < times; i++) {
      if (profile.strict && i === 0) {
        add('discipline');
        continue;
      }
      if (profile.warm) {
        const options = available.filter((d) => ['praise_them', 'play_together', 'read_together', 'help_homework'].includes(d.id));
        if (options.length > 0) plans.push({ interactionId: weightedPick(rng, options.map((d) => [d.id, d.id === 'praise_them' ? 3 : 2] as const)), personId: kid.id });
      } else {
        add(chance(rng, 0.6) ? 'brush_off' : 'help_homework');
      }
    }
    if (!profile.involved && !profile.warm) add('brush_off');
  }
  return plans;
}

/** What the run measures about children, for one simulated player. */
export interface FamilyReport {
  lives: number;
  /** Lives that reached 50, and those among them with a child (born, adopted or step) by then. */
  reached50: number;
  parentsAt50: number;
  /** Children by how they came (born to you or your partner, adopted, IVF, surrogacy, step). */
  children: Record<'birth' | 'adopted' | 'ivf' | 'surrogacy' | 'step', number>;
  /** Your own children (not step) in all, and lives with at least one. */
  ownChildren: number;
  livesWithOwn: number;
  pregnancies: { began: number; unplanned: number; born: number; miscarried: number; placed: number; ended: number };
  /** Lives (that reached 50) that started each process, and the processes started and answered well. */
  processes: Record<'adoption' | 'ivf' | 'surrogacy', { started: number; worked: number; lives: number }>;
  /** Children who died before their parent, and the stage they died in. */
  deaths: { children: number; byStage: Record<'infant' | 'young' | 'teen' | 'adult', number> };
  /** Lives with a miscarriage, and how many of those saw a grief event (fired, or still due when the life ended). */
  miscarriageLives: number;
  miscarriageGrief: number;
  lossLives: number;
  lossGrief: number;
  custody: { hearings: number; full: number; shared: number; other: number; supportPaid: number; supportReceived: number };
  /** Yearly child costs in years with minors at home, and the share of income they take. */
  costs: { years: number; total: number; income: number };
  /** Children raised at the high and the low end of each style line (the player's profile): grades at 16–17, kindness and discipline at 18. */
  style: Record<'warm' | 'strict' | 'involved', { high: StyleCell; low: StyleCell }>;
  /** Starting smarts of children with two biological parents against the parents' mean. */
  inheritance: { n: number; sumX: number; sumY: number; sumXX: number; sumYY: number; sumXY: number; outside: number };
}

export interface StyleCell {
  children: number;
  gradesN: number;
  gradesSum: number;
  kindnessN: number;
  kindnessSum: number;
  disciplineN: number;
  disciplineSum: number;
}

const cell = (): StyleCell => ({ children: 0, gradesN: 0, gradesSum: 0, kindnessN: 0, kindnessSum: 0, disciplineN: 0, disciplineSum: 0 });

export function emptyFamilyReport(): FamilyReport {
  return {
    lives: 0,
    reached50: 0,
    parentsAt50: 0,
    children: { birth: 0, adopted: 0, ivf: 0, surrogacy: 0, step: 0 },
    ownChildren: 0,
    livesWithOwn: 0,
    pregnancies: { began: 0, unplanned: 0, born: 0, miscarried: 0, placed: 0, ended: 0 },
    processes: { adoption: { started: 0, worked: 0, lives: 0 }, ivf: { started: 0, worked: 0, lives: 0 }, surrogacy: { started: 0, worked: 0, lives: 0 } },
    deaths: { children: 0, byStage: { infant: 0, young: 0, teen: 0, adult: 0 } },
    miscarriageLives: 0,
    miscarriageGrief: 0,
    lossLives: 0,
    lossGrief: 0,
    custody: { hearings: 0, full: 0, shared: 0, other: 0, supportPaid: 0, supportReceived: 0 },
    costs: { years: 0, total: 0, income: 0 },
    style: { warm: { high: cell(), low: cell() }, strict: { high: cell(), low: cell() }, involved: { high: cell(), low: cell() } },
    inheritance: { n: 0, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0, outside: 0 },
  };
}

const GRIEF = {
  miscarriage: ['miscarriage_quiet', 'miscarriage_partner_talk_spouse', 'miscarriage_partner_talk_partner', 'miscarriage_anniversary'],
  loss: ['after_child_death_numb', 'after_child_death_together', 'after_child_death_sibling', 'after_child_death_milestone'],
};

/** Per life: watches the family change year by year, and adds to the report when the life ends. */
export class FamilyWatcher {
  private seen = new Map<string, { origin: string; custodyDecided: boolean; custody: string }>();
  private gpa16 = new Map<string, number>();
  private traits18 = new Map<string, { kindness: number; discipline: number }>();
  private prevPregnancy = false;
  private prevDecision: string | null = null;
  private prevProcess: string | null = null;
  private prevMiscarriages = 0;
  private prevLost = 0;
  private startedLives = new Set<string>();
  private everPay = false;
  private everReceive = false;

  constructor(
    private readonly report: FamilyReport,
    private readonly profile: FamilyProfile,
    /** Only the careful player's children count toward the style comparison (the others have no plan). */
    private readonly planned: boolean,
  ) {}

  observe(life: LifeState, content: ContentBundle): void {
    const r = this.report;
    const f = life.family;

    // Pregnancies.
    if (f.pregnancy && !this.prevPregnancy) {
      r.pregnancies.began++;
      if (f.pregnancy.how === 'unplanned') r.pregnancies.unplanned++;
    }
    if (!f.pregnancy && this.prevPregnancy && this.prevDecision === 'pending') r.pregnancies.ended++;
    if (!f.pregnancy && this.prevPregnancy && this.prevDecision === 'adoption' && f.miscarriages === this.prevMiscarriages) r.pregnancies.placed++;
    r.pregnancies.miscarried += f.miscarriages - this.prevMiscarriages;
    this.prevPregnancy = f.pregnancy !== null;
    this.prevDecision = f.pregnancy?.decision ?? null;
    this.prevMiscarriages = f.miscarriages;

    // Processes.
    const kind = f.process?.kind ?? null;
    if (kind && this.prevProcess === null) {
      r.processes[kind].started++;
      this.startedLives.add(kind);
    }
    this.prevProcess = kind;

    // Children.
    for (const person of Object.values(life.people)) {
      const d = person.child;
      const rel = life.relationships[person.id];
      if (!d || !rel) continue;
      const known = this.seen.get(person.id);
      if (!known) {
        this.seen.set(person.id, { origin: d.origin, custodyDecided: d.custodyDecided, custody: d.custody });
        if (d.origin !== 'grandchild') r.children[d.origin]++;
        if (d.origin === 'adopted') r.processes.adoption.worked++;
        if (d.origin === 'birth' || d.origin === 'ivf' || d.origin === 'surrogacy') r.pregnancies.born++;
        if (d.origin === 'ivf') r.processes.ivf.worked++;
        if (d.origin === 'surrogacy') r.processes.surrogacy.worked++;
        // A baby with two biological parents among the people you know: where do they start against them?
        if (d.origin === 'birth' && d.otherParentId !== undefined && person.birthYear === life.currentYear && life.people[d.otherParentId]) {
          const parents = (life.character.stats.smarts + life.people[d.otherParentId]!.smarts) / 2;
          const x = parents;
          const y = person.smarts;
          const i = r.inheritance;
          i.n++;
          i.sumX += x;
          i.sumY += y;
          i.sumXX += x * x;
          i.sumYY += y * y;
          i.sumXY += x * y;
          const lo = Math.min(life.character.stats.smarts, life.people[d.otherParentId]!.smarts) - 2 * content.balance.family.genetics.noiseSd;
          const hi = Math.max(life.character.stats.smarts, life.people[d.otherParentId]!.smarts) + 2 * content.balance.family.genetics.noiseSd;
          if (y < lo || y > hi) i.outside++;
        }
      } else if (!known.custodyDecided && d.custodyDecided) {
        r.custody[d.custody === 'you' ? 'full' : d.custody]++;
      }
      const prior = this.seen.get(person.id)!;
      prior.custodyDecided = d.custodyDecided;
      prior.custody = d.custody;
      const kidAge = life.currentYear - person.birthYear;
      if (rel.kind === 'child' && person.alive) {
        if (kidAge === 16 || kidAge === 17) this.gpa16.set(person.id, d.gpa);
        if (kidAge >= 18 && !this.traits18.has(person.id)) this.traits18.set(person.id, { kindness: person.traits.kindness ?? 50, discipline: person.traits.discipline ?? 50 });
      }
    }

    if (f.lostChildren > this.prevLost) {
      r.deaths.children += f.lostChildren - this.prevLost;
      for (const person of Object.values(life.people)) {
        if (person.child && !person.alive && person.deathYear === life.currentYear) {
          const a = person.deathYear - person.birthYear;
          r.deaths.byStage[a < 2 ? 'infant' : a < 13 ? 'young' : a < 18 ? 'teen' : 'adult']++;
        }
      }
    }
    this.prevLost = f.lostChildren;
    if (f.support?.direction === 'pay') this.everPay = true;
    if (f.support?.direction === 'receive') this.everReceive = true;

    // Costs in years with minors at home.
    const ledger = life.finances.lastLedger;
    if (ledger && ledger.year === life.currentYear && ledger.children > 0) {
      r.costs.years++;
      r.costs.total += ledger.children;
      r.costs.income += ledger.gross + ledger.supportReceived;
    }
  }

  /** The life has ended: add what the life as a whole shows. */
  finish(life: LifeState, firesThisLife: ReadonlyMap<string, number>): void {
    const r = this.report;
    r.lives++;
    const age = life.character.age;
    const kids = Object.values(life.relationships).filter((rel) => rel.kind === 'child' || rel.kind === 'stepchild');
    const own = kids.filter((rel) => rel.kind === 'child').length;
    r.ownChildren += own;
    if (own > 0) r.livesWithOwn++;
    if (age >= 50) {
      r.reached50++;
      if (kids.length > 0) r.parentsAt50++;
      for (const k of ['adoption', 'ivf', 'surrogacy'] as const) if (this.startedLives.has(k)) r.processes[k].lives++;
    }
    const fired = (ids: string[]) => ids.some((id) => (firesThisLife.get(id) ?? 0) > 0 || life.scheduled.some((s) => s.eventId === id));
    if (life.family.miscarriages > 0) {
      r.miscarriageLives++;
      // Or the life ended before the first link of the chain fell due.
      if (fired(GRIEF.miscarriage) || life.death !== null) r.miscarriageGrief++;
    }
    if (life.family.lostChildren > 0) {
      r.lossLives++;
      if (fired(GRIEF.loss) || life.death !== null) r.lossGrief++;
    }
    r.custody.hearings += firesThisLife.get('custody_hearing') ?? 0;
    if (this.everPay) r.custody.supportPaid++;
    if (this.everReceive) r.custody.supportReceived++;

    // How the style the player brought shaped its children.
    if (this.planned) {
      const lines = { warm: this.profile.warm, strict: this.profile.strict, involved: this.profile.involved } as const;
      for (const [id, person] of Object.entries(life.people)) {
        if (life.relationships[id]?.kind !== 'child' || !person.child) continue;
        for (const line of ['warm', 'strict', 'involved'] as const) {
          const c = r.style[line][lines[line] ? 'high' : 'low'];
          c.children++;
          const g = this.gpa16.get(id);
          if (g !== undefined && g > 0) {
            c.gradesN++;
            c.gradesSum += g;
          }
          const t = this.traits18.get(id);
          if (t) {
            c.kindnessN++;
            c.kindnessSum += t.kindness;
            c.disciplineN++;
            c.disciplineSum += t.discipline;
          }
        }
      }
    }
  }
}

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—');
const mean = (sum: number, n: number) => (n > 0 ? sum / n : 0);

/** The correlation of a child's starting smarts with the mean of their parents'. */
export function inheritanceCorrelation(i: FamilyReport['inheritance']): number {
  if (i.n < 3) return 0;
  const cov = i.sumXY / i.n - (i.sumX / i.n) * (i.sumY / i.n);
  const vx = i.sumXX / i.n - (i.sumX / i.n) ** 2;
  const vy = i.sumYY / i.n - (i.sumY / i.n) ** 2;
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0;
}

/** What each style line did, as the difference between children raised high and low (grades, kindness and discipline). */
export function styleEffects(r: FamilyReport) {
  const diff = (line: 'warm' | 'strict' | 'involved', key: 'grades' | 'kindness' | 'discipline') => {
    const hi = r.style[line].high;
    const lo = r.style[line].low;
    const m = (c: StyleCell) => (key === 'grades' ? mean(c.gradesSum, c.gradesN) : key === 'kindness' ? mean(c.kindnessSum, c.kindnessN) : mean(c.disciplineSum, c.disciplineN));
    return m(hi) - m(lo);
  };
  return {
    warmKindness: diff('warm', 'kindness'),
    warmGrades: diff('warm', 'grades'),
    strictDiscipline: diff('strict', 'discipline'),
    strictGrades: diff('strict', 'grades'),
    involvedGrades: diff('involved', 'grades'),
    involvedKindness: diff('involved', 'kindness'),
  };
}

export function formatFamily(report: FamilyReport, content: ContentBundle): string[] {
  const r = report;
  const lines: string[] = [];
  const child = r.children;
  lines.push(`Children and parenting (E2a): ${r.lives} lives; ${r.livesWithOwn} had a child of their own (${(r.lives > 0 ? r.ownChildren / r.lives : 0).toFixed(2)} children a life, ${(r.livesWithOwn > 0 ? r.ownChildren / r.livesWithOwn : 0).toFixed(2)} for those who had any)`);
  lines.push(`  children: ${child.birth} born, ${child.adopted} adopted, ${child.ivf} through IVF, ${child.surrogacy} through surrogacy, ${child.step} stepchildren`);
  lines.push(`  parents (born, adopted or step) among the ${r.reached50} lives that reached 50: ${r.parentsAt50} (${pct(r.parentsAt50, r.reached50)})`);
  const p = r.pregnancies;
  lines.push(`  pregnancies: ${p.began} began (${p.unplanned} unplanned): ${p.born} births, ${p.miscarried} miscarriages (${pct(p.miscarried, p.born + p.miscarried + p.placed)} of pregnancies that ended that way), ${p.placed} placed for adoption, ${p.ended} ended`);
  for (const k of ['adoption', 'ivf', 'surrogacy'] as const) {
    const x = r.processes[k];
    lines.push(`  ${k}: ${x.started} started, ${x.worked} worked${k === 'adoption' ? ' (a child came to you)' : ' (a pregnancy began)'}; ${x.lives} of the ${r.reached50} lives reaching 50 (${pct(x.lives, r.reached50)})`);
  }
  const total = child.birth + child.adopted + child.ivf + child.surrogacy + child.step;
  lines.push(`  children who died before their parent: ${r.deaths.children} of ${total} (${pct(r.deaths.children, total)}): ${Object.entries(r.deaths.byStage).map(([s, n]) => `${s} ${n}`).join(', ')}`);
  lines.push(`  grief chains: ${r.miscarriageGrief} of ${r.miscarriageLives} lives with a miscarriage reached a grief event; ${r.lossGrief} of ${r.lossLives} lives that lost a child`);
  const c = r.custody;
  lines.push(`  custody: ${c.hearings} hearings; children with you ${c.full}, shared ${c.shared}, with the other parent ${c.other}; ${c.supportPaid} lives paid child support, ${c.supportReceived} received it`);
  lines.push(`  child costs: ${r.costs.years > 0 ? `${dollars(r.costs.total / r.costs.years)} a year in ${r.costs.years} years with minors at home, ${pct(r.costs.total, r.costs.income)} of income` : 'none'}`);
  const s = styleEffects(r);
  const t = content.balance.targets.family.styleEffect;
  lines.push(
    `  parenting style (children raised high vs low): kindness at 18, warm minus cold ${s.warmKindness.toFixed(1)} (need ${t.personality}); discipline at 18, strict minus relaxed ${s.strictDiscipline.toFixed(1)} (need ${t.personality}); grades at 16–17, involved minus absent ${s.involvedGrades.toFixed(2)} (need ${t.grades}); other effects: warm grades ${s.warmGrades.toFixed(2)}, strict grades ${s.strictGrades.toFixed(2)}, involved kindness ${s.involvedKindness.toFixed(1)}`,
  );
  lines.push(
    `  starting smarts against both parents' mean: correlation ${inheritanceCorrelation(r.inheritance).toFixed(2)} over ${r.inheritance.n} children; ${pct(r.inheritance.outside, r.inheritance.n)} outside the parents' range by more than 2 spreads`,
  );
  return lines;
}

const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export interface FamilyTarget {
  label: string;
  value: string;
  goal: string;
  met: boolean;
}

/** E2a: judged on the careful player. */
export function familyTargets(report: FamilyReport, content: ContentBundle): FamilyTarget[] {
  const t = content.balance.targets.family;
  const r = report;
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const range = (x: { min: number; max: number }) => `${pct1(x.min)}–${pct1(x.max)}`;
  const inRange = (v: number, x: { min: number; max: number }) => v >= x.min && v <= x.max;
  const reached = (n: number) => (r.reached50 > 0 ? n / r.reached50 : 0);
  const pregnancies = r.pregnancies.born + r.pregnancies.miscarried + r.pregnancies.placed;
  const children = r.children.birth + r.children.adopted + r.children.ivf + r.children.surrogacy + r.children.step;
  const s = styleEffects(r);
  const corr = inheritanceCorrelation(r.inheritance);
  const outside = r.inheritance.n > 0 ? r.inheritance.outside / r.inheritance.n : 0;
  const row = (label: string, v: number, x: { min: number; max: number }): FamilyTarget => ({ label, value: pct1(v), goal: range(x), met: inRange(v, x) });
  return [
    row('lives reaching 50 with a child', reached(r.parentsAt50), t.parents),
    row('lives reaching 50 that started an adoption', reached(r.processes.adoption.lives), t.adoption),
    row('lives reaching 50 that started IVF', reached(r.processes.ivf.lives), t.ivf),
    row('lives reaching 50 that started surrogacy', reached(r.processes.surrogacy.lives), t.surrogacy),
    row('pregnancies that end in miscarriage', pregnancies > 0 ? r.pregnancies.miscarried / pregnancies : 0, t.miscarriage),
    row('children who die before their parent', children > 0 ? r.deaths.children / children : 0, t.childDeath),
    { label: 'miscarriages and losses that reach their grief chain', value: `${r.miscarriageGrief + r.lossGrief} of ${r.miscarriageLives + r.lossLives}`, goal: 'all', met: r.miscarriageGrief + r.lossGrief === r.miscarriageLives + r.lossLives },
    { label: 'kindness at 18, raised warm vs cold', value: s.warmKindness.toFixed(1), goal: `at least ${t.styleEffect.personality}`, met: s.warmKindness >= t.styleEffect.personality },
    { label: 'discipline at 18, raised strict vs relaxed', value: s.strictDiscipline.toFixed(1), goal: `at least ${t.styleEffect.personality}`, met: s.strictDiscipline >= t.styleEffect.personality },
    { label: 'grades at 16–17, raised involved vs absent', value: s.involvedGrades.toFixed(2), goal: `at least ${t.styleEffect.grades}`, met: s.involvedGrades >= t.styleEffect.grades },
    { label: 'starting smarts correlate with the parents’ mean', value: corr.toFixed(2), goal: `at least ${t.inheritance}`, met: corr >= t.inheritance },
    { label: 'children starting outside their parents’ range', value: pct1(outside), goal: `under ${pct1(t.maxOutsideParents)}`, met: outside < t.maxOutsideParents },
  ];
}
