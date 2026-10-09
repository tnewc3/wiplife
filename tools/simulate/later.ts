/**
 * Later life, simulated (L1): the player model's grandparenting, how it
 * answers a need for care, a warning of a death coming and a chance to make
 * amends, and what the run measures about them: how many lives have
 * grandchildren and what they do with them, who needs care and who provides
 * it, how many deaths are foreseen and what is chosen (hospice, the service,
 * visitors, letters, a speaker, an updated will), the amends chances history
 * calls for and what comes of them, and the life review of regrets and proud
 * moments. It also checks, life by life, what must always hold: every
 * review line is true of the life, every amends chance has history behind it,
 * family care is given by someone who could give it, and the final wishes
 * reach the funeral. Like the other player models, these chances describe the
 * simulated player, not the game, so they live here and not in the balance
 * files.
 */
import type { ContentBundle } from '../../src/content/schemas';
import { AMENDS_RESULTS, CARE_OPTIONS, HOSPICE_CHOICES, SERVICE_STYLES } from '../../src/content/schemas';
import type { LifeActionId, LifeActionParams } from '../../src/engine/actions';
import { availableInteractions } from '../../src/engine/interactions/availability';
import { amendsCandidates } from '../../src/engine/later/amends';
import { careProviders } from '../../src/engine/later/care';
import { grandchildren, raisedGrandchildren, willOutOfDate } from '../../src/engine/later/query';
import { reviewOptions } from '../../src/engine/later/review';
import { canSpeak, hospiceCost } from '../../src/engine/later/terminal';
import { willCandidates } from '../../src/engine/estate/will';
import { askedSpeaker, writeFuneral } from '../../src/engine/eulogy';
import { chance, type RngState } from '../../src/engine/rng';
import { weightedPick } from '../../src/engine/random';
import { writeReview } from '../../src/engine/later/review';
import type { Id, LifeState, WillShare } from '../../src/engine/types';
import type { InteractionPlan } from './interactions';
import type { SimulationReport, TargetResult } from './run';

/** What a simulated player does in later life, fixed for the life. */
export interface LaterProfile {
  /** Sets their final wishes when told a death is coming. */
  setsWishes: boolean;
  /** Updates the will when told it is out of date. */
  updatesWill: boolean;
  /** How they would rather be looked after. */
  carePreference: 'family' | 'paid' | 'assisted';
  /** How hands-on a grandparent they are: grandchildren interactions a year per grandchild. */
  grandparenting: number;
  /** Plays favorites now and then. */
  favorites: boolean;
}

export function rollLaterProfile(rng: RngState): LaterProfile {
  return {
    setsWishes: chance(rng, 0.8),
    updatesWill: chance(rng, 0.7),
    carePreference: weightedPick(rng, [['family', 5], ['paid', 3], ['assisted', 2]] as const),
    grandparenting: weightedPick(rng, [[0, 1], [1, 3], [2, 3]] as const),
    favorites: chance(rng, 0.1),
  };
}

const byId = (a: Id, b: Id) => a.localeCompare(b, 'en', { numeric: true });

/** The will after the update: the spouse, then the children and grandchildren, in shares that add up to 100. */
function updatedWill(life: LifeState, content: ContentBundle): WillShare[] | null {
  const family = willCandidates(life, content).filter((c) => c.kind === 'person' && ['spouse', 'child', 'stepchild', 'grandchild'].includes(c.relation));
  const room = content.balance.family.estate.maxShares;
  const spouse = family.find((c) => c.relation === 'spouse');
  const kids = family.filter((c) => c.relation !== 'spouse').slice(0, spouse ? room - 1 : room);
  const named = [...(spouse ? [spouse] : []), ...kids];
  if (named.length === 0) return null;
  const spouseShare = spouse ? (kids.length > 0 ? 40 : 100) : 0;
  const each = kids.length > 0 ? Math.floor((100 - spouseShare) / kids.length) : 0;
  const shares: WillShare[] = named.map((c, i) => ({ kind: 'person' as const, id: c.id, percent: i === 0 && spouse ? spouseShare : each }));
  shares[shares.length - 1]!.percent += 100 - shares.reduce((sum, s) => sum + s.percent, 0);
  return shares.every((s) => s.percent >= 1) ? shares : null;
}

