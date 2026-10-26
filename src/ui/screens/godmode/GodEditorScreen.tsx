import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { content } from '../../../content';
import { GENDER_CATEGORIES, TRAIT_KEYS } from '../../../content/schemas';
import { pronounsFromPreset } from '../../../engine/creation/character';
import { getEditView, type EditView } from '../../../engine/editView';
import type { EditRefusal } from '../../../engine/godmode';
import { getPronounPresets } from '../../../engine/selectors';
import type { FamilyWealth, GenderCategory, Pronouns } from '../../../engine/types';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { MultiChoice, SingleChoice } from '../../components/Choices';
import { Screen } from '../../components/Screen';
import { ScoreSlider } from '../../components/ScoreSlider';
import { Sheet } from '../../components/Sheet';
import { TextField } from '../../components/TextField';
import {
  ageFixedSentence,
  ATTRACTION_LABELS,
  DEBT_LABELS,
  GOD_AREA_LABELS,
  GOD_FIELD_LABELS,
  GOD_MODE_LABELS,
  GOD_RELATIONSHIP_KIND_LABELS,
  GOD_STAT_LABELS,
  GOD_STATUS_LABELS,
  GOD_VALUE_LABELS,
  money,
  refusalSentence,
  TRAIT_LABELS,
  WEALTH_LABELS,
} from '../../labels';
import { Group, DollarField, RemoveButton, Row, Select, Toggle } from './controls';
import { changeCount, cloneView, toPayload } from './draft';

type GroupId = 'name' | 'identity' | 'latent' | 'looks' | 'stats' | 'personality' | 'values' | 'health' | 'relationship' | 'work' | 'city' | 'faith' | 'languages' | 'citizenships' | 'money' | 'age';

/** The group each payload area belongs to (refusals point at it). */
const GROUP_OF: Record<string, GroupId> = {
  name: 'name',
  identity: 'identity',
  latent: 'latent',
  looks: 'looks',
  appearance: 'looks',
  stats: 'stats',
  personality: 'personality',
  values: 'values',
  conditions: 'health',
  troubles: 'health',
  neuro: 'health',
  relationship: 'relationship',
  work: 'work',
  wealth: 'work',
  cityId: 'city',
  faith: 'faith',
  languages: 'languages',
  citizenships: 'citizenships',
  money: 'money',
  birthYear: 'age',
};

const GROUP_TITLES: Record<GroupId, string> = {
  name: GOD_AREA_LABELS.name!,
  identity: GOD_AREA_LABELS.identity!,
  latent: GOD_AREA_LABELS.latent!,
  looks: GOD_AREA_LABELS.looks!,
  stats: GOD_AREA_LABELS.stats!,
  personality: GOD_AREA_LABELS.personality!,
  values: GOD_AREA_LABELS.values!,
  health: GOD_AREA_LABELS.conditions!,
  relationship: GOD_AREA_LABELS.relationship!,
  work: GOD_AREA_LABELS.work!,
  city: GOD_AREA_LABELS.cityId!,
  faith: GOD_AREA_LABELS.faith!,
  languages: GOD_AREA_LABELS.languages!,
  citizenships: GOD_AREA_LABELS.citizenships!,
  money: GOD_AREA_LABELS.money!,
  age: GOD_AREA_LABELS.birthYear!,
};

const KIND_CHOICES = ['friend', 'acquaintance', 'partner', 'fiance', 'spouse', 'ex'] as const;
const NO_FAITH = '__none__';
const NO_VALUE = '__unset__';
const sortedBy = <T,>(items: T[], name: (item: T) => string) => [...items].sort((a, b) => name(a).localeCompare(name(b)));

/** The god mode editor (G1): one scrolling screen of collapsible groups, a sticky save bar, and a "Can't save that" panel. */
export function GodEditorScreen() {
  const life = useAppStore((s) => s.life);
  const target = useAppStore((s) => s.editorTarget);
  const closeEditor = useAppStore((s) => s.closeEditor);
  const [saved, setSaved] = useState(false);
  const base = useMemo(() => (life && target ? getEditView(life, target, content) : null), [life, target]);
  if (!life || !target || !base) return null;
  const title = base.self ? GOD_MODE_LABELS.editorTitleSelf : `Edit ${base.name.first}`;
  return (
    <Screen title={title} onBack={closeEditor} backLabel={GOD_MODE_LABELS.back}>
      <Editor key={`${target}:${life.inputLog.length}`} base={base} saved={saved} onSaved={() => setSaved(true)} onChanged={() => setSaved(false)} />
    </Screen>
  );
}

