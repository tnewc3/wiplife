import { useCallback, useEffect, useRef, useState } from 'react';
import { content } from '../../../content';
import { GENDER_CATEGORIES } from '../../../content/schemas';
import { InvalidInputError, maxSiblings } from '../../../engine/creation/input';
import { getCityOptions, getPronounPresets } from '../../../engine/selectors';
import type { FamilyWealth, Personality, Pronouns, Stats } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { MultiChoice, SingleChoice, Suggestions } from '../../components/Choices';
import { ReplaceLifeSheet } from '../../components/ReplaceLifeSheet';
import { Screen } from '../../components/Screen';
import { ScoreSlider } from '../../components/ScoreSlider';
import { TextField } from '../../components/TextField';
import { ATTRACTION_LABELS, STAT_LABELS, TRAIT_LABELS, WEALTH_LABELS } from '../../labels';
import {
  defaultPronounChoice,
  draftPronouns,
  errorsForStep,
  initialDraft,
  stepOf,
  STEPS,
  toCustomInput,
  validateDraft,
  type Draft,
  type Errors,
} from './draft';

type Update = (patch: Partial<Draft>) => void;

interface StepProps {
  draft: Draft;
  update: Update;
  errors: Errors;
}

function NameStep({ draft, update, errors }: StepProps) {
  const { groups } = content.character.appearance;
  return (
    <div className="flex flex-col gap-5">
      <TextField label="First name" value={draft.first} onChange={(first) => update({ first })} error={errors['name.first']} />
      <TextField label="Last name" value={draft.last} onChange={(last) => update({ last })} error={errors['name.last']} />
      {groups.map((group) => (
        <SingleChoice
          key={group.id}
          label={group.label}
          value={draft.appearance[group.id] ?? ''}
          choices={[{ value: '', label: 'Surprise me' }, ...group.options.map((o) => ({ value: o, label: o }))]}
          onChange={(value) => update({ appearance: { ...draft.appearance, [group.id]: value } })}
        />
      ))}
      <TextField
        label="Anything else about how you look? (optional)"
        value={draft.extraDescriptor}
        onChange={(extraDescriptor) => update({ extraDescriptor })}
        error={Object.entries(errors).find(([k]) => k.startsWith('appearance'))?.[1]}
        autoCapitalize="none"
      />
    </div>
  );
}

const PRONOUN_FIELDS: { key: Exclude<keyof Pronouns, 'verbPlural'>; label: string; example: string }[] = [
  { key: 'subject', label: 'Subject', example: 'they' },
  { key: 'object', label: 'Object', example: 'them' },
  { key: 'possessive', label: 'Possessive', example: 'their' },
  { key: 'possessivePronoun', label: 'Possessive pronoun', example: 'theirs' },
  { key: 'reflexive', label: 'Reflexive', example: 'themself' },
];

function IdentityStep({ draft, update, errors }: StepProps) {
  const options = content.character.identity;
  const presets = getPronounPresets(content);
  const pronouns = draftPronouns(draft, content);

  return (
    <div className="flex flex-col gap-6">
      <SingleChoice
        label="Which fits best?"
        value={draft.genderCategory}
        columns={3}
        error={errors['identity.genderCategory']}
        choices={GENDER_CATEGORIES.map((c) => ({ value: c, label: options.categories[c].label }))}
        onChange={(genderCategory) =>
          update({
            genderCategory,
            genderIdentity: draft.genderIdentity || (options.categories[genderCategory].identities[0] ?? ''),
            genderExpression: draft.genderExpression || options.categories[genderCategory].defaultExpression,
            pronounChoice: draft.pronounChoice ?? defaultPronounChoice(content, genderCategory),
          })
        }
      />
      <p className="-mt-3 text-sm text-muted">This decides who you can be matched with romantically. Everything else is up to you.</p>

      <div className="flex flex-col gap-2">
        <TextField
          label="Gender identity"
          value={draft.genderIdentity}
          onChange={(genderIdentity) => update({ genderIdentity })}
          error={errors['identity.genderIdentity']}
          autoCapitalize="none"
        />
        <Suggestions label="Gender identity suggestions" options={options.identitySuggestions} onPick={(genderIdentity) => update({ genderIdentity })} />
      </div>

      <div className="flex flex-col gap-2">
        <TextField
          label="Gender expression"
          value={draft.genderExpression}
          onChange={(genderExpression) => update({ genderExpression })}
          error={errors['identity.genderExpression']}
          autoCapitalize="none"
        />
        <Suggestions label="Gender expression suggestions" options={options.expressions} onPick={(genderExpression) => update({ genderExpression })} />
      </div>

      <SingleChoice
        label="Pronouns"
        value={draft.pronounChoice}
        error={errors['identity.pronouns']}
        choices={[...presets.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom' }]}
        onChange={(pronounChoice) =>
          update(
            pronounChoice === 'custom' && draft.pronounChoice !== 'custom'
              ? { pronounChoice, customPronouns: { ...pronouns } }
              : { pronounChoice },
          )
        }
      />
      {draft.pronounChoice === 'custom' && (
        <Card className="flex flex-col gap-3">
          {PRONOUN_FIELDS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              placeholder={f.example}
              value={draft.customPronouns[f.key]}
              onChange={(value) => update({ customPronouns: { ...draft.customPronouns, [f.key]: value } })}
              error={errors[`identity.pronouns.${f.key}`]}
              autoCapitalize="none"
            />
          ))}
          <SingleChoice
            label="Verbs"
            value={draft.customPronouns.verbPlural ? 'plural' : 'singular'}
            columns={2}
            choices={[
              { value: 'singular', label: `${draft.customPronouns.subject || 'xe'} is` },
              { value: 'plural', label: `${draft.customPronouns.subject || 'they'} are` },
            ]}
            onChange={(v) => update({ customPronouns: { ...draft.customPronouns, verbPlural: v === 'plural' } })}
          />
        </Card>
      )}

      <MultiChoice
        label="Attracted to"
        value={draft.attractedTo}
        columns={1}
        error={errors['identity.attractedTo']}
        choices={GENDER_CATEGORIES.map((c) => ({ value: c, label: ATTRACTION_LABELS[c] }))}
        onChange={(attractedTo) => update({ attractedTo })}
      />
      <p className="-mt-3 text-sm text-muted">Choose none if you’re not attracted to anyone. Who you are can change over a lifetime.</p>
    </div>
  );
}

