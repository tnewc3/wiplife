import type { ReactNode } from 'react';
import { lightHaptic } from '../haptics';
import { Icon } from './Icon';

/** The event category colors (tokens.css) an action tile's icon square can use. */
export type TileTone = 'sports' | 'fame' | 'money' | 'health' | 'work' | 'school' | 'love' | 'friends' | 'family' | 'mind' | 'crime' | 'home' | 'travel' | 'people' | 'wonder';

export interface ActionTileProps {
  label: string;
  /** One status line: "1 of 10", "$120", "Ready", "●●○". */
  status?: string | undefined;
  /** A content icon id, or an interface icon of your own. */
  icon?: string | undefined;
  glyph?: ReactNode;
  tone?: TileTone;
  onClick?: (() => void) | undefined;
  /** Greyed out: it can't be used now (the status line says why). */
  disabled?: boolean | undefined;
  testId?: string | undefined;
}

/** One of up to four main actions of a feature screen: an icon on a colored square, a label and a status line. At least 44px tall. */
export function ActionTile({ label, status, icon, glyph, tone = 'sports', onClick, disabled = false, testId }: ActionTileProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-testid={testId}
      onClick={() => {
        lightHaptic();
        onClick?.();
      }}
      className="wl-press flex min-h-[5.25rem] min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl border border-border bg-surface px-1 py-2 text-center disabled:opacity-50"
    >
      <span className="flex size-9 items-center justify-center rounded-xl" style={{ backgroundColor: `var(--wl-cat-${tone})`, color: 'var(--wl-cat-ink)' }}>
        {glyph ?? (icon && <Icon id={icon} size={22} />)}
      </span>
      <span className="font-display w-full text-[13px] leading-tight font-semibold [overflow-wrap:anywhere]">{label}</span>
      {status && <span className="w-full text-[11px] leading-tight text-muted [overflow-wrap:anywhere]">{status}</span>}
    </button>
  );
}

/** Up to four tiles in a row. */
export function ActionTileRow({ children, label = 'Actions' }: { children: ReactNode; label?: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {children}
    </div>
  );
}
