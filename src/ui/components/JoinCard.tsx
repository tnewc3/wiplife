import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

/**
 * A card of a joinable list (U3): clubs, causes, faith communities, gyms, schools, teams. Icon, name, kind and, when true, how
 * many people you know there; fact chips (time a week, cost, main benefit); and an inline Join button. In "Yours" the same
 * card shows your role and a chevron to the group's own screen.
 */
export function JoinCard({ icon, name, kind, known, chips, join, joinLabel = 'Join', joinDisabled = false, role, onOpen, testId, joinTestId }: { icon?: string | undefined; name: string; kind: string; known?: number | undefined; /** FactChips. */ chips?: ReactNode; /** Joins (the Join tab). */ join?: (() => void) | undefined; joinLabel?: string; joinDisabled?: boolean; /** Your role (the Yours tab). */ role?: string | undefined; /** Opens the group's feature screen (the Yours tab). */ onOpen?: (() => void) | undefined; testId?: string; joinTestId?: string }) {
  const body = (
    <>
      {icon && <Icon id={icon} size={32} />}
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="font-display text-base leading-tight font-semibold [overflow-wrap:anywhere]">{name}</span>
        <span className="text-[13px] text-muted [overflow-wrap:anywhere]">
          {[kind, role, known && known > 0 ? `${known} ${known === 1 ? 'person' : 'people'} you know` : null].filter(Boolean).join(' · ')}
        </span>
      </span>
      {onOpen && <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />}
    </>
  );
  return (
    <li data-testid={testId} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
      {onOpen ? (
        <button type="button" onClick={onOpen} className="wl-press flex min-h-11 w-full min-w-0 items-center gap-3">
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-3">{body}</div>
      )}
      {chips && <div className="flex flex-wrap gap-1">{chips}</div>}
      {join && (
        <Button variant="secondary" block disabled={joinDisabled} onClick={join} data-testid={joinTestId}>
          {joinLabel}
        </Button>
      )}
    </li>
  );
}
