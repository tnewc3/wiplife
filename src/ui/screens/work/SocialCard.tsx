import { content } from '../../../content';
import { getSocialView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { money } from '../../labels';

/** Batch 8: the Work tab's way into the Social screen, for creators (everyone else finds it under Activities). */
export function SocialCard({ life }: { life: LifeState }) {
  const view = getSocialView(life, content);
  const open = useAppStore((s) => s.openSocial);
  if (!view.creator) return null;
  return (
    <Card role="region" aria-labelledby="work-social-title" data-testid="work-social">
      <h2 id="work-social-title" className="text-lg font-bold">
        Social media
      </h2>
      <p className="mt-1 text-muted">
        {view.accounts.length === 0 ? 'No accounts yet.' : `You reach ${view.reachWords}.`}
        {view.incomeThisYear > 0 && ` The platforms paid you ${money(view.incomeThisYear)} this year.`}
      </p>
      <Button block className="mt-3" onClick={() => open()} data-testid="work-open-social">
        Open your accounts
      </Button>
    </Card>
  );
}
