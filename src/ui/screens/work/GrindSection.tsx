import { useState } from 'react';
import type { FameView } from '../../../engine/selectors';
import { useAppStore } from '../../../store/appStore';
import { EmptyState } from '../../components/EmptyState';
import { FactChip } from '../../components/FactChip';
import { ListRow, RowList } from '../../components/ListRow';
import { MiniBar } from '../../components/MiniBar';
import { OptionCard, OptionPickerSheet } from '../../components/OptionPickerSheet';
import { CompactList, CompactRow, SectionLabel } from '../../components/SectionLabel';
import { money, PRACTICE_BLOCK_LABELS, SHOW_BLOCK_LABELS, SHOW_OUTCOME_LABELS, skillWord, TOUR_BLOCK_LABELS } from '../../labels';

/**
 * Batch 4, rebuilt in U3: the grind of a fame path: shows and the tour, your sound, and practice. Rows and option pickers; the
 * genre and the instrument are chosen from a picker sheet, never a dropdown. Money goes through the yearly ledger.
 */
export function GrindSection({ view, disabled }: { view: FameView; disabled: boolean }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const main = view.paths[0];
  const [picker, setPicker] = useState<'genre' | 'instrument' | null>(null);
  if (!main) return null;
  const shows = view.shows;
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Shows and tours</SectionLabel>
      <CompactList label="Shows and tours">
        {shows.venue ? (
          <>
            <CompactRow label={`${shows.venue.label}`} value={`${shows.played} of ${shows.max}`} testId="shows-count" />
            <CompactRow label="A good night pays about" value={money(shows.pay)} />
            {shows.block !== null && shows.block !== 'path' && <CompactRow muted label={SHOW_BLOCK_LABELS[shows.block]} />}
            {shows.last && (
              <CompactRow
                testId="show-result"
                label={`${SHOW_OUTCOME_LABELS[shows.last.outcome]} at ${shows.last.venue.toLowerCase()}: about ${shows.last.fans.toLocaleString('en-US')} new fans`}
                value={`+${money(shows.last.pay)}`}
              />
            )}
          </>
        ) : (
          <CompactRow muted label="No shows in this line of work." />
        )}
        {view.tour ? (
          <CompactRow testId="tour-booked" label={`Booked: ${view.tour.noun}, costs ${money(view.tour.cost)}`} value="Call off" onClick={disabled ? undefined : () => void act('cancel_tour')} />
        ) : main.tourQuote ? (
          <CompactRow
            testId="tour-quote"
            label={`${main.tour.label}: costs about ${money(main.tourQuote.cost)}, brings about ${money(main.tourQuote.revenue)}`}
            value={main.tourBlock !== null && main.tourBlock !== 'path' ? TOUR_BLOCK_LABELS[main.tourBlock] : 'Book'}
            onClick={disabled || main.tourBlock !== null ? undefined : () => void act('book_tour', { pathId: main.id })}
          />
        ) : null}
      </CompactList>
      {view.tour && <span className="sr-only" data-testid="tour-cancel" />}
      {main.tourQuote && !view.tour && <span className="sr-only" data-testid="tour-book" />}

      {main.genres.length > 0 && (
        <>
          <SectionLabel>Your sound</SectionLabel>
          <CompactList label="Your sound">
            <CompactRow testId="sound-genre" label={main.genre ? `You make ${main.genre.name.toLowerCase()}.` : 'You have not settled on a sound yet.'} value="Change" onClick={disabled ? undefined : () => setPicker('genre')} />
          </CompactList>
        </>
      )}

      {main.skills.length > 0 && (
        <div className="flex flex-col gap-3" data-testid="practice">
          <span className="sr-only" data-testid="practice-count">
            {view.practice.used} of {view.practice.budget} practice sessions this year
          </span>
          <SectionLabel trailing={`${view.practice.used} of ${view.practice.budget}`}>Practice</SectionLabel>
          {view.instruments.length > 0 && (
            <CompactList label="Instrument">
              <CompactRow testId="instrument-line" label={view.instrument ? `Your instrument: ${view.instrument.label}` : 'You have no instrument yet'} value={view.instrument ? 'Switch' : 'Take it up'} onClick={disabled ? undefined : () => setPicker('instrument')} />
            </CompactList>
          )}
          <RowList label="Skills">
            {main.skills.map((sk) => (
              <ListRow
                key={sk.id}
                title={sk.instrument && view.instrument ? view.instrument.label : sk.label}
                subtitle={sk.block !== null && sk.block !== 'budget' ? PRACTICE_BLOCK_LABELS[sk.block] : `${skillWord(sk.level)} · tap to practise`}
                value={<MiniBar label={sk.label} value={sk.level} />}
                ending="chevron"
                muted={disabled || sk.block !== null}
                onClick={disabled || sk.block !== null ? undefined : () => void act('practice', { pathId: main.id, skillId: sk.id })}
                testId={`practise-${sk.id}`}
              />
            ))}
          </RowList>
        </div>
      )}
      {main.skills.length === 0 && !shows.venue && !main.tourQuote && <EmptyState text="Nothing to practise here yet." />}

      <OptionPickerSheet open={picker === 'genre'} title="Your sound" icon="musical_note" line={main.genre ? `Now: ${main.genre.name}` : undefined} onClose={() => setPicker(null)} testId="sound-picker">
        {main.genres.map((g) => (
          <OptionCard
            key={g.id}
            name={g.name}
            chips={g.distance !== undefined && main.genre && g.id !== main.genre.id ? <FactChip>{g.distance >= 0.5 ? 'Far from your sound' : 'Close to your sound'}</FactChip> : undefined}
            reason={main.genre?.id === g.id ? 'Now' : undefined}
            testId={`sound-${g.id}`}
            onClick={() => {
              setPicker(null);
              void act('set_genre', { pathId: main.id, genreId: g.id });
            }}
          />
        ))}
      </OptionPickerSheet>
      <OptionPickerSheet open={picker === 'instrument'} title="Your instrument" icon="guitar" onClose={() => setPicker(null)} testId="instrument-picker">
        {view.instruments.map((i) => (
          <OptionCard
            key={i.id}
            name={i.label}
            reason={view.instrument?.id === i.id ? 'Now' : undefined}
            testId={`instrument-${i.id}`}
            onClick={() => {
              setPicker(null);
              void act('set_instrument', { instrumentId: i.id });
            }}
          />
        ))}
      </OptionPickerSheet>
    </div>
  );
}