/** What the simulated player does about care, a warning of a death and the will this year. */
export function chooseLaterActions(life: LifeState, content: ContentBundle, rng: RngState, profile: LaterProfile): [LifeActionId, LifeActionParams][] {
  const out: [LifeActionId, LifeActionParams][] = [];
  const t = life.later.terminal;
  const b = content.balance.later.terminal;
  if (t !== null && t.wishesYear === undefined && profile.setsWishes) {
    const people = Object.keys(life.relationships)
      .sort(byId)
      .filter((id) => life.relationships[id]!.status !== 'ended' && life.people[id]?.alive);
    const closeness = (id: Id) => life.relationships[id]!.affection + life.relationships[id]!.trust;
    const closest = [...people].sort((x, y) => closeness(y) - closeness(x) || byId(x, y));
    const speaker = closest.find((id) => canSpeak(life, id, content) && life.relationships[id]!.status === 'active');
    const estranged = people.filter((id) => life.relationships[id]!.status === 'estranged' && life.relationships[id]!.affection >= 20);
    const visitors = [...new Set([...closest.filter((id) => life.relationships[id]!.status === 'active').slice(0, b.maxVisitors - 1), ...(estranged[0] !== undefined ? [estranged[0]] : [])])].slice(0, b.maxVisitors);
    const letters = [...new Set([...estranged.slice(0, 1), ...closest.slice(0, 2)])].slice(0, b.maxLetters);
    out.push([
      'set_final_wishes',
      {
        wishes: {
          hospice: weightedPick(rng, [['hospice', 4], ['home', 4], ['hospital', 2]] as const),
          service: weightedPick(rng, [['traditional', 4], ['simple', 3], ['celebration', 2], ['private', 1]] as const),
          speakerId: speaker ?? null,
          letters,
          visitors,
        },
      },
    ]);
  }
  if ((t !== null || life.character.age >= 70) && profile.updatesWill && willOutOfDate(life)) {
    const shares = updatedWill(life, content);
    if (shares) out.push(['write_will', { shares }]);
  }
  const care = life.later.care;
  if (care !== null && care.option === null && chance(rng, 0.5)) {
    const providers = careProviders(life, content);
    if (profile.carePreference === 'family' && providers.length > 0) out.push(['choose_care', { careOption: 'family', carerId: providers[0]!.id }]);
    else if (profile.carePreference === 'assisted') out.push(['choose_care', { careOption: 'assisted' }]);
    else out.push(['choose_care', { careOption: 'paid' }]);
  }
  return out;
}

/** The grandchildren interactions the simulated player does this year. */
export function chooseGrandparentPlans(life: LifeState, content: ContentBundle, rng: RngState, profile: LaterProfile): InteractionPlan[] {
  const plans: InteractionPlan[] = [];
  if (profile.grandparenting === 0) return plans;
  for (const kid of grandchildren(life)) {
    const available = availableInteractions(life, kid.id, content);
    if (available.length === 0) continue;
    const ids = new Set(available.map((d) => d.id));
    for (let i = 0; i < profile.grandparenting; i++) {
      const options = [
        ['babysit', 3],
        ['spoil_them', 2],
        ['teach_them', 2],
        ['tell_stories', 2],
        ['make_favorite', profile.favorites ? 3 : 0],
        ['spend_time', 2],
        ['chat', 1],
        ['hug', 1],
      ] as const;
      const fitting = options.filter(([id, weight]) => ids.has(id) && weight > 0);
      if (fitting.length === 0) break;
      const id = weightedPick(rng, fitting);
      plans.push({ interactionId: id, personId: kid.id, ...(content.interactions[id]?.gift ? { giftTier: 'small' as const } : {}) });
    }
  }
  return plans;
}

// ── The report ─────────────────────────────────────────────────────────────

