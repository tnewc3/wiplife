# WIPlife — Post-Expansion 1 Changes

**Status:** Triage of the first playtest after the full expansion wave (C1 through W6), with a batch of coding-AI prompts for each fix. Written 2026-10-15 from the playtest notes (`postexp1.txt`), the code on `main` at `8a9fbb9`, the CI and nightly logs, `docs/w4b-validation.md`, `docs/w5-validation.md`, and a 1,000-life simulation run for this review.

---

## How to use this file

- **One batch is one pull request into `main`,** following AGENTS.md (branch from the latest `main`, one task per PR, merge only when CI is green).
- **Run the batches in order.** Batch 0 comes first because CI and the nightly runs must be green, and the simulation fast enough, before anything else is added. After that the order follows dependencies: Batch 4's practice system is reused by Batch 5, Batch 5's sports changes by Batch 6, and Batch 4's fame changes by Batch 8.
- **Copy the batch's prompt** (the `text` block) into a new Claude session on a fresh branch. Each prompt stands alone, but it tells Claude to read this file for the starting facts.
- **Starting facts** are what the code did on 2026-10-15, with file paths and line numbers. Code moves, so every prompt tells Claude to re-check them before relying on them.
- **Batches 7 and 9 have two steps:** first a plan (a gate written into `docs/expansion.md`, then a stop for your approval), then the build. They change the architecture, and AGENTS.md says to stop and ask in that case.

### Decisions already made (2026-10-15)

| Question | Decision |
|---|---|
| Social media platforms | **Real names:** Instagram, TikTok, X (Twitter), YouTube, Twitch and podcasts. Batch 8 amends the "platforms are fictional" rule in `docs/expansion.md` for this path only. |
| W4b (Language) and W5 (Travel) | **Validate, then expand:** Batch 0 closes their missing acceptance gates; Batch 10 adds features. |
| God mode | **A Settings toggle.** Edited lives are **not** marked in the archive. |
| Team names | Fictional by default, renameable by the player in Settings, and the change persists across lives (Batch 6). |

---

## Triage of the playtest notes

| # | Note (paraphrased) | What the code does today (verified) | Kind | Batch |
|---|---|---|---|---|
| 1 | Can't romance the same gender after choosing same-sex attraction | Romance interactions and "Ask out" appear only when attraction is mutual (`src/engine/relationships.ts:54-56`, `src/engine/interactions/availability.ts:51-54`), and interactions that aren't available are hidden. Friends, coworkers and classmates get their attraction from the population weights (`src/content/balance/creation.yaml:15-31`), so only about 11% of men are attracted to men. A gay man finds romance options on roughly 1 in 9 men he knows, while a straight man finds them on about 94% of the women he knows. People made for a romantic role (dating app, meet-cute, travel) are fine. | **Bug** | 1 |
| 2 | Names should fit where you're born (Mexico → Mexican names) | Name pools exist per country and heritage (`src/content/names/*.yaml`, about 11–27 first names per heritage). Your birth family shares a heritage. Heritage isn't stored on anyone, so everyone else (including your own children) rolls a heritage from the current country's weights (`src/engine/events/casting.ts:197-205`, `src/engine/family/children.ts:102-107`). Weights are per country, not per city. | **Bug / gap** | 1 |
| 3 | Missing BitLife-style action categories | **Missing:** black market, lawsuits, movie theater, nightlife, plastic surgery, salon & spa, shopping, gambling as an action (events only). **Partial:** identity (gender and pronouns, no name change), mind & body (doctor and therapist, no gym), loans (only with a purchase), crime (crew events, no menu), outdoor, luxury, love (no "find a date" action). | **Gap** | 1, 2a, 2b |
| 4 | School should do more, and follow the country (US high school, UK secondary) | Each country has stage names, grade display and exams (`src/content/countries/*.yaml`). The UK has no sixth-form stage (`primary / secondary / secondary`). There's one hidden GPA and no "study harder" action. Classmates come only from events and cliques, and teachers aren't people you can interact with. | **Gap** | 3 |
| 5 | See coworkers at work and interact with them | A boss and up to 4 coworkers exist as people (`src/engine/career.ts:205-224`), with 19 interactions. They show only in the People tab; the Work tab shows just "Your boss". There's no "work harder" action. Coworkers are left out of social-web ties (`src/engine/web/ties.ts:29`). | **Gap** | 3 |
| 6 | Music: genre, song and album titles, bands, open mic is a dead end, concerts and tours, fame too slow | The entry route isn't stored (`src/engine/fame/ladder.ts:68-94`), and there is no band, member or leader concept. Titles are random from 12 fixed ones (`src/content/text/fame.yaml:113-125`), and there's no genre. One project a year, with "tour" as a checkbox on it; no gigs and no gig cap. Without a fitting talent, a career stalls around rungs 2–3 ("local at 28"). | **Gap / flaw** | 4 |
| 7 | Grind skills (vocals, instruments) | Skill is one `craft` number per path that grows by itself each year (`src/engine/fame/work.ts:106-114`). There's no practice action (`src/engine/actions/fame.ts:16`). | **Gap** | 4, 5 |
| 8 | Sports overhaul: tryouts for specific teams, scholarships, academies, abroad, draft pay, transfers and loans, no training injuries, undrafted tryouts, personal training, more cities and countries, editable teams | Injury risk is multiplied by the training focus (`src/engine/sports/injury.ts:22-36`, `src/content/balance/sports.yaml:18-20`). The open-tryout route takes ages 17–26, but college players age out at 23 (`src/content/fame/basketball.yaml:13,71`, `src/engine/sports/season.ts:251`), so anyone entering at 24–26 is out after their first season. School teams (`src/engine/teen/activities.ts`) are a separate system. There are no athletic scholarships (`src/engine/education.ts:299-304`) and rookie pay goes by round only (`src/engine/sports/contract.ts:28-33`). Pro teams are limited to your own country (`src/engine/sports/team.ts:26-28`). There are no soccer loans or transfers and no training without a team. Settings store only four fields (`src/persistence/settings.ts`). Almost everything happens automatically each year. | **Bug + gap** | 1, 5, 6 |
| 9 | Business is too simple: no stock, products or supply and demand; staff capped at 10 | One price setting for the whole business, with no products or stock (`src/engine/business/model.ts:131-149`). Named staff are capped at **4** (`src/content/balance/business.yaml:11`), not 10. The rest is computed "crew" (at most 8 workers at a location). Hiring always goes to the first location (`src/ui/screens/work/BusinessScreen.tsx:60,72`). The city `competition` value is loaded but never used (`model.ts:15,21`). | **Gap + bug** | 7 |
| 10 | God mode: edit any part of a generated person | There's no editor. The data lives in `src/engine/types.ts` (Character 109-136, Person 138-180) and is checked by strict zod schemas (`src/persistence/lifeSchema.ts`). Lives replay from the input log (`src/engine/replay.ts`), which has no "edit" record. The sandbox (`/?sandbox`) only previews events. | **Feature** | 9 |
| 11 | Social media expansion on real platforms | The social path has four kinds of work (short videos, series, livestreams, a big collab) and fictional "platforms" that are only contract companies (`src/content/studios`). There are no accounts, platforms or podcasts. | **Feature** | 8 |
| 12 | W4b Language, W5 Travel | Both merged without their acceptance gates: no completed 10,000-life run, and the full suite and CI not verified green (`docs/w4b-validation.md`, `docs/w5-validation.md`). | **Validation + feature** | 0, 10 |
| 13 | Check the ChatGPT validation files, review for bugs, run a 1,000-life simulation | Done for this review. Results below, and the fixes in Batch 0. | **Process** | 0 |

---

## Serious flaws, ranked

