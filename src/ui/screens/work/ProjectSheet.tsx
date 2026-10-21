import { useState } from 'react';
import { content } from '../../../content';
import { FAME_RISKS, FAME_STYLES, type FameRisk, type FameStyle } from '../../../content/schemas';
import { getProjectBlock, parseTitle, titleSuggestion, type FamePathView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { TextField } from '../../components/TextField';
import { RISK_BLURBS, RISK_LABELS, STYLE_BLURBS, STYLE_LABELS, TITLE_ERROR } from '../../labels';

const SELECT = 'min-h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-base text-text';

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
 * work, commercial or artistic, safe or bold, and whether to do a press run.
 * Batch 4: its genre (outside your sound, fans take it by how far it is), the
 * title you type (or a suggestion) and, for a record, track titles if you
 * want them. Tours are booked on their own. The work comes out as the next
 * year begins; quality is rolled from your talent, your craft and skills,
 * your band and team, and these choices; critics and fans judge it separately.
 */
export function ProjectSheet({ life, paths, open, onClose }: { life: LifeState; paths: FamePathView[]; open: boolean; onClose: () => void }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [pathId, setPathId] = useState(paths[0]?.id ?? '');
  const path = paths.find((p) => p.id === pathId) ?? paths[0];
  const [kindId, setKindId] = useState<string>('');
  const [style, setStyle] = useState<FameStyle>('commercial');
  const [risk, setRisk] = useState<FameRisk>('safe');
  const [press, setPress] = useState(false);
  const [genre, setGenre] = useState('');
  const [n, setN] = useState(0);
  const [title, setTitle] = useState<string | null>(null);
  const [tracks, setTracks] = useState('');
  if (!path) return null;
  const kinds = path.kinds.filter((k) => !k.locked);
  const kind = kinds.find((k) => k.id === kindId) ?? kinds[0];
  const typed = title ?? titleSuggestion(life, path.id, n, content);
  const titleOk = parseTitle(typed) !== null;
  const maxTracks = kind ? (path.tracks[kind.id] ?? 0) : 0;
  const trackList = maxTracks > 0 ? tracks.split('\n').map((t) => t.trim()).filter((t) => t.length > 0) : [];
  const pickedGenre = genre || path.genre?.id || path.genres[0]?.id || '';
  const far = path.genres.find((g) => g.id === pickedGenre)?.distance ?? 0;
  const params = {
    pathId: path.id,
    kindId: kind?.id ?? '',
    style,
    risk,
    press: press && path.press.allowed,
    title: typed,
    ...(pickedGenre ? { genreId: pickedGenre } : {}),
    ...(trackList.length > 0 ? { tracks: trackList } : {}),
  };
  const block = kind ? getProjectBlock(life, params, content) : 'kind';
  const blocked = block !== null;
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
      <p className="text-muted">It comes out as the year begins. How good it is depends on your talent, your craft and skills, your band and team, and what you choose here.</p>
      <div className="mt-3 flex flex-col gap-2">
        <TextField label="Title" value={typed} onChange={setTitle} maxLength={60} error={titleOk ? undefined : TITLE_ERROR} hint="Type your own, or take a suggestion." data-testid="project-title" />
        <Button
          variant="ghost"
          onClick={() => {
            setTitle(null);
            setN((x) => x + 1);
          }}
          data-testid="project-title-suggest"
        >
          Suggest another title
        </Button>
      </div>
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
      {maxTracks > 0 && (
        <label className="mt-3 flex flex-col gap-1 text-sm font-semibold">
          Track titles (optional, one a line, up to {maxTracks})
          <textarea className={`${SELECT} min-h-24 py-2`} value={tracks} onChange={(e) => setTracks(e.target.value)} data-testid="project-tracks" />
          {block === 'tracks' && <span className="text-sm font-normal text-danger">{trackList.length > maxTracks ? `At most ${maxTracks} tracks.` : TITLE_ERROR}</span>}
        </label>
      )}
      {path.genres.length > 0 && (
        <label className="mt-3 flex flex-col gap-1 text-sm font-semibold">
          Genre
          <select className={SELECT} value={pickedGenre} onChange={(e) => setGenre(e.target.value)} data-testid="project-genre">
            {path.genres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {path.genre?.id === g.id ? ' (your sound)' : ''}
              </option>
            ))}
          </select>
          {path.genre && pickedGenre !== path.genre.id && (
            <span className="text-sm font-normal text-muted" data-testid="project-off-genre">
              Outside your sound. Critics will judge it on its own; {far >= 0.5 ? 'many fans will not follow you there, though new ones may come.' : 'most fans will come along.'}
            </span>
          )}
        </label>
      )}
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