export interface LaterReport {
  lives: number;
  /** Lives that reached 50, 65, 70 and 80. */
  reached: { 50: number; 65: number; 70: number; 80: number };
  grand: {
    /** Lives with at least one grandchild, and all the grandchildren in all. */
    livesWith: number;
    total: number;
    /** Lives with a grandchild among those that reached 65. */
    livesWithAt65: number;
    /** Your age when the first grandchild was born, summed over lives, for the mean. */
    firstAgeSum: number;
    /** Interactions with grandchildren, by interaction. */
    interactions: Record<string, number>;
    /** Adult grandchildren who were still in your life at your death, and the average affection of all grandchildren then. */
    closeAtDeath: number;
    withAtDeath: number;
    favoritesNoticed: number;
    /** Raising: asked (a parent who could not, or had died), taken in, handed back, and lives that raised one. */
    asked: { parentCannot: number; parentGone: number; parentBack: number };
    raised: number;
    returned: number;
    livesRaised: number;
    /** Raised grandchildren who went on to be an heir. */
    grandHeirs: number;
  };
  care: {
    /** Lives that needed care, and their age when it began (summed). */
    needed: number;
    ageSum: number;
    neededAt70: number;
    /** The event that asked: a relative offered, nobody could, an estranged relative came back. */
    asked: { offer: number; alone: number; returns: number };
    /** What was arranged, counted when it was (a life can change its mind), by option. */
    arranged: Record<string, number>;
    /** Family care by what the relative was to you. */
    providers: Record<string, number>;
    /** Estranged relatives who came back, and relatives who said no or gave out (their ids go on the care's declined list). */
    returned: number;
    stayedAway: number;
    /** Family care that ended (the relative gave out, died or was no longer able). */
    providerGone: number;
    /** Care nobody arranged for years, until the family or paid care stepped in. */
    defaulted: number;
    /** Lives that spent their last year in each kind of care. */
    atDeath: Record<string, number>;
    /** Years of care by kind. */
    years: Record<string, number>;
    paidSpent: number;
    assistedMoves: number;
  };
  terminal: {
    /** Lives that were warned, and lives that died with a warning. */
    warned: number;
    foreseenDeaths: number;
    /** Deaths at 50 or later (the denominator for foreseen). */
    diedAt50: number;
    byWhy: Record<string, number>;
    /** Years between the warning and the death, summed. */
    yearsSum: number;
    wishesSet: number;
    hospice: Record<string, number>;
    service: Record<string, number>;
    speakerAsked: number;
    speakerSpoke: number;
    visitorsInvited: number;
    visitorsCame: number;
    lettersWritten: number;
    lettersReconciled: number;
    willPrompted: number;
    willUpdated: number;
    /** Funerals of foreseen deaths where someone you asked for stayed away. */
    declinedListed: number;
    hospiceSpent: number;
  };
  amends: {
    livesOffered: number;
    chances: number;
    /** By source: offered, then the result. */
    bySource: Record<string, { offered: number; made: number; declined: number; refused: number }>;
    byResult: Record<string, number>;
    madeEstrangedReconciled: number;
  };
  review: {
    lives: number;
    withAny: number;
    regrets: number;
    proud: number;
    /** Template ids used, to see how much of the content shows. */
    used: Record<string, number>;
    templates: number;
  };
  /** What must always hold; each must be zero. */
  violations: { reviewProof: number; amendsHistory: number; careProvider: number; askedSpeaker: number; visitorsFuneral: number; hospiceLedger: number; grandchildLink: number };
  messages: string[];
}

