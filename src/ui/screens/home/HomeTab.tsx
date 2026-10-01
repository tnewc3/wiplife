import { content } from '../../../content';
import { getCharacterSummary, getFamily, getHistoryFeed, getYearRecap } from '../../../engine/selectors';
import type { LifeState, Stats } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { StatBar } from '../../components/StatBar';
import { YearRecapList } from '../../components/YearRecapList';
import {
  ageLabel,
  HOUSING_LABELS,
  LIFE_STAGE_LABELS,
  memberAgeLabel,
  money,
  relativeLabel,
  romanceLine,
  schoolStatusLine,
  STAT_LABELS,
  timelineAgeLabel,
} from '../../labels';

/** How many recent history entries the Home feed shows. */
const FEED_LENGTH = 12;

/** A short summary of the year just lived. */
function YearRecapCard({ life }: { life: LifeState }) {
  const recap = getYearRecap(life, content);
  if (!recap) return null;
  return (
    <Card aria-labelledby="recap-title" role="region">
      <h3 id="recap-title" className="text-lg font-bold">
        {recap.year} · {ageLabel(recap.age)}
      </h3>
      <YearRecapList recap={recap} />
    </Card>
  );
}

/** The most recent moments of this life, newest first. */
function StoryFeed({ life }: { life: LifeState }) {
  const openLifeHistory = useAppStore((s) => s.openLifeHistory);
  const feed = getHistoryFeed(life, FEED_LENGTH);
  return (
    <Card>
      <h3 className="mb-2 text-lg font-bold">Your story</h3>
      {feed.length === 0 ? (
        <p className="text-muted">Your story starts here.</p>
      ) : (
        <>
          <ol aria-label="Your story" className="flex flex-col divide-y divide-border">
            {feed.map((e, i) => (
              <li key={i} className="flex min-w-0 flex-col py-2">
                <span className="text-sm text-muted">
                  {timelineAgeLabel(e.age)} · {e.year}
                </span>
                <span className="break-words [overflow-wrap:anywhere]">{e.text}</span>
              </li>
            ))}
          </ol>
          <Button variant="ghost" block className="mt-2" onClick={openLifeHistory}>
            See your whole life
          </Button>
        </>
      )}
    </Card>
  );
}

/** The Life tab: who you are, how you're doing, your family and your story. */
export function HomeTab({ life }: { life: LifeState }) {
  const summary = getCharacterSummary(life, content);
  const family = getFamily(life);
  const love = romanceLine(summary.romance.status, summary.romance.partnerName);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-2xl leading-tight font-bold break-words [overflow-wrap:anywhere]" data-testid="character-name">
          {summary.fullName}
        </h2>
        <p className="mt-1 break-words text-muted [overflow-wrap:anywhere]">
          {ageLabel(summary.age)} · {summary.cityName} · {summary.pronounLabel}
        </p>
        <p className="mt-1 text-sm text-muted">
          {LIFE_STAGE_LABELS[summary.lifeStage]} · {HOUSING_LABELS[summary.housing]}
        </p>
        {summary.school && (
          <p className="mt-1 text-sm break-words text-muted [overflow-wrap:anywhere]" data-testid="school-line">
            {schoolStatusLine(summary.school)}
          </p>
        )}
        <p className="mt-1 text-sm text-muted" data-testid="money-line">
          Savings {money(summary.savings)}
          {summary.debt > 0 && ` · Debt ${money(summary.debt)}`}
        </p>
        {love && (
          <p className="mt-1 text-sm break-words text-muted [overflow-wrap:anywhere]" data-testid="romance-line">
            {love}
          </p>
        )}
      </Card>

      <YearRecapCard life={life} />

      <Card>
        <h3 className="sr-only">Stats</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3" aria-label="Stats" role="group">
          {(Object.keys(STAT_LABELS) as (keyof Stats)[]).map((key) => (
            <StatBar key={key} label={STAT_LABELS[key]} value={life.character.stats[key]} />
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-bold">Family</h3>
        {family.length === 0 ? (
          <p className="text-muted">No family.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border" aria-label="Family">
            {family.map((member) => (
              <li key={member.person.id} className="flex min-w-0 flex-col py-2">
                <span className="font-semibold break-words [overflow-wrap:anywhere]">
                  {member.person.name.first} {member.person.name.last}
                </span>
                <span className="text-sm text-muted">
                  {relativeLabel(member)} · {memberAgeLabel(member)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <StoryFeed life={life} />
    </div>
  );
}
