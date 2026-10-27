import { content } from '../../../content';
import { getFameView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { StatBar } from '../../components/StatBar';
import { FAME_ICON, HOME_STATS, STAT_ICONS, STAT_LABELS } from '../../labels';

/** The stat panel at the bottom of Home (U1): happiness, health, smarts and looks as bars with percentages, and fame once you are famous. */
export function StatPanel({ life }: { life: LifeState }) {
  const fame = getFameView(life, content);
  const famous = fame.active && !fame.retired ? fame.paths[0] : undefined;
  return (
    <section aria-label="Stats" className="px-safe flex flex-col gap-1.5 border-t border-border bg-bg py-2.5" data-testid="stat-panel">
      {HOME_STATS.map((key) => (
        <StatBar key={key} label={STAT_LABELS[key]} value={life.character.stats[key]} icon={STAT_ICONS[key]} layout="row" />
      ))}
      {famous && <StatBar label="Fame" value={famous.fame} icon={FAME_ICON} layout="row" />}
    </section>
  );
}