export function emptyLaterReport(content: ContentBundle): LaterReport {
  const t = content.text.review;
  return {
    lives: 0,
    reached: { 50: 0, 65: 0, 70: 0, 80: 0 },
    grand: {
      livesWith: 0,
      total: 0,
      livesWithAt65: 0,
      firstAgeSum: 0,
      interactions: {},
      closeAtDeath: 0,
      withAtDeath: 0,
      favoritesNoticed: 0,
      asked: { parentCannot: 0, parentGone: 0, parentBack: 0 },
      raised: 0,
      returned: 0,
      livesRaised: 0,
      grandHeirs: 0,
    },
    care: {
      needed: 0,
      ageSum: 0,
      neededAt70: 0,
      asked: { offer: 0, alone: 0, returns: 0 },
      arranged: Object.fromEntries(CARE_OPTIONS.map((o) => [o, 0])),
      providers: {},
      returned: 0,
      stayedAway: 0,
      providerGone: 0,
      defaulted: 0,
      atDeath: { ...Object.fromEntries(CARE_OPTIONS.map((o) => [o, 0])), none: 0 },
      years: Object.fromEntries(CARE_OPTIONS.map((o) => [o, 0])),
      paidSpent: 0,
      assistedMoves: 0,
    },
    terminal: {
      warned: 0,
      foreseenDeaths: 0,
      diedAt50: 0,
      byWhy: {},
      yearsSum: 0,
      wishesSet: 0,
      hospice: { ...Object.fromEntries(HOSPICE_CHOICES.map((h) => [h, 0])), none: 0 },
      service: { ...Object.fromEntries(SERVICE_STYLES.map((s) => [s, 0])), none: 0 },
      speakerAsked: 0,
      speakerSpoke: 0,
      visitorsInvited: 0,
      visitorsCame: 0,
      lettersWritten: 0,
      lettersReconciled: 0,
      willPrompted: 0,
      willUpdated: 0,
      declinedListed: 0,
      hospiceSpent: 0,
    },
    amends: {
      livesOffered: 0,
      chances: 0,
      bySource: Object.fromEntries(Object.keys(content.registries.later.amends.sources).sort().map((s) => [s, { offered: 0, made: 0, declined: 0, refused: 0 }])),
      byResult: Object.fromEntries(AMENDS_RESULTS.map((r) => [r, 0])),
      madeEstrangedReconciled: 0,
    },
    review: { lives: 0, withAny: 0, regrets: 0, proud: 0, used: {}, templates: t.regrets.length + t.proud.length },
    violations: { reviewProof: 0, amendsHistory: 0, careProvider: 0, askedSpeaker: 0, visitorsFuneral: 0, hospiceLedger: 0, grandchildLink: 0 },
    messages: [],
  };
}

/** Watches one run's lives for the later-life report. */
export class LaterWatcher {
  /** Event id -> the amends source it answers. */
  private readonly sourceOf = new Map<string, string>();
  private firstGrandAge: number | null = null;
  private prevRaised = 0;

  constructor(
    private readonly report: LaterReport,
    private readonly content: ContentBundle,
  ) {
    for (const [source, def] of Object.entries(content.registries.later.amends.sources)) for (const id of def.events) this.sourceOf.set(id, source);
  }

  private fail(kind: keyof LaterReport['violations'], life: LifeState, message: string): void {
    this.report.violations[kind]++;
    if (this.report.messages.length < 8) this.report.messages.push(`${life.seed}: ${message}`);
  }

  /** A grandchildren interaction the player does. */
  interacted(plan: InteractionPlan, life: LifeState): void {
    if (life.relationships[plan.personId]?.kind !== 'grandchild') return;
    const g = this.report.grand.interactions;
    g[plan.interactionId] = (g[plan.interactionId] ?? 0) + 1;
  }

  /** What care looked like at the last look, to count the changes events and actions make between years. */
  private seen: LifeState['later']['care'] = null;

  /** A change in how care is provided: counted once, whether an event, an action or the year's step made it. */
  private careChanged(from: LifeState['later']['care'], to: LifeState['later']['care'], at: LifeState): void {
    const r = this.report;
    if (!to || !from || to.option === from.option) return;
    if (to.option !== null) {
      r.care.arranged[to.option]!++;
      if (to.option === 'family' && to.providerId !== undefined) {
        const kind = at.relationships[to.providerId]?.kind ?? 'unknown';
        r.care.providers[kind] = (r.care.providers[kind] ?? 0) + 1;
        if (at.relationships[to.providerId]?.memories.some((m) => m.tag === 'made_peace' && m.year === at.currentYear)) r.care.returned++;
      }
      if (to.option === 'assisted') r.care.assistedMoves++;
      if (from.option === null && at.currentYear - from.since >= this.content.balance.later.care.defaultAfterYears) r.care.defaulted++;
    } else if (from.option === 'family') r.care.providerGone++;
  }

