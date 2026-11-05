import type { PastimeDef, PastimeTier } from '../../../content/schemas';
import { STAT_LABELS } from '../../labels';

export interface ChipSpec {
  text: string;
  tone: 'good' | 'risk';
}

/** Stats where a lower number is the better one. */
const LOWER_IS_BETTER = new Set(['stress']);

const statName = (key: string) => (key in STAT_LABELS ? STAT_LABELS[key as keyof typeof STAT_LABELS] : key[0]!.toUpperCase() + key.slice(1));

/** The stat changes of a tier, summed by stat. */
function statDeltas(tier: PastimeTier | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of tier?.effects ?? []) if (e.type === 'stat') out.set(e.key, (out.get(e.key) ?? 0) + e.delta);
  return out;
}

/**
 * The effect chips of an activity option (U3), read from its tiers in content so they never drift from what happens:
 * what the good outcome gives (green: "+ Fitness", "− Stress", "++" when it is a lot) and what the bad ones risk (amber:
 * "Injury risk", "Legal trouble", "Money at risk", "Can go wrong").
 */
export function effectChips(def: PastimeDef | undefined): ChipSpec[] {
  if (!def) return [];
  const good = statDeltas(def.tiers.good);
  for (const [k, v] of statDeltas(def.tiers.great)) if (!good.has(k) || Math.abs(v) > Math.abs(good.get(k)!)) good.set(k, v);
  const chips: ChipSpec[] = [];
  const rank = [...good.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  for (const [key, delta] of rank) {
    if (delta === 0) continue;
    const beneficial = LOWER_IS_BETTER.has(key) ? delta < 0 : delta > 0;
    const big = Math.abs(delta) >= 4;
    chips.push({ text: `${delta > 0 ? (big ? '++' : '+') : big ? '−−' : '−'} ${statName(key)}`, tone: beneficial ? 'good' : 'risk' });
  }
  const bad = [def.tiers.bad, def.tiers.backfire];
  const types = new Set(bad.flatMap((t) => (t?.effects ?? []).map((e) => e.type)));
  const risks: ChipSpec[] = [];
  if (types.has('health')) risks.push({ text: 'Injury risk', tone: 'risk' });
  if (types.has('legal') || types.has('crime')) risks.push({ text: 'Legal trouble', tone: 'risk' });
  if (bad.some((t) => t?.money?.mode === 'loss') || def.mechanic === 'gamble') risks.push({ text: 'Money at risk', tone: 'risk' });
  if (def.tiers.backfire && risks.length === 0) risks.push({ text: 'Can go wrong', tone: 'risk' });
  return [...chips.filter((c) => c.tone === 'good').slice(0, 3), ...risks.slice(0, 2), ...chips.filter((c) => c.tone === 'risk').slice(0, 1)];
}
