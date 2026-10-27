import { useEffect, useRef } from 'react';
import { content } from '../../../content';
import { getFamilyView, getLaterView, getNews, getPreviously, getYearRecap } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { YearRecapList } from '../../components/YearRecapList';
import { ageLabel, NEWS_TITLE, PROCESS_LABELS, pregnancyLine, TABLOID_TITLE } from '../../labels';
import { LifeLog } from './LifeLog';

/**
 * A short summary of the year just lived: what changed in your stats, the memories made and the people met (the year's
 * lines are in the log above, so they are not repeated). A quiet year, which opens no card, shows its recap only here.
 */
function YearRecapCard({ life }: { life: LifeState }) {
  const recap = getYearRecap(life, content);
  if (!recap) return null;
  return (
    <Card aria-labelledby="recap-title" role="region">
      <h3 id="recap-title" className="text-lg font-bold">
        {recap.year} · {ageLabel(recap.age)}
      </h3>
      <YearRecapList recap={{ ...recap, entries: [], money: null }} />
    </Card>
  );
}

/** E3: the newest news from the people you know. */
function NewsCard({ life }: { life: LifeState }) {
  const news = getNews(life);
  if (!news) return null;
  return (
    <Card role="region" aria-labelledby="news-title" data-testid="news-card">
      <h3 id="news-title" className="text-lg font-bold">
        {NEWS_TITLE}
      </h3>
      <p className="text-sm text-muted">{news.year}</p>
      <ul className="mt-2 flex flex-col gap-2" aria-label={NEWS_TITLE}>
        {news.items.map((item, i) => (
          <li key={i} className="break-words [overflow-wrap:anywhere]" data-testid={item.tabloid ? 'tabloid-headline' : undefined}>
            {item.tabloid && <span className="font-semibold">{TABLOID_TITLE}: </span>}
            {item.text}
          </li>
        ))}
      </ul>
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

/** L1: care to arrange, or a death coming: the card that says what to do about it. */
function LaterCard({ life }: { life: LifeState }) {
  const view = getLaterView(life, content);
  const openLater = useAppStore((s) => s.openLater);
  const openWill = useAppStore((s) => s.openWill);
  const t = view.terminal;
  const careOpen = view.care !== null && view.care.option === null;
  if (!t && !careOpen) return null;
  return (
    <Card role="region" aria-labelledby="later-card-title" data-testid="later-card">
      <h3 id="later-card-title" className="text-lg font-bold">
        {t ? 'Put your affairs in order' : 'You need looking after'}
      </h3>
      <p className="mt-1 text-muted">
        {t
          ? t.wishesSet
            ? 'Your final wishes are set. You can change them while there is time.'
            : 'Choose where you spend your last months, who is with you and what comes after.'
          : 'Someone has to help. Choose how: family, a paid carer, or assisted living.'}
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <Button variant="secondary" block onClick={openLater} data-testid="later-card-open">
          {t ? 'Final wishes' : 'Arrange care'}
        </Button>
        {t && (view.willOutOfDate || !view.hasWill) && (
          <Button variant="secondary" block onClick={openWill} data-testid="later-card-will">
            {view.hasWill ? 'Update your will' : 'Write your will'}
          </Button>
        )}
      </div>
    </Card>
  );
}

/** A pregnancy or a family process (adoption, IVF, surrogacy) under way. */
function ExpectingCard({ life }: { life: LifeState }) {
  const familyView = getFamilyView(life, content);
  if (!familyView.pregnancy && !familyView.process) return null;
  return (
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
  );
}

/**
 * Home (U1): the life log, then whatever needs your attention now (an heir's "Previously", a pregnancy or process under
 * way, care or final wishes to arrange, news from your people). The page stays scrolled to the newest line.
 */
export function HomeTab({ life }: { life: LifeState }) {
  const end = useRef<HTMLDivElement>(null);
  const size = life.history.length;
  // Stay at the newest line: on arrival at Home, and as the story grows.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    end.current?.scrollIntoView({ block: 'end', behavior: reduce ? 'auto' : 'smooth' });
    // Years drawn for the first time can be taller than the space kept for them (content-visibility): keep settling at the end for a few frames.
    let frame = 0;
    let left = 8;
    const pin = () => {
      end.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
      if (--left > 0) frame = requestAnimationFrame(pin);
    };
    frame = requestAnimationFrame(pin);
    return () => cancelAnimationFrame(frame);
  }, [size, life.currentYear, life.phase]);

  return (
    <div className="flex flex-col gap-4">
      <LifeLog life={life} />
      <PreviouslyCard life={life} />
      <ExpectingCard life={life} />
      <LaterCard life={life} />
      <YearRecapCard life={life} />
      <NewsCard life={life} />
      <div ref={end} aria-hidden="true" className="h-px" />
    </div>
  );
}
