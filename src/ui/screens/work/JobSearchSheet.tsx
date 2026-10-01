import { useState } from 'react';
import { content } from '../../../content';
import { JOB_CATEGORIES, type JobCategory } from '../../../content/schemas';
import { getJobSearch, type JobOption } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { capitalized, JOB_APPLY_BLOCK_LABELS, JOB_CATEGORY_LABELS, money, oddsLabel } from '../../labels';

type Filter = JobCategory | 'all';
type Sort = 'pay' | 'odds';

function OpeningButton({ option, onPick }: { option: JobOption; onPick: () => void }) {
  const status =
    option.result === true ? 'You got this job' : option.result === false ? 'Turned you down this year' : option.block ? JOB_APPLY_BLOCK_LABELS[option.block] : oddsLabel(option.chance);
  return (
    <li>
      <button
        type="button"
        disabled={option.block !== null}
        onClick={onPick}
        className="flex min-h-11 w-full min-w-0 flex-col py-3 text-left active:bg-surface-2 disabled:opacity-60"
      >
        <span className="font-semibold break-words">{option.name}</span>
        <span className="text-sm break-words text-muted">
          {capitalized(option.title)} · {money(option.salary)} a year
        </span>
        <span className="text-sm break-words text-muted">{option.blurb}</span>
        {option.topSalary > option.salary && <span className="text-sm text-muted">Up to {money(option.topSalary)} a year at the top</span>}
        <span className={`text-sm ${option.result === true ? 'font-semibold text-accent' : 'text-muted'}`}>{status}</span>
      </button>
    </li>
  );
}

/**
 * Job search: the openings in your city this year that you qualify for,
 * filtered by kind of work and sorted by pay or odds. Picking one asks
 * before applying; applying starts the interview (a result event).
 */
export function JobSearchSheet({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const search = getJobSearch(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('pay');
  const [picked, setPicked] = useState<string | null>(null);

  const shown = search.options
    .filter((o) => filter === 'all' || o.category === filter)
    .sort((a, b) => (sort === 'odds' ? b.chance - a.chance : 0) || b.salary - a.salary || (a.name < b.name ? -1 : 1));
  const choice = search.options.find((o) => o.jobId === picked) ?? null;
  const close = () => {
    setPicked(null);
    onClose();
  };
  const filters: Filter[] = ['all', ...JOB_CATEGORIES.filter((c) => search.options.some((o) => o.category === c))];

  if (choice) {
    return (
      <Sheet
        open={open}
        title={`Apply: ${capitalized(choice.title)}`}
        onClose={() => setPicked(null)}
        footer={
          <>
            <Button
              block
              disabled={busy || choice.block !== null}
              onClick={() => {
                const jobId = choice.jobId;
                close();
                void act('apply_job', { jobId });
              }}
            >
              Apply
            </Button>
            <Button variant="secondary" block onClick={() => setPicked(null)}>
              Back
            </Button>
          </>
        }
      >
        <dl className="flex flex-col gap-1">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Job</dt>
            <dd className="text-right break-words">{choice.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Starting as</dt>
            <dd className="text-right break-words">{capitalized(choice.title)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Starting pay</dt>
            <dd className="tabular-nums">{money(choice.salary)} a year</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Your chances</dt>
            <dd>{oddsLabel(choice.chance)}</dd>
          </div>
        </dl>
        {life.career.job && <p className="mt-3 text-sm text-muted">If they hire you, you’ll leave your job at {life.career.job.employer}.</p>}
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      title="Job search"
      onClose={close}
      footer={
        <Button variant="secondary" block onClick={close}>
          Done
        </Button>
      }
    >
      <p className="text-muted">
        Openings in {search.cityName} this year that you qualify for. Applications left: {search.applicationsLeft}.
      </p>
      {search.options.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of work">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${filter === f ? 'border-accent bg-accent text-accent-contrast' : 'border-border bg-surface'}`}
              >
                {f === 'all' ? 'All' : JOB_CATEGORY_LABELS[f]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Sort by">
            {(['pay', 'odds'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sort === s}
                onClick={() => setSort(s)}
                className={`min-h-11 rounded-full border px-4 text-sm ${sort === s ? 'border-accent font-semibold text-accent' : 'border-border bg-surface'}`}
              >
                {s === 'pay' ? 'Best pay' : 'Best chances'}
              </button>
            ))}
          </div>
        </>
      )}
      {shown.length === 0 ? (
        <p className="mt-3" data-testid="no-openings">
          Nothing you qualify for is hiring here this year. Try again next year, or somewhere else.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border" aria-label="Openings">
          {shown.map((o) => (
            <OpeningButton key={o.jobId} option={o} onPick={() => setPicked(o.jobId)} />
          ))}
        </ul>
      )}
    </Sheet>
  );
}
