import { content } from '../../../content';
import { canPlanEstate, getTeenView } from '../../../engine/selectors';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';

/** The More tab: your home, your health, life history, settings. */
export function MoreTab() {
  const navigate = useAppStore((s) => s.navigate);
  const openSettings = useAppStore((s) => s.openSettings);
  const openLifeHistory = useAppStore((s) => s.openLifeHistory);
  const openHome = useAppStore((s) => s.openHome);
  const openHealth = useAppStore((s) => s.openHealth);
  const openFamily = useAppStore((s) => s.openFamily);
  const openWill = useAppStore((s) => s.openWill);
  const openBelongings = useAppStore((s) => s.openBelongings);
  const openTeen = useAppStore((s) => s.openTeen);
  /** T1: the teen years, and for anyone grown without a license the way to get one. */
  const teen = useAppStore((s) => {
    if (!s.life) return null;
    const v = getTeenView(s.life, content);
    return v.teen ? 'Teen years' : v.license.stage !== 'licensed' && s.life.character.age >= 16 ? 'Driver’s license' : null;
  });
  const adult = useAppStore((s) => s.life !== null && canPlanEstate(s.life, content));
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" block onClick={openHome}>
        Home
      </Button>
      <Button variant="secondary" block onClick={openHealth}>
        Health
      </Button>
      <Button variant="secondary" block onClick={openFamily}>
        Family
      </Button>
      {teen && (
        <Button variant="secondary" block onClick={openTeen} data-testid="more-teen">
          {teen}
        </Button>
      )}
      <Button variant="secondary" block onClick={openBelongings} data-testid="more-belongings">
        Belongings
      </Button>
      {adult && (
        <Button variant="secondary" block onClick={openWill} data-testid="more-will">
          Write a will
        </Button>
      )}
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
