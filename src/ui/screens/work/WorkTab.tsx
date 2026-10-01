import { content } from '../../../content';
import { getWorkView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { money } from '../../labels';
import { SchoolCard } from './SchoolCard';

/** The Work/School tab: school (Stage 7) and gig work (jobs arrive with careers). */
export function WorkTab({ life }: { life: LifeState }) {
  const view = getWorkView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);

  return (
    <div className="flex flex-col gap-4">
      <SchoolCard life={life} />
      <Card role="region" aria-labelledby="gig-title">
        <h2 id="gig-title" className="text-lg font-bold">
          Gig work
        </h2>
        <p className="mt-1 text-muted">Deliveries, rides and odd jobs. The pay is low and changes every year, but it’s always there.</p>
        {!view.canGig ? (
          <p className="mt-3" data-testid="gig-status">
            You can start gig work at {view.gigMinAge}.
          </p>
        ) : (
          <>
            <p className="mt-3" data-testid="gig-status">
              {view.gig ? 'You’re doing gig work.' : 'You’re not doing gig work.'} A typical year pays about {money(view.expectedGigPay)}.
            </p>
            {view.lastIncome > 0 && <p className="mt-1 text-sm text-muted">Last year you earned {money(view.lastIncome)} before tax.</p>}
            <Button
              block
              variant={view.gig ? 'secondary' : 'primary'}
              className="mt-3"
              disabled={busy || !view.between}
              onClick={() => void act(view.gig ? 'stop_gig' : 'start_gig')}
            >
              {view.gig ? 'Stop gig work' : 'Start gig work'}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
