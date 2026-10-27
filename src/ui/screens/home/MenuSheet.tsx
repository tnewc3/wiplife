import { Archive, BookOpen, House, Plus, Settings, type LucideIcon } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { Sheet } from '../../components/Sheet';

function Item({ Icon, label, onClick, testId }: { Icon: LucideIcon; label: string; onClick: () => void; testId?: string }) {
  return (
    <li>
      <button type="button" onClick={onClick} data-testid={testId} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left text-lg font-semibold active:bg-surface-2">
        <Icon aria-hidden="true" size={24} className="text-link" />
        {label}
      </button>
    </li>
  );
}

/**
 * The menu (U1): new life, the archive, settings, your life history and the way back to the title. One life is kept at a
 * time (starting another archives the first), so there is no list of lives in progress.
 */
export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useAppStore((s) => s.navigate);
  const openArchive = useAppStore((s) => s.openArchive);
  const openSettings = useAppStore((s) => s.openSettings);
  const openLifeHistory = useAppStore((s) => s.openLifeHistory);
  const go = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <Sheet open={open} title="Menu" onClose={onClose}>
      <ul className="flex flex-col" aria-label="Menu">
        <Item Icon={Plus} label="New life" onClick={go(() => navigate('newLife'))} testId="menu-new-life" />
        <Item Icon={BookOpen} label="Life history" onClick={go(openLifeHistory)} testId="menu-life-history" />
        <Item Icon={Archive} label="Archive" onClick={go(() => void openArchive())} testId="menu-archive" />
        <Item Icon={Settings} label="Settings" onClick={go(openSettings)} testId="menu-settings" />
        <Item Icon={House} label="Back to title" onClick={go(() => navigate('title'))} testId="menu-title" />
      </ul>
    </Sheet>
  );
}
