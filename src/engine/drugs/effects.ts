/**
 * The drug effects events can have (D1): taking something that was offered, being charged, a seizure, recovery,
 * customers and standing, a dealer joining your people, and going back. The engine ignores what doesn't fit and never what
 * would break a rule: nobody under 18 buys, deals or makes, and a charge needs something to charge.
 */
import type { ContentBundle, Effect } from '../../content/schemas';
import { clampInt } from '../random';
import type { Id, LifeState } from '../types';
import { meetDealer } from './market';
import { ensureHabit, canUseAge, drugDef, isAdult, rollYear } from './query';
import { charge } from './legal';
import { syncAddiction } from './habit';
import { stopDealing } from './dealing';
import { useDrug } from './use';
import { say } from './text';
import { nextInt } from '../rng';

type DrugsEffect = Extract<Effect, { type: 'drugs' }>;

export function applyDrugsEffect(state: LifeState, effect: DrugsEffect, content: ContentBundle): void {
  const d = state.drugs;
  switch (effect.action) {
    case 'use': {
      if (!canUseAge(state, content) || !drugDef(content, effect.drug)) return;
      const q = content.balance.drugs.sources.nightlife.quality;
      useDrug(state, effect.drug!, effect.dose ?? 'light', content, { quality: clampInt(q.mean + nextInt(state.rng, -q.sd, q.sd), 5, 100) });
      return;
    }
    case 'charge': {
      if (!isAdult(state, content) && effect.situation !== 'holding') return;
      charge(state, effect.situation!, content);
      return;
    }
    case 'seize': {
      for (const id of Object.keys(d.stock).sort()) {
        const s = d.stock[id]!;
        s.units = Math.floor(s.units * (1 - effect.share!));
        if (s.units <= 0) delete d.stock[id];
      }
      return;
    }
    case 'recover': {
      const worst = Object.values(d.habits).sort((a, b) => b.dependence - a.dependence)[0];
      if (worst && worst.dependence > 0) worst.dependence = Math.max(0, worst.dependence + effect.delta!);
      syncAddiction(state, content);
      return;
    }
    case 'quit': {
      for (const h of Object.values(d.habits)) if (h.dependence >= content.balance.drugs.threshold && h.quitYear === 0) h.quitYear = state.currentYear;
      return;
    }
    case 'customers':
      if (d.dealing) d.dealing.customers = clampInt(d.dealing.customers + effect.delta!, 0, content.balance.drugs.dealing.customers.max);
      return;
    case 'standing':
      if (d.dealing) d.dealing.standing = clampInt(d.dealing.standing + effect.delta!, 0, 100);
      return;
    case 'dealer':
      if (isAdult(state, content)) meetDealer(state, content);
      return;
    case 'stop':
      stopDealing(state, content);
      return;
    case 'relapse': {
      // Back to a drug you quit: the one named, or the one you depended on most.
      const pick: Id | undefined = effect.drug ?? Object.entries(d.habits).filter(([, h]) => h.quitYear > 0).sort((a, b) => b[1].peak - a[1].peak)[0]?.[0];
      if (pick === undefined || !drugDef(content, pick)) return;
      rollYear(state);
      const h = ensureHabit(state, pick);
      if (h.quitYear === 0) return;
      h.quitYear = 0;
      h.recovered = false;
      h.relapses += 1;
      h.clean = 0;
      h.dependence = Math.max(h.dependence, Math.round(h.peak * content.balance.drugs.recovery.relapseShare));
      d.totals.relapses += 1;
      say(state, 'relapsed', { drug: drugDef(content, pick)!.noun }, content);
      syncAddiction(state, content);
      return;
    }
  }
}
