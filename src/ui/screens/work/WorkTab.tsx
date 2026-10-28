import { AbroadCard } from './AbroadCard';
import { content } from '../../../content';
import { getAbroadView, getCharacterSummary, getCrimeView, getFameView, getSocialView, getSportsView, getWorkView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { InteractSheet } from '../../components/InteractSheet';
import { WayRow } from '../../components/WayRow';
import { money } from '../../labels';
import { BusinessCard } from './BusinessCard';
import { CrimeCard } from './CrimeCard';
import { FameCard } from './FameCard';
import { JobCard } from './JobCard';
import { SchoolCard } from './SchoolCard';
import { SocialCard } from './SocialCard';
import { SportsCard } from './SportsCard';

/** Gig work: deliveries, rides and odd jobs, as a card. */
function GigCard({ life }: { life: LifeState }) {
  const view = getWorkView(life, content);
  const busy = useAppStore((s) => s.aging);
  const act = useAppStore((s) => s.takeLifeAction);
  return (
    <Card role="region" aria-labelledby="gig-title">
      <h2 id="gig-title" className="text-lg font-bold">
        Gig work
      </h2>
      <p className="mt-1 text-muted">Deliveries, rides and odd jobs. The pay is low and changes every year, but it’s always there.</p>
      <p className="mt-3" data-testid="gig-status">
        {view.gig ? 'You’re doing gig work.' : 'You’re not doing gig work.'} A typical year pays about {money(view.expectedGigPay)}.
      </p>
      {view.lastIncome > 0 && <p className="mt-1 text-sm text-muted">Last year you earned {money(view.lastIncome)} before tax.</p>}
      <Button block variant={view.gig ? 'secondary' : 'primary'} className="mt-3" disabled={busy || !view.between} onClick={() => void act(view.gig ? 'stop_gig' : 'start_gig')}>
        {view.gig ? 'Stop gig work' : 'Start gig work'}
      </Button>
    </Card>
  );
}

/**
 * The Job tab (School while you are enrolled), U1: school first when you are enrolled, then your job; below, a list of the
 * ways to work: gig work, a business, time abroad, and the special careers (fame, sports, social media, crime). A way
 * that is not open to you is greyed out, and tapping it says why.
 */
export function WorkTab({ life }: { life: LifeState }) {
  const view = getWorkView(life, content);
  const enrolled = getCharacterSummary(life, content).school !== null;
  const gigReason = view.job ? 'You have a full-time job, so there’s no time for gig work.' : !view.canGig ? `You can start gig work at ${view.gigMinAge}.` : undefined;
  const businessAge = content.balance.business.limits.minAge;
  const businessReason = life.character.age < businessAge ? `You can run a business from ${businessAge}.` : undefined;
  const abroad = getAbroadView(life, { destinationId: '', route: 'year' }, content).oldEnough;
  const fame = getFameView(life, content).show;
  const sports = getSportsView(life, content).show;
  const social = getSocialView(life, content).creator;
  const crime = getCrimeView(life, content).show;
  const job = life.character.age >= view.minAge - 2;
  const school = <SchoolCard life={life} />;

  return (
    <div className="flex flex-col gap-4">
      {enrolled && school}
      {job && <JobCard life={life} />}
      {!enrolled && school}
      {/* The Talk buttons on the school and job cards open the interaction menu here. */}
      <InteractSheet life={life} />
      <section aria-labelledby="ways-title" className="flex flex-col gap-2">
        <h2 id="ways-title" className="font-display text-lg font-semibold">
          Ways to work
        </h2>
        <WayRow title="Gig work" status={view.gig ? 'Doing it now' : undefined} reason={gigReason} testId="way-gig">
          <GigCard life={life} />
        </WayRow>
        <WayRow title="Run a business" reason={businessReason} testId="way-business">
          <BusinessCard life={life} />
        </WayRow>
        {abroad && (
          <WayRow title="Time abroad">
            <AbroadCard life={life} />
          </WayRow>
        )}
      </section>
      {(fame || sports || social || crime) && (
        <section aria-labelledby="special-title" className="flex flex-col gap-2">
          <h2 id="special-title" className="font-display text-lg font-semibold">
            Special careers
          </h2>
          {fame && (
            <WayRow title="Arts and media">
              <FameCard life={life} />
            </WayRow>
          )}
          {sports && (
            <WayRow title="Sports">
              <SportsCard life={life} />
            </WayRow>
          )}
          {social && (
            <WayRow title="Social media">
              <SocialCard life={life} />
            </WayRow>
          )}
          {crime && (
            <WayRow title="Crime">
              <CrimeCard life={life} />
            </WayRow>
          )}
        </section>
      )}
    </div>
  );
}