1. **CI's large runs have been failing for a week, and two stages merged without their gates.** The nightly job failed every night from 2026-10-08 to 10-14: all four 2,500-life lifespan shards hit their fixed 600-second timeout (`src/engine/lifespanShard.ts`). The nightly 10,000-life simulation step has no `if: always()`, so it hasn't run since 10-07. W5 (PR #37) merged with its CI cancelled, and `main`'s push CI then failed on the travel e2e test (run 38467127039). W6 turned `main` green again (run 38622584296). W4b's and W5's 10,000-life gates were never completed, and W6's 10,000-life totals were recorded before its last fix.
2. **The simulation is getting slower with every stage.** The CI 500-life step took 10m07s at the W5 merge and 18m03s at W6. The nightly 2,000-life coverage run took 2,426 s (about 1.2 s a life). Each new batch adds more, so the 60-minute CI limit is at risk without a performance budget.
3. **Same-sex romance is effectively broken for everyone you already know** (note 1). The game isn't wrong about attraction: it requires attraction both ways, then hides the menu. Combined with the population weights, this means a gay or lesbian player almost never sees a romance option.
4. **Invariant failures and targets that have slipped.** The nightly 2,000-life coverage run on the W5 merge commit reported 12 invariant failures. This review's 1,000-life run on `main` had none, but 11 of the careful player's targets were not met, including business owners earning 6.3× what workers earn (target at most 3.2×) and `beginYear` at 28 ms (target at most 20 ms). See the results below.
5. **A W5 block that blocks nothing.** The temporary-stay blocklist names `start_fame` and `start_sport` (`src/engine/actions/life.ts:315`), but neither action exists. The real one is `enter_fame`, so you can start a fame or sports career while on an exchange or working holiday abroad.
6. **Sports dead ends:** an open-tryout entry at 24–26 ends after one season, and training raises injury risk (note 8).
7. **Music has no route forward from an open mic,** and without a talent the climb stops at "local" (note 6).
8. **Smaller correctness gaps:**
   - Custom creation defaults "Attracted to" to nobody (`src/ui/screens/custom/draft.ts:62`). The summary shows it, but it's easy to miss.
   - People-you-know couples (E3) check attraction only one way (`src/engine/lives/love.ts:26-51`).
   - Business hires always go to the first location.
   - A city's business `competition` value is never used.
9. **Event repetition is high, though within target.** The nightly coverage run had 36.2% of fired events repeating one the life already had. `therapist_talked` fires about 8 times a life, `doctor_all_clear` 7.2 and W4b's `language_class_result` 6.7 (2.0% of all events fired, against a 3% cap). Repeats of events not marked recurring were 13.4%, within the 15% target. This is Stage 12 balancing work, but Batch 0 checks `language_class_result`, since W4b's validation never did.

---

## 1,000-life simulation (run for this review)

Command: `npm run simulate -- --lives 1000 --seed postexp1` (the defaults: careful and careless players on the same seeds, careful lives continued as heirs for three generations). Code at `8a9fbb9`, content `0.1.0+10d9f36ef0` (1,719 definitions). It ran in this review's cloud container, so the timing doesn't compare directly with CI's.

**Result: 0 invariant failures** in every generation (1,000, 415 and 33 lives). 10 of 10 sampled lives rebuilt exactly from their input logs. The W6 "must be zero" checks were 0. It took **5,382 s** (about 90 minutes). The 12 invariant failures from the nightly coverage run on `238e0fb` didn't appear on this seed set; Batch 0 still reproduces them from that run's seeds.

**Careful-player targets NOT MET:**

| Target | Result | Target range |
|---|---|---|
| Bankruptcy | 25.4% of adults | at most 15% (already unmet before W4a; see the W4a as-built notes) |
| Bachelor's vs high school lifetime earnings | 1.26× | at least 1.3× |
| Lives with PTSD | 1.5% | 3–16% |
| Drug possession on record | 2.9% | 6–20% |
| Shoplifting on record | 7.8% | 10–30% |
| Underage drinking on record | 1.8% | 2–25% |
| Lives reaching 50 with a child | 46.0% | 50–90% |
| `beginYear` time, full circle of 60 | 28.38 ms | at most 20 ms |
| Eulogy pieces used at least once | 79.2% | 80–100% (a 1,000-life sample may be too small for this one) |
| Business owners' yearly income vs workers' | 6.32× | 0.60–3.20× |
| Owners' median net worth at 65 vs everyone else's | 3.66× | 0.50–2.60× |

**Other observations:**
- Average `beginYear` was 15.56 ms, with the slowest year at 408 ms.
- `language_class_result` was the most repeated event not marked recurring (5,355 repeats), followed by `travel_trip_booking` (2,970).
- 95.6% of lives took a trip, at 3.9 trips a life.
- 4.1% moved abroad.
- Median lifespan was 82, and the per-country targets (lifespan, pay at 40, net worth at 65) were all met.

The business ratios look like a regression since W3 (its four 2,500-life runs had owners at 1.7–2.8× workers' income). Whether one of the later stages caused it, and which, is **unverified**. Many unmet targets come from a single 1,000-life sample (PTSD, the offense records, children by 50); the 10,000-life runs in Batch 0 decide which are real. The careless player's unmet targets are reported but not tuned for, as the simulation runner says.

---

## Rules for every batch

These come from AGENTS.md and the expansion gates. Each prompt repeats the short form.

- **Read first:** AGENTS.md, `docs/design.md`, `docs/technical.md`, `docs/expansion.md` and this file. Inspect the code before changing it. Extend existing systems; never build a second one that does the same job.
- **Where things live:**
  - Content (names, items, text, teams, platforms) in `src/content` as YAML.
  - Numbers in `src/content/balance`.
  - Fixed interface words in `src/ui/labels.ts`.
  - Persistence code in `src/persistence` only.
  - No `Math.random` or `Date.now` in the engine.
- **Consistency rules** (category contracts, presence, evidence, `{since}`, money shown with the amount and new balance, household, status-aware text): the content build must show no unreviewed warnings.
- **Content rules:** no romance or sexual content involving anyone under 18, no sexual violence as a choice, and crime and drugs at the level of story and consequences, never real-world instructions. Pronoun placeholders for every NPC.
- **Every new player action** is validated, recorded in the input log, and replays exactly.
- **Every changed saved shape** bumps the schema version with a migration (in lives and in heir replay snapshots) and a migration test.
- **Testing:** unit tests for every new system, and a phone-sized e2e test for every new screen or flow. Touch targets of 44px or more, safe areas respected, nothing that depends on hover.
- **Simulation:**
  - Extend `tools/simulate.ts` with the batch's report and targets in `balance/targets.yaml`.
  - Run a 1,000-life smoke run while working, then 10,000 lives as four shards of 2,500 with recorded seeds.
  - Zero invariant failures.
  - Keep within the performance budget set in Batch 0.
- **Finishing:** add the batch's "as built" notes to `docs/technical.md` and update README.md where commands or screens change. Open the PR into `main`, wait for green CI, and report only verified facts (label anything unverified).

---

## Batch 0 — Stabilize and validate

> **Built in PR #40;** see "Batch 0 — Stabilize and validate (as built)" in docs/technical.md for what was done, the figures and the deviations.

**Objective:** Get CI and the nightly runs green, stop the simulation from getting slower with every stage, finish the acceptance gates W4b and W5 skipped, and fix the bugs found in this review, before any new feature work.

### Starting facts

- Nightly (`.github/workflows/nightly.yml`) has failed every night from 2026-10-08 to 10-14:
  - `npx vitest run src/engine/lifespan` with `LIFESPAN_LIVES=10000` gives each of the four shards 2,500 lives and a fixed 600,000 ms timeout (`src/engine/lifespanShard.ts`), and all four time out.
  - The "Simulation (10,000 lives)" and "spamming player" steps have no `if: always()`, so they are skipped once a step fails.
  - The 2,000-life coverage step on commit `238e0fb` reported `NOT MET invariant failures: 12`.
- Speed:
  - CI's "Simulation (500 lives)" step took 10m07s on `238e0fb` (W5) and 18m03s on `eb142a3` (W6).
  - The coverage run took 2,426 s for 2,000 lives.
  - `balance/targets.yaml` has `maxBeginYearMs: 20`, but nothing guards the whole year's time.
- W4b (`docs/w4b-validation.md`):
  - The 10,000-life run was never completed.
  - The full suite had two timeouts (`lifespan-1`, `tools/simulate/run.test.ts`) whose cause was never found.
  - `language_class_result` is now 2.0% of all events fired (6.7 a life).
- W5 (`docs/w5-validation.md`):
  - Both 5,000-life runs were killed at about 1,900 lives without reports.
  - The full suite and CI were never seen green before merging.
  - Open questions: part-year stays, families on temporary stays, pension portability.
- W6 (`docs/technical.md`, W6 as built): the 10,000-life totals were recorded before commit `eb142a3`'s fix and weren't re-run.
- The bug `src/engine/actions/life.ts:315`: the temporary-stay blocklist names `start_fame` and `start_sport`, which don't exist; the real action is `enter_fame`. `enterBlock` (`src/engine/fame/ladder.ts:54-65`) doesn't check residence either.
- See the 1,000-life section above for this review's own results.

### Acceptance criteria

- The nightly workflow passes:
  - The 10,000-life lifespan test runs in shards small enough for the timeout (for example 16 shards of 625, the same size as a PR shard) without raising any per-test timeout to hide slowness.
  - The simulation steps run even if an earlier step fails (`if: always()`) and upload their reports.
- **Performance:**
  - Profile a year of the pipeline (`beginYear`, the events, people, web, fame, business, travel and migration steps) and fix the largest costs without changing outcomes. The fixed-seed replay must give identical lives, proven by a golden-life test.
  - Bring the CI 500-life step back to about W5's time or better.
  - Add a performance budget the CI run checks: mean milliseconds per simulated year, set in `balance/targets.yaml` from the measured value plus headroom, reported by `tools/simulate.ts` and failing CI when exceeded.
- Every invariant failure from the nightly coverage run is reproduced by seed, root-caused, fixed and covered by a regression test.
- Every careful-player target NOT MET in this review's 1,000-life run is checked at 10,000 lives. Each one still unmet is either fixed at its cause (business income and net worth ratios, `beginYear` time first) or retuned in balance with the reason recorded in `docs/technical.md`.
- The W5 blocklist uses real action ids and is checked by a test that every id in an action allow/block list exists.
- W4b and W5 finish their gates:
  - 10,000-life runs (four shards of 2,500, recorded seeds) with zero invariant failures.
  - Their reports' figures written into `docs/technical.md`, with `docs/w4b-validation.md` and `docs/w5-validation.md` marked superseded.
  - Every W4b and W5 acceptance criterion in `docs/expansion.md` checked and marked met, or listed as not met with the reason.
  - `language_class_result`'s frequency reviewed: either justified as recurring, or given a cooldown.
- W6's 10,000-life run is repeated on the fixed code and its numbers replaced.
- `npm run check`, `npm run test:e2e`, CI and one manual nightly run (`workflow_dispatch`) are all green.

### Prompt

```text
You are implementing Batch 0 (Stabilize and validate) of the post-expansion-1 changes for WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md (section Q and the W4b, W5 and W6 as-built notes), docs/expansion.md (W4b, W5, W6), docs/w4b-validation.md, docs/w5-validation.md and docs/post-expansion1-changes.md (the triage, the serious flaws, the 1,000-life results and Batch 0). Re-check each starting fact in Batch 0 against the code and the CI logs before relying on it; the code wins.

Build only Batch 0. No new game features.
- Nightly: shard the 10,000-life lifespan test so each shard fits the existing per-test timeout (for example 16 shards of 625 lives), keeping the same seeds as today's runs; give the nightly simulation steps if: always() so they run and upload reports even when an earlier step fails. Do not raise timeouts to hide slowness.
- Performance: profile a simulated year step by step (tools/simulate.ts already measures beginYear) and fix the largest costs without changing any outcome. Prove it with a fixed-seed golden-life test that compares whole lives before and after. Bring the CI 500-life simulation step back to about its W5 duration (10 minutes) or better. Add a mean-milliseconds-per-simulated-year budget to balance/targets.yaml (measured value plus headroom), reported by tools/simulate.ts, that fails the run when exceeded.
- Invariants: reproduce every invariant failure from the nightly coverage run on 238e0fb by seed, find the root cause, fix it in the system that owns it, and add a regression test for each.
- Targets: check every careful-player target listed as NOT MET in the 1,000-life section of docs/post-expansion1-changes.md at 10,000 lives. For each still unmet, fix the cause (start with the business owners' income and net worth ratios, which look like a regression since W3, and beginYear time) or retune balance with the reason recorded in docs/technical.md.
- Bugs: fix the W5 temporary-stay blocklist in src/engine/actions/life.ts (it names start_fame and start_sport, which do not exist; the real action is enter_fame). Add a test that every action id in an allow or block list exists in LIFE_ACTION_IDS.
- W4b and W5 gates: run 10,000 lives for each (four shards of 2,500 with recorded seeds, --player careful --generations 1 plus the default run), with zero invariant failures. Check every W4b and W5 acceptance criterion in docs/expansion.md and record met or not met with the evidence. Review language_class_result's frequency (2.0% of all events fired, 6.7 per life) and either justify it as recurring or add a cooldown. Write the figures into the W4b and W5 as-built notes in docs/technical.md and mark docs/w4b-validation.md and docs/w5-validation.md as superseded by those notes.
- W6: re-run its 10,000-life simulation on the fixed code and replace the recorded figures.
- Run a general bug sweep: read the as-built notes and the newest engine folders (travel, migration, languages, business, sports) for state that can go out of sync, and fix only verified bugs, each with a test. List anything suspicious you could not confirm as unverified.

Acceptance: every Batch 0 criterion in docs/post-expansion1-changes.md. Run npm run check, npm run test:e2e and the simulations; trigger the nightly workflow once by hand (workflow_dispatch) and confirm it passes. Open a pull request into main, wait for CI to be green, and report what you fixed (with seeds and root causes), before-and-after timings, the W4b, W5 and W6 10,000-life results, deviations and why, and open questions. Report only verified facts; label anything unverified.
```

---

## Batch 1 — Playtest bug fixes: romance, names, sports injuries

**Objective:** Fix the three playtest problems that are bugs rather than missing features: same-sex romance, names that ignore where people are from, and sports injuries caused by training.

### Starting facts

**Romance**
- `mutualAttraction` (`src/engine/relationships.ts:54-56`) controls:
  - `isRomanticMatch`, `canChangeKind → partner` and `ask_out` (`src/engine/actions/relationships.ts:36-45`);
  - the romance interactions (`src/engine/interactions/availability.ts:51-54`);
  - romantic casting of existing people (`src/engine/events/casting.ts:97`);
  - E4 couples (`src/engine/web/ties.ts:68`).
- Interactions that aren't available are hidden (`src/engine/interactions/views.ts:29`).
- Friends, coworkers and classmates roll attraction from `balance/creation.yaml:15-31`, with no link to you.
- New romantic people do match you (`casting.ts:159-165`, `casting.ts:217`), tested in `src/engine/relationships.test.ts:153-179`. There is no test for same-gender romance with people you already know.
- Custom creation defaults to `attractedTo: []` (`src/ui/screens/custom/draft.ts:62`).
- E3 couples (`src/engine/lives/love.ts:26-51`) pick a partner of a gender the person likes, without checking that the partner likes them back.
- There is no player action to find a date with a stranger; it only happens through events (`dating_app`, `meet_cute`, `set_up_by_friend`).

**Names**
- Pools are in `src/content/names/{us,ca,uk,mx}.yaml`, split into heritages, with about 11–27 first names each. Weights are per country (`src/content/countries/*.yaml names.heritageWeights`, read in `src/engine/creation/family.ts:61`).
- The birth family shares a heritage (`family.ts:113-126`), and a custom last name found in a heritage picks it (`family.ts:75-80`).
- Heritage isn't stored on Character or Person. Everyone else, and your own children (`src/engine/family/children.ts:102-107`), rolls a heritage from the current country.
- There are no city weights: Houston uses the US weights and Montreal has no French bias.

**Sports**
- `injuryRisk` (`src/engine/sports/injury.ts:22-36`) multiplies by the training focus risk (`balance/sports.yaml:18-20`: skills 1, conditioning 0.75, film 1), and is rolled once a season in `playSeason` (`src/engine/sports/season.ts:280`).
- School-team activities roll a separate `broken_bone` (`src/engine/teen/activities.ts:102`).
- The `open_tryout` route allows ages 17–26 and starts at rung 3 (`src/content/fame/*.yaml`), but the age-out at that level is 23 (`ageOut: [14, 18, 23]`, `season.ts:251-255`).

### Acceptance criteria

**Romance**
- Romance interactions and "Ask out" are offered for any unrelated adult you are attracted to.
- Whether they are attracted to you decides the outcome: a person who isn't gives a clear, kind rejection ("not interested in you that way") and never a romantic result. Partnering still needs attraction both ways.
- The adults-only and no-family rules are unchanged, in the engine and in the content build.

**Dating and creation**
- A "Find a date" action (Love; ages 18+; dating app, set-up by a friend, a night out) creates candidates through the existing romantic casting, with diminishing returns per year.
- Custom creation makes you choose "Attracted to" explicitly ("No one" is still a valid choice).
- E3 couples require attraction both ways.

**Romance in the simulation**
- New tests cover same-gender romance with people you already know, and the rejection outcome.
- The simulation reports, for adults attracted to the same gender, to another gender and to more than one: the share who ever have a partner, the years until the first one, and the years spent single.
- A target in `balance/targets.yaml` keeps same-gender lives within a set distance of opposite-gender lives.

**Names**
- `heritage` is stored on Character and Person (a save migration fills it where it can be known and leaves it unset otherwise).
- Children take a parent's heritage (mixed parents give either, by weight).
- People you meet roll heritage from their own city's weights, which come from optional `heritageWeights` on a city, falling back to the country's (for example, Houston leans Hispanic and Montreal French).
- A custom first or last name that matches a heritage picks it.
- Each heritage pool has at least 50 first names per gender category and 50 last names, with the content build checking those minimums.
- Pronoun and gender rules are unchanged.

**Sports**
- Training focus never changes injury risk.
- Injuries come only from games played (scaled by the share of the season played), playoff and big-moment events, and playing through pain.
- No training or practice action anywhere can cause an injury, and a test proves it.
- The open-tryout route's ages and the age-out at its level agree: no entry is aged out after its first season, and a test covers it.
- Save migrations and simulation targets (injuries per 100 seasons, `balance/targets.yaml sports`) are re-measured and still met, or retuned with a note.

### Prompt

```text
You are implementing Batch 1 (Playtest bug fixes: romance, names, sports injuries) of the post-expansion-1 changes for WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md, docs/expansion.md (E1, E3, E6c, W4a) and docs/post-expansion1-changes.md (triage notes 1, 2 and 8, and Batch 1 with its starting facts). Re-check each starting fact against the code before relying on it; the code wins. Extend the existing relationship, interaction, casting, creation, naming and sports code; do not duplicate it.

Build only Batch 1:
- Romance: make romance interactions and "Ask out" available for any unrelated adult the player is attracted to; whether the other person is attracted to the player decides the outcome tier (someone who is not gives a kind, clear rejection and never a romantic result, with text variants and pronoun placeholders). Becoming partners still needs attraction both ways. Keep the adults-only and no-family rules in the engine and the content build. Add a "Find a date" life action (18+, dating app, set-up by a friend, a night out) that creates candidates through the existing romantic casting, with yearly diminishing returns and the input log. Make custom creation require an explicit "Attracted to" choice ("No one" stays a valid answer). Make E3 couples (src/engine/lives/love.ts) require attraction both ways. Add unit tests for same-gender romance with existing friends and coworkers and for the rejection outcome, and a simulation report and target comparing partnering rates and years single by attraction.
- Names: store heritage on Character and Person (save migration; leave it unset where it cannot be known). Children take a parent's heritage; people you meet roll heritage from their own city's optional heritageWeights (falling back to the country's); a custom first or last name that matches a heritage picks it. Grow every heritage pool to at least 50 first names per gender category and 50 last names, and add a content-build check for those minimums. Add city weights for at least Houston, Los Angeles and Montreal.
- Sports: remove the training focus from injuryRisk (src/engine/sports/injury.ts); injuries come only from games played (scaled by the share of the season played), playoff and big-moment events, and playing through pain. Add a test that no training or practice choice changes injury risk. Fix the open-tryout route so its ages and the age-out at its level agree (no entry is aged out after its first season), with a test. Re-measure the sports injury and career targets and retune balance only if needed, with a note.

Meet every Batch 1 acceptance criterion. Upgrade saves (schema bump, lives and heir replay snapshots). Run npm run check, npm run test:e2e (add phone e2e for "Find a date" and a same-gender flirt with a friend), a 1,000-life smoke run and 10,000 lives (four shards of 2,500 with recorded seeds). Open a pull request into main, wait for green CI, and report what you fixed, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Batch 2a — Activities: leisure and self

**Objective:** Add the everyday BitLife-style activity categories, with real content and real costs, without making any of them a grind.

### Starting facts

- **Actions are code, not YAML.** A new life action needs:
  - an id list and a `{parse, allowed, apply}` rule in `src/engine/actions/<domain>.ts`;
  - registration in `LIFE_ACTION_IDS` and `LIFE_ACTIONS` (`src/engine/actions/life.ts`);
  - parameters in `LifeActionParams`;
  - the prison allowlist and temporary-stay blocklist where relevant.
- The UI calls `takeLifeAction`, and the input log and replay are automatic. Results that answer with an event use `fittingResults` / `queueResult` and a registry.
- **What exists:** doctor, therapist and care; vehicles (including a sports car), a vacation home and renovations (E5, which decided on "no valuables"); W2 groups (for example `running_club`); trips (W5); dating only through events.
- **The More tab** has trip, move abroad, home, health, family, teen/license, later life, groups, belongings and will.
- **Legal ages** per country and city exist (`legalAge` condition: drinking, gambling, driving).

### What to build

A data-driven **activity** content type (`src/content/activities` already holds T1 school activities, so use a new folder such as `src/content/pastimes`). Each definition gives:
- category, label and blurb;
- age and legal-age requirements, and country or city availability;
- in-person or not, and who can come along (partner, friend, family; presence rules);
- cost in `balance`, scaled by the country's price level and city;
- effects (stats, stress, looks, fitness, affection with a companion);
- an outcome event pool (2–3 text variants per tier);
- a yearly limit and diminishing returns, like E1's interactions.

One generic engine action (for example `do_activity`) runs them through finance, health, relationships and events. Categories that touch a deeper system call that system.

| Category | Contents (examples) | Links |
|---|---|---|
| Mind & body | Gym, run, yoga, meditation, martial arts class, diet plan, walk | Fitness, stress, health; no injuries from training |
| Salon & spa | Haircut and style, color, nails, massage, spa day | Looks, stress, money |
| Plastic surgery (18+) | A handful of procedures with price tiers and surgeon quality | Looks, recovery time, complication risk through the health system, regret and pride events; written frankly, never graphic |
| Shopping | Clothes, gadgets, gifts, a shopping spree | Money, happiness with diminishing returns, a small looks effect for clothes, an overspending flag that events can read |
| Movie theater | Pick a genre, go alone or with someone (a date with a partner) | Happiness, affection, a memory |
| Nightlife | Bar, club, house party, live show, comedy night | Meeting people (adults only, presence rules), the legal drinking age, drinking and addiction through Stage 9's vice, fights through legal, hookups adults-only and suggestive, driving home through E5's drunk-driving offense |
| Outdoor | Hike, camp, beach day, fishing, gardening | Fitness, happiness, rare mishap events (outings, not training) |
| Luxury | Jewelry, designer goods, art, a boat | Extends E5 possessions with a **valuables** kind (value, appreciation or depreciation, upkeep, theft and insurance, passing through the estate). This reverses E5's "no valuables" decision at the playtester's request, so record it in `docs/expansion.md`. |
| Love | Speed dating, a matchmaker, a date night with your partner, a hookup app (adults) | Uses Batch 1's "Find a date" and romantic casting |

UI: an **Activities** screen (from More), grouped by category. It shows only what's available now, with the cost shown on each button, the money change and new balance on each outcome, and words, not numbers, for effects.

### Acceptance criteria

- Every category above has at least 5 activities (Luxury: at least 5 valuables), each with outcome text and its links working.
- Every cost goes through the finance module and is shown with the new balance.
- Age, legal-age, adults-only and presence rules are enforced in the engine and the content build.
- Repeating an activity gives less each time within a year (proved by a spamming simulation player), and nothing in this batch creates money.
- The simulation player model uses activities, and the report gives activities per life by category, money spent, surgery complications, nightlife meetings and addictions started from nightlife, with targets.

### Prompt

```text
You are implementing Batch 2a (Activities: leisure and self) of the post-expansion-1 changes for WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md, docs/expansion.md (E1, E5, T1, W2, W4a) and docs/post-expansion1-changes.md (triage note 3 and Batch 2a). Re-check the starting facts against the code. Inspect the existing life actions (src/engine/actions), interactions (E1), finance, health and vice, possessions (E5), relationships and presence casting, legal ages and the More tab first. Extend them; do not duplicate them.

Build only Batch 2a:
- A data-driven activity content type in a new folder (for example src/content/pastimes; src/content/activities already holds T1 school activities) with a Zod schema: category, label, blurb, age and legal-age requirements, country and city availability, in-person or not, companions, cost in balance (scaled by price level and city), effects, outcome tiers with 2-3 text variants, a yearly limit and diminishing returns.
- One generic engine action (for example do_activity) that runs any activity through finance, health, relationships and the event pipeline, recorded in the input log.
- Content for Mind & body, Salon & spa, Plastic surgery (18+, complication risk through the health system, frank but never graphic), Shopping, Movie theater, Nightlife (adults-only meetings and hookups, suggestive only; legal drinking age; vice and addiction; fights through legal; drunk driving through E5), Outdoor, Luxury and Love (speed dating, matchmaker, date night, hookup app for adults), at least 5 activities each.
- Luxury: extend E5 possessions with a valuables kind (value, appreciation or depreciation, upkeep, theft and insurance, estate). Record in docs/expansion.md that this reverses E5's "no valuables" decision at the playtester's request.
- An Activities screen from More, grouped by category, showing only available activities with costs on buttons and the money change and new balance on outcomes.
- Every amount in {$N} form, every NPC with pronoun placeholders, no romance involving anyone under 18, and the consistency rules applied (money, presence, household).

Meet every Batch 2a acceptance criterion. Upgrade saves. Extend tools/simulate.ts (player model, spammer, report and targets). Run npm run check, npm run test:e2e (phone e2e for the Activities screen, a paid activity with its receipt, and a nightlife outing), a 1,000-life smoke run and 10,000 lives in four shards. Open a pull request into main, wait for green CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Batch 2b — Activities: risk and legal

**Objective:** Add the riskier BitLife categories (crime, black market, gambling, lawsuits, identity, loans) through the systems that already handle the law, money and addiction.

### Starting facts

- **The legal system** (Stage 9) has offenses, charges, outcomes and records; juvenile handling and sealing come from T1. E6a crime careers are adults-only, with heat and dirty money.
- **Gambling** happens only in events (`casino_weekend`, `lottery_ticket`), alongside a gambling addiction condition. The legal gambling age is per country and city.
- **Loans** exist only with a purchase or a business (mortgage, car, business, student loan). Bankruptcy and missed payments exist.
- **Identity:** gender and pronouns are editable (`src/engine/discovery.ts:253-260`). There is no name change, and citizenship is W6's.
- **Lawsuits** appear nowhere in the code.

### What to build

All of this uses Batch 2a's activity type and action where it fits, and the existing systems for every consequence.

| Category | Contents (examples) | Links |
|---|---|---|
| Crime (solo) | Shoplift, pickpocket, burglary, steal a car, vandalism, a robbery (adults) | Odds from stats and luck, then charges, outcomes and records through the legal system. Teens only for the petty ones, with juvenile handling. Story and consequences only, never instructions. Heat for crew members. |
| Black market | Counterfeit goods, stolen electronics, a fake ID, pills, illegal drugs | Money, legal risk, addiction through vice. A fake ID unlocks underage drinking with a chance of being caught. Prices in balance. |
| Gambling | Casino (a few simple games as odds), lottery, sports betting, horse racing | The legal gambling age, money through finance, the existing addiction condition and debt. A loss-chasing choice. Odds always favour the house, set in balance. |
| Lawsuits | Sue an employer, a doctor (after a treatment), a landlord, a neighbor or an ex; get sued through events | Lawyer tiers and fees, odds from the evidence (flags and memories), settlement or trial, money through finance, effects on reputation and relationships |
| Identity | Legal name change (18+, or with a parent's consent), with the gender marker kept in the existing editor | A fee, a history entry, people adjusting, the name used in text from then on. Any name the player types is validated. |
| Loans | Personal loan (bank: approval by income, record and bankruptcy), payday loan (high rate), borrowing from a loan shark | The debt system (new kinds with rates and terms in `balance/economy.yaml`). A loan shark links to crime (threats, violence as consequence) and E6a. |

### Acceptance criteria

- Every category above has at least 5 options with outcome text and its links.
- Every consequence runs through the legal, finance, health or vice system: no new separate record, debt or addiction.
- Ages: crime and black market follow the legal and juvenile rules, gambling the legal gambling age per country and city, and a name change 18+ or with a parent.
- The content build rejects any risk-category text that reads as real-world instructions, reusing the checks the crime and immigration content already use.
- Gambling loses money on average across the simulation, and loans cost what their rates say.
- The careful player never uses crime or the black market, and its targets stay met.
- The criminal and careless players use them, with a report on charges, convictions, debts from gambling and payday loans, and lawsuits won, lost and settled.

### Prompt

```text
You are implementing Batch 2b (Activities: risk and legal) of the post-expansion-1 changes for WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md, docs/expansion.md (Stage 9 notes, T1, E6a, W4a) and docs/post-expansion1-changes.md (triage note 3 and Batch 2b). Batch 2a must be merged first; reuse its activity content type and action. Inspect the legal system (offenses, charges, juvenile handling), E6a crime and heat, finance, debt and bankruptcy, vice and addiction, discovery/identity editing and legal ages first. Extend them; do not duplicate them.

Build only Batch 2b:
- Crime (solo petty and serious crimes with odds and legal outcomes; teens only petty ones with juvenile handling; heat for crew members), Black market (counterfeit goods, stolen electronics, a fake ID, pills, illegal drugs, with legal and addiction risk), Gambling (casino, lottery, sports betting, horse racing; house edge in balance; legal gambling age; the existing addiction condition; a loss-chasing choice), Lawsuits (sue an employer, doctor, landlord, neighbor or ex, and be sued through events; lawyer tiers, evidence from flags and memories, settlement or trial), Identity (a legal name change, 18+ or with a parent, validated input, used in text afterwards) and Loans (personal, payday and loan-shark loans as new debt kinds with rates and terms in balance/economy.yaml; approval by income, record and bankruptcy; the loan shark linking to crime).
- At least 5 options per category, with outcome text variants and pronoun placeholders, story and consequences only, never real-world instructions. Extend the content build's instruction-wording checks to these categories.
- Add them to the Activities screen from Batch 2a.

Meet every Batch 2b acceptance criterion. Upgrade saves. Extend tools/simulate.ts (the careful player never uses crime or the black market; the criminal and careless players do) with reports and targets. Run npm run check, npm run test:e2e (phone e2e for a gambling night with its receipt, a lawsuit and a name change), a 1,000-life smoke run and 10,000 lives in four shards. Open a pull request into main, wait for green CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Batch 3 — School and work life

**Objective:** Make school feel like the country you're in, with things to do and people to know, and put your coworkers on the Work tab where you can deal with them.

### Starting facts

**School**
- Country data is in `src/content/countries/*.yaml` under `school` and `words`:

  | Country | Stages | Ages, grades and exams |
  |---|---|---|
  | US | elementary / middle / high (6, 3 and 4 years) | letter grades and GPA, SAT/ACT |
  | Canada | same as the US | percent grades; CEGEP (Quebec) not modelled |
  | UK | primary / secondary / secondary | starts at 4, percent grades, A-levels; no sixth form and no GCSEs |
  | Mexico | primary / secondary / preparatoria | ten-point grades |

- The engine has one hidden GPA per enrollment (`src/engine/education.ts:128-147`) and picks the stage by age (`education.ts:41-60`).
- School actions: `apply_school`, `choose_major`, `drop_out`, `return_to_school`, `take_ged`, `decline_admission`. There is no "study harder".
- Teens (13–17): yearly focus, cliques (8, `src/content/cliques`), license, teen job, teams and clubs, house rules.
- Classmates (`kind: classmate`) come only from events and cliques.
- Teachers aren't a relationship kind (one event casts one as an acquaintance).

**Work**
- `staffWorkplace` creates a boss and 2 coworkers, with a 30% yearly chance of another, up to 4 (`src/engine/career.ts:205-224`, `balance/careers.yaml:139-144`). They're in the People tab "Work" group.
- JobCard shows only "Your boss" (`src/ui/screens/work/JobCard.tsx:47`).
- Work actions: `apply_job`, `ask_raise`, `quit_job`, `retire`, plus gig work. Performance is calculated, not acted on (`career.ts:317-332`).
- E4 ties exclude coworkers (`src/engine/web/ties.ts:29`), as decided in `docs/expansion.md` E3/E4.

### What to build

**School that fits the country**
- Country definitions gain:
  - **UK:** a sixth-form (or college) stage with a real choice at 16 (stay on, college, apprenticeship, work); GCSEs at 16; A-levels at 18.
  - **US:** grade names (freshman to senior) in the words.
  - **Canada:** CEGEP for Quebec (Montreal) as a city override.
  - **Mexico:** the secundaria/preparatoria split, and a university entrance exam.
- Exams per country become events with results that matter for admission.

**Things to do at school**
- School actions: study harder (better grades, more stress), slack off, get a tutor (paid), ask a teacher for help, cheat on a test (a chance of being caught, with discipline), skip class (from T1's trouble).
- A yearly report card with 4–6 subjects per country's curriculum, shown in words and derived from the GPA plus a small, stored per-subject spread, so "work on grades" has a target.
- Clubs and teams open to younger ages where they fit (the activity definitions already carry ages).

**People at school**
- Each school year has a small class of classmates (a balance number, about 4–6), generated on entering a stage or school and kept while you share the school. They're listed on the School card and open the interaction menu.
- Teachers and staff (a homeroom or form teacher, a principal or head, a coach or counsellor) become people with a new relationship kind (`teacher`), and a few interactions: ask for help, suck up, argue, report a problem. No romance with teachers, and never with anyone under 18; the engine and content build enforce it.
- The yearly pruning keeps your current class and teachers, and lets old ones fade.

**Work**
- The Work tab's job card lists your boss and coworkers, each opening the interaction menu.
- Work actions: work harder (a better review, more stress), slack off, socialize with coworkers, go to the office party, report a coworker.
- How many coworkers you have scales with the job's workplace size (balance), still capped for performance.
- Coworkers can form E4 ties (friends, rivals), which changes the E3/E4 decision table in `docs/expansion.md`, at the playtester's request. Record it there.

### Acceptance criteria

- Each of the four countries runs its own stages, names, exams and choices, with a test per country. The UK's choice at 16 and Quebec's CEGEP work.
- School actions measurably move grades and stress in the simulation, in both directions, and a tutor costs money through finance.
- Each school year has classmates and teachers you can interact with. The romance and age rules are unchanged and enforced.
- The Work tab shows coworkers and the boss with interactions. Work actions measurably move job performance.
- People counts stay within the People list's cap, and the time per simulated year stays within Batch 0's budget.

### Prompt

```text
You are implementing Batch 3 (School and work life) of the post-expansion-1 changes for WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md (Stages 7 and 8, T1, E4, W4a as built), docs/expansion.md (T1, E3 & E4 decisions, W4a) and docs/post-expansion1-changes.md (triage notes 4 and 5, Batch 3). Re-check the starting facts against the code. Inspect the country definitions, education, careers (staffWorkplace), teen systems (focus, cliques, activities), people pruning, interactions (E1) and social web ties (E4) first. Extend them; do not duplicate them.

Build only Batch 3:
- Country-true school: a UK sixth-form/college stage with a choice at 16 (stay on, college, apprenticeship, work), GCSEs at 16 and A-levels at 18; US grade names (freshman to senior); a Quebec CEGEP city override for Montreal; Mexico's secundaria/preparatoria split and a university entrance exam. Exams are events whose results feed admission.
- School actions: study harder, slack off, get a tutor (paid), ask a teacher for help, cheat on a test (risk and discipline), skip class (reuse T1 trouble). A yearly report card with 4-6 subjects per country's curriculum, derived from the GPA plus a stored per-subject spread, shown in words.
- Clubs and teams open to younger ages where their definitions allow.
- A yearly class of classmates (number in balance) generated per school stage and listed on the School card; teachers and staff as people with a new relationship kind (teacher) and a few interactions (ask for help, suck up, argue, report a problem). No romance with teachers and none involving anyone under 18, enforced by the engine and the content build. Pruning keeps your current class and teachers.
- Work: the job card lists the boss and coworkers with the interaction menu; work actions (work harder, slack off, socialize, office party, report a coworker) that move performance and stress; coworker counts scaled by workplace size in balance; coworkers forming E4 ties (record the changed E3/E4 decision in docs/expansion.md).
- About 30 new school and work events using the new people, following AGENTS.md (status-aware text, presence, evidence).

Meet every Batch 3 acceptance criterion. Upgrade saves. Extend tools/simulate.ts with the reports and targets, and stay within the Batch 0 performance budget. Run npm run check, npm run test:e2e (phone e2e for the School card with a classmate and a teacher interaction, a UK choice at 16, and coworkers on the Work tab), a 1,000-life smoke run and 10,000 lives in four shards. Open a pull request into main, wait for green CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Batch 4 — Music, bands and the grind

**Objective:** Make a music career something you work at all year: choose your sound, name your songs, form or join a band, play shows, tour and practice. Fame should come a little faster for people who put in the work, while some people still never get far.

### Starting facts

**Routes and rungs**
- Music routes (`src/content/fame/music.yaml:10-13`): `open_mic` (14+), `band` (13+), `lessons` (8+), `talent_show` (10+). All start at rung 1.
- `enterPath` reads only the route's craft (`src/engine/fame/ladder.ts:68-94`) and doesn't store the route. The band route is flavour text only (`band_in_the_garage`).
- There is one active fame career at a time; crossing over needs rung 4 and fame 55.
- Rungs: open mic, local gigs (fame 12, quality 32), first release (26/42), signed (40/52), a hit (56/64), touring headliner (72/80), arena star (88/92).

**Projects and titles**
- One project a year (`FamePlan`: kind single, EP, album or live; style commercial or artistic; risk safe or bold; tour and press checkboxes) (`src/engine/types.ts:1615-1622`, `src/ui/screens/work/ProjectSheet.tsx`).
- The title comes from 12 fixed titles (`src/content/text/fame.yaml:113-125`), and there's no genre.
- A year without work fades fame (12% + 1.2) and pays a retainer.

**Quality and fame**
- Quality = 20 + aptitude blend + talent (+22 if it fits, +4 once found) + 0.17 × craft + agent + company + luck + difficulty + noise.
- Fame won = reception curve × kind × rung scale × commitment × press × tour × agent.
- Craft grows by itself (5 a year when low; 0.3 of that in an idle year).
- The talent effect is the largest single term. Without a fitting talent the climb stalls near rungs 2–3, which the E6b targets require ("without talent, rarely past the middle").

**Actions**
- There's no practice, gig or concert action (`src/engine/actions/fame.ts:16`).

### What to build

**Bands**
- A band record: name, members (people in your circle, each with an instrument or role, skill and affection), leader, chemistry. Solo artists have none.
- You can form a band (auditions bring new people), join one (offers from bands in your city), leave one or go solo, at any rung and from any route. The open mic is no longer a dead end.
- As the leader (the founder or lead singer) you can rename the band, kick a member, or recruit a replacement. Members can quit, clash, get poached or break the band up, as events.
- Store the route you came in by.

**Your sound**
- Genres come from content (rock, alt rock, metal, punk, pop, hip hop, R&B, country, EDM, indie, folk, jazz, Latin and regional Mexican, and more).
- You have a main genre, and each release picks a genre. Releasing outside your genre (an alt-rock artist's metal single) is allowed: critics judge it on its own, while fans react by how far it sits from your sound (some leave, some new ones come). Genre affinities live in balance.

**Titles**
- You type the song, EP and album titles, with track titles optional. Input is validated (trimmed, length limits, allowed characters).
- Random suggestions come from a much larger content list. Titles show in history, the release card and the eulogy and obituary highlights.

**Shows and tours**
- "Play a show" is an action: open mic, local gig, club show, concert or festival slot by rung, at most **6 a year** (balance). Each show pays, adds fans and a little fame, raises craft, and costs stress. A band's affection moves with how it goes.
- "Go on tour" is an action at most **once a year** (balance), sized by rung (local, regional, national, world), with cost, revenue, fame, fans, strain on relationships and burnout. It replaces the tour checkbox on a project, and a migration carries existing plans over.

**Practice**
- A generic practice system for fame paths: skills per path (music: vocals, an instrument chosen from content, songwriting, stage presence). Each practice session raises that skill, which feeds craft and the quality of matching work.
- Practice has a yearly session budget with diminishing returns (balance), and it never causes an injury.
- The system is built so acting, writing and art, and sports (Batch 5) can register their own skills.

**Fame pace**
- Retune `balance/fame.yaml` so an active musician (shows, a release, a tour, practice) with a fitting talent usually reaches rung 4 ("signed act") in their mid-twenties if they start as a teen.
- Without a talent, grinding can reach rung 3 more often than today, but still rarely passes the middle. Update the E6b targets in `balance/targets.yaml` and record the before and after.
- Shows, gigs and tours all add fame. Doing nothing still fades it.

### Acceptance criteria

- Bands work end to end: form, join, leave, go solo, rename, kick and recruit, with members as people (ties, memories, events).
- Every route can lead to a band.
- Genre and title choices are stored, shown and validated. Releasing outside your genre changes fan and critic reception as defined.
- At most 6 shows and one tour a year, enforced in the engine. Shows and tours add fame, fans, money and strain through the ledger and the relationship systems.
- Practice raises skills and the quality of matching work, with diminishing returns, and never injures.
- The star simulation player uses bands, shows, tours and practice. The report shows:
  - the rung reached by age 28 with and without a fitting talent (with talent: the median active musician reaches rung 4 by 28; without: past the middle stays rare);
  - shows and tours per career year, band formations, splits and member changes, and genre switches.
  - E6b's other targets stay met or are retuned with a note.
- Minors: bands and shows are allowed with a parent's consent and contracts signed by a parent. No romance or sexual content involves anyone under 18.

### Prompt

```text
You are implementing Batch 4 (Music, bands and the grind) of the post-expansion-1 changes for WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md (E6b as built), docs/expansion.md (E5 & E6 decisions and writing guidance, E6b) and docs/post-expansion1-changes.md (triage notes 6 and 7, Batch 4). Re-check the starting facts against the code. Inspect src/engine/fame (step, work, ladder, fans, people), src/engine/actions/fame.ts, src/content/fame/music.yaml, balance/fame.yaml, text/fame.yaml, the Fame screen and ProjectSheet first. Extend them; do not duplicate them.

Build only Batch 4:
- Bands: a band record (name, members as people with role/instrument, skill and affection, leader, chemistry). Form a band (auditions create people), join one (offers from bands in your city), leave or go solo, from any route and rung. The leader can rename the band, kick a member and recruit a replacement. Member quitting, clashes, poaching and break-ups as events. Store the entry route.
- Sound: genres in content with affinities in balance; a main genre and a genre per release; off-genre releases judged on their own by critics while fans react by distance from your sound.
- Titles: player-typed song, EP and album titles (track titles optional) with validated input and a larger content list of suggestions; titles shown in history, release cards and life summaries.
- Shows and tours: a "Play a show" action by rung, at most 6 a year (balance), paying through the ledger and adding fans, a little fame and craft, and stress; a "Go on tour" action at most once a year, sized by rung, replacing the tour checkbox on projects (migrate existing plans).
- Practice: a generic per-path skill practice system with a yearly session budget and diminishing returns, registered for music (vocals, an instrument from content, songwriting, stage presence) and built so other paths and sports can register skills. Practice never causes injury.
- Fame pace: retune balance/fame.yaml so active, talented musicians usually reach rung 4 by their mid-twenties when they start as teens, and untalented ones grind to rung 3 more often but rarely past the middle. Update the fame targets in balance/targets.yaml and record before and after.
- UI: band management on the Fame screen, a genre and title step in the project flow, Shows and Tour buttons with costs, and a Practice section.
- About 30 new events (band drama, shows, tours, genre switches), following AGENTS.md and the E6 writing guidance; minors only with a parent and never in romance.

Meet every Batch 4 acceptance criterion. Upgrade saves. Extend tools/simulate.ts (the star player uses bands, shows, tours and practice) with reports and targets. Run npm run check, npm run test:e2e (phone e2e: form a band from an open-mic start, rename it and replace a member; play a show; release an off-genre single with a typed title; practice), a 1,000-life smoke run and 10,000 star lives in four shards. Open a pull request into main, wait for green CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Batch 5 — Sports I: the grind and the road to the pros

**Objective:** Turn sports from something that happens to you each year into something you work at. That means trying out for specific teams, training with or without a team, earning a scholarship, getting drafted where your skill puts you, and fighting your way back in if you go undrafted.

### Starting facts

**How a career starts**
- Routes (`src/content/fame/basketball.yaml:11-13` and the other sports):
  - `youth_league`: 8–13, rung 1
  - `school_tryout`: 13–17, rung 2
  - `open_tryout`: 17–26, rung 3 (age-out fixed in Batch 1)
- None of these tryouts can fail.
- T1 school teams (`src/engine/teen/activities.ts`) are a separate system with their own tryout chance. The E6c known gaps say "a T1 school team and a sport do not overlap".

**Training**
- `set_focus` (skills, conditioning, film) works only inside a sports career. Fitness from the focus applies after a season.
- There is no gym or personal training.

**Scholarships**
- None for athletes (`src/engine/education.ts:299-304`: merit and need only).

**The draft and the first deal**
- Draft score = the last three ratings + 0.35 × fame + noise. You declare at 50 or are forced at an age.
- Pick (`src/engine/sports/contract.ts:92-99`): `1 + (78 − score) × 1.2`.
- Rookie pay by round `[1.4, 1, 0.8, 0.6]` × the pro rung's pay (`contract.ts:28-33`).
- An undrafted player gets a camp offer by rating (40→10%, 60→80%) at a minimum deal (`undrafted_phone_calls`), or retries next year.
- After two years unsigned, the career stalls.

**What the player controls**
- Almost everything runs in `runFame` → `playSeason`. The player sets only focus, position, commitment, agent, trade or contract asks, and event choices.

### What to build

**One path from school to the pros**
- A T1 school team in a sport is the sports career's school rung. Joining the team starts or continues the career, and the two systems share one record (migrate existing lives).
- Club and travel teams sit alongside school teams for youth players.

**Tryouts for specific teams**
- At each level you see a list of teams (youth clubs, school varsity and JV, college programs, pro camps) with their level and how hard they are to make, and you choose which to try out for.
- The result depends on your rating against the team's bar plus luck, with a fallback to a lower team.
- Tryouts are events with choices (how you play the scrimmage).

**Training as the grind**
- Training sessions are actions with a yearly time budget, alongside school, work and relationships (an all-in commitment gives more sessions). They use Batch 4's practice system with sport skills (for example shooting, handling, defense and strength for basketball, per sport in content).
- With a team, training uses its coaches and facilities. Without one (a gym membership or a paid private coach, through finance) it still works but gains less.
- Training never causes injury (Batch 1).

**Scholarships**
- College programs recruit by rating, fame, grades and position need: offer events with a choice between programs.
- An athletic scholarship pays a share of tuition through the education and finance systems (a full ride for the best), keeps a GPA floor (losing eligibility is an event), and ends if you leave the team.
- Per country: US and Canada college sports; the UK and Mexico use academies and university sport scholarships, as their definitions say.

**The draft and first deals**
- Draft position comes from skill: the draft score from rating, fame, combine-style events (choices), and position need.
- Rookie pay scales by **pick** (a smooth curve by pick and round in balance) and by skill (a stronger rating within a slot pays more through incentives), with a signing bonus.
- Undrafted and unsigned players can attend camps, open tryouts and walk-ons every year (events with a skill check), and sign when good enough. There is no automatic stall while they keep training and trying out (a balance number ends it at an age).

**More choices each season**
- Events for role and minutes battles, asking the coach for a bigger role, offseason workout plans, and picking a jersey number and captaincy.

### Acceptance criteria

- A school team in a sport is the sports career. Existing lives migrate without losing their career.
- You choose which team to try out for at every level. Tryouts can fail, with a fallback.
- Training is an action with a budget, works without a team (at a lower gain) and with one, and never injures.
- Athletic scholarships exist through education and finance in the countries that have them, with eligibility and loss.
- Draft position follows skill, and rookie pay is a curve by pick plus skill. Undrafted and unsigned players can keep trying out and sign when good enough.
- The athlete simulation player trains, picks tryouts, takes scholarships and, if undrafted, retries. The report shows:
  - tryout success by level;
  - scholarships per sport and country;
  - pick against rating, and rookie pay by pick;
  - undrafted players who later signed;
  - training sessions per year with and without a team;
  - and still no one under 18 in the pros.
- E6c's other targets stay met or are retuned with a note.

### Prompt

```text
You are implementing Batch 5 (Sports I: the grind and the road to the pros) of the post-expansion-1 changes for WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md (E6b, E6c and T1 as built), docs/expansion.md (E6c, T1) and docs/post-expansion1-changes.md (triage notes 7 and 8, Batch 5). Batches 1 and 4 must be merged first (no training injuries; the practice system). Re-check the starting facts against the code. Inspect src/engine/sports (season, contract, team, injury, query), src/engine/teen/activities.ts, src/engine/education.ts (scholarships), finance, the fame step and the Sports screen first. Extend them; do not duplicate them.

Build only Batch 5:
- One path: a T1 school team in a sport becomes the sports career's school rung (shared record, migration for existing lives); club and travel teams for youth.
- Tryouts for specific teams at every level (youth clubs, varsity and JV, college programs, pro camps), chosen from a list with each team's level, decided by rating against the team's bar plus luck, with a fallback team; tryouts as events with choices.
- Training sessions as actions with a yearly time budget, using Batch 4's practice system with per-sport skills in content; team training uses coaches and facilities, gym or private-coach training (paid through finance) works without a team at a lower gain. Training never causes injury.
- Athletic scholarships: recruiting offers by rating, fame, grades and position need; a share of tuition through education and finance; a GPA floor and loss of eligibility as events; per-country availability from the country definitions.
- Draft: position from skill (rating, fame, combine-style event choices, position need); rookie pay as a curve by pick in balance plus skill incentives and a signing bonus. Undrafted and unsigned players can attend camps, open tryouts and walk-ons every year and sign when good enough; replace the automatic stall with an age limit in balance.
- Season choice events: role battles, asking for minutes, offseason plans, jersey number and captaincy.
- UI: team lists with tryout buttons, a Training section with the session budget and costs, scholarship offers, and a draft card showing your projected range in words.
- About 30 new events following AGENTS.md and the E6 writing guidance; nobody under 18 in the pros.

Meet every Batch 5 acceptance criterion. Upgrade saves. Extend tools/simulate.ts (the athlete player trains, picks tryouts, takes scholarships, retries when undrafted) with reports and targets. Run npm run check, npm run test:e2e (phone e2e: try out for a chosen school team, train without a team, accept a scholarship, go undrafted and sign from a camp), a 1,000-life smoke run and 10,000 athlete lives in four shards. Open a pull request into main, wait for green CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Batch 6 — Sports II: leagues, the soccer world and your own teams

**Objective:** Widen the sports world beyond the game's 16 cities. That means more teams in more places, soccer's academies, transfers and loans, playing in Europe, and team names (and your own teams) that you control and that last across lives.

### Starting facts

- **Pro teams:** 30 per sport, inline in each sport's YAML (`leagues.pro.teams`), each tied to a game city:
  - United States: Chicago, Houston, Los Angeles, New York;
  - Canada: Toronto, Vancouver, Montreal;
  - United Kingdom: London, Manchester;
  - Mexico: Mexico City, Guadalajara, Monterrey.
- `proTeamsIn` allows only your own country (`src/engine/sports/team.ts:26-28`). Joining a team moves you to its city.
- **Soccer:** the "academy" is just rung 3, with no loans and no transfer market. A trade is the only move. Soccer and football keep one name everywhere (W4a open question).
- **Settings:** the Dexie database `wiplife` has `lives`, `backups`, `archive` and `settings`. Settings is one row (`ageConfirmed`, `theme`, `persistRequested`, `installPromptShown`; `src/persistence/settings.ts`), and `loadSettings` keeps only fields in its schema.
- **Content** is compiled at build time (`src/content/compiled/content.json`), and nothing edits content at runtime.
- **Lives replay** from the input log, so anything that changes the simulation must be in the life itself, not read from settings later.
- **Name pools** exist only for the US, Canada, the UK and Mexico.

### What to build

**Teams in cities the game doesn't have yet**
- Add pro teams in more US cities (for example Boston, Philadelphia, Miami, Atlanta, Dallas, Denver, Phoenix, Seattle, Detroit, Minneapolis), and the same for Canada where it fits.
- Each such team has a `cityName` (its words), a `nearestCityId` (the modeled city you live in when you sign) and `futureCity: true`.
- You "commute": you live in the nearest modeled city, home games are trips that fit the presence rules, and the text says where the team plays.
- A content-build check lists every `futureCity` team, so the list is ready when those cities are added.

**Europe and the soccer world**
- Leagues in Spain, Italy, Germany and France (fictional clubs in real cities), flagged `futureCountry`. A player signed there lives in a UK modeled city and commutes, a placeholder until those countries exist. Contracts and pay go through the ledger in the base unit.
- Add name pools for those four countries (Batch 1's heritage system), so teammates fit.
- Clubs outside your country become possible for soccer, and for other sports where it fits (for example Canadian teams in US leagues).

**Soccer's path**
- Youth academies (join from about 8 to 16, including abroad through a trial), promotion from the academy to the first team, and loans (a season at another club, with the parent club deciding).
- Transfers with fees (a market each year, offers by rating and fame, your agent negotiating, release clauses), transfer windows as a yearly event, and promotion and relegation between two tiers per country.

**Your own teams, kept across lives**
- In Settings, "Teams" lets you rename any team (name and nickname), change its city among the game's cities, and add your own team to a league (name, city, a strength level). Input is validated.
- The changes are stored in the settings database (a new record or table with a zod schema and a migration) and apply to every new life.
- So that lives still replay exactly, the team list a life uses is snapshotted into the life at creation. A rename during a life is display-only, keyed by team id, and also applies to the current life. A team added or removed during a life takes effect from its next season through a recorded input.

**Extras**
- National team call-ups and an international tournament (fictional names).
- Captaincy (from Batch 5), derbies and rivalries as events.
- "Football" in the UK and Mexico for soccer, through the country words (the W4a open question).

### Acceptance criteria

- Teams exist in at least 10 US cities the game doesn't have, each with a nearest modeled city and `futureCity: true`. Signing there keeps you living in that city, and the presence rules hold.
- Spain, Italy, Germany and France have leagues. A player can sign there from the UK and "commute", with fitting teammate names.
- Soccer has academies (including abroad), academy-to-first-team promotion, loans, transfers with fees and windows, and promotion and relegation.
- Renamed, moved and added teams persist across lives through settings, are validated, and appear in every new life. Every life still replays exactly (test: change settings after a life starts, then replay it).
- "Football" is used for soccer where the country says so.
- The simulation report shows careers by league and country, academy graduates, loans and transfers (fees through the ledger), commuting players, and call-ups, with targets. Zero invariant failures.

### Prompt

```text
You are implementing Batch 6 (Sports II: leagues, the soccer world and your own teams) of the post-expansion-1 changes for WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md (E6c, W4a, W6 as built), docs/expansion.md (E6c, W4a, W6) and docs/post-expansion1-changes.md (triage note 8, Batch 6). Batches 1 and 5 must be merged first. Re-check the starting facts against the code. Inspect the sport definitions (src/content/fame/*.yaml), src/engine/sports (team, contract, season), presence rules, the country definitions, name pools, src/persistence (db, settings) and replay first. Extend them; do not duplicate them. If any part of this design does not fit the code, stop and ask.

Build only Batch 6:
- Teams in at least 10 US cities the game does not model (and Canadian ones where they fit), each with cityName, nearestCityId and futureCity: true; signing keeps you living in the nearest modeled city and home games fit the presence rules; a content-build list of futureCity teams.
- Leagues in Spain, Italy, Germany and France (fictional clubs in real cities, flagged futureCountry); a player signed there lives in a UK modeled city and commutes; pay through the ledger in the base unit; name pools for those countries via Batch 1's heritage system. Allow clubs outside your country for soccer and where else it fits.
- Soccer: youth academies (including trials abroad), academy-to-first-team promotion, loans, a yearly transfer market with fees, agent negotiation and release clauses, transfer windows, promotion and relegation between two tiers per country.
- Settings "Teams": rename any team, change its city among modeled cities, add your own team (name, city, strength), with validated input, stored in the settings database (zod schema, migration) and applied to every new life. Snapshot the team list into each life at creation so replays stay exact; a rename mid-life is display-only and keyed by team id; additions or removals mid-life take effect next season through a recorded input. Test that changing settings after a life starts does not change its replay.
- Extras: national team call-ups and an international tournament (fictional names), derbies and rivalries, and "football" for soccer where the country words say so.
- About 30 new events following AGENTS.md, the E6 writing guidance and the second-wave writing guidance (no national stereotypes).

Meet every Batch 6 acceptance criterion. Upgrade saves and settings. Extend tools/simulate.ts with reports and targets. Run npm run check, npm run test:e2e (phone e2e: rename a team in Settings and see it in a new life; sign with a futureCity team; a soccer loan and a transfer; sign in Spain from the UK), a 1,000-life smoke run and 10,000 athlete lives in four shards. Open a pull request into main, wait for green CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Batch 7 — Business depth (7a: plan, 7b: build)

**Objective:** Turn a business from a set of dials into a shop you run: what you sell, what it costs, how much you stock, who works where, and a market that pushes back.

### Starting facts

**What a business has**
- Six kinds (`src/content/businesses/*.yaml`), each with three styles: café, bakery, shop, salon, plumbing, cleaning.

**Decisions and demand**
- One price setting for the whole business (low, fair or high: 0.85, 1 or 1.25).
- Yearly decisions: marketing, quality spend, pay, staffing (lean, normal or full), and who runs it.
- Demand = style demand × city fit × reputation × quality × price elasticity × marketing × owner effort × saturation × maturity × luck × shocks (`src/engine/business/model.ts:131-143`).
- The city `competition` value is loaded but unused (`model.ts:15,21`).
- Supplies are a share of revenue, with no stock and no products.

**Staff**
- At most 4 named staff a business, besides a manager (`balance/business.yaml:11`), enforced in `src/engine/business/staff.ts:27-29,89`, the UI and an invariant. The schema allows 12.
- Workers per location are computed: `round(style.staff × staffing)`, at most 8. The rest is unnamed crew at the market wage.
- Hiring always goes to the first location (`src/ui/screens/work/BusinessScreen.tsx:60,72`), and staff can't be moved.

**Limits and gaps**
- At most 3 businesses and 12 locations.
- Not built (W3 open questions): franchising, seasonal trade, a market that follows the economy.

### 7a: the plan

Write a gate in `docs/expansion.md` (a new section, "B2 — Business depth") in the same format as the other stages: objective, player experience, systems, content, data, UI, dependencies, acceptance criteria, testing, failure modes and a coding-AI prompt. It must cover at least:

- **Products and stock.**
  - Product lines per kind, in content (a café's coffee, tea, pastries and sandwiches; a bakery's bread, cakes and custom orders; a shop chooses what it sells, such as clothes, electronics, groceries or books; services such as salon, plumbing and cleaning sell services with parts or supplies instead of shelves).
  - Price and unit cost per product, a stock level or order size per product, spoilage for perishables, and stockouts that lose sales and reputation.
- **Supply and demand.**
  - Demand per product from price, quality, a trend, the city and **competition** (use the field).
  - Supplier prices that move each year (events: a supplier raises prices, a shortage, a better deal), and a simple yearly economy index in balance that business demand follows. Say whether other systems should follow it later.
- **Employees.**
  - Replace the 4-named-staff cap with a headcount you choose per location and role, scaled to the business's size. Roles per kind (manager per location, shift lead, barista or baker or stylist or plumber, cashier).
  - Hire to a specific location, transfer between locations, promote to location manager, wages per person, training, and morale.
  - Keep key staff as people (ties, memories, gossip) and the rest as an aggregated pool, so performance holds; say where the line is.
- **Limits.** Revisit the 3-business and 12-location limits, and franchising (in or out).
- **Simulation.** What the business player does and what the report and targets measure (stockouts, waste, margins by product, headcount by size, survival).

Then **stop** and ask the user to approve the gate before building.

### 7b: the build

Implement the approved gate.

### Prompt (7a)

```text
You are writing the plan for Batch 7 (Business depth) of the post-expansion-1 changes for WIPlife. This is step 7a: a plan only, no code.

Read AGENTS.md, docs/design.md, docs/technical.md (W3 as built), docs/expansion.md (second-wave decisions, W3) and docs/post-expansion1-changes.md (triage note 9, Batch 7). Re-check the starting facts against src/engine/business, src/content/businesses, balance/business.yaml and the Business screen.

Write a new gate in docs/expansion.md, "B2 — Business depth", in the same format as the other stages (objective, player experience, systems, content, data, UI, dependencies, acceptance criteria, testing, failure modes, coding-AI prompt). Cover everything listed under "7a: the plan" in docs/post-expansion1-changes.md: product lines and stock per kind (services have supplies, not shelves), per-product price and cost, ordering, spoilage, stockouts, demand per product including the unused competition field, supplier price changes, a yearly economy index, a chosen headcount per location and role replacing the 4-named-staff cap, hiring to a location and transfers, location managers, key staff as people with the rest aggregated for performance, the business and location limits and franchising, the simulation player and the report and targets. Keep the moderate depth of W3 ("don't need to be insanely in-depth, but they need content"), every number in balance and all content in YAML.

Open a pull request into main with only the plan, and report it with the open questions. Do not build anything until the user approves the gate.
```

### Prompt (7b)

```text
You are implementing Batch 7b (Business depth) of the post-expansion-1 changes for WIPlife, from the approved gate "B2 — Business depth" in docs/expansion.md.

Read AGENTS.md, docs/design.md, docs/technical.md (W3 as built), docs/expansion.md (W3 and B2) and docs/post-expansion1-changes.md (Batch 7). Inspect src/engine/business (model, step, staff, found, market, funding, estate), the content and balance files, the Business screen and tools/simulate/business.ts first. Extend them; do not duplicate them.

Build only B2, as the gate describes. Fix the known bug that hiring always goes to the first location. Upgrade saves (existing businesses get default product lines, stock and headcount without changing their last year's results). Extend tools/simulate.ts with the gate's reports and targets, and stay within the Batch 0 performance budget.

Meet every B2 acceptance criterion. Run npm run check, npm run test:e2e (the gate's phone flows), a 1,000-life smoke run and 10,000 lives in four shards. Open a pull request into main, wait for green CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Batch 8 — Social media (real platforms)

**Objective:** Make social media a real part of life, both for creators chasing fame and for everyone else posting about their lives, on the platforms players know.

### Starting facts

- **The social path** (`src/content/fame/social.yaml`):
  - Routes: `first_posts`, `streaming`, `collab`, `after_viral`.
  - Kinds of work: `short_videos`, `series`, `livestreams`, `big_collab`.
  - Rungs: first posts, small following, creator, sponsored, household name.
  - Youngest age 13.
- The only "platforms" are contract companies in `src/content/studios` (Nimbus Network, Loop & Lens). There are no accounts, handles, followers per platform or podcasts.
- **The design rule:** `docs/expansion.md` (E5 & E6 writing guidance) says "Leagues, labels, studios, platforms, awards and brands are all fictional."
- **Decided 2026-10-15:** this path uses real platform names.

### What to build

**Platforms**
- Platforms are content (YAML), with real names: **Instagram** (photos and reels), **TikTok** (short video), **X / Twitter** (posts), **YouTube** (long video), **Twitch** (live streaming) and **Podcasts** (a show distributed on podcast apps). Each has:
  - its kind of content and the age to join (13+, or the country's rule);
  - how it grows (reach, how much the algorithm favors new accounts, how fast followers fade);
  - how it pays: ad revenue share at a follower threshold, subscriptions and donations for streams, a creator fund for short video, ad reads for podcasts, brand deals everywhere.
- **Brand rule:**
  - Amend the guidance in `docs/expansion.md`: real platform names are allowed for this path only, kept in content so they can be swapped.
  - No logos, and no claims of partnership or endorsement.
  - No real people.
  - Labels, studios, brands and awards stay fictional.

**Accounts**
- An account per platform with a handle you type (validated), followers, engagement and a niche (gaming, comedy, beauty, fitness, music, education, lifestyle and more, from content).
- Posting is an action per platform (post, upload, stream, record an episode) inside a yearly content budget with diminishing returns.
- Cross-promotion between your accounts. Collaborations with other creators (people in your circle).

**For creators**
- The E6b social path's fame and rung come from your accounts (total reach, weighted by platform).
- Viral moments are big breaks. Algorithm changes, demonetization, burnout, a controversy or being "cancelled" use E4 gossip and E6b tabloids. Sponsorship deals use E6b contracts with fictional brands.
- Musicians, actors and athletes get followers from their fame (crossover), and can promote releases and seasons on their accounts.

**For everyone**
- Anyone 13+ can have casual accounts. What you post can help or hurt you: an employer sees a post, an ex comments, family finds out a secret, the gossip web picks it up.
- A setting to keep accounts private.

**Minors**
- Accounts from 13 (or the country's age), with a parent's involvement and contracts signed by a parent.
- No romance or sexual content involving anyone under 18, and nothing a minor meets can be suggestive (the content build checks it, as E6b does).

### Acceptance criteria

- Six platforms with distinct growth and pay models, defined in content.
- Accounts with typed handles, followers, a niche, and per-platform posting actions with a budget and diminishing returns.
- Platform income goes through the ledger with the right model per platform.
- The social path's rung and fame derive from your accounts, and other fame paths cross-promote.
- Casual accounts for everyone, with consequences through the gossip web and events.
- Age and minor rules are enforced in the engine and the content build.
- The doc amendment to the brand rule is made.
- The simulation report shows accounts per life, followers by platform, income by platform model, viral moments, controversies and cancellations, and posts that reached an employer or partner, with targets. The star player covers the social path.

### Prompt

```text
You are implementing Batch 8 (Social media, real platforms) of the post-expansion-1 changes for WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md (E4, E6b as built), docs/expansion.md (E4, E5 & E6 decisions and writing guidance, E6b) and docs/post-expansion1-changes.md (triage note 11, Batch 8). Batch 4 must be merged first. Re-check the starting facts against the code. Inspect src/content/fame/social.yaml, src/engine/fame, the E4 knowledge and gossip system, tabloids, contracts and studios first. Extend them; do not duplicate them.

The user decided on 2026-10-15 that this path uses real platform names. Amend the brand rule in docs/expansion.md accordingly: real platform names are allowed for this path only, defined in content so they can be swapped, with no logos, no claims of partnership or endorsement, and no real people; labels, studios, brands and awards stay fictional.

Build only Batch 8:
- Platforms as YAML content: Instagram, TikTok, X / Twitter, YouTube, Twitch and Podcasts, each with its content kind, joining age, growth model and pay model (ad share at a threshold, subscriptions and donations, a creator fund, podcast ad reads, brand deals).
- Accounts per platform with a typed, validated handle, followers, engagement and a niche from content; posting actions per platform within a yearly content budget with diminishing returns; cross-promotion and collaborations with creators in your circle.
- Creators: the E6b social path's rung and fame derived from total reach; viral moments as big breaks; algorithm changes, demonetization, burnout, controversy and cancellation through E4 gossip and E6b tabloids; sponsorships through E6b contracts with fictional brands; crossover followers for musicians, actors and athletes, who can promote their work.
- Everyone 13+: casual accounts with a private setting, where posts can reach an employer, a partner, an ex or family through events and the gossip web.
- Minors: a parent involved and signing contracts; no romance or sexual content involving anyone under 18 and nothing suggestive a minor can meet, checked by the content build.
- UI: a Social screen (from Work for creators and More for everyone) with accounts, handles, followers in words and numbers, post buttons with the budget, and income on the Money tab.
- About 35 new events following AGENTS.md and the writing guidance.

Meet every Batch 8 acceptance criterion. Upgrade saves (existing social-path careers get accounts that match their current fame). Extend tools/simulate.ts with reports and targets. Run npm run check, npm run test:e2e (phone e2e: create an account with a handle, post on two platforms, reach a monetization threshold, a casual post found by an employer), a 1,000-life smoke run and 10,000 lives in four shards (default and star players). Open a pull request into main, wait for green CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## Batch 9 — God mode (9a: plan, 9b: build)

**Objective:** Let a player switch on god mode in Settings and edit any part of themselves or anyone in their life, without breaking the game's rules or its exact replays.

### Starting facts

- **Data** (`src/engine/types.ts`):
  - `Identity` (63-73), `Personality` (75-82), `Stats` (86-93), `HiddenValues` (97-107);
  - `Character` (109-136), `Person` (138-180), `PersonLife`, `ChildData`;
  - `Relationship` (346-391), `HealthState`, `EducationState`, `CareerState`;
  - `LifeState` (1111-1180).
- **Saves** are validated by strict zod schemas (`src/persistence/lifeSchema.ts`) plus `checkInvariants` (`src/engine/invariants.ts`). A save that fails loads a backup.
- **Replays:** lives replay exactly from `inputLog` (`src/engine/replay.ts`). `InputRecord.kind` has no "edit" kind. The heir "snapshot" record is the closest precedent.
- **The sandbox** (`/?sandbox`, development only) previews events on a throwaway life. It isn't an editor, but its field controls can be reused.
- **Decided 2026-10-15:** a Settings toggle, and edited lives are **not** marked in the archive.

### 9a: the plan

Write a gate in `docs/expansion.md` ("G1 — God mode") in the stage format. It must settle:

- **What can be edited,** for you and for any person:
  - name;
  - identity (gender, pronouns, attraction, including the hidden orientation);
  - stats, personality and hidden values (talent, luck, reputation and the rest);
  - looks;
  - health conditions (add, remove, severity);
  - relationship kind and values (affection, trust, status);
  - job and wealth level;
  - city (with presence rules);
  - faith, languages, citizenships;
  - money and debts.
- **What cannot be edited, or only within limits:**
  - **Age:** decide whether it's editable at all, and how history and life stage would follow.
  - **Anything that would break a content rule:** for example making anyone under 18 a romantic partner, editing a partner's age under 18, romance with family, or someone living with you in another city.
- **Replay:** a new `edit` input-record kind, applied through one engine action, validated and replayed exactly.
- **Validation:** every edit runs the zod schema and the full invariants before it's accepted, and is refused with a reason otherwise.
- **The toggle:** stored in Settings (persistence), available in every build, and unmarked (the user's decision). The simulation never uses god mode.
- **UI:** an Edit button on Profile and person pages while god mode is on. Grouped, phone-sized editors with sliders and pickers, and words beside numbers.

Then **stop** and ask the user to approve the gate before building.

### 9b: the build

Implement the approved gate.

### Prompt (9a)

```text
You are writing the plan for Batch 9 (God mode) of the post-expansion-1 changes for WIPlife. This is step 9a: a plan only, no code.

Read AGENTS.md, docs/design.md, docs/technical.md (sections M, N and Q), docs/expansion.md and docs/post-expansion1-changes.md (triage note 10, Batch 9). Inspect src/engine/types.ts, src/persistence/lifeSchema.ts, src/engine/invariants.ts, src/engine/replay.ts, the sandbox and the Settings screen.

Write a new gate in docs/expansion.md, "G1 — God mode", in the same format as the other stages. Settle everything listed under "9a: the plan" in docs/post-expansion1-changes.md: the full list of editable fields for the player and any person, what is limited or refused (decide on age), the edit input-record kind and how replays stay exact, validation through the zod schemas and the full invariants with refusal reasons, the content rules no edit may break (no romance involving anyone under 18, none with family, presence), the Settings toggle (every build, edited lives unmarked, as the user decided on 2026-10-15), and the UI.

Open a pull request into main with only the plan, and report it with the open questions. Do not build anything until the user approves the gate.
```

### Prompt (9b)

```text
You are implementing Batch 9b (God mode) of the post-expansion-1 changes for WIPlife, from the approved gate "G1 — God mode" in docs/expansion.md.

Read AGENTS.md, docs/design.md, docs/technical.md, docs/expansion.md (G1) and docs/post-expansion1-changes.md (Batch 9). Inspect the types, the save schemas, invariants, replay, persistence settings and the Profile, person and Settings screens first. Extend them; do not duplicate them.

Build only G1, as the gate describes: the Settings toggle, an edit input-record kind and one validated engine action, the editors for the player and any person, refusal of edits that break the schemas, invariants or content rules, with a reason. Edited lives are not marked. Add unit tests for each editable area and for every refusal rule (including that no edit can create romance involving anyone under 18 or with family), a replay test of a life with edits, and a save round-trip test.

Meet every G1 acceptance criterion. Upgrade saves and settings. Run npm run check and npm run test:e2e (phone e2e: switch god mode on, edit your stats and a friend's attraction, have a refused edit explained, reload and see the edits kept). Open a pull request into main, wait for green CI, and report what you built, deviations and why, and open questions. Report only verified facts.
```

---

## Batch 10 — Language and travel, expanded

**Objective:** Build on W4b and W5 once their gates are closed (Batch 0): more ways to learn and use languages, and more to do when you travel.

### Starting facts

**Languages (W4b)**
- 20 language definitions. Skill 0–100, shown as beginner, basic, conversational or fluent.
- Learning comes from school classes, one paid course a year as an adult, and immersion. Unused languages fade, with a floor for native ones.
- Job language requirements by country and city. Shared-language weighting in meeting people and in interaction odds.

**Travel (W5)**
- 22 destinations, including six vacation-only ones (Paris, Rome, Barcelona, Kyoto, Chiang Mai, Negril). People met there are fellow travelers from modeled countries.
- Exchanges, working holidays and transfers.
- Open questions in `docs/w5-validation.md`:
  - a semester takes a whole yearly turn;
  - temporary stays are solo;
  - pension portability uses the current country only.

**Repetition**
- `language_class_result` is 6.7 a life (Batch 0 reviews it).

### What to build

**Languages**
- More ways to learn: an app (cheap, slow), a tutor (paid, fast), practicing with a native speaker you know (an interaction that raises both your skill and affection), and immersion trips.
- Certificates: a language exam event with levels that count for jobs and W6 routes.
- A translator or interpreter job track.
- Raising a bilingual child: a parenting choice that passes a language on.
- Heritage languages coming back later in life (events).
- Languages for Batch 6's new countries (German, if not present; check Italian and French).

**Travel**
- More vacation destinations: at least 6 more across regions not yet covered, with light definitions. Locals met there use name pools (Batch 1 and Batch 6 heritages) where they exist.
- Things to do on a trip (sightseeing, nightlife, adventure, food), each a choice with effects and stories.
- Cruises, honeymoons (linked to the wedding flow), group trips with friends, business travel for jobs that call for it, souvenirs (Batch 2a valuables where costly).
- **The W5 open questions:**
  - A family coming along on a temporary stay (a partner and children, with school and housing handled by the existing systems).
  - A decision on part-year stays: build them or close the question with the reason.
  - A pension portability model across the four countries.

### Acceptance criteria

- Each new way of learning moves skill at the rate in `balance/languages.yaml`. Certificates count for jobs and W6 routes. The translator track and bilingual parenting work.
- At least 6 new destinations with trip activities. Locals use fitting names where pools exist. Honeymoons, cruises, group trips and business travel work, and every cost goes through finance with its receipt.
- Families can come along on temporary stays, with children's schooling handled.
- Part-year stays are either built or closed with a recorded reason, and pension portability works across countries, with a test.
- The simulation reports learning by method, certificates, translators, bilingual children, trips by activity and destination, families on stays, and pensions earned across countries, with targets. Zero invariant failures.

### Prompt

```text
You are implementing Batch 10 (Language and travel, expanded) of the post-expansion-1 changes for WIPlife.

Read AGENTS.md, docs/design.md, docs/technical.md (W4b, W5, W6 as built), docs/expansion.md (W4b, W5, W6) and docs/post-expansion1-changes.md (triage note 12, Batch 10). Batch 0 must be merged (W4b and W5 gates closed); use Batch 1's heritage names and Batch 2a's valuables where they exist. Re-check the starting facts against the code. Inspect src/engine/languages.ts, src/engine/travel, src/engine/migration, education, careers, parenting, pensions and the destination and language content first. Extend them; do not duplicate them.

Build only Batch 10:
- Languages: learning by app, by tutor (paid) and by practicing with a native speaker you know (an interaction raising skill and affection), at rates in balance/languages.yaml; certificate exams as events that count for jobs and W6 routes; a translator or interpreter job track; raising a bilingual child as a parenting choice; heritage languages returning in later-life events; any languages Batch 6's countries need.
- Travel: at least 6 new vacation destinations with light definitions; trip activities (sightseeing, nightlife, adventure, food) as choices with effects and stories; cruises, honeymoons linked to the wedding flow, group trips with friends, business travel for jobs that call for it, souvenirs; locals met abroad using fitting name pools where they exist.
- W5 open questions: families coming along on temporary stays (partner and children, with schooling and housing through the existing systems); build part-year stays or close the question with the reason recorded; a pension portability model across the four countries, with tests.
- About 30 new events following AGENTS.md and the second-wave writing guidance (no national stereotypes).

Meet every Batch 10 acceptance criterion. Upgrade saves. Extend tools/simulate.ts with reports and targets. Run npm run check, npm run test:e2e (phone e2e: practice with a native speaker, pass a certificate, take a honeymoon, bring a family on a working stay), a 1,000-life smoke run and 10,000 lives in four shards. Open a pull request into main, wait for green CI, and report what you built, the simulation results, deviations and why, and open questions. Report only verified facts.
```

---

## After these batches

Stage 11 (Polish), Stage 12 (Balancing) and Stage 13 (Launch) in `docs/technical.md` follow, now covering these batches too. Stage 12 should take on the event repetition noted above (`therapist_talked`, `doctor_all_clear` and the other events that most often repeat within a life).
