import { ChevronRight } from 'lucide-react';
import { content } from '../../../content';
import { getTeenView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Icon } from '../../components/Icon';
import { Card } from '../../components/Card';
import { ACTIVITIES_LABELS } from '../../labels';

function Row({ title, detail, onClick, testId }: { title: string; detail: string; onClick: () => void; testId: string }) {
  return (
    <li>
      <button type="button" onClick={onClick} data-testid={testId} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-left active:bg-surface-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-base font-semibold">{title}</span>
          <span className="text-sm break-words text-muted">{detail}</span>
        </span>
        <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />
      </button>
    </li>
  );
}

/**
 * The Activities tab (U1). Its own set of activities (the gym, the doctor, nightlife, dating, the lottery, the casino,
 * shopping, vacations, the salon and hobbies) arrives with the Activities stage, so it opens on a "coming soon" card.
 * Until then it is also the home of the things that already exist and are about spending time: leisure and self, trips,
 * moving abroad, social media and the teen years.
 */
export function ActivitiesTab({ life }: { life: LifeState }) {
  const openPastimes = useAppStore((s) => s.openPastimes);
  const openTravel = useAppStore((s) => s.openTravel);
  const openMigration = useAppStore((s) => s.openMigration);
  const openSocial = useAppStore((s) => s.openSocial);
  const openTeen = useAppStore((s) => s.openTeen);
  const grown = life.character.age >= content.balance.immigration.minAge;
  const online = life.character.age >= 13;
  const teen = getTeenView(life, content);
  const teenTitle = teen.teen ? 'Teen years' : teen.license.stage !== 'licensed' && life.character.age >= 16 ? 'Driver’s license' : null;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-2 text-center" role="region" aria-labelledby="activities-soon" data-testid="activities-coming-soon">
        <Icon id="rocket" size={56} />
        <h2 id="activities-soon" className="font-display text-xl font-semibold">
          {ACTIVITIES_LABELS.soonTitle}
        </h2>
        <p className="text-muted">{ACTIVITIES_LABELS.soonBody}</p>
      </Card>
      <section aria-labelledby="activities-now" className="flex flex-col gap-2">
        <h2 id="activities-now" className="font-display text-lg font-semibold">
          {ACTIVITIES_LABELS.nowTitle}
        </h2>
        <ul className="flex flex-col gap-2" aria-label={ACTIVITIES_LABELS.nowTitle}>
          <Row title="Leisure and self" detail={ACTIVITIES_LABELS.pastimes} onClick={openPastimes} testId="activities-pastimes" />
          <Row title="Plan a trip" detail={ACTIVITIES_LABELS.travel} onClick={openTravel} testId="activities-travel" />
          {grown && <Row title="Move abroad and citizenship" detail={ACTIVITIES_LABELS.migration} onClick={openMigration} testId="activities-migration" />}
          {online && <Row title="Social media" detail={ACTIVITIES_LABELS.social} onClick={openSocial} testId="activities-social" />}
          {teenTitle && <Row title={teenTitle} detail={ACTIVITIES_LABELS.teen} onClick={openTeen} testId="activities-teen" />}
        </ul>
      </section>
    </div>
  );
}
