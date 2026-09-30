import { StatBar } from './StatBar';
import { BOND_LABELS } from '../labels';

/** How someone feels about you: affection and trust as bars, never numbers. */
export function BondBars({ affection, trust, label }: { affection: number; trust: number; label: string }) {
  return (
    <div className="grid grid-cols-2 gap-x-4" role="group" aria-label={label}>
      <StatBar label={BOND_LABELS.affection} value={affection} />
      <StatBar label={BOND_LABELS.trust} value={trust} />
    </div>
  );
}
