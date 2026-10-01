import { useId, useMemo, useState, type ReactNode } from 'react';
import { content } from '../../../content';
import { LIFE_STAGE_IDS } from '../../../content/schemas';
import { previewEvent, sandboxOutcome, type SandboxPreview } from '../../../engine/sandbox';
import type { Personality, Stats } from '../../../engine/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { LIFE_STAGE_LABELS, STAT_LABELS, TRAIT_LABELS } from '../../labels';

/**
 * Event sandbox (Stage 10): a development-only screen that previews any event
 * with any cast, pronoun set and character state. It builds a throwaway life
 * through the engine (src/engine/sandbox.ts) and never touches the saved one.
 * Open it with `?sandbox` in a development or test build.
 */
const SELECT = 'min-h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-base text-text';

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        {children}
      </select>
    </div>
  );
}

const STAT_KEYS = Object.keys(STAT_LABELS) as (keyof Stats)[];
const TRAIT_KEYS = Object.keys(TRAIT_LABELS) as (keyof Personality)[];

export function EventSandboxScreen() {
  const events = useMemo(() => Object.values(content.events).sort((a, b) => (a.id < b.id ? -1 : 1)), []);
  const pronounIds = Object.keys(content.pronouns).sort();
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [seed, setSeed] = useState('sandbox');
  const [age, setAge] = useState('30');
  const [selfPronouns, setSelfPronouns] = useState('they_them');
  const [castPronouns, setCastPronouns] = useState('she_her');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<{ key: string; text: string } | null>(null);

  const numbers = (keys: string[]) =>
    Object.fromEntries(keys.flatMap((k) => (scores[k] !== undefined && scores[k] !== '' && Number.isFinite(Number(scores[k])) ? [[k, Number(scores[k])]] : [])));
  const ageNumber = Number.isFinite(Number(age)) && age !== '' ? Number(age) : 30;
  const key = JSON.stringify([eventId, seed, ageNumber, selfPronouns, castPronouns, scores]);

  let preview: SandboxPreview | null = null;
  let error: string | null = null;
  try {
    preview = previewEvent(content, {
      eventId,
      seed: seed || 'sandbox',
      age: ageNumber,
      selfPronouns,
      castPronouns,
      stats: numbers(STAT_KEYS),
      personality: numbers(TRAIT_KEYS),
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const choose = (choiceId: string) => {
    if (!preview) return;
    try {
      setOutcome({ key, text: sandboxOutcome(preview, choiceId, content) || '(no outcome text)' });
    } catch (err) {
      setOutcome({ key, text: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  };
  const shownOutcome = outcome?.key === key ? outcome.text : null;

  return (
    <Screen title="Event sandbox">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <Select label="Event" value={eventId} onChange={setEventId}>
            {LIFE_STAGE_IDS.map((stage) => (
              <optgroup key={stage} label={LIFE_STAGE_LABELS[stage]}>
                {events
                  .filter((e) => e.lifeStages[0] === stage)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id}
                      {e.rarity === 'legendary' ? ' ★' : ''}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Age" value={age} onChange={setAge} inputMode="numeric" />
            <TextField label="Seed" value={seed} onChange={setSeed} autoCapitalize="off" />
            <Select label="Your pronouns" value={selfPronouns} onChange={setSelfPronouns}>
              {pronounIds.map((id) => (
                <option key={id} value={id}>
                  {content.pronouns[id]!.label}
                </option>
              ))}
            </Select>
            <Select label="Cast pronouns" value={castPronouns} onChange={setCastPronouns}>
              {pronounIds.map((id) => (
                <option key={id} value={id}>
                  {content.pronouns[id]!.label}
                </option>
              ))}
            </Select>
          </div>
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Stats and personality</summary>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {[...STAT_KEYS.map((k) => [k, STAT_LABELS[k]] as const), ...TRAIT_KEYS.map((k) => [k, TRAIT_LABELS[k]] as const)].map(([k, label]) => (
                <TextField
                  key={k}
                  label={label}
                  value={scores[k] ?? ''}
                  onChange={(v) => setScores((s) => ({ ...s, [k]: v }))}
                  inputMode="numeric"
                  placeholder="0–100"
                />
              ))}
            </div>
          </details>
        </Card>

        {error && (
          <Card role="alert" className="text-danger">
            {error}
          </Card>
        )}

        {preview && (
          <article className="overflow-hidden rounded-card border border-border bg-surface" data-testid="sandbox-card" data-tone={preview.tone}>
            <div className="flex flex-col gap-3 p-5">
              <p className="text-sm text-muted">
                {preview.tone} · {content.events[eventId]?.rarity} · {content.events[eventId]?.category}
                {!preview.requirementsMet && ' · requirements not met in this state'}
              </p>
              <h2 className="text-2xl leading-tight font-bold break-words">{preview.title}</h2>
              <p className="leading-relaxed break-words" data-testid="sandbox-text">
                {preview.text}
              </p>
              {preview.cast.length > 0 && (
                <ul className="text-sm text-muted" aria-label="Cast">
                  {preview.cast.map((c) => (
                    <li key={c.role}>
                      {c.role}: {c.name}, {c.age}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-2">
                {preview.choices.map((c) => (
                  <Button key={c.id} variant="secondary" block className="whitespace-normal text-left" disabled={!c.visible} onClick={() => choose(c.id)}>
                    {c.label}
                    {!c.visible && ' (hidden in this state)'}
                  </Button>
                ))}
              </div>
              {shownOutcome && (
                <p className="border-l-4 border-border pl-3 leading-relaxed break-words" data-testid="sandbox-outcome">
                  {shownOutcome}
                </p>
              )}
            </div>
          </article>
        )}
      </div>
    </Screen>
  );
}
