import type { MajorOption } from '../../../engine/selectors';
import { difficultyLabel } from '../../labels';

/** A list of majors to pick one from: name, what it's like and where it leads. */
export function MajorPicker({
  majors,
  selected,
  current = null,
  onPick,
  label = 'Majors',
}: {
  majors: MajorOption[];
  selected: string | null;
  /** Your major now, which can't be picked again. */
  current?: string | null;
  onPick: (id: string) => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {majors.map((m) => {
        const checked = selected === m.id;
        const isCurrent = current === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={isCurrent}
            onClick={() => onPick(m.id)}
            className={`flex min-h-11 w-full min-w-0 flex-col rounded-xl border px-4 py-2 text-left disabled:opacity-60 ${
              checked ? 'border-accent bg-surface-2' : 'border-border'
            }`}
          >
            <span className="flex flex-wrap justify-between gap-x-2 font-semibold">
              <span>{m.name}</span>
              <span className="text-sm font-normal text-muted">{isCurrent ? 'Your major' : difficultyLabel(m.difficulty)}</span>
            </span>
            <span className="text-sm break-words text-muted">{m.blurb}</span>
            <span className="text-sm break-words text-muted">Leads to: {m.careers}</span>
          </button>
        );
      })}
    </div>
  );
}
