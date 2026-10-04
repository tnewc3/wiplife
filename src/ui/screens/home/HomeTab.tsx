import { useState } from 'react';
import { content } from '../../../content';
import { getCharacterSummary, getFamilyView, getFamily, getHistoryFeed, getPreviously, getYearRecap } from '../../../engine/selectors';
import type { LifeState, Stats } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { StatBar } from '../../components/StatBar';
import { YearRecapList } from '../../components/YearRecapList';
import { ProfileSheet } from './ProfileSheet';
import {
  ageLabel,
  guardianHousingLine,
  HOUSING_LABELS,
  jobLine,
  LIFE_STAGE_LABELS,
  memberAgeLabel,
  money,
  PROCESS_LABELS,
  pregnancyLine,
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

/** E2b: the card an heir's life starts with, until their first year begins. */
function PreviouslyCard({ life }: { life: LifeState }) {
  const previously = getPreviously(life);
  if (!previously) return null;
  return (
    <Card role="region" aria-labelledby="previously-title" data-testid="previously-card">
      <h3 id="previously-title" className="text-lg font-bold">
        Previously
      </h3>
      <p className="mt-1 text-sm text-muted">The life of {previously.parentName}, and what it left you.</p>
      <ul className="mt-2 flex flex-col gap-2" aria-label="Previously">
        {previously.lines.map((line, i) => (
          <li key={i} className="break-words [overflow-wrap:anywhere]">
            {line}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The Life tab: who you are, how you're doing, your family and your story. */
export function HomeTab({ life }: { life: LifeState }) {
  const summary = getCharacterSummary(life, content);
  const family = getFamily(life);
  const love = romanceLine(summary.romance.status, summary.romance.partnerName);
  const [profileOpen, setProfileOpen] = useState(false);
  const familyView = getFamilyView(life, content);

  return (
    <div className="flex flex-col gap-4">
      <PreviouslyCard life={life} />
      <Card>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-2xl leading-tight font-bold break-words [overflow-wrap:anywhere]" data-testid="character-name">
            {summary.fullName}
          </h2>
          <Button variant="secondary" className="shrink-0" onClick={() => setProfileOpen(true)}>
            Profile
          </Button>
        </div>
        <p className="mt-1 break-words text-muted [overflow-wrap:anywhere]">
          {ageLabel(summary.age)} · {summary.cityName} · {summary.pronounLabel}
        </p>
        <p className="mt-1 text-sm text-muted">
          {LIFE_STAGE_LABELS[summary.lifeStage]} · {summary.guardian ? guardianHousingLine(summary.guardian, summary.cityName) : HOUSING_LABELS[summary.housing]}
        </p>
        {summary.school && (
          <p className="mt-1 text-sm break-words text-muted [overflow-wrap:anywhere]" data-testid="school-line">
            {schoolStatusLine(summary.school)}
          </p>
        )}
        {(summary.job || summary.retired) && (
          <p className="mt-1 text-sm break-words text-muted [overflow-wrap:anywhere]" data-testid="job-line">
            {summary.job ? jobLine(summary.job.title, summary.job.employer) : 'Retired'}
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

      {(familyView.pregnancy || familyView.process) && (
        <Card role="region" aria-labelledby="expecting-title">
          <h3 id="expecting-title" className="text-lg font-bold">
            {familyView.pregnancy ? 'Expecting' : PROCESS_LABELS[familyView.process!.kind].name}
          </h3>
          <p className="mt-1 break-words" data-testid="pregnancy-line">
            {familyView.pregnancy
              ? pregnancyLine(familyView.pregnancy, life.currentYear)
              : familyView.process!.yearsLeft <= 0
                ? 'An answer is due any day now.'
                : familyView.process!.yearsLeft === 1
                  ? 'In progress. An answer is due next year.'
                  : `In progress. An answer is due in ${familyView.process!.yearsLeft} years.`}
          </p>
        </Card>
      )}

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
      <ProfileSheet life={life} open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