  /** One year of the life: `before` is how it stood as the year began, `after` once the year's steps have run. */
  observe(before: LifeState, after: LifeState): void {
    const r = this.report;
    const reg = this.content.registries.later;
    // What the last year's events and the player's actions did to how care is provided.
    this.careChanged(this.seen, before.later.care, before);
    // Grandchildren born.
    const was = new Set(grandchildren(before).map((p) => p.id));
    const now = grandchildren(after);
    for (const kid of now) {
      if (was.has(kid.id)) continue;
      r.grand.total++;
      if (this.firstGrandAge === null) {
        this.firstGrandAge = after.character.age;
        r.grand.livesWith++;
        r.grand.firstAgeSum += after.character.age;
      }
    }
    const raised = raisedGrandchildren(after).length;
    if (raised > this.prevRaised) {
      r.grand.raised += raised - this.prevRaised;
      if (this.prevRaised === 0) r.grand.livesRaised++;
    } else if (raised < this.prevRaised && !raisedGrandchildren(after).every((p) => p.alive)) {
      // (A raised grandchild who died is not handed back.)
    } else if (raised < this.prevRaised) r.grand.returned += this.prevRaised - raised;
    this.prevRaised = raised;
    // Care.
    const bc = before.later.care;
    const ac = after.later.care;
    if (ac && !bc) {
      r.care.needed++;
      r.care.ageSum += after.character.age;
      if (after.character.age >= 70) r.care.neededAt70++;
    }
    this.careChanged(bc, ac, after);
    this.seen = ac ? { ...ac } : null;
    if (ac?.option) r.care.years[ac.option]!++;
    // Where the last months were spent is charged: the ledger for this year includes it, from the hospice you had chosen when the year began.
    if (before.later.terminal?.hospice && after.finances.lastLedger?.year === after.currentYear && after.housing.kind !== 'incarcerated') {
      if (after.finances.lastLedger.care < hospiceCost(before, this.content)) this.fail('hospiceLedger', after, 'the ledger did not charge where the last months were spent');
    }
    if (ac) r.care.paidSpent += (after.finances.lastLedger?.care ?? 0) > 0 && ac.option === 'paid' ? (after.finances.lastLedger?.care ?? 0) : 0;
    if (after.later.terminal) r.terminal.hospiceSpent += hospiceCost(after, this.content);
    // The family step: a hold on the provider's rules, every year.
    if (ac?.option === 'family' && ac.providerId !== undefined) {
      const p = after.people[ac.providerId];
      const rel = after.relationships[ac.providerId];
      if (!p?.alive || !rel || rel.status !== 'active' || !this.content.balance.later.care.family.kinds.includes(rel.kind)) {
        this.fail('careProvider', after, `family care provided by ${ac.providerId} (${rel?.kind ?? 'unrelated'}, ${rel?.status ?? 'gone'}, alive ${String(p?.alive)})`);
      }
    }
    // What the year asks.
    for (const p of after.pending) {
      const id = p.eventId;
      if (reg.grandchildren.parentCannot.includes(id)) r.grand.asked.parentCannot++;
      else if (reg.grandchildren.parentGone.includes(id)) r.grand.asked.parentGone++;
      else if (reg.grandchildren.parentBack.includes(id)) r.grand.asked.parentBack++;
      else if (reg.grandchildren.favorite.includes(id)) r.grand.favoritesNoticed++;
      else if (reg.care.offer.includes(id)) r.care.asked.offer++;
      else if (reg.care.alone.includes(id)) r.care.asked.alone++;
      else if (reg.care.returns.includes(id)) r.care.asked.returns++;
      const source = this.sourceOf.get(id);
      if (source !== undefined) {
        r.amends.chances++;
        r.amends.bySource[source]!.offered++;
        this.checkAmends(after, source, p.cast.npc);
      }
    }
  }

  /** Every amends chance has history behind it: a source that fits the person (or the goal) as the year began. */
  private checkAmends(life: LifeState, source: string, npc: Id | undefined): void {
    const ok = amendsCandidates(life, this.content).some((c) => c.source === source && c.personId === npc);
    if (!ok) this.fail('amendsHistory', life, `an amends chance from "${source}" for ${npc ?? 'no one'} with nothing in the history to call for it`);
  }

