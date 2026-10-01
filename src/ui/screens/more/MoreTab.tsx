import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';

/** The More tab: your home, your health, life history, settings. */
export function MoreTab() {
  const navigate = useAppStore((s) => s.navigate);
  const openSettings = useAppStore((s) => s.openSettings);
  const openLifeHistory = useAppStore((s) => s.openLifeHistory);
  const openHome = useAppStore((s) => s.openHome);
  const openHealth = useAppStore((s) => s.openHealth);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" block onClick={openHome}>
        Home
      </Button>
      <Button variant="secondary" block onClick={openHealth}>
        Health
      </Button>
      <Button variant="secondary" block onClick={openLifeHistory}>
        Life history
      </Button>
      <Button variant="secondary" block onClick={openSettings}>
        Settings
      </Button>
      <Button variant="ghost" block onClick={() => navigate('title')}>
        Back to title
      </Button>
    </div>
  );
}
