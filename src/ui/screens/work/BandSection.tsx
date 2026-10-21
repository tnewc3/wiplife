import { useState } from 'react';
import { content } from '../../../content';
import { bandNameSuggestion, parseTitle, type FameView } from '../../../engine/selectors';
import type { LifeState } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { StatBar } from '../../components/StatBar';
import { TextField } from '../../components/TextField';
import { BAND_BLOCK_LABELS, CHEMISTRY_WORDS, PAST_BAND_LABELS, skillWord, TITLE_ERROR } from '../../labels';

const SELECT = 'min-h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-base text-text';

/** How a bandmate feels about you, in words (from the relationship's affection). */
function feeling(affection: number): string {
  return affection >= 70 ? 'close to you' : affection >= 45 ? 'on good terms' : affection >= 25 ? 'cooling on you' : 'fed up with you';
}

/**
 * Batch 4: your band on the Fame screen. With none: form one (a name you
 * type, or a suggestion, and the part you play; auditions bring the rest),
 * or take up an offer from a band in your city. In one: its members, their
 * parts, how good they are and how they feel about you, its chemistry; as
 * its leader, rename it, ask a member to leave and recruit for an open part;
 * leave it, or go solo.
 */
export function BandSection({ life, view, disabled }: { life: LifeState; view: FameView; disabled: boolean }) {
  const act = useAppStore((s) => s.takeLifeAction);
  const busy = useAppStore((s) => s.aging);
  const [n, setN] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [part, setPart] = useState('');
  const [rename, setRename] = useState<string | null>(null);
  const [recruit, setRecruit] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'kick'; id: string; who: string } | { kind: 'leave'; solo: boolean } | null>(null);
  const band = view.band;
  const typed = name ?? bandNameSuggestion(life, n, content);
  const nameOk = parseTitle(typed) !== null;
  const renamed = rename ?? band?.name ?? '';
  const renameOk = parseTitle(renamed) !== null;
  const openPart = band?.openParts.find((p) => p.id === recruit) ?? band?.openParts[0];

  return (
    <section className="mt-5" aria-label="Your band" data-testid="band">
      <h3 className="text-base font-bold">Your band</h3>
      {band ? (
        <div className="mt-1 flex flex-col gap-2">
          <p className="font-semibold break-words" data-testid="band-name">
            {band.name}
          </p>
          <p className="text-sm text-muted">
            You play {band.part.toLowerCase()}. {band.leader ? 'You lead it.' : `${band.leaderName ?? 'Someone else'} leads it.`} Together since {band.since}.
          </p>
          <div>
            <StatBar label="Chemistry" value={band.chemistry} />
            <p className="text-sm" data-testid="band-chemistry">
              {CHEMISTRY_WORDS[band.chemistryBand]}
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-border" aria-label="Band members">
            {band.members.map((m) => (
              <li key={m.id} className="flex min-w-0 flex-col gap-1 py-2" data-testid="band-member">
                <span className="font-semibold break-words">
                  {m.name} <span className="font-normal text-muted">· {m.part}</span>
                </span>
                <span className="text-sm text-muted">
                  {skillWord(m.skill)} player, {feeling(m.affection)}.
                </span>
                {band.leader && (
                  <Button variant="ghost" disabled={disabled} onClick={() => setConfirm({ kind: 'kick', id: m.id, who: m.name })} data-testid={`kick-${m.id}`}>
                    Ask {m.name.split(' ')[0]} to leave
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {band.leader && (
            <>
              <TextField label="The band’s name" value={renamed} onChange={setRename} maxLength={60} error={renameOk ? undefined : TITLE_ERROR} data-testid="band-rename-input" />
              <Button
                variant="secondary"
                disabled={disabled || !renameOk || renamed.trim() === band.name}
                onClick={() => {
                  void act('rename_band', { bandName: renamed });
                  setRename(null);
                }}
                data-testid="band-rename"
              >
                Rename the band
              </Button>
              {band.openParts.length > 0 && openPart && (
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    Hold auditions for
                    <select className={SELECT} value={openPart.id} onChange={(e) => setRecruit(e.target.value)} data-testid="recruit-part">
                      {band.openParts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button variant="secondary" disabled={disabled} onClick={() => void act('recruit_member', { part: openPart.id })} data-testid="recruit">
                    Recruit someone new
                  </Button>
                </div>
              )}
            </>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={disabled} onClick={() => setConfirm({ kind: 'leave', solo: false })} data-testid="band-leave">
              Leave the band
            </Button>
            <Button variant="ghost" className="flex-1" disabled={disabled} onClick={() => setConfirm({ kind: 'leave', solo: true })} data-testid="band-solo">
              Go solo
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-2">
          <p className="text-muted">You perform on your own.</p>
          {view.offers.length > 0 && (
            <ul className="flex flex-col divide-y divide-border" aria-label="Bands that want you">
              {view.offers.map((o, i) => (
                <li key={o.name} className="flex min-w-0 flex-col gap-1 py-2" data-testid="band-offer">
                  <span className="font-semibold break-words">{o.name}</span>
                  <span className="text-sm text-muted">
                    A {o.genre.toLowerCase()} band of {o.size} that wants you on {o.part.toLowerCase()}. Good until the new year.
                  </span>
                  <Button variant="secondary" disabled={disabled || view.formBlock !== null} onClick={() => void act('join_band', { offer: i })} data-testid={`join-band-${i}`}>
                    Join them
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {view.formBlock !== null ? (
            <p className="text-sm text-muted">{BAND_BLOCK_LABELS[view.formBlock]}</p>
          ) : (
            <>
              <TextField label="Name your band" value={typed} onChange={setName} maxLength={60} error={nameOk ? undefined : TITLE_ERROR} hint="Type your own, or take a suggestion." data-testid="band-name-input" />
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setName(null);
                  setN((x) => x + 1);
                }}
                data-testid="band-name-suggest"
              >
                Suggest another name
              </Button>
              {view.parts.length > 0 && (
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  Your part
                  <select className={SELECT} value={part || view.parts[0]!.id} onChange={(e) => setPart(e.target.value)} data-testid="band-part">
                    {view.parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Button
                disabled={disabled || !nameOk}
                onClick={() => {
                  void act('form_band', { bandName: typed, ...(part || view.parts[0] ? { part: part || view.parts[0]!.id } : {}) });
                  setName(null);
                }}
                data-testid="band-form"
              >
                Hold auditions and form it
              </Button>
            </>
          )}
        </div>
      )}
      {view.pastBands.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-muted" aria-label="Bands you were in">
          {view.pastBands.map((b, i) => (
            <li key={i} className="break-words">
              {b.name}, {b.from}–{b.to}: {PAST_BAND_LABELS[b.how]}.
            </li>
          ))}
        </ul>
      )}
      <ConfirmSheet
        open={confirm?.kind === 'kick'}
        title="Ask them to leave?"
        body={confirm?.kind === 'kick' ? `${confirm.who} will take it hard. The band will feel it, for better or worse.` : ''}
        confirmLabel="Ask them to leave"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'kick') void act('kick_member', { personId: confirm.id });
          setConfirm(null);
        }}
      />
      <ConfirmSheet
        open={confirm?.kind === 'leave'}
        title={confirm?.kind === 'leave' && confirm.solo ? 'Go solo?' : 'Leave the band?'}
        body={
          confirm?.kind === 'leave' && confirm.solo
            ? 'Most of the fans come with you; your bandmates will not forget it.'
            : band?.leader
              ? 'It is your band: without you, it ends. Some fans will drift off with it.'
              : 'Some fans will stay with the band. Your bandmates will be sorry to see you go.'
        }
        confirmLabel={confirm?.kind === 'leave' && confirm.solo ? 'Go solo' : 'Leave'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'leave') void act('leave_band', { solo: confirm.solo });
          setConfirm(null);
        }}
      />
    </section>
  );
}
