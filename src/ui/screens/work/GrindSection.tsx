import { useState } from 'react';
import type { FameView } from '../../../engine/selectors';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { StatBar } from '../../components/StatBar';
import { money, PRACTICE_BLOCK_LABELS, SHOW_BLOCK_LABELS, SHOW_OUTCOME_LABELS, skillWord, TOUR_BLOCK_LABELS } from '../../labels';

const SELECT = 'min-h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-base text-text';

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <section className="mt-5" aria-label={title} data-testid={testId}>
      <h3 className="text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Batch 4: the grind on the Fame screen: your sound (your main genre), shows
 * (up to a number a year, with what a good night pays) and a tour (one a year,
 * with its cost and takings), and practice (a yearly number of sessions; each
 * one raises a skill, by less as it grows). Money goes through the yearly ledger.
 */
export function GrindSection({ view, disabled }: { view: FameView; disabled: boolean }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const main = view.paths[0];
  const [genre, setGenre] = useState('');
  const [instrument, setInstrument] = useState('');
  if (!main) return null;
  const pickedGenre = genre || main.genre?.id || main.genres[0]?.id || '';
  const pickedInstrument = instrument || view.instrument?.id || view.instruments[0]?.id || '';
  const far = main.genres.find((g) => g.id === pickedGenre)?.distance ?? 0;
  const shows = view.shows;
  return (
    <>
      {main.genres.length > 0 && (
        <Section title="Your sound" testId="sound">
          <p className="mt-1" data-testid="sound-genre">
            {main.genre ? `You make ${main.genre.name.toLowerCase()}.` : 'You have not settled on a sound yet.'}
          </p>
          <label className="mt-2 flex flex-col gap-1 text-sm font-semibold">
            Genre
            <select className={SELECT} value={pickedGenre} onChange={(e) => setGenre(e.target.value)} data-testid="sound-select">
              {main.genres.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {main.genre && pickedGenre !== main.genre.id && (
            <p className="mt-1 text-sm text-muted">{far >= 0.5 ? 'A long way from your sound: some fans will not follow you.' : 'Close to your sound: most fans will come along.'}</p>
          )}
          <Button variant="secondary" className="mt-2" block disabled={disabled || pickedGenre === main.genre?.id} onClick={() => void act('set_genre', { pathId: main.id, genreId: pickedGenre })} data-testid="sound-set">
            {main.genre ? 'Change your sound' : 'Make it your sound'}
          </Button>
        </Section>
      )}

      <Section title="Shows and tours" testId="shows">
        {shows.venue ? (
          <>
            <p className="mt-1">
              {shows.venue.label}: {shows.venue.blurb}
            </p>
            <p className="text-sm text-muted" data-testid="shows-count">
              {shows.played} of {shows.max} shows this year. A good night pays about {money(shows.pay)}, through your yearly ledger.
            </p>
            <Button className="mt-2" block disabled={disabled || shows.block !== null} onClick={() => void act('play_show')} data-testid="play-show">
              Play a show
            </Button>
            {shows.block !== null && shows.block !== 'path' && <p className="text-sm text-muted">{SHOW_BLOCK_LABELS[shows.block]}</p>}
            {shows.last && (
              <p className="mt-1 text-sm" data-testid="show-result">
                {SHOW_OUTCOME_LABELS[shows.last.outcome]} at {shows.last.venue.toLowerCase()}: about {shows.last.fans.toLocaleString('en-US')} new fans, and {money(shows.last.pay)} to come in your yearly ledger
                {shows.owed > shows.last.pay ? ` (${money(shows.owed)} from this year’s shows in all)` : ''}.
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-muted">No shows in this line of work.</p>
        )}
        {view.tour ? (
          <div className="mt-3" data-testid="tour-booked">
            <p>
              Booked: {view.tour.noun}, on the road as the year begins. It costs {money(view.tour.cost)} to put on, charged in your yearly ledger.
            </p>
            <Button variant="ghost" disabled={disabled} onClick={() => void act('cancel_tour')} data-testid="tour-cancel">
              Call it off
            </Button>
          </div>
        ) : main.tourQuote ? (
          <div className="mt-3">
            <p data-testid="tour-quote">
              {main.tourQuote.noun[0]!.toUpperCase() + main.tourQuote.noun.slice(1)}: costs about {money(main.tourQuote.cost)} to put on and should bring in about {money(main.tourQuote.revenue)}, both through your yearly ledger. Fame, fans and a hard year.
            </p>
            <Button variant="secondary" block className="mt-2" disabled={disabled || main.tourBlock !== null} onClick={() => void act('book_tour', { pathId: main.id })} data-testid="tour-book">
              {main.tour.label}
            </Button>
            {main.tourBlock !== null && main.tourBlock !== 'path' && <p className="text-sm text-muted">{TOUR_BLOCK_LABELS[main.tourBlock]}</p>}
          </div>
        ) : null}
      </Section>

      {main.skills.length > 0 && (
        <Section title="Practice" testId="practice">
          <p className="mt-1 text-sm text-muted" data-testid="practice-count">
            {view.practice.used} of {view.practice.budget} practice sessions this year. Each one helps a little less than the last, and practice alone only takes you so far.
          </p>
          {view.instruments.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Your instrument
                <select className={SELECT} value={pickedInstrument} onChange={(e) => setInstrument(e.target.value)} data-testid="instrument-select">
                  {view.instruments.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </label>
              {pickedInstrument !== view.instrument?.id && (
                <Button variant="secondary" disabled={disabled} onClick={() => void act('set_instrument', { instrumentId: pickedInstrument })} data-testid="instrument-set">
                  {view.instrument ? 'Switch instruments' : 'Take it up'}
                </Button>
              )}
            </div>
          )}
          <ul className="mt-2 flex flex-col gap-3" aria-label="Skills">
            {main.skills.map((sk) => (
              <li key={sk.id} className="flex min-w-0 flex-col gap-1" data-testid={`skill-${sk.id}`}>
                <StatBar label={sk.instrument && view.instrument ? view.instrument.label : sk.label} value={sk.level} />
                <span className="text-sm text-muted">
                  {skillWord(sk.level)}. {sk.blurb}
                </span>
                <Button variant="secondary" disabled={disabled || sk.block !== null} onClick={() => void act('practice', { pathId: main.id, skillId: sk.id })} data-testid={`practise-${sk.id}`}>
                  Practise
                </Button>
                {sk.block !== null && sk.block !== 'budget' && <span className="text-sm text-muted">{PRACTICE_BLOCK_LABELS[sk.block]}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