  /** The life that has just ended. */
  finish(life: LifeState): void {
    const r = this.report;
    const age = life.character.age;
    r.lives++;
    for (const a of [50, 65, 70, 80] as const) if (age >= a) r.reached[a]++;
    if (age >= 65 && this.firstGrandAge !== null) r.grand.livesWithAt65++;
    const kids = grandchildren(life);
    if (kids.length > 0) {
      r.grand.withAtDeath++;
      for (const kid of kids) {
        const rel = life.relationships[kid.id]!;
        if (rel.status === 'active' && rel.affection >= 60) r.grand.closeAtDeath++;
      }
    }
    if (raisedGrandchildren(life).length > 0) r.grand.grandHeirs += raisedGrandchildren(life).filter((p) => p.alive).length;
    for (const person of Object.values(life.people)) {
      if (!person.grandchild) continue;
      const rel = life.relationships[person.id];
      if (!rel || (rel.kind !== 'grandchild' && rel.kind !== 'child')) this.fail('grandchildLink', life, `${person.id} is a grandchild but is "${rel?.kind ?? 'unrelated'}"`);
    }
    // Care.
    const care = life.later.care;
    if (care) {
      r.care.atDeath[care.option ?? 'none']!++;
      r.care.stayedAway += care.declined.length;
    }
    // Warning.
    if (age >= 50) r.terminal.diedAt50++;
    const t = life.later.terminal;
    if (t) {
      r.terminal.warned++;
      r.terminal.foreseenDeaths++;
      r.terminal.yearsSum += life.currentYear - t.since;
      const why = t.conditionId ?? 'decline';
      r.terminal.byWhy[why] = (r.terminal.byWhy[why] ?? 0) + 1;
      r.terminal.hospice[t.hospice ?? 'none']!++;
      r.terminal.service[t.service ?? 'none']!++;
      if (t.wishesYear !== undefined) r.terminal.wishesSet++;
      if (t.speakerId !== undefined) r.terminal.speakerAsked++;
      r.terminal.visitorsInvited += t.visits.length;
      r.terminal.visitorsCame += t.visits.filter((v) => v.came).length;
      r.terminal.lettersWritten += t.letters.length;
      r.terminal.lettersReconciled += t.letters.filter((id) => life.relationships[id]?.memories.some((m) => m.tag === 'made_peace' && m.year >= (t.wishesYear ?? 0))).length;
      if (t.willPrompted) r.terminal.willPrompted++;
      if (t.willPrompted && !willOutOfDate(life)) r.terminal.willUpdated++;
      this.checkFuneral(life);
    }
    // Amends.
    const records = life.later.amends;
    if (records.length > 0) r.amends.livesOffered++;
    for (const a of records) {
      r.amends.byResult[a.result]!++;
      const row = r.amends.bySource[a.source];
      if (row) row[a.result]++;
      if (a.result === 'made' && a.personId !== undefined && life.relationships[a.personId]?.memories.some((m) => m.tag === 'made_peace')) r.amends.madeEstrangedReconciled++;
    }
    // The review.
    r.review.lives++;
    const review = writeReview(life, this.content);
    if (review) {
      if (review.regrets.length + review.proud.length > 0) r.review.withAny++;
      r.review.regrets += review.regrets.length;
      r.review.proud += review.proud.length;
      const options = new Set([...reviewOptions(life, this.content.text.review.regrets, this.content), ...reviewOptions(life, this.content.text.review.proud, this.content)].map((o) => o.template.id));
      for (const line of [...review.regrets, ...review.proud]) {
        r.review.used[line.id] = (r.review.used[line.id] ?? 0) + 1;
        if (!options.has(line.id)) this.fail('reviewProof', life, `review line "${line.id}" is not true of this life`);
      }
    }
  }

  /** The final wishes reach the funeral. */
  private checkFuneral(life: LifeState): void {
    const t = life.later.terminal!;
    const funeral = writeFuneral(life, this.content);
    if (!funeral) return;
    if (!funeral.lastDays) {
      this.fail('visitorsFuneral', life, 'a foreseen death with no account of the last days');
      return;
    }
    const asked = askedSpeaker(life, this.content);
    if (asked) {
      this.report.terminal.speakerSpoke++;
      const name = `${life.people[asked.personId]!.name.first} ${life.people[asked.personId]!.name.last}`;
      if (funeral.eulogy?.speakerName !== name) this.fail('askedSpeaker', life, `${name} was asked to speak and able to, but ${funeral.eulogy?.speakerName ?? 'no one'} did`);
    }
    const came = t.visits.filter((v) => v.came).map((v) => `${life.people[v.id]!.name.first} ${life.people[v.id]!.name.last}`);
    const listed = new Set(funeral.lastDays.bedside.map((g) => g.name));
    for (const name of came) if (!listed.has(name)) this.fail('visitorsFuneral', life, `${name} came to the bedside but is not in the account of the last days`);
    const away = new Set(funeral.notAttending.map((g) => g.name));
    for (const v of t.visits.filter((x) => !x.came)) {
      const name = `${life.people[v.id]!.name.first} ${life.people[v.id]!.name.last}`;
      const p = life.people[v.id]!;
      if (p.alive && away.has(name)) this.report.terminal.declinedListed++;
    }
  }
}

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const mean = (sum: number, n: number) => (n > 0 ? (sum / n).toFixed(1) : 'n/a');