function Editor({ base, saved, onSaved, onChanged }: { base: EditView; saved: boolean; onSaved: () => void; onChanged: () => void }) {
  const life = useAppStore((s) => s.life)!;
  const editLife = useAppStore((s) => s.editLife);
  const previewEdit = useAppStore((s) => s.previewEdit);
  const ageBoundsOf = useAppStore((s) => s.ageBoundsOf);
  const [draft, setDraft] = useState<EditView>(() => cloneView(base));
  const [refusals, setRefusals] = useState<EditRefusal[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Set<GroupId>>(() => new Set(['stats']));
  const [citySheet, setCitySheet] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const up = (change: (d: EditView) => void) => {
    setDraft((prev) => {
      const next = cloneView(prev);
      change(next);
      return next;
    });
    setRefusals(null);
    onChanged();
  };
  const nameOf = (id: string) => life.people[id]?.name.first ?? id;
  const payload = useMemo(() => toPayload(base, draft), [base, draft]);
  const count = changeCount(payload);
  // What the rules say about the draft as it stands, shown beside the groups before anything is saved.
  const live = useMemo(() => (payload ? previewEdit(payload) : null), [payload, previewEdit]);
  const liveRefusals = live && !live.ok ? live.refusals : [];
  const notesFor = (group: GroupId) => liveRefusals.filter((r) => GROUP_OF[r.area] === group).map((r) => refusalSentence(r, nameOf));
  const toggle = (group: GroupId) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  const groupProps = (group: GroupId) => ({ id: group, title: GROUP_TITLES[group], open: open.has(group), onToggle: () => toggle(group), notes: notesFor(group) });

  useEffect(() => {
    if (refusals) panelRef.current?.focus();
  }, [refusals]);

  const save = async () => {
    if (!payload || saving) return;
    setSaving(true);
    try {
      const result = await editLife(payload);
      if (result.ok) {
        setRefusals(null);
        onSaved();
      } else {
        setRefusals(result.refusals);
        setOpen((prev) => new Set([...prev, ...result.refusals.flatMap((r) => (GROUP_OF[r.area] ? [GROUP_OF[r.area]!] : []))]));
      }
    } finally {
      setSaving(false);
    }
  };
  const goTo = (area: string) => {
    const group = GROUP_OF[area];
    if (!group) return;
    setOpen((prev) => new Set([...prev, group]));
    requestAnimationFrame(() => document.getElementById(`god-area-${group}`)?.scrollIntoView({ block: 'start' }));
  };

  /** Why this draft, with one thing changed, can't be saved: the first refusal in these areas, or null when it can. */
  const reasonFor = (change: (d: EditView) => void, areas: string[]): string | null => {
    const variant = cloneView(draft);
    change(variant);
    const p = toPayload(base, variant);
    if (!p) return null;
    const result = previewEdit(p);
    if (result.ok) return null;
    const hit = result.refusals.find((r) => areas.includes(r.area));
    return hit ? refusalSentence(hit, nameOf) : null;
  };

  const v = draft;
  const presets = getPronounPresets(content);
  const bounds = base.self || !base.personId ? null : ageBoundsOf(base.personId);

  return (
    <div className="flex flex-col gap-3 pb-24" data-testid="god-editor">
      {saved && (
        <p role="status" className="rounded-xl bg-surface-2 px-4 py-3 font-semibold" data-testid="god-saved">
          {GOD_MODE_LABELS.saved}
        </p>
      )}
      {refusals && (
        <div ref={panelRef} tabIndex={-1} role="alert" className="rounded-card border border-danger bg-surface p-4 outline-none" data-testid="god-refusals">
          <h2 className="text-lg font-bold">{GOD_MODE_LABELS.cantSave}</h2>
          <p className="text-sm text-muted">{GOD_MODE_LABELS.cantSaveNote}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {refusals.map((r, i) => (
              <li key={i}>
                <button type="button" onClick={() => goTo(r.area)} className="min-h-11 text-left underline" data-testid={`god-refusal-${r.code}`}>
                  {refusalSentence(r, nameOf)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Group {...groupProps('name')}>
        <TextField label={GOD_FIELD_LABELS.firstName} value={v.name.first} onChange={(x) => up((d) => (d.name.first = x))} />
        <TextField label={GOD_FIELD_LABELS.lastName} value={v.name.last} onChange={(x) => up((d) => (d.name.last = x))} />
      </Group>

      <Group {...groupProps('identity')}>
        <SingleChoice
          label={GOD_FIELD_LABELS.genderCategory}
          value={v.identity.genderCategory}
          columns={3}
          choices={GENDER_CATEGORIES.map((c) => ({ value: c, label: content.character.identity.categories[c].label }))}
          onChange={(c: GenderCategory) => up((d) => (d.identity.genderCategory = c))}
        />
        <TextField label={GOD_FIELD_LABELS.genderIdentity} value={v.identity.genderIdentity} autoCapitalize="none" onChange={(x) => up((d) => (d.identity.genderIdentity = x))} />
        <TextField label={GOD_FIELD_LABELS.genderExpression} value={v.identity.genderExpression} autoCapitalize="none" onChange={(x) => up((d) => (d.identity.genderExpression = x))} />
        <PronounPicker pronouns={v.identity.pronouns} presets={presets} onChange={(p) => up((d) => (d.identity.pronouns = p))} />
        <MultiChoice
          label={GOD_FIELD_LABELS.attractedTo}
          value={v.identity.attractedTo}
          columns={3}
          choices={GENDER_CATEGORIES.map((c) => ({ value: c, label: ATTRACTION_LABELS[c] }))}
          onChange={(a) => up((d) => (d.identity.attractedTo = a))}
        />
        <Toggle label={GOD_FIELD_LABELS.canCarry} checked={v.identity.canCarry} onChange={(x) => up((d) => (d.identity.canCarry = x))} />
      </Group>

      {v.latent && (
        <Group {...groupProps('latent')}>
          <p className="text-sm text-muted">{GOD_MODE_LABELS.hiddenNote}</p>
          <Toggle
            label={GOD_FIELD_LABELS.hiddenAttraction}
            checked={v.latent.attractedTo !== null}
            onChange={(x) => up((d) => (d.latent!.attractedTo = x ? [...d.identity.attractedTo] : null))}
          />
          {v.latent.attractedTo !== null && (
            <MultiChoice
              label={GOD_FIELD_LABELS.hiddenAttractedTo}
              value={v.latent.attractedTo}
              columns={3}
              choices={GENDER_CATEGORIES.map((c) => ({ value: c, label: ATTRACTION_LABELS[c] }))}
              onChange={(a) => up((d) => (d.latent!.attractedTo = a))}
            />
          )}
          <Toggle
            label={GOD_FIELD_LABELS.hiddenGender}
            checked={v.latent.gender !== null}
            onChange={(x) =>
              up((d) => {
                d.latent!.gender = x ? { genderCategory: d.identity.genderCategory, genderIdentity: d.identity.genderIdentity, pronouns: { ...d.identity.pronouns } } : null;
              })
            }
          />
          {v.latent.gender && (
            <>
              <SingleChoice
                label={GOD_FIELD_LABELS.hiddenGenderCategory}
                value={v.latent.gender.genderCategory}
                columns={3}
                choices={GENDER_CATEGORIES.map((c) => ({ value: c, label: content.character.identity.categories[c].label }))}
                onChange={(c: GenderCategory) => up((d) => (d.latent!.gender!.genderCategory = c))}
              />
              <TextField label={GOD_FIELD_LABELS.hiddenGenderIdentity} value={v.latent.gender.genderIdentity} autoCapitalize="none" onChange={(x) => up((d) => (d.latent!.gender!.genderIdentity = x))} />
              <PronounPicker pronouns={v.latent.gender.pronouns} presets={presets} label={GOD_FIELD_LABELS.hiddenPronouns} onChange={(p) => up((d) => (d.latent!.gender!.pronouns = p))} />
            </>
          )}
          <Toggle label={GOD_FIELD_LABELS.hiddenExpression} checked={v.latent.expression !== null} onChange={(x) => up((d) => (d.latent!.expression = x ? d.identity.genderExpression : null))} />
          {v.latent.expression !== null && <TextField label={GOD_FIELD_LABELS.hiddenGenderExpression} value={v.latent.expression} autoCapitalize="none" onChange={(x) => up((d) => (d.latent!.expression = x))} />}
          {TRAIT_KEYS.map((k) => (
            <OptionalSlider
              key={k}
              label={GOD_FIELD_LABELS.hiddenTrait(TRAIT_LABELS[k])}
              value={v.latent!.personality[k]}
              initial={v.personality[k] ?? 50}
              onChange={(x) => up((d) => (d.latent!.personality[k] = x))}
            />
          ))}
          <Toggle label={GOD_FIELD_LABELS.hiddenPull} checked={v.latent.faith !== null} onChange={(x) => up((d) => (d.latent!.faith = x ? { id: null } : null))} />
          {v.latent.faith && (
            <Select
              label={GOD_FIELD_LABELS.hiddenFaith}
              value={v.latent.faith.id ?? NO_FAITH}
              options={[{ value: NO_FAITH, label: GOD_FIELD_LABELS.noFaith }, ...faithOptions()]}
              onChange={(x) => up((d) => (d.latent!.faith = { id: x === NO_FAITH ? null : x }))}
            />
          )}
        </Group>
      )}

      <Group {...groupProps('looks')}>
        <ScoreSlider label={GOD_FIELD_LABELS.looks} value={v.looks} showNumber steps={{ down: GOD_MODE_LABELS.stepDown, up: GOD_MODE_LABELS.stepUp, step: 5 }} onChange={(x) => up((d) => (d.looks = x))} />
        {base.self && (
          <>
            {content.character.appearance.groups.map((g) => {
              const current = v.appearance.find((w) => g.options.includes(w)) ?? '';
              return (
                <Select
                  key={g.id}
                  label={g.label}
                  value={current}
                  options={[{ value: '', label: '—' }, ...g.options.map((o) => ({ value: o, label: o }))]}
                  onChange={(x) =>
                    up((d) => {
                      const groups = content.character.appearance.groups;
                      const free = d.appearance.filter((w) => !groups.some((gg) => gg.options.includes(w)));
                      d.appearance = [...groups.flatMap((gg) => (gg.id === g.id ? (x === '' ? [] : [x]) : d.appearance.filter((w) => gg.options.includes(w)))), ...free];
                    })
                  }
                />
              );
            })}
            <TextField
              label={GOD_MODE_LABELS.freeWord}
              value={v.appearance.find((w) => !content.character.appearance.groups.some((g) => g.options.includes(w))) ?? ''}
              onChange={(x) =>
                up((d) => {
                  const grouped = d.appearance.filter((w) => content.character.appearance.groups.some((g) => g.options.includes(w)));
                  d.appearance = x.trim() === '' ? grouped : [...grouped, x];
                })
              }
            />
          </>
        )}
      </Group>

      <Group {...groupProps('stats')}>
        {(Object.keys(v.stats) as (keyof EditView['stats'])[]).map((k) => (
          <ScoreSlider
            key={k}
            label={GOD_STAT_LABELS[k]}
            value={v.stats[k] ?? 0}
            min={k === 'health' ? 1 : 0}
            showNumber
            steps={{ down: GOD_MODE_LABELS.stepDown, up: GOD_MODE_LABELS.stepUp, step: k === 'mood' || k === 'moodBase' ? content.balance.godmode.mood.step : 5 }}
            onChange={(x) => up((d) => (d.stats[k] = x))}
          />
        ))}
      </Group>

      <Group {...groupProps('personality')}>
        {TRAIT_KEYS.map((k) =>
          base.self || base.child ? (
            <ScoreSlider key={k} label={TRAIT_LABELS[k]} value={v.personality[k] ?? 50} showNumber steps={{ down: GOD_MODE_LABELS.stepDown, up: GOD_MODE_LABELS.stepUp, step: 5 }} onChange={(x) => up((d) => (d.personality[k] = x))} />
          ) : (
            <OptionalSlider key={k} label={TRAIT_LABELS[k]} value={v.personality[k]} initial={50} onChange={(x) => up((d) => (d.personality[k] = x))} />
          ),
        )}
      </Group>

      {(base.self || base.child) && (
        <Group {...groupProps('values')}>
          {(Object.keys(GOD_VALUE_LABELS) as (keyof typeof GOD_VALUE_LABELS)[])
            .filter((k) => v.values[k] !== undefined)
            .map((k) => (
              <ScoreSlider key={k} label={GOD_VALUE_LABELS[k]} value={v.values[k] ?? 0} showNumber steps={{ down: GOD_MODE_LABELS.stepDown, up: GOD_MODE_LABELS.stepUp, step: 5 }} onChange={(x) => up((d) => (d.values[k] = x))} />
            ))}
          <Select
            label={GOD_FIELD_LABELS.talent}
            value={v.values.talent ?? NO_VALUE}
            options={[{ value: NO_VALUE, label: GOD_MODE_LABELS.none }, ...sortedBy(Object.values(content.talents).filter((t) => !t.retired), (t) => t.name).map((t) => ({ value: t.id, label: t.name }))]}
            onChange={(x) => up((d) => (d.values.talent = x === NO_VALUE ? null : x))}
          />
          {base.self && <Toggle label={GOD_FIELD_LABELS.talentFound} checked={v.values.talentDiscovered} disabled={v.values.talent === null} onChange={(x) => up((d) => (d.values.talentDiscovered = x))} />}
        </Group>
      )}

      <Group {...groupProps('health')}>
        {base.self ? (
          <>
            {v.conditions.map((c, i) => {
              const def = content.conditions[c.conditionId];
              return (
                <Row key={c.conditionId} testId={`god-condition-${c.conditionId}`}>
                  <p className="font-semibold">{def?.name ?? c.conditionId}</p>
                  <ScoreSlider label={GOD_FIELD_LABELS.severity} value={c.severity} min={1} showNumber steps={{ down: GOD_MODE_LABELS.stepDown, up: GOD_MODE_LABELS.stepUp, step: 5 }} onChange={(x) => up((d) => (d.conditions[i]!.severity = x))} />
                  <Toggle label={GOD_MODE_LABELS.treated} checked={c.treated} onChange={(x) => up((d) => (d.conditions[i]!.treated = x))} />
                  {(def?.kind === 'mental' || def?.kind === 'neuro') && <Toggle label={GOD_MODE_LABELS.named} checked={c.named} onChange={(x) => up((d) => (d.conditions[i]!.named = x))} />}
                  <RemoveButton label={`${GOD_MODE_LABELS.remove}: ${def?.name ?? c.conditionId}`} onClick={() => up((d) => d.conditions.splice(i, 1))} />
                </Row>
              );
            })}
            <Select
              label={GOD_MODE_LABELS.addCondition}
              value=""
              options={[{ value: '', label: '—' }, ...sortedBy(Object.values(content.conditions).filter((c) => !c.retired && !v.conditions.some((x) => x.conditionId === c.id)), (c) => c.name).map((c) => ({ value: c.id, label: c.name }))]}
              onChange={(x) => x && up((d) => d.conditions.push({ conditionId: x, severity: 30, treated: false, named: false }))}
            />
          </>
        ) : (
          <>
            {v.troubles.map((t, i) => (
              <Row key={`${t.kind}:${t.refId}`} testId={`god-trouble-${t.refId}`}>
                <p className="font-semibold">{content.conditions[t.refId]?.name ?? t.refId}</p>
                <ScoreSlider label={GOD_FIELD_LABELS.severity} value={t.severity} min={1} showNumber steps={{ down: GOD_MODE_LABELS.stepDown, up: GOD_MODE_LABELS.stepUp, step: 5 }} onChange={(x) => up((d) => (d.troubles[i]!.severity = x))} />
                <Toggle label={GOD_MODE_LABELS.treated} checked={t.treated} onChange={(x) => up((d) => (d.troubles[i]!.treated = x))} />
                <RemoveButton label={`${GOD_MODE_LABELS.remove}: ${content.conditions[t.refId]?.name ?? t.refId}`} onClick={() => up((d) => d.troubles.splice(i, 1))} />
              </Row>
            ))}
            <Select
              label={GOD_MODE_LABELS.addTrouble}
              value=""
              options={[{ value: '', label: '—' }, ...sortedBy(Object.values(content.conditions).filter((c) => !c.retired && c.kind !== 'neuro' && !v.troubles.some((x) => x.refId === c.id)), (c) => c.name).map((c) => ({ value: c.id, label: c.name }))]}
              onChange={(x) => x && up((d) => d.troubles.push({ kind: content.conditions[x]?.kind === 'addiction' ? 'addiction' : 'illness', refId: x, severity: 30, treated: false }))}
            />
            {v.neuro.map((n, i) => (
              <Row key={n}>
                <p className="font-semibold">{content.conditions[n]?.name ?? n}</p>
                <RemoveButton label={`${GOD_MODE_LABELS.remove}: ${content.conditions[n]?.name ?? n}`} onClick={() => up((d) => d.neuro.splice(i, 1))} />
              </Row>
            ))}
            <Select
              label={GOD_FIELD_LABELS.addBornWith}
              value=""
              options={[{ value: '', label: '—' }, ...Object.values(content.conditions).filter((c) => c.kind === 'neuro' && !c.retired && !v.neuro.includes(c.id)).map((c) => ({ value: c.id, label: c.name }))]}
              onChange={(x) => x && up((d) => d.neuro.push(x))}
            />
          </>
        )}
      </Group>

      {v.relationship && (
        <Group {...groupProps('relationship')}>
          {KIND_CHOICES.includes(base.relationship!.kind as never) || ['coworker', 'boss', 'classmate'].includes(base.relationship!.kind) ? (
            <KindChoice
              current={v.relationship.kind}
              original={base.relationship!.kind}
              reasonFor={(kind) => reasonFor((d) => (d.relationship!.kind = kind), ['relationship', 'birthYear'])}
              onChange={(kind) => up((d) => (d.relationship!.kind = kind))}
            />
          ) : (
            <p className="text-sm text-muted" data-testid="god-kind-fixed">
              {refusalSentence({ code: 'family_kind', area: 'relationship', person: base.personId!, facts: {} }, nameOf)}
            </p>
          )}
          <ScoreSlider label={GOD_FIELD_LABELS.affection} value={v.relationship.affection} showNumber steps={{ down: GOD_MODE_LABELS.stepDown, up: GOD_MODE_LABELS.stepUp, step: 5 }} onChange={(x) => up((d) => (d.relationship!.affection = x))} />
          <ScoreSlider label={GOD_FIELD_LABELS.trust} value={v.relationship.trust} showNumber steps={{ down: GOD_MODE_LABELS.stepDown, up: GOD_MODE_LABELS.stepUp, step: 5 }} onChange={(x) => up((d) => (d.relationship!.trust = x))} />
          <SingleChoice
            label={GOD_FIELD_LABELS.status}
            value={v.relationship.status}
            columns={3}
            choices={(['active', 'estranged', 'ended'] as const).map((s) => ({ value: s, label: GOD_STATUS_LABELS[s] }))}
            onChange={(s) => up((d) => (d.relationship!.status = s))}
          />
        </Group>
      )}

      <Group {...groupProps('work')}>
        <Select
          label={GOD_FIELD_LABELS.job}
          value={v.work.jobId ?? NO_VALUE}
          options={[{ value: NO_VALUE, label: GOD_MODE_LABELS.noJob }, ...sortedBy(Object.values(content.jobs).filter((j) => !j.retired || j.id === v.work.jobId), (j) => j.name).map((j) => ({ value: j.id, label: j.name }))]}
          onChange={(x) => up((d) => ((d.work.jobId = x === NO_VALUE ? null : x), (d.work.level = Math.min(d.work.level, content.jobs[x]?.levels.length ?? 1))))}
        />
        {v.work.jobId !== null && content.jobs[v.work.jobId] && (
          <Select
            label={GOD_MODE_LABELS.level}
            value={String(Math.min(v.work.level, content.jobs[v.work.jobId]!.levels.length))}
            options={content.jobs[v.work.jobId]!.levels.map((l, i) => ({ value: String(i + 1), label: `${i + 1} · ${l.title}` }))}
            onChange={(x) => up((d) => (d.work.level = Number(x)))}
          />
        )}
        <SingleChoice label={base.self ? GOD_FIELD_LABELS.familyWealth : GOD_FIELD_LABELS.wealth} value={v.wealth} columns={2} choices={(Object.keys(WEALTH_LABELS) as FamilyWealth[]).map((w) => ({ value: w, label: WEALTH_LABELS[w] }))} onChange={(w) => up((d) => (d.wealth = w))} />
      </Group>

      <Group {...groupProps('city')}>
        <p data-testid="god-city">{content.cities[v.cityId]?.name ?? v.cityId}</p>
        {base.self && <p className="text-sm text-muted">{GOD_MODE_LABELS.moveWarning}</p>}
        <Button variant="secondary" onClick={() => setCitySheet(true)}>
          {GOD_MODE_LABELS.chooseCity}
        </Button>
        {citySheet && (
          <CitySheet
            current={v.cityId}
            countryOf={content.cities[base.cityId]?.countryId}
            reasonFor={(cityId) => reasonFor((d) => (d.cityId = cityId), ['cityId'])}
            onPick={(cityId) => {
              up((d) => (d.cityId = cityId));
              setCitySheet(false);
            }}
            onClose={() => setCitySheet(false)}
          />
        )}
      </Group>

      <Group {...groupProps('faith')}>
        <Select
          label={GOD_FIELD_LABELS.faith}
          value={v.faith.id ?? NO_FAITH}
          options={[{ value: NO_FAITH, label: GOD_FIELD_LABELS.noFaith }, ...faithOptions()]}
          onChange={(x) => up((d) => ((d.faith.id = x === NO_FAITH ? null : x), (d.faith.strength = x === NO_FAITH ? 0 : Math.max(1, d.faith.strength || 50))))}
        />
        {v.faith.id !== null && <ScoreSlider label={GOD_FIELD_LABELS.howStrongly} value={v.faith.strength} min={1} showNumber steps={{ down: GOD_MODE_LABELS.stepDown, up: GOD_MODE_LABELS.stepUp, step: 5 }} onChange={(x) => up((d) => (d.faith.strength = x))} />}
      </Group>

      <Group {...groupProps('languages')}>
        {v.languages.map((l, i) => (
          <Row key={l.id} testId={`god-language-${l.id}`}>
            <p className="font-semibold">{content.languages[l.id]?.name ?? l.id}</p>
            <ScoreSlider label={GOD_FIELD_LABELS.skill} value={l.skill} showNumber steps={{ down: GOD_MODE_LABELS.stepDown, up: GOD_MODE_LABELS.stepUp, step: 5 }} onChange={(x) => up((d) => (d.languages[i]!.skill = x))} />
            <Toggle label={GOD_MODE_LABELS.native} checked={l.native} onChange={(x) => up((d) => (d.languages[i]!.native = x))} />
            <RemoveButton label={`${GOD_MODE_LABELS.remove}: ${content.languages[l.id]?.name ?? l.id}`} onClick={() => up((d) => d.languages.splice(i, 1))} />
          </Row>
        ))}
        <Select
          label={GOD_MODE_LABELS.addLanguage}
          value=""
          options={[{ value: '', label: '—' }, ...sortedBy(Object.values(content.languages).filter((l) => !l.retired && !v.languages.some((x) => x.id === l.id)), (l) => l.name).map((l) => ({ value: l.id, label: l.name }))]}
          onChange={(x) => x && up((d) => d.languages.push({ id: x, skill: 50, native: false }))}
        />
      </Group>

      <Group {...groupProps('citizenships')}>
        <p className="text-sm text-muted">{GOD_MODE_LABELS.firstCitizenship}</p>
        {v.citizenships.map((c, i) => (
          <Row key={c} testId={`god-citizenship-${c}`}>
            <p className="font-semibold">{content.countries[c]?.name ?? c}</p>
            {i > 0 && <RemoveButton label={`${GOD_MODE_LABELS.remove}: ${content.countries[c]?.name ?? c}`} onClick={() => up((d) => d.citizenships.splice(i, 1))} />}
          </Row>
        ))}
        <Select
          label={GOD_MODE_LABELS.addCitizenship}
          value=""
          options={[{ value: '', label: '—' }, ...sortedBy(Object.values(content.countries).filter((c) => !c.retired && !v.citizenships.includes(c.id as never)), (c) => c.name).map((c) => ({ value: c.id, label: c.name }))]}
          onChange={(x) => x && up((d) => d.citizenships.push(x as never))}
        />
      </Group>

      {v.money && base.money && (
        <Group {...groupProps('money')}>
          <DollarField label={GOD_FIELD_LABELS.savings} value={v.money.savings} format={(x) => (x === base.money!.savings ? money(x) : GOD_MODE_LABELS.moneyNow(money(base.money!.savings), money(x)))} onChange={(x) => up((d) => (d.money!.savings = x))} />
          {v.money.debts.map((debt, i) => (
            <Row key={`${debt.id}:${i}`} testId={`god-debt-${i}`}>
              <p className="font-semibold">{DEBT_LABELS[debt.kind]}</p>
              <DollarField label={GOD_FIELD_LABELS.balance} value={debt.balance} format={(x) => money(x)} onChange={(x) => up((d) => (d.money!.debts[i]!.balance = x))} />
              <RemoveButton label={`${GOD_MODE_LABELS.remove}: ${DEBT_LABELS[debt.kind]}`} onClick={() => up((d) => d.money!.debts.splice(i, 1))} />
            </Row>
          ))}
          <Select
            label={GOD_MODE_LABELS.addDebt}
            value=""
            options={[{ value: '', label: '—' }, ...content.balance.godmode.money.debtKinds.map((k) => ({ value: k, label: DEBT_LABELS[k] }))]}
            onChange={(x) => x && up((d) => d.money!.debts.push({ id: '', kind: x as never, balance: 1000 }))}
          />
          <p className="text-sm text-muted">{GOD_MODE_LABELS.forgiveNote}</p>
          {v.money.locked > 0 && <p className="text-sm text-muted">{GOD_MODE_LABELS.lockedDebtNote}</p>}
        </Group>
      )}

      <Group {...groupProps('age')}>
        {base.self ? (
          <p data-testid="god-age-fixed">{GOD_MODE_LABELS.ageSelf}</p>
        ) : bounds?.editable ? (
          <AgeStepper
            age={life.currentYear - v.birthYear}
            min={life.currentYear - bounds.maxBirthYear}
            max={life.currentYear - bounds.minBirthYear}
            onChange={(age) => up((d) => (d.birthYear = life.currentYear - age))}
          />
        ) : (
          <p data-testid="god-age-fixed">{ageFixedSentence(bounds?.reason, base.name.first)}</p>
        )}
      </Group>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 flex justify-center border-t border-border bg-bg">
        <div className="px-safe flex w-full max-w-lg gap-2 py-3">
          <Button variant="secondary" disabled={count === 0 || saving} onClick={() => (setDraft(cloneView(base)), setRefusals(null))} data-testid="god-revert">
            {GOD_MODE_LABELS.revert}
          </Button>
          <Button block disabled={count === 0 || saving} onClick={() => void save()} data-testid="god-save">
            {GOD_MODE_LABELS.saveCount(count)}
          </Button>
        </div>
      </div>
    </div>
  );

  function faithOptions() {
    return sortedBy(Object.entries(content.registries.belonging.faiths).map(([id, f]) => ({ id, name: f.name })), (f) => f.name).map((f) => ({ value: f.id, label: f.name }));
  }
}

function PronounPicker({ pronouns, presets, onChange, label = GOD_FIELD_LABELS.pronouns }: { pronouns: Pronouns; presets: ReturnType<typeof getPronounPresets>; onChange: (p: Pronouns) => void; label?: string }) {
  const same = (a: Pronouns, b: Pronouns) => (Object.keys(a) as (keyof Pronouns)[]).every((k) => a[k] === b[k]);
  const preset = presets.find((p) => same(pronounsFromPreset(content, p.id), pronouns));
  const [custom, setCustom] = useState(preset === undefined);
  const fields: [Exclude<keyof Pronouns, 'verbPlural'>, string][] = [
    ['subject', GOD_FIELD_LABELS.subject],
    ['object', GOD_FIELD_LABELS.object],
    ['possessive', GOD_FIELD_LABELS.possessive],
    ['possessivePronoun', GOD_FIELD_LABELS.possessivePronoun],
    ['reflexive', GOD_FIELD_LABELS.reflexive],
  ];
  return (
    <div className="flex flex-col gap-3">
      <SingleChoice
        label={label}
        value={custom ? 'custom' : (preset?.id ?? 'custom')}
        choices={[...presets.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: GOD_FIELD_LABELS.custom }]}
        onChange={(x) => {
          if (x === 'custom') setCustom(true);
          else {
            setCustom(false);
            onChange(pronounsFromPreset(content, x));
          }
        }}
      />
      {custom && (
        <>
          {fields.map(([key, name]) => (
            <TextField key={key} label={name} value={pronouns[key]} autoCapitalize="none" onChange={(x) => onChange({ ...pronouns, [key]: x })} />
          ))}
          <Toggle label={GOD_FIELD_LABELS.pluralVerbs} checked={pronouns.verbPlural} onChange={(x) => onChange({ ...pronouns, verbPlural: x })} />
        </>
      )}
    </div>
  );
}

/** A 0–100 value that is either set or not (a person's trait, a hidden trait). */
function OptionalSlider({ label, value, initial, onChange }: { label: string; value: number | null; initial: number; onChange: (value: number | null) => void }): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <Toggle label={label} checked={value !== null} onChange={(x) => onChange(x ? initial : null)} {...(value === null ? { note: GOD_MODE_LABELS.none } : {})} />
      {value !== null && <ScoreSlider label={label} value={value} showNumber steps={{ down: GOD_MODE_LABELS.stepDown, up: GOD_MODE_LABELS.stepUp, step: 5 }} onChange={onChange} />}
    </div>
  );
}

/** What they are to you: each kind is disabled, with its reason beside it, when the rules would refuse it. */
function KindChoice({ current, original, reasonFor, onChange }: { current: string; original: string; reasonFor: (kind: (typeof KIND_CHOICES)[number]) => string | null; onChange: (kind: (typeof KIND_CHOICES)[number]) => void }) {
  const kinds = KIND_CHOICES.map((k) => ({ kind: k, reason: k === original ? null : reasonFor(k) }));
  return (
    <fieldset className="flex flex-col gap-2" data-testid="god-kind">
      <legend className="mb-2 text-sm font-semibold">{GOD_FIELD_LABELS.relationship}</legend>
      <div role="radiogroup" aria-label={GOD_FIELD_LABELS.relationship} className="grid grid-cols-2 gap-2">
        {kinds.map(({ kind, reason }) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={current === kind}
            disabled={reason !== null}
            aria-describedby={reason ? `god-kind-${kind}-why` : undefined}
            onClick={() => onChange(kind)}
            data-testid={`god-kind-${kind}`}
            className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold ${current === kind ? 'border-accent bg-accent text-accent-contrast' : 'border-border bg-surface text-text'} disabled:opacity-50`}
          >
            {GOD_RELATIONSHIP_KIND_LABELS[kind]}
          </button>
        ))}
      </div>
      {kinds.map(({ kind, reason }) =>
        reason ? (
          <p key={kind} id={`god-kind-${kind}-why`} className="text-sm text-muted" data-testid={`god-kind-${kind}-why`}>
            {GOD_RELATIONSHIP_KIND_LABELS[kind]}: {reason}
          </p>
        ) : null,
      )}
    </fieldset>
  );
}

function CitySheet({ current, countryOf, reasonFor, onPick, onClose }: { current: string; countryOf: string | undefined; reasonFor: (cityId: string) => string | null; onPick: (cityId: string) => void; onClose: () => void }) {
  const cities = sortedBy(
    Object.values(content.cities).filter((c) => !c.retired && c.countryId === countryOf),
    (c) => c.name,
  );
  return (
    <Sheet open title={GOD_MODE_LABELS.chooseCity} onClose={onClose} footer={<Button variant="secondary" block onClick={onClose}>{GOD_MODE_LABELS.back}</Button>}>
      <p className="mb-2 text-sm text-muted">{content.countries[countryOf as never]?.name}</p>
      <ul className="flex flex-col gap-2">
        {cities.map((c) => {
          const reason = c.id === current ? null : reasonFor(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                disabled={reason !== null}
                aria-current={c.id === current ? 'true' : undefined}
                onClick={() => onPick(c.id)}
                data-testid={`god-city-${c.id}`}
                className={`min-h-11 w-full rounded-xl border px-3 py-2 text-left font-semibold ${c.id === current ? 'border-accent' : 'border-border'} disabled:opacity-50`}
              >
                {c.name}
                {reason && <span className="block text-sm font-normal text-muted">{reason}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function AgeStepper({ age, min, max, onChange }: { age: number; min: number; max: number; onChange: (age: number) => void }) {
  return (
    <div className="flex flex-col gap-2" data-testid="god-age">
      <p className="font-semibold">
        {GOD_MODE_LABELS.age}: <span data-testid="god-age-value">{age}</span>
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={age <= min} aria-label={GOD_FIELD_LABELS.younger} onClick={() => onChange(age - 1)}>
          −
        </Button>
        <Button variant="secondary" disabled={age >= max} aria-label={GOD_FIELD_LABELS.older} onClick={() => onChange(age + 1)}>
          +
        </Button>
      </div>
      <p className="text-sm text-muted">{GOD_MODE_LABELS.ageRange(min, max)}</p>
    </div>
  );
}

