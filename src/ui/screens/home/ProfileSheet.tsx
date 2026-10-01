import { useState } from 'react';
import { content } from '../../../content';
import { GENDER_CATEGORIES } from '../../../content/schemas';
import { pronounsFromPreset } from '../../../engine/creation/character';
import { InvalidInputError } from '../../../engine/creation/input';
import { identityEditIssues, type IdentityEditInput } from '../../../engine/discovery';
import { getProfileView, getPronounPresets } from '../../../engine/selectors';
import type { GenderCategory, LifeState, Personality, Pronouns } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { SingleChoice, Suggestions } from '../../components/Choices';
import { Sheet } from '../../components/Sheet';
import { StatBar } from '../../components/StatBar';
import { TextField } from '../../components/TextField';
import { ATTRACTION_LABELS, recordLine, TRAIT_LABELS } from '../../labels';

const PRONOUN_FIELDS: { key: Exclude<keyof Pronouns, 'verbPlural'>; label: string; example: string }[] = [
  { key: 'subject', label: 'Subject', example: 'they' },
  { key: 'object', label: 'Object', example: 'them' },
  { key: 'possessive', label: 'Possessive', example: 'their' },
  { key: 'possessivePronoun', label: 'Possessive pronoun', example: 'theirs' },
  { key: 'reflexive', label: 'Reflexive', example: 'themself' },
];

const samePronouns = (a: Pronouns, b: Pronouns) => (Object.keys(a) as (keyof Pronouns)[]).every((k) => a[k] === b[k]);

interface EditDraft {
  genderCategory: GenderCategory;
  genderIdentity: string;
  genderExpression: string;
  /** A preset id, or 'custom'. */
  pronounChoice: string;
  customPronouns: Pronouns;
  comingOut: boolean;
}

function startDraft(life: LifeState): EditDraft {
  const id = life.character.identity;
  const preset = getPronounPresets(content).find((p) => samePronouns(pronounsFromPreset(content, p.id), id.pronouns));
  return {
    genderCategory: id.genderCategory,
    genderIdentity: id.genderIdentity,
    genderExpression: id.genderExpression,
    pronounChoice: preset?.id ?? 'custom',
    customPronouns: { ...id.pronouns },
    comingOut: false,
  };
}

function toInput(draft: EditDraft): IdentityEditInput {
  const pronouns = draft.pronounChoice === 'custom' ? draft.customPronouns : pronounsFromPreset(content, draft.pronounChoice);
  return {
    genderCategory: draft.genderCategory,
    genderIdentity: draft.genderIdentity,
    genderExpression: draft.genderExpression,
    pronouns,
    comingOut: draft.comingOut,
  };
}

