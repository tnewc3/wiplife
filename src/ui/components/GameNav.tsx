import { Briefcase, GraduationCap, Sparkles, Users, Wallet, type LucideIcon } from 'lucide-react';
import { content } from '../../content';
import { getCharacterSummary } from '../../engine/selectors';
import { useAppStore, type TabId } from '../../store/appStore';
import { TAB_LABELS } from '../labels';
import { AgeUpButton } from './AgeUpButton';

type MainTab = Exclude<TabId, 'home'>;

function TabButton({ id, label, Icon }: { id: MainTab; label: string; Icon: LucideIcon }) {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const active = tab === id;
  return (
    <li className="min-w-0 flex-1">
      <button
        type="button"
        // Tapping the open tab again returns to its first page (closing a person or a page opened over it).
        onClick={() => setTab(id)}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-16 w-full flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-xs font-bold ${active ? 'bg-surface-2 text-link' : 'text-muted'} active:bg-surface-2`}
      >
        <Icon aria-hidden="true" size={24} strokeWidth={active ? 2.6 : 2.1} />
        <span className="w-full truncate text-center">{label}</span>
      </button>
    </li>
  );
}

/**
 * The bottom of every game screen (U1): Job (School while you are enrolled) and Assets on the left, the Age button in the
 * middle, People and Activities on the right. The page's back button returns to Home.
 */
export function GameNav() {
  const enrolled = useAppStore((s) => s.life !== null && getCharacterSummary(s.life, content).school !== null);
  return (
    <nav aria-label="Game sections" className="px-safe border-t border-border bg-surface pt-1 pb-[max(env(safe-area-inset-bottom),0.25rem)]">
      <ul className="flex items-center gap-1">
        <TabButton id="work" label={enrolled ? TAB_LABELS.school : TAB_LABELS.job} Icon={enrolled ? GraduationCap : Briefcase} />
        <TabButton id="assets" label={TAB_LABELS.assets} Icon={Wallet} />
        <li className="flex w-[5.5rem] shrink-0 justify-center">
          <AgeUpButton />
        </li>
        <TabButton id="people" label={TAB_LABELS.people} Icon={Users} />
        <TabButton id="activities" label={TAB_LABELS.activities} Icon={Sparkles} />
      </ul>
    </nav>
  );
}