function FamilyStep({ draft, update, errors }: StepProps) {
  const most = maxSiblings(content);
  return (
    <div className="flex flex-col gap-6">
      <SingleChoice
        label="Parents"
        value={draft.parents}
        columns={2}
        choices={[
          { value: 1, label: 'One parent' },
          { value: 2, label: 'Two parents' },
        ]}
        onChange={(parents) => update({ parents })}
      />
      <SingleChoice
        label="Older siblings"
        value={draft.siblings}
        error={errors['family.siblings']}
        choices={Array.from({ length: most + 1 }, (_, i) => ({ value: i, label: i === 0 ? 'None' : String(i) }))}
        onChange={(siblings) => update({ siblings })}
      />
      <SingleChoice<FamilyWealth>
        label="Family wealth"
        value={draft.familyWealth}
        columns={1}
        error={errors.familyWealth}
        choices={(Object.keys(WEALTH_LABELS) as FamilyWealth[]).map((w) => ({ value: w, label: WEALTH_LABELS[w] }))}
        onChange={(familyWealth) => update({ familyWealth })}
      />
    </div>
  );
}

function CityStep({ draft, update, errors }: StepProps) {
  return (
    <SingleChoice
      label="Where you’re born"
      value={draft.cityId}
      columns={1}
      error={errors.cityId}
      choices={getCityOptions(content).map((c) => ({
        value: c.id,
        name: c.name,
        label: (
          <span className="flex flex-col items-start text-left">
            <span className="text-base">{c.name}</span>
            <span className="text-xs font-normal opacity-80">{c.blurb}</span>
          </span>
        ),
      }))}
      onChange={(cityId) => update({ cityId })}
    />
  );
}

function TraitsStep({ draft, update }: StepProps) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="custom-stats">
        <h3 id="custom-stats" className="text-lg font-bold">
          Stats
        </h3>
        {(Object.keys(STAT_LABELS) as (keyof Stats)[]).map((key) => (
          <ScoreSlider
            key={key}
            label={STAT_LABELS[key]}
            value={draft.stats[key]}
            onChange={(v) => update({ stats: { ...draft.stats, [key]: v } })}
          />
        ))}
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="custom-personality">
        <h3 id="custom-personality" className="text-lg font-bold">
          Personality
        </h3>
        {(Object.keys(TRAIT_LABELS) as (keyof Personality)[]).map((key) => (
          <ScoreSlider
            key={key}
            label={TRAIT_LABELS[key]}
            value={draft.personality[key]}
            onChange={(v) => update({ personality: { ...draft.personality, [key]: v } })}
          />
        ))}
      </section>
    </div>
  );
}

