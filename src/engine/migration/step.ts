/**
 * The migration step of the year pipeline (W6), after school and language and before work and the ledger: decisions
 * on applications, permits that end, the year of someone without papers (stress, the risk of removal, wages kept
 * back, a chance at status), and the first years in a new country. Each situation that matters is queued as an event
 * from registries/immigration.yaml; the choices are the player's. Rates are in balance/immigration.yaml.
 */
import type { ContentBundle } from '../../content/schemas';
import { hasCredential } from '../education';
import { instanceOf } from '../belonging/query';
import { clampInt } from '../random';
import { chance } from '../rng';
import { countedRecord } from '../record';
import { applyStatEffects } from '../systems/economy';
import type { LifeState } from '../types';
import { becomeUndocumented, grantCitizenship, grantPermanent, grantRegularization, removeFromCountry } from './move';
import { queueEvent } from './queue';
import { bump, denialKey, refundHeld, testOdds } from './routes';
import { isCitizen, isUndocumented, livingCountry, relativesAbroad } from './query';

/** A member in good standing of a group that stands by newcomers. */
export function hasCommunitySupport(state: LifeState, content: ContentBundle): boolean {
  const u = content.balance.immigration.undocumented;
  return state.belonging.memberships.some((m) => {
    const g = instanceOf(state, m.groupId);
    return !!g && u.supportGroups.includes(g.defId) && m.standing >= u.deportation.communityStanding && g.cityId === state.character.cityId;
  });
}

/** The risk of being removed this year, before the roll: the country's base, years lived there, contact with police, a record, the attention you drew, and community. */
export function removalRisk(state: LifeState, content: ContentBundle): number {
  const b = content.balance.immigration;
  const d = b.undocumented.deportation;
  const rules = b.countries[livingCountry(state, content)];
  const years = state.currentYear - (state.migration.arrivedYear ?? state.currentYear);
  const base = rules.undocumented.deportation * Math.max(d.floor, 1 - d.yearsDecay * years) * (hasCommunitySupport(state, content) ? d.community : 1);
  const police = state.migration.year.policeContact ? d.policeContact : 0;
  const record = countedRecord(state, content).some((r) => r.outcome !== 'warning' && state.currentYear - r.year <= 5) ? d.record : 0;
  return Math.min(0.6, base + police + record + state.migration.exposure);
}

function decide(state: LifeState, content: ContentBundle): void {
  const m = state.migration;
  const app = m.application;
  const year = state.currentYear;
  if (!app || app.status !== 'pending' || app.decisionYear > year) return;
  app.decidedYear = year;
  const odds = app.kind === 'naturalization' ? testOdds(state, app.prepared === true, content) : app.odds;
  const ok = chance(state.rng, odds);
  const what = app.kind === 'entry' ? app.route! : app.kind === 'permanent' ? 'permanent' : app.kind === 'naturalization' ? 'citizenship' : app.basis!;
  app.status = ok ? 'approved' : 'denied';
  bump(state, `${ok ? 'approved' : 'denied'}:${app.kind}:${what}:${app.countryId}`);
  if (!ok) {
    m.denied[denialKey(app.kind, what, app.countryId)] = year;
    if (app.kind === 'entry') refundHeld(state, app);
    if (app.kind === 'naturalization') m.testFails++;
    if (app.kind === 'regularization') m.exposure += content.balance.immigration.undocumented.deportation.denied;
  } else if (app.kind === 'entry') {
    app.expiresYear = year + content.balance.immigration.approvedWindow;
  } else if (app.kind === 'permanent') grantPermanent(state, content);
  else if (app.kind === 'naturalization') grantCitizenship(state, content);
  else grantRegularization(state, content);
  queueEvent(state, ok ? content.registries.immigration.triggers.approved : content.registries.immigration.triggers.denied, content);
}

/** A study permit becomes a work permit with a degree; a permit that ends offers a choice, and a year later it is decided for you. */
function permits(state: LifeState, content: ContentBundle): void {
  const r = state.travel.residence;
  const year = state.currentYear;
  if (!r || !r.settled || (r.type !== 'student' && r.type !== 'temporary_worker')) return;
  const country = livingCountry(state, content);
  if (r.type === 'student' && state.education.current === null && state.education.admission === null && year > r.startYear) {
    if (hasCredential(state, ['bachelor', 'associate', 'grad'])) {
      state.travel.residence = { ...r, type: 'temporary_worker', route: 'study_work', startYear: year, endYear: year + content.balance.immigration.countries[country].study_work.graduateYears };
      bump(state, `graduatedToWork:${country}`);
      return;
    }
    r.endYear = Math.min(r.endYear, year);
  }
  const waiting = state.migration.application?.kind === 'permanent' && state.migration.application.status === 'pending';
  if (waiting || year < r.endYear) return;
  if (year === r.endYear) queueEvent(state, content.registries.immigration.triggers.visaEnding, content);
  else becomeUndocumented(state, content);
}

