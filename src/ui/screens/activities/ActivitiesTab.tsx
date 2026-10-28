import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { content } from '../../../content';
import { getActivityTabView, getTeenView, type ActivityHubView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Icon } from '../../components/Icon';
import { ACTIVITIES_LABELS, ACTIVITY_TAB_LABELS, HUB_BLOCK_WORDS } from '../../labels';

function Row({ title, detail, onClick, testId, icon, muted, ariaDisabled }: { title: string; detail: string; onClick: () => void; testId: string; icon?: string; muted?: boolean; ariaDisabled?: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        aria-disabled={ariaDisabled ? true : undefined}
        className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2 text-left active:bg-surface-2 ${muted ? 'opacity-60' : ''}`}
      >
        {icon && <Icon id={icon} size={32} />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-base font-semibold">{title}</span>
          <span className="text-sm break-words text-muted">{detail}</span>
        </span>
        <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />
      </button>
    </li>
  );
}

/** Why an activity is greyed out. */
function blockWords(block: NonNullable<ActivityHubView['block']>): string {
  if (block.reason === 'age') return HUB_BLOCK_WORDS.age(block.minAge);
  return HUB_BLOCK_WORDS[block.reason];
}

/**
 * The Activities tab (A1): the groups (Mind & body, Social, Money & luck, Leisure) and the activities in them. An activity you
 * can't do yet is greyed out, and tapping it says why. Tapping one that is open opens its sheet of options. Below them are the
 * other things that are about spending time: the rest of the leisure list, moving abroad, social media and the teen years.
 */
export function ActivitiesTab({ life }: { life: LifeState }) {
  const openActivity = useAppStore((s) => s.openActivity);
  const modelConnected = useAppStore((s) => s.modelConnected);
  const openPastimes = useAppStore((s) => s.openPastimes);
  const openTravel = useAppStore((s) => s.openTravel);
  const openMigration = useAppStore((s) => s.openMigration);
  const openSocial = useAppStore((s) => s.openSocial);
  const openTeen = useAppStore((s) => s.openTeen);
  const [explain, setExplain] = useState<string | null>(null);
  const view = getActivityTabView(life, content);
  const grown = life.character.age >= content.balance.immigration.minAge;
  const online = life.character.age >= 13;
  const teen = getTeenView(life, content);
  const teenTitle = teen.teen ? 'Teen years' : teen.license.stage !== 'licensed' && life.character.age >= 16 ? 'Driver’s license' : null;

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-xl font-semibold">{ACTIVITY_TAB_LABELS.title}</h2>
      {!view.canAct && <p className="text-sm text-muted">{HUB_BLOCK_WORDS.busy}</p>}
      {view.groups.map((group) => {
        // "Do your own thing" is on the tab only when a model is connected (X1).
        const activities = group.activities.filter((a) => a.kind !== 'own_thing' || modelConnected);
        if (activities.length === 0) return null;
        return (
          <section key={group.id} aria-labelledby={`activities-group-${group.id}`} className="flex flex-col gap-2" data-testid={`activities-group-${group.id}`}>
            <h3 id={`activities-group-${group.id}`} className="font-display text-lg font-semibold">
              {group.label}
            </h3>
            <ul className="flex flex-col gap-2" aria-label={group.label}>
              {activities.map((a) => (
                <ActivityRow key={a.id} a={a} explaining={explain === a.id} onOpen={() => (a.block ? setExplain(explain === a.id ? null : a.id) : openActivity(a.id))} />
              ))}
            </ul>
          </section>
        );
      })}

      <section aria-labelledby="activities-more" className="flex flex-col gap-2">
        <h3 id="activities-more" className="font-display text-lg font-semibold">
          {ACTIVITY_TAB_LABELS.more}
        </h3>
        <ul className="flex flex-col gap-2" aria-label={ACTIVITY_TAB_LABELS.more}>
          <Row title="Everything else" detail={ACTIVITY_TAB_LABELS.moreBody} onClick={openPastimes} testId="activities-pastimes" />
          <Row title="Plan a trip" detail={ACTIVITIES_LABELS.travel} onClick={openTravel} testId="activities-travel" />
          {grown && <Row title="Move abroad and citizenship" detail={ACTIVITIES_LABELS.migration} onClick={openMigration} testId="activities-migration" />}
          {online && <Row title="Social media" detail={ACTIVITIES_LABELS.social} onClick={openSocial} testId="activities-social" />}
          {teenTitle && <Row title={teenTitle} detail={ACTIVITIES_LABELS.teen} onClick={openTeen} testId="activities-teen" />}
        </ul>
      </section>
    </div>
  );
}

function ActivityRow({ a, explaining, onOpen }: { a: ActivityHubView; explaining: boolean; onOpen: () => void }) {
  const detail = a.kind === 'options' || a.kind === 'vacation' || a.kind === 'hobbies' ? (a.count > 0 ? `${a.subtitle} ${ACTIVITY_TAB_LABELS.doneThisYear(a.count, a.limit)}` : a.subtitle) : a.subtitle;
  return (
    <>
      <Row title={a.label} detail={detail} onClick={onOpen} testId={`activity-hub-${a.id}`} icon={a.icon} muted={a.block !== null} ariaDisabled={a.block !== null} />
      {explaining && a.block && (
        <li className="px-2 text-sm" data-testid={`activity-hub-why-${a.id}`} role="status">
          {blockWords(a.block)}
        </li>
      )}
    </>
  );
}
