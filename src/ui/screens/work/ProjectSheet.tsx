import { useState } from 'react';
import { content } from '../../../content';
import { FAME_RISKS, FAME_STYLES, type FameRisk, type FameStyle } from '../../../content/schemas';
import { getProjectBlock, type FamePathView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { RISK_BLURBS, RISK_LABELS, STYLE_BLURBS, STYLE_LABELS } from '../../labels';

function Choice({ checked, label, blurb, onPick, testId, disabled = false }: { checked: boolean; label: string; blurb: string; onPick: () => void; testId: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onPick}
      data-testid={testId}
      className={`flex min-h-11 w-full min-w-0 flex-col rounded-xl border px-3 py-2 text-left disabled:opacity-50 ${checked ? 'border-accent bg-surface-2' : 'border-border bg-surface'}`}
    >
      <span className="font-semibold break-words">{label}</span>
      <span className="text-sm break-words text-muted">{blurb}</span>
    </button>
  );
}

/**
 * E6b: the creative choices step when you line up a project: the kind of
 * work, commercial or artistic, safe or bold, and whether to tour or do a
 * press run. The work comes out as the next year begins; quality is rolled
 * from your talent, your craft, your team and these choices, and critics and
 * fans judge it separately.
 */
export function ProjectSheet({ life, paths, open, onClose }: { life: LifeState; paths: FamePathView[]; open: boolean; onClose: () => void }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [pathId, setPathId] = useState(paths[0]?.id ?? '');
  const path = paths.find((p) => p.id === pathId) ?? paths[0];
  const [kindId, setKindId] = useState<string>('');
  const [style, setStyle] = useState<FameStyle>('commercial');
  const [risk, setRisk] = useState<FameRisk>('safe');
  const [tour, setTour] = useState(false);
  const [press, setPress] = useState(false);
  if (!path) return null;
  const kinds = path.kinds.filter((k) => !k.locked);
  const kind = kinds.find((k) => k.id === kindId) ?? kinds[0];
  const params = { pathId: path.id, kindId: kind?.id ?? '', style, risk, tour: tour && path.tour.allowed, press: press && path.press.allowed };
  const blocked = !kind || getProjectBlock(life, params, content) !== null;
  const save = async () => {
    await act('plan_project', params);
    onClose();
  };
  return (
    <Sheet
      open={open}
      title="Line up a project"
      onClose={onClose}
      footer={
        <Button block disabled={busy || blocked} onClick={() => void save()} data-testid="project-save">
          Line it up
        </Button>
      }
    >
      <p className="text-muted">It comes out as the year begins. How good it is depends on your talent, your craft, your team and what you choose here.</p>
      {paths.length > 1 && (
        <fieldset className="mt-3 flex flex-col gap-2">
          <legend className="font-semibold">Which path</legend>
          <div role="radiogroup" aria-label="Which path" className="flex flex-col gap-2">
            {paths.map((p) => (
              <Choice key={p.id} checked={p.id === path.id} label={p.name} blurb={p.rungTitle} onPick={() => setPathId(p.id)} testId={`project-path-${p.id}`} />
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="mt-3 flex flex-col gap-2">
        <legend className="font-semibold">Kind of work</legend>
        <div role="radiogroup" aria-label="Kind of work" className="flex flex-col gap-2">
          {path.kinds.map((k) => (
            <Choice key={k.id} checked={k.id === kind?.id} label={k.label} blurb={k.locked ? `Opens at ${path.ladder[k.minRung - 1]?.title ?? 'a higher rung'}.` : k.blurb} disabled={k.locked} onPick={() => setKindId(k.id)} testId={`project-kind-${k.id}`} />
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-3 flex flex-col gap-2">
        <legend className="font-semibold">Aim</legend>
        <div role="radiogroup" aria-label="Aim" className="flex flex-col gap-2">
          {FAME_STYLES.map((s) => (
            <Choice key={s} checked={style === s} label={STYLE_LABELS[s]} blurb={STYLE_BLURBS[s]} onPick={() => setStyle(s)} testId={`project-style-${s}`} />
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-3 flex flex-col gap-2">
        <legend className="font-semibold">How much to risk</legend>
        <div role="radiogroup" aria-label="How much to risk" className="flex flex-col gap-2">
          {FAME_RISKS.map((r) => (
            <Choice key={r} checked={risk === r} label={RISK_LABELS[r]} blurb={RISK_BLURBS[r]} onPick={() => setRisk(r)} testId={`project-risk-${r}`} />
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-3 flex flex-col gap-2">
        <legend className="font-semibold">Beyond the work</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-6" checked={tour && path.tour.allowed} disabled={!path.tour.allowed} onChange={(e) => setTour(e.target.checked)} data-testid="project-tour" />
          <span className="min-w-0 break-words">
            {path.tour.label}
            <span className="block text-sm text-muted">{path.tour.allowed ? 'More money and more fans, and a harder year.' : `Opens at ${path.ladder[path.tour.minRung - 1]?.title ?? 'a higher rung'}.`}</span>
          </span>
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-6" checked={press && path.press.allowed} disabled={!path.press.allowed} onChange={(e) => setPress(e.target.checked)} data-testid="project-press" />
          <span className="min-w-0 break-words">
            {path.press.label}
            <span className="block text-sm text-muted">{path.press.allowed ? 'Fame travels further. So does anything you say.' : `Opens at ${path.ladder[path.press.minRung - 1]?.title ?? 'a higher rung'}.`}</span>
          </span>
        </label>
      </fieldset>
    </Sheet>
  );
}