export function formatLater(r: LaterReport, content: ContentBundle): string[] {
  const lines: string[] = ['', 'Later life (L1):'];
  const g = r.grand;
  lines.push(`  ${r.lives} lives; reached 50: ${r.reached[50]}, 65: ${r.reached[65]}, 70: ${r.reached[70]}, 80: ${r.reached[80]}`);
  lines.push(`  grandparenting: ${pct(g.livesWith, r.lives)} of lives had a grandchild (${pct(g.livesWithAt65, r.reached[65])} of those who reached 65), ${(g.total / Math.max(1, g.livesWith)).toFixed(1)} each on average; first grandchild at age ${mean(g.firstAgeSum, g.livesWith)}`);
  const totalIx = Object.values(g.interactions).reduce((a, b) => a + b, 0);
  lines.push(`    ${totalIx} grandparent interactions: ${Object.entries(g.interactions).sort().map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  lines.push(`    at death: ${g.withAtDeath} lives with living grandchildren, ${g.closeAtDeath} of them close (60+ affection)`);
  lines.push(`    favorites noticed ${g.favoritesNoticed}`);
  lines.push(`    raising: asked because a parent could not ${g.asked.parentCannot}, because a parent died ${g.asked.parentGone}, a parent asking for them back ${g.asked.parentBack}; took in ${g.raised} (${g.livesRaised} lives), handed back ${g.returned}; raised grandchildren alive at the end ${g.grandHeirs}`);
  const c = r.care;
  lines.push(`  care: ${pct(c.needed, r.reached[70])} of lives that reached 70 needed it (${c.needed} lives, at ${mean(c.ageSum, c.needed)} on average)`);
  lines.push(`    asked: a relative offered ${c.asked.offer}, nobody could ${c.asked.alone}, an estranged relative came back ${c.asked.returns}`);
  lines.push(`    arranged: ${CARE_OPTIONS.map((o) => `${o} ${c.arranged[o]}`).join(', ')}; family care by ${Object.entries(c.providers).sort().map(([k, v]) => `${k} ${v}`).join(', ') || 'no one'}`);
  lines.push(`    estranged who came back ${c.returned}; relatives who said no or gave out ${c.stayedAway}; family care ended ${c.providerGone}; unarranged until the family or paid care stepped in ${c.defaulted}`);
  lines.push(`    at death: ${Object.entries(c.atDeath).map(([k, v]) => `${k} ${v}`).join(', ')}; years of care ${CARE_OPTIONS.map((o) => `${o} ${c.years[o]}`).join(', ')}; assisted moves ${c.assistedMoves}`);
  const t = r.terminal;
  lines.push(`  foreseen deaths: ${pct(t.foreseenDeaths, t.diedAt50)} of deaths at 50 or later (${t.foreseenDeaths}), known ${mean(t.yearsSum, t.foreseenDeaths)} years ahead on average`);
  lines.push(`    why: ${Object.entries(t.byWhy).sort().map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  lines.push(`    final wishes set by ${pct(t.wishesSet, t.foreseenDeaths)}; where: ${Object.entries(t.hospice).map(([k, v]) => `${k} ${v}`).join(', ')}; service: ${Object.entries(t.service).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  lines.push(`    asked to speak ${t.speakerAsked}; visitors invited ${t.visitorsInvited}, came ${t.visitorsCame} (${pct(t.visitorsCame, t.visitorsInvited)}); letters ${t.lettersWritten}; will prompted ${t.willPrompted}, up to date at death ${t.willUpdated}; invited but listed as staying away ${t.declinedListed}; spent on hospice ${dollars(t.hospiceSpent)}`);
  const a = r.amends;
  lines.push(`  amends: ${a.chances} chances in ${a.livesOffered} lives (${pct(a.livesOffered, r.reached[50])} of those who reached 50); ${AMENDS_RESULTS.map((x) => `${x} ${a.byResult[x]}`).join(', ')}; ended an estrangement ${a.madeEstrangedReconciled}`);
  for (const [source, row] of Object.entries(a.bySource)) lines.push(`    ${source.padEnd(18)} offered ${String(row.offered).padStart(5)}  made ${String(row.made).padStart(5)}  declined ${String(row.declined).padStart(5)}  refused ${String(row.refused).padStart(5)}`);
  const v = r.review;
  const used = Object.keys(v.used).length;
  lines.push(`  life review: ${pct(v.withAny, v.lives)} of lives had at least one line; ${(v.regrets / Math.max(1, v.lives)).toFixed(2)} regrets and ${(v.proud / Math.max(1, v.lives)).toFixed(2)} proud moments each; ${used} of ${v.templates} templates used`);
  const never = [...content.text.review.regrets, ...content.text.review.proud].map((x) => x.id).filter((id) => !v.used[id]);
  if (never.length > 0) lines.push(`    never used (${never.length}): ${never.slice(0, 30).join(', ')}${never.length > 30 ? ', ...' : ''}`);
  const x = r.violations;
  lines.push(`  must be zero: a review line not true of the life ${x.reviewProof}, amends with no history ${x.amendsHistory}, family care by someone who could not ${x.careProvider}, an asked speaker who did not speak ${x.askedSpeaker}, wishes missing from the funeral ${x.visitorsFuneral}, hospice not in the ledger ${x.hospiceLedger}, grandchild link broken ${x.grandchildLink}`);
  for (const m of r.messages) lines.push(`    ${m}`);
  return lines;
}

/** The L1 targets (balance/targets.yaml), on a report. */
export function laterTargets(sim: SimulationReport, content: ContentBundle): TargetResult[] {
  const r = sim.later;
  const t = content.balance.targets.later;
  const out: TargetResult[] = [];
  const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const num = (x: number) => x.toFixed(1);
  const range = (rng: { min: number; max: number }, f: (x: number) => string) => `${f(rng.min)}–${f(rng.max)}`;
  const add = (label: string, value: number, rng: { min: number; max: number }, f: (x: number) => string) =>
    out.push({ label, value: Number.isNaN(value) ? 'n/a' : f(value), short: Number.isNaN(value) ? 'n/a' : f(value), goal: range(rng, f), met: !Number.isNaN(value) && value >= rng.min && value <= rng.max });
  const share = (n: number, d: number) => (d > 0 ? n / d : Number.NaN);
  add('lives that reached 65 with a grandchild', share(r.grand.livesWithAt65, r.reached[65]), t.grandparentShare, pct1);
  add('care needed, of lives that reached 70', share(r.care.needed, r.reached[70]), t.careShare, pct1);
  add('deaths at 50 or later that were foreseen', share(r.terminal.foreseenDeaths, r.terminal.diedAt50), t.foreseenShare, pct1);
  add('foreseen deaths where final wishes were set', share(r.terminal.wishesSet, r.terminal.foreseenDeaths), t.wishesShare, pct1);
  add('lives of 50 or more offered a chance to make amends', share(r.amends.livesOffered, r.reached[50]), t.amendsShare, pct1);
  add('amends chances that ended well', share(r.amends.byResult.made!, r.amends.chances), t.amendsMadeShare, pct1);
  add('lives with a life review line', share(r.review.withAny, r.review.lives), t.reviewShare, pct1);
  add('review templates used at least once', share(Object.keys(r.review.used).length, r.review.templates), t.reviewVariety, pct1);
  add('family care among care arranged', share(r.care.arranged.family!, r.care.arranged.family! + r.care.arranged.paid! + r.care.arranged.assisted!), t.familyCareShare, pct1);
  add('years known before a foreseen death', share(r.terminal.yearsSum, r.terminal.foreseenDeaths), t.yearsKnown, num);
  const v = r.violations;
  const bad = v.reviewProof + v.amendsHistory + v.careProvider + v.askedSpeaker + v.visitorsFuneral + v.hospiceLedger + v.grandchildLink;
  out.push({ label: 'later-life rules broken (review proof, amends history, care provider, wishes at the funeral)', value: String(bad), short: String(bad), goal: '0', met: bad === 0 });
  return out;
}