function IdentityForm({ life, onDone }: { life: LifeState; onDone: () => void }) {
  const editIdentity = useAppStore((s) => s.editIdentity);
  const busy = useAppStore((s) => s.aging);
  const [draft, setDraft] = useState(() => startDraft(life));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const options = content.character.identity;
  const presets = getPronounPresets(content);
  const update = (patch: Partial<EditDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const input = toInput(draft);
  const current = life.character.identity;
  const unchanged =
    input.genderCategory === current.genderCategory &&
    input.genderIdentity.trim() === current.genderIdentity &&
    input.genderExpression.trim() === current.genderExpression &&
    samePronouns(input.pronouns as Pronouns, current.pronouns);

  const save = async () => {
    const issues = identityEditIssues(input);
    setErrors(issues);
    if (Object.keys(issues).length > 0) return;
    try {
      await editIdentity(input);
      onDone();
    } catch (err) {
      if (err instanceof InvalidInputError) setErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
      else throw err;
    }
  };

  return (
    <form
      className="flex flex-col gap-5"
      aria-label="Edit who you are"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <SingleChoice
        label="Which fits best?"
        value={draft.genderCategory}
        columns={3}
        choices={GENDER_CATEGORIES.map((c) => ({ value: c, label: options.categories[c].label }))}
        onChange={(genderCategory) => update({ genderCategory })}
      />
      <p className="-mt-3 text-sm text-muted">This decides who you can be matched with romantically.</p>
      <div className="flex flex-col gap-2">
        <TextField
          label="Gender identity"
          value={draft.genderIdentity}
          onChange={(genderIdentity) => update({ genderIdentity })}
          error={errors.genderIdentity}
          autoCapitalize="none"
        />
        <Suggestions label="Gender identity suggestions" options={options.identitySuggestions} onPick={(genderIdentity) => update({ genderIdentity })} />
      </div>
      <div className="flex flex-col gap-2">
        <TextField
          label="Gender expression"
          value={draft.genderExpression}
          onChange={(genderExpression) => update({ genderExpression })}
          error={errors.genderExpression}
          autoCapitalize="none"
        />
        <Suggestions label="Gender expression suggestions" options={options.expressions} onPick={(genderExpression) => update({ genderExpression })} />
      </div>
      <SingleChoice
        label="Pronouns"
        value={draft.pronounChoice}
        choices={[...presets.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom' }]}
        onChange={(pronounChoice) =>
          update(pronounChoice === 'custom' && draft.pronounChoice !== 'custom' ? { pronounChoice, customPronouns: { ...input.pronouns } as Pronouns } : { pronounChoice })
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
              error={errors[`pronouns.${f.key}`]}
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
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5 shrink-0 accent-accent"
          checked={draft.comingOut}
          onChange={(e) => update({ comingOut: e.target.checked })}
        />
        <span>
          Tell the people close to you next year
          <span className="block text-sm text-muted">Optional. Nobody has to know until you’re ready.</span>
        </span>
      </label>
      <div className="flex flex-col gap-2">
        <Button type="submit" block disabled={busy || unchanged}>
          Save
        </Button>
        <Button variant="secondary" block onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The Profile sheet, from the Home header (Stage 9): who you are, your
 * personality and your record. Between years you can change your pronouns,
 * gender identity and expression; it takes effect at once.
 */
export function ProfileSheet({ life, open, onClose }: { life: LifeState; open: boolean; onClose: () => void }) {
  const view = getProfileView(life, content);
  const [editing, setEditing] = useState(false);
  const close = () => {
    setEditing(false);
    onClose();
  };
  const id = view.identity;
  const rows: [string, string][] = [
    ['Gender identity', id.genderIdentity],
    ['Gender expression', id.genderExpression],
    ['Pronouns', `${id.pronouns.subject}/${id.pronouns.object}/${id.pronouns.possessivePronoun}`],
    ['Attracted to', id.attractedTo.length === 0 ? 'No one' : id.attractedTo.map((c) => ATTRACTION_LABELS[c]).join(', ')],
  ];

  return (
    <Sheet open={open} title={editing ? 'Who you are' : 'Profile'} onClose={close}>
      {editing ? (
        <IdentityForm key={life.currentYear} life={life} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-col gap-5">
          <section aria-labelledby="profile-identity">
            <h3 id="profile-identity" className="text-lg font-bold break-words [overflow-wrap:anywhere]">
              {view.fullName}
            </h3>
            <dl className="mt-2 flex flex-col divide-y divide-border" data-testid="profile-identity">
              {rows.map(([label, value]) => (
                <div key={label} className="flex min-w-0 justify-between gap-3 py-2">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right break-words [overflow-wrap:anywhere]">{value}</dd>
                </div>
              ))}
            </dl>
            <Button variant="secondary" block className="mt-3" disabled={!view.canEdit} onClick={() => setEditing(true)}>
              Edit pronouns, gender and expression
            </Button>
          </section>
          <section aria-labelledby="profile-personality">
            <h3 id="profile-personality" className="mb-2 text-lg font-bold">
              Personality
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3" role="group" aria-label="Personality">
              {(Object.keys(TRAIT_LABELS) as (keyof Personality)[]).map((key) => (
                <StatBar key={key} label={TRAIT_LABELS[key]} value={view.personality[key]} />
              ))}
            </div>
          </section>
          {view.record.length > 0 && (
            <section aria-labelledby="profile-record">
              <h3 id="profile-record" className="mb-2 text-lg font-bold">
                Criminal record
              </h3>
              <ul className="flex flex-col divide-y divide-border" aria-label="Criminal record">
                {view.record.map((row, i) => (
                  <li key={i} className="py-2 text-sm break-words">
                    {recordLine(row)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}
