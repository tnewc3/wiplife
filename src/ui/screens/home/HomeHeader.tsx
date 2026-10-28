import { Menu } from 'lucide-react';
import { content } from '../../../content';
import { getCharacterSummary, getPortrait } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { CharacterPortrait } from '../../portraits/CharacterPortrait';
import { guardianHousingLine, money, occupationLine } from '../../labels';

/**
 * The Home header (U1): the menu button, then your portrait, name, what you do and where, and your balance. Tapping the
 * portrait or the name opens your profile.
 */
export function HomeHeader({ life, onMenu, onProfile }: { life: LifeState; onMenu: () => void; onProfile: () => void }) {
  const summary = getCharacterSummary(life, content);
  const occupation = occupationLine(summary);
  const testId = summary.job ? 'job-line' : summary.school ? 'school-line' : undefined;
  return (
    <header className="pt-safe px-safe flex shrink-0 items-center gap-1 border-b border-border bg-surface-2 py-2">
      <button type="button" onClick={onMenu} aria-label="Menu" className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-text active:bg-surface">
        <Menu aria-hidden="true" size={26} />
      </button>
      <button type="button" onClick={onProfile} aria-label="Profile" className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl text-left active:bg-surface">
        <CharacterPortrait portrait={getPortrait(life, 'you', content)} size={48} label={`Portrait of ${summary.fullName}`} />
        <span className="flex min-w-0 flex-col">
          <span className="font-display truncate text-lg leading-tight font-semibold" data-testid="character-name">
            {summary.fullName}
          </span>
          <span className="truncate text-sm text-muted">
            <span data-testid={testId}>{occupation}</span> · {summary.guardian ? guardianHousingLine(summary.guardian, summary.cityName) : summary.cityName}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-end pl-1" data-testid="money-line">
        <span className="sr-only">Balance</span>
        <span className={`font-display text-lg font-semibold tabular-nums ${summary.savings < 0 ? 'text-negative' : 'text-positive'}`} data-testid="balance">
          {money(summary.savings)}
        </span>
        {summary.debt > 0 && <span className="text-xs font-semibold text-negative">Debt {money(summary.debt)}</span>}
      </div>
    </header>
  );
}