function ReviewStep({ draft }: StepProps) {
  const pronouns = draftPronouns(draft, content);
  const city = draft.cityId ? content.cities[draft.cityId]?.name : '';
  const rows: [string, string][] = [
    ['Name', `${draft.first} ${draft.last}`],
    ['Identity', `${draft.genderIdentity} · ${draft.genderExpression}`],
    ['Pronouns', `${pronouns.subject}/${pronouns.object}/${pronouns.possessivePronoun}`],
    ['Attracted to', draft.attractedTo.length ? draft.attractedTo.map((c) => ATTRACTION_LABELS[c]).join(', ') : 'No one'],
    ['Family', `${draft.parents === 1 ? 'One parent' : 'Two parents'}, ${draft.siblings === 0 ? 'no' : draft.siblings} older sibling${draft.siblings === 1 ? '' : 's'}`],
    ['Wealth', draft.familyWealth ? WEALTH_LABELS[draft.familyWealth] : ''],
    ['City', city ?? ''],
  ];
  return (
    <Card>
      <dl className="flex flex-col gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
            <dd className="break-words [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-muted">Some things about you may only come out later in life.</p>
    </Card>
  );
}

const STEP_COMPONENTS = [NameStep, IdentityStep, FamilyStep, CityStep, TraitsStep, ReviewStep];

/** Which input path each draft field feeds, for clearing errors as the player edits. */
const ERROR_PATHS: Record<keyof Draft, string> = {
  first: 'name.first',
  last: 'name.last',
  appearance: 'appearance',
  extraDescriptor: 'appearance',
  genderIdentity: 'identity.genderIdentity',
  genderCategory: 'identity.genderCategory',
  genderExpression: 'identity.genderExpression',
  pronounChoice: 'identity.pronouns',
  customPronouns: 'identity.pronouns',
  attractedTo: 'identity.attractedTo',
  parents: 'family.parents',
  siblings: 'family.siblings',
  familyWealth: 'familyWealth',
  cityId: 'cityId',
  stats: 'stats',
  personality: 'personality',
};

/** Multi-step custom creation: name → identity → family → city → stats → review. */
export function CustomLifeScreen() {
  const navigate = useAppStore((s) => s.navigate);
  const startCustomLife = useAppStore((s) => s.startCustomLife);
  const creating = useAppStore((s) => s.creating);
  const hasLife = useAppStore((s) => s.life !== null);

  const [draft, setDraft] = useState<Draft>(() => initialDraft(content));
  const [step, setStep] = useState(0);
  const [shownErrors, setShownErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const update: Update = useCallback((patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setShownErrors((e) => {
      // Clear shown errors for the fields being edited.
      const touched = (Object.keys(patch) as (keyof Draft)[]).map((k) => ERROR_PATHS[k]);
      return Object.fromEntries(Object.entries(e).filter(([path]) => !touched.some((t) => path === t || path.startsWith(`${t}.`))));
    });
  }, []);

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [step]);

  const goTo = (target: number) => {
    setShownErrors({});
    setStep(target);
  };

  const next = () => {
    const errors = errorsForStep(validateDraft(draft, content), step);
    if (Object.keys(errors).length > 0) {
      setShownErrors(errors);
      return;
    }
    goTo(step + 1);
  };

  const start = async () => {
    setFailure(null);
    const errors = validateDraft(draft, content);
    const first = Object.keys(errors)[0];
    if (first !== undefined) {
      setStep(stepOf(first));
      setShownErrors(errorsForStep(errors, stepOf(first)));
      return;
    }
    try {
      await startCustomLife(toCustomInput(draft, content));
    } catch (err) {
      setConfirming(false);
      if (err instanceof InvalidInputError && err.issues[0]) {
        const target = stepOf(err.issues[0].path.replace(/^custom\./, ''));
        setStep(target);
        setShownErrors(Object.fromEntries(err.issues.map((i) => [i.path.replace(/^custom\./, ''), i.message])));
      } else {
        setFailure('Something went wrong starting your life. Please try again.');
      }
    }
  };

  const Step = STEP_COMPONENTS[step]!;
  const isReview = step === STEPS.length - 1;
  const errorCount = Object.keys(shownErrors).length;

  return (
    <Screen
      title="Custom life"
      onBack={() => (step === 0 ? navigate('newLife') : goTo(step - 1))}
      backLabel={step === 0 ? 'Back to New Life' : 'Previous step'}
      footer={
        <div className="px-safe flex flex-col gap-2 border-t border-border bg-bg pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {errorCount > 0 && (
            <p role="alert" className="text-sm text-danger">
              {errorCount === 1 ? 'Fix the highlighted field to continue.' : 'Fix the highlighted fields to continue.'}
            </p>
          )}
          {failure && (
            <p role="alert" className="text-sm text-danger">
              {failure}
            </p>
          )}
          {isReview ? (
            <Button size="lg" block disabled={creating} onClick={() => (hasLife ? setConfirming(true) : void start())}>
              Start this life
            </Button>
          ) : (
            <Button size="lg" block onClick={next}>
              Next
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-sm text-muted">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
            {STEPS[step]!.title}
          </h2>
        </div>
        <Step draft={draft} update={update} errors={shownErrors} />
      </div>
      <ReplaceLifeSheet open={confirming} onCancel={() => setConfirming(false)} onConfirm={() => void start()} busy={creating} />
    </Screen>
  );
}