function undocumentedYear(state: LifeState, content: ContentBundle): void {
  const m = state.migration;
  const b = content.balance.immigration;
  const u = b.undocumented;
  const year = state.currentYear;
  applyStatEffects(state, { stress: { perYear: u.stress.perYear, limit: u.stress.limit }, happiness: { perYear: u.happiness, limit: 0 } });
  if (state.character.age >= content.balance.economy.gig.minAge && state.housing.kind !== 'incarcerated') state.career.gig = true;
  const risk = removalRisk(state, content);
  m.year.risk = risk;
  m.exposure = 0;
  if (chance(state.rng, risk)) {
    removeFromCountry(state, content);
    queueEvent(state, content.registries.immigration.triggers.deported, content);
    return;
  }
  if (chance(state.rng, u.closeCall.chance * (m.year.policeContact ? 2 : 1))) {
    m.year.closeCall = true;
    if (m.undocumented) m.undocumented.closeCalls++;
    bump(state, 'closeCalls');
    queueEvent(state, content.registries.immigration.yearly.closeCall, content);
  } else if (state.career.gig && chance(state.rng, u.exploitation)) {
    bump(state, 'exploitation');
    queueEvent(state, content.registries.immigration.yearly.exploitation, content);
  } else if (chance(state.rng, 0.3)) {
    queueEvent(state, content.registries.immigration.yearly.undocumented, content);
  }
  if ((m.ruleChangeUntil === null || m.ruleChangeUntil < year) && chance(state.rng, u.ruleChange.yearlyChance)) {
    m.ruleChangeUntil = year + u.ruleChange.window - 1;
    bump(state, 'ruleChanges');
    queueEvent(state, content.registries.immigration.triggers.ruleChange, content);
  }
}

function settledYear(state: LifeState, content: ContentBundle): void {
  const b = content.balance.immigration;
  const m = state.migration;
  const years = state.currentYear - (m.arrivedYear ?? state.currentYear);
  if (years <= b.settle.firstYears) applyStatEffects(state, { stress: { perYear: b.settle.yearly.stress, limit: 100 }, happiness: { perYear: b.settle.yearly.happiness, limit: 0 } });
  // The people left behind drift a little without visits; money sent home eases it.
  for (const id of relativesAbroad(state, content)) {
    const rel = state.relationships[id]!;
    rel.affection = clampInt(rel.affection - b.settle.ties + (m.remit.level === 'none' ? 0 : b.remit.affection), 0, 100);
  }
  if (chance(state.rng, b.settle.homesickChance)) queueEvent(state, content.registries.immigration.yearly.abroad, content);
  // A non-citizen sentenced to prison may be removed.
  const sentenced = state.legal.record.some((r) => r.outcome === 'jail' && r.year >= state.currentYear - 1);
  if (sentenced && state.migration.undocumented === null && chance(state.rng, b.undocumented.deportation.serious)) {
    removeFromCountry(state, content);
    queueEvent(state, content.registries.immigration.triggers.deported, content);
  }
}

/** Step 'migration'. */
export function runMigration(state: LifeState, content: ContentBundle): void {
  const m = state.migration;
  const year = state.currentYear;
  const police = state.legal.record.some((r) => !r.sealed && r.year >= year - 1);
  m.year = { year, risk: 0, closeCall: false, policeContact: police, stolen: 0 };
  const app = m.application;
  if (app && app.status !== 'pending') {
    // An approval to move stays open for its window; everything else is a record of last year's decision.
    if (app.kind === 'entry' && app.status === 'approved') {
      if (app.expiresYear !== undefined && app.expiresYear < year) { m.application = null; bump(state, 'lapsed'); }
    } else if ((app.decidedYear ?? year) < year) m.application = null;
  }
  if (state.character.age < content.balance.immigration.minAge) return;
  decide(state, content);
  const waiting = m.application;
  if (waiting?.status === 'pending' && waiting.sinceYear < year && waiting.decisionYear > year) queueEvent(state, content.registries.immigration.triggers.waiting, content);
  if (!state.travel.residence?.settled) return;
  permits(state, content);
  if (isUndocumented(state)) undocumentedYear(state, content);
  else if (!isCitizen(state, content)) settledYear(state, content);
  // (A citizen who moved for good keeps no permit record; the first years' strain ended with the permit.)
}
