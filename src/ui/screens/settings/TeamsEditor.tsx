import { useId, useMemo, useState } from 'react';
import { content } from '../../../content';
import { firstSetupProblem, getTeamEditorView, teamRenames, type AddedTeam, type TeamEditorRow, type TeamSetup } from '../../../engine/selectors';
import { useAppStore } from '../../../store/appStore';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';
import { TextField } from '../../components/TextField';
import { TEAM_EDITOR_WORDS } from '../../labels';

const SELECT = 'min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-text';
/** The most teams listed at once; a search narrows the rest. */
const PAGE = 30;

type Edit = { kind: 'team'; row: TeamEditorRow } | { kind: 'new' } | null;

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/** Settings → Teams (Batch 6): rename any team, change its city among the game's cities, and add your own. */
export function TeamsEditor({ onBack }: { onBack: () => void }) {
  const stored = useAppStore((s) => s.settings.teams);
  const saveTeams = useAppStore((s) => s.saveTeams);
  const life = useAppStore((s) => s.life);
  const takeLifeAction = useAppStore((s) => s.takeLifeAction);
  const view = useMemo(() => getTeamEditorView(stored, content), [stored]);
  const [sportId, setSportId] = useState(view.sports[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [edit, setEdit] = useState<Edit>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sport = view.sports.find((s) => s.id === sportId) ?? view.sports[0];
  const matches = (sport?.teams ?? []).filter((t) => `${t.name} ${t.cityName} ${t.place ?? ''}`.toLocaleLowerCase('en-US').includes(query.trim().toLocaleLowerCase('en-US')));

  const commit = async (next: TeamSetup): Promise<boolean> => {
    setSaving(true);
    setProblem(null);
    try {
      await saveTeams(next);
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message.replace(/^Invalid team setup: /, '') : 'Those changes could not be saved.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // A life in progress: the names it shows follow the settings at once (display only); moved and added teams wait for next season.
  const lifeNames = life ? teamRenames(life.league.setup, stored, content).length : 0;
  const lifeDiffers = life !== null && (JSON.stringify(life.league.pending?.moved ?? life.league.setup.moved) !== JSON.stringify(stored.moved) || JSON.stringify(life.league.pending?.added ?? life.league.setup.added) !== JSON.stringify(stored.added));
  const useInLife = () => void takeLifeAction('sync_teams', { teamChange: { moved: stored.moved, added: stored.added } });

  return (
    <Screen title="Teams" onBack={onBack} backLabel="Back to settings">
      <div className="flex flex-col gap-4" data-testid="teams-editor">
        <p className="text-sm text-muted">{TEAM_EDITOR_WORDS.intro}</p>
        {life && (lifeNames > 0 || lifeDiffers) && (
          <Card className="flex flex-col gap-2" data-testid="teams-life-note">
            <p className="text-sm">{TEAM_EDITOR_WORDS.lifeNote}</p>
            {lifeDiffers && (
              <Button variant="secondary" block disabled={life.phase !== 'yearStart'} onClick={useInLife} data-testid="teams-sync">
                {TEAM_EDITOR_WORDS.sync}
              </Button>
            )}
          </Card>
        )}
        {life?.league.pending && <p className="text-sm text-muted">{TEAM_EDITOR_WORDS.pending}</p>}
        <Field label="Sport">
          {(id) => (
            <select
              id={id}
              className={SELECT}
              value={sport?.id ?? ''}
              onChange={(e) => {
                setSportId(e.target.value);
                setLimit(PAGE);
              }}
            >
              {view.sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <TextField label="Find a team" value={query} onChange={(v) => { setQuery(v); setLimit(PAGE); }} placeholder="Name or city" />
        <Button variant="secondary" block onClick={() => setEdit({ kind: 'new' })} data-testid="teams-add">
          Add a team
        </Button>
        <ul className="flex flex-col gap-2" aria-label="Teams" data-testid="teams-list">
          {matches.slice(0, limit).map((t) => (
            <li key={t.id}>
              <Card className="flex items-center justify-between gap-3 !p-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words" data-testid={`team-name-${t.id}`}>
                    {t.name}
                  </p>
                  <p className="text-sm text-muted break-words">
                    {t.place ? `${t.place} (you live in ${t.cityName})` : t.cityName}
                    {t.division !== null && sport?.tiers ? ` · ${sport.tiers[t.division - 1]}` : ''}
                    {t.custom ? ' · yours' : t.renamed || t.moved ? ' · changed' : ''}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => setEdit({ kind: 'team', row: t })} aria-label={`Edit ${t.name}`} data-testid={`team-edit-${t.id}`}>
                  Edit
                </Button>
              </Card>
            </li>
          ))}
          {matches.length === 0 && <li className="text-sm text-muted">No team matches.</li>}
        </ul>
        {matches.length > limit && (
          <Button variant="ghost" block onClick={() => setLimit(limit + PAGE)}>
            Show more
          </Button>
        )}
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
      </div>
      {edit && sport && (
        <TeamSheet
          key={edit.kind === 'team' ? edit.row.id : 'new'}
          edit={edit}
          sportId={sport.id}
          stored={stored}
          cities={view.cities}
          strengths={view.strengths}
          twoLeagues={sport.tiers !== null}
          saving={saving}
          onClose={() => {
            setEdit(null);
            setProblem(null);
          }}
          commit={commit}
        />
      )}
    </Screen>
  );
}

function TeamSheet({
  edit,
  sportId,
  stored,
  cities,
  strengths,
  twoLeagues,
  saving,
  onClose,
  commit,
}: {
  edit: Exclude<Edit, null>;
  sportId: string;
  stored: TeamSetup;
  cities: { id: string; name: string; country: string }[];
  strengths: { level: 1 | 2 | 3 | 4 | 5; label: string }[];
  twoLeagues: boolean;
  saving: boolean;
  onClose: () => void;
  commit: (next: TeamSetup) => Promise<boolean>;
}) {
  const row = edit.kind === 'team' ? edit.row : null;
  const known = row !== null && !row.custom;
  const [name, setName] = useState(row?.name ?? '');
  const [nickname, setNickname] = useState(row?.nickname ?? '');
  const [city, setCity] = useState(row?.cityId ?? cities[0]?.id ?? '');
  const [strength, setStrength] = useState<number>(row?.strength ?? 3);
  const [tier, setTier] = useState<1 | 2>(row?.division ?? 1);
  const [issue, setIssue] = useState<string | null>(null);

  const build = (): TeamSetup => {
    const setup: TeamSetup = JSON.parse(JSON.stringify(stored)) as TeamSetup;
    if (row === null) {
      const n = 1 + Math.max(0, ...setup.added.map((a) => Number(a.id.replace(/\D/g, '')) || 0));
      const added: AddedTeam = { id: `custom_${n}`, sport: sportId, name, ...(nickname.trim() ? { nickname } : {}), city, strength: strength as AddedTeam['strength'], ...(twoLeagues ? { tier } : {}) };
      setup.added.push(added);
      return setup;
    }
    if (row.custom) {
      setup.added = setup.added.map((a) => (a.id === row.id ? { ...a, name, ...(nickname.trim() ? { nickname } : { nickname: undefined }), city, strength: strength as AddedTeam['strength'], ...(twoLeagues ? { tier } : {}) } : a)).map((a) => JSON.parse(JSON.stringify(a)) as AddedTeam);
      delete setup.moved[row.id];
      return setup;
    }
    const base = content.famePaths[sportId]?.sport?.leagues.pro.teams.find((t) => t.id === row.id);
    const rename: { name?: string; nickname?: string } = {};
    if (name.trim() !== base?.name) rename.name = name;
    // A nickname typed is a rename; one left as it was is not.
    if (nickname.trim() !== '' && nickname.trim() !== row.nickname) rename.nickname = nickname;
    else if (setup.renamed[row.id]?.nickname !== undefined && nickname.trim() === row.nickname) rename.nickname = setup.renamed[row.id]!.nickname!;
    if (rename.name !== undefined || rename.nickname !== undefined) setup.renamed[row.id] = rename;
    else delete setup.renamed[row.id];
    if (base && city !== base.city) setup.moved[row.id] = city;
    else delete setup.moved[row.id];
    return setup;
  };

  const save = async () => {
    const next = build();
    const problem = firstSetupProblem(next, content);
    if (problem !== null) {
      setIssue(problem);
      return;
    }
    setIssue(null);
    if (await commit(next)) onClose();
  };

  const reset = async () => {
    if (!row) return;
    const setup: TeamSetup = JSON.parse(JSON.stringify(stored)) as TeamSetup;
    delete setup.renamed[row.id];
    delete setup.moved[row.id];
    if (await commit(setup)) onClose();
  };

  const remove = async () => {
    if (!row?.custom) return;
    const setup: TeamSetup = JSON.parse(JSON.stringify(stored)) as TeamSetup;
    setup.added = setup.added.filter((a) => a.id !== row.id);
    delete setup.moved[row.id];
    delete setup.renamed[row.id];
    if (await commit(setup)) onClose();
  };

  return (
    <Sheet
      open
      title={row ? (row.custom ? 'Edit your team' : 'Edit team') : 'Add a team'}
      onClose={onClose}
      footer={
        <>
          <Button block onClick={save} disabled={saving} data-testid="team-save">
            Save
          </Button>
          {known && (row.renamed || row.moved) && (
            <Button variant="secondary" block onClick={reset} disabled={saving}>
              Put back the game’s version
            </Button>
          )}
          {row?.custom && (
            <Button variant="danger" block onClick={remove} disabled={saving}>
              Remove this team
            </Button>
          )}
          <Button variant="secondary" block onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="team-sheet">
        <TextField label="Team name" value={name} onChange={setName} maxLength={40} data-testid="team-name-input" />
        <TextField label="Nickname" value={nickname} onChange={setNickname} maxLength={30} hint="Optional. Used in headlines and stories." data-testid="team-nickname-input" />
        <Field label="City">
          {(id) => (
            <select id={id} className={SELECT} value={city} onChange={(e) => setCity(e.target.value)} data-testid="team-city-input">
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.country})
                </option>
              ))}
            </select>
          )}
        </Field>
        {(row === null || row.custom) && (
          <>
            <Field label="Strength">
              {(id) => (
                <select id={id} className={SELECT} value={strength} onChange={(e) => setStrength(Number(e.target.value))} data-testid="team-strength-input">
                  {strengths.map((s) => (
                    <option key={s.level} value={s.level}>
                      {s.level} · {s.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {twoLeagues && (
              <Field label="League">
                {(id) => (
                  <select id={id} className={SELECT} value={tier} onChange={(e) => setTier(Number(e.target.value) === 2 ? 2 : 1)}>
                    <option value={1}>Top league</option>
                    <option value={2}>Second league</option>
                  </select>
                )}
              </Field>
            )}
          </>
        )}
        {issue && (
          <p role="alert" className="text-sm text-danger" data-testid="team-issue">
            {issue}
          </p>
        )}
      </div>
    </Sheet>
  );
}

