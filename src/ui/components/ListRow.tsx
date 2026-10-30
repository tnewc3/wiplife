import { ChevronRight, MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export interface ListRowProps {
  title: string;
  /** One line, 13px, under the title. */
  subtitle?: string | undefined;
  /** A content icon id (registries/icons.yaml), 28px. */
  icon?: string | undefined;
  /** Something of your own in the icon's place (a portrait). */
  lead?: ReactNode;
  /** The key value, inline on the right: a price, "$15/hour", a bar. */
  value?: ReactNode;
  /** How the row ends: a chevron opens a new screen (needs onClick); three dots open a quick action sheet (needs onMore) without leaving the screen. */
  ending?: 'chevron' | 'dots' | 'none';
  onClick?: (() => void) | undefined;
  onMore?: (() => void) | undefined;
  /** Greyed out: it can't be used now. It stays tappable (tapping explains why) unless there is no onClick. */
  muted?: boolean | undefined;
  /** The gold accent of the Luxury hub. */
  gold?: boolean | undefined;
  testId?: string | undefined;
  moreTestId?: string | undefined;
  moreLabel?: string | undefined;
  className?: string | undefined;
}

/**
 * The one list row of the app (U2 density rules): about 56px tall with a 28px icon, a 16px title and a one-line 13px
 * subtitle, the key value inline, and a chevron (opens a screen) or three dots (opens an action sheet) at the end.
 * Put it in a `<ul>` as `<li>`.
 */
export function ListRow({ title, subtitle, icon, lead, value, ending = 'none', onClick, onMore, muted = false, gold = false, testId, moreTestId, moreLabel, className = '' }: ListRowProps) {
  const body = (
    <>
      {lead ?? (icon && <Icon id={icon} size={28} />)}
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="font-display truncate text-base leading-tight font-semibold">{title}</span>
        {subtitle && <span className="truncate text-[13px] leading-tight text-muted">{subtitle}</span>}
      </span>
      {value !== undefined && value !== null && <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>}
      {ending === 'chevron' && <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />}
    </>
  );
  const shape = `flex min-h-row w-full min-w-0 items-center gap-3 px-3 py-1.5 ${muted ? 'opacity-60' : ''}`;
  return (
    <li className={`flex min-w-0 items-stretch border-b border-border last:border-b-0 ${gold ? 'bg-gold-surface' : ''} ${className}`}>
      {onClick ? (
        <button type="button" onClick={onClick} data-testid={testId} aria-disabled={muted ? true : undefined} className={`${shape} active:bg-surface-2`}>
          {body}
        </button>
      ) : (
        <div data-testid={testId} className={shape}>
          {body}
        </div>
      )}
      {ending === 'dots' && (
        <button
          type="button"
          onClick={onMore}
          aria-label={moreLabel ?? `More for ${title}`}
          data-testid={moreTestId}
          className="flex w-11 shrink-0 items-center justify-center text-muted active:bg-surface-2"
        >
          <MoreHorizontal aria-hidden="true" size={20} />
        </button>
      )}
    </li>
  );
}

/** The frame of a list of rows: one rounded surface with dividers, no card padding. */
export function RowList({ children, label, gold = false, className = '' }: { children: ReactNode; label: string; gold?: boolean; className?: string }) {
  return (
    <ul aria-label={label} className={`overflow-hidden rounded-2xl border ${gold ? 'border-gold-border bg-gold-surface' : 'border-border bg-surface'} ${className}`}>
      {children}
    </ul>
  );
}
