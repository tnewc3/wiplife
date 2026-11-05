import { content } from '../../../content';
import { getHubView } from '../../../engine/selectors';
import type { CommitLevel, LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { FeatureScreen } from '../../components/FeatureScreen';
import { HeroCard, StatCell } from '../../components/HeroCard';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { SectionLabel } from '../../components/SectionLabel';
import { CAREER_LABELS, COMMITMENT_LABELS, skillWord } from '../../labels';

/**
 * The Schedule (U3): the one place where you choose how hard you work at each role (holding back, steady, all in). It is a
 * feature screen with your load and burnout up top, one card per role, and your skills; the rules are behind ⓘ.
 */
export function ScheduleScreen({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const view = getHubView(life, content);
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const disabled = busy || !view.between;
  const loadPct = Math.min(100, Math.round((view.load.total / (view.load.comfortable * 1.6)) * 100));
  return (
    <FeatureScreen
      open={open}
      title={CAREER_LABELS.scheduleTitle}
      onBack={onClose}
      testId="schedule-sheet"
      info={
        <>
          <p>{CAREER_LABELS.scheduleNote}</p>
          {view.penalty > 0 && <p>{CAREER_LABELS.penalty(view.penalty)}</p>}
        </>
      }
    >
      <HeroCard title={CAREER_LABELS.loadWords[view.loadBand]} status={view.load.over > 0 ? CAREER_LABELS.over(view.load.over) : undefined} testId="schedule-load">
        <StatCell label={CAREER_LABELS.load} value={`${loadPct}%`} bar={loadPct} barKind="bad" />
        <StatCell label={CAREER_LABELS.burnout} value={`${Math.round(view.burnout)}%`} bar={view.burnout} barKind="bad" />
      </HeroCard>
      {view.gave && view.gave.year >= life.currentYear - 1 && <p className="px-1 text-sm font-semibold">{CAREER_LABELS.gave[view.gave.what]}</p>}
      <SectionLabel>{CAREER_LABELS.you}</SectionLabel>
      {view.roles.length === 0 ? (
        <p className="px-1 text-muted">{CAREER_LABELS.noRoles}</p>
      ) : (
        <RowList label="Roles">
          {view.roles.map((r) => (
            <li key={r.id} className="flex min-w-0 flex-col gap-1.5 border-b border-border px-3 py-2 last:border-b-0" data-testid={`schedule-${r.id}`}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-display text-base font-semibold [overflow-wrap:anywhere]">{r.title || CAREER_LABELS.roleNames[r.id]}</span>
                <span className="shrink-0 text-sm text-muted tabular-nums">{view.load.shares.find((s) => s.id === r.id)?.points ?? 0} pts</span>
              </span>
              <span role="radiogroup" aria-label={`${CAREER_LABELS.commitment}: ${CAREER_LABELS.roleNames[r.id]}`} className="flex gap-1">
                {(['back', 'steady', 'all'] as const).map((c: CommitLevel) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={r.commit === c}
                    disabled={disabled}
                    onClick={() => void act('set_role_commit', { roleId: r.id, commitment: c })}
                    data-testid={`commit-${r.id}-${c}`}
                    className={`wl-press min-h-11 flex-1 rounded-xl border px-1 text-sm leading-tight font-semibold disabled:opacity-60 ${r.commit === c ? 'border-accent bg-surface-2' : 'border-border'}`}
                  >
                    {COMMITMENT_LABELS[c]}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </RowList>
      )}
      <SectionLabel>{CAREER_LABELS.skills}</SectionLabel>
      {view.skills.length === 0 ? (
        <p className="px-1 text-muted">{CAREER_LABELS.noSkills}</p>
      ) : (
        <RowList label={CAREER_LABELS.skills}>
          {view.skills.slice(0, 12).map((k) => (
            <ListRow key={k.key} title={k.label} subtitle={`${skillWord(k.level)}${CAREER_LABELS.skillLine(Math.round(k.peak), k.idle) ? ` · ${CAREER_LABELS.skillLine(Math.round(k.peak), k.idle)}` : ''}`} value={<MiniBar label={k.label} value={k.level} />} testId={`skill-${k.key}`} />
          ))}
        </RowList>
      )}
    </FeatureScreen>
  );
}

