# W5 implementation and stopped validation report

Validation was stopped at the user's request on 2026-10-13. PR [#37](https://github.com/tnewc3/wiplife/pull/37) remains a draft into `main`. This report covers implementation commits `a23f85b` and `01a8fae`. W5 has not passed every acceptance gate and is not ready to merge on the evidence below.

## Built

- 22 destinations: the 16 existing cities and six vacation-only destinations.
- More → Plan a trip: destination, budget, up to three eligible companions, finance-module booking charges, language/stat effects and travel stories.
- Travel encounters using existing people, relationships and presence rules; adults-only holiday romance and trouble abroad.
- Dated visitor, student and temporary-worker residence records, automatic returns, study exchanges through education, and working holidays/employer transfers through careers. Existing language immersion and distance effects apply.
- 40 travel events, content validation and sandbox previews; schema-26 upgrades including heir replay snapshots; W5 simulation reports.
- Permanent emigration, undocumented status and citizenship were not implemented.

## Completed evidence

| Check | Verified result and limit |
| --- | --- |
| Content build | 1,657 definitions, version `0.1.0+feb278552a`; no consistency warnings. Test content pack: 549 definitions. |
| Lint and type check | Final logs reported no errors. These do not establish a passing full `npm run check`. |
| Focused engine/save/report tests | Five files, 51 tests passed before the final planner-selector refinements. Includes travel, save, cooldown, simulation-report and later-life checks. |
| Content fixture tests | 65 passed, 87 skipped. A separate real-content compile test passed. |
| Phone suite | 130 tests passed before the final planner-selector refinements. |
| Final W5 phone rerun | All three travel/exchange/temporary-work tests passed in 49.2 seconds, exit 0. This run finished before cancellation. |
| Completed smoke simulation | 30 careful-player lives, zero invariant failures; 122 trips, two study stays, seven work stays, nine returns, 147 encounters and zero completed holiday romances. This is a small smoke sample, not the 10,000-life acceptance run. |

The completed smoke observed all 22 destinations. It does not establish balanced destination frequency, holiday-romance frequency, causal effects on grades, or coverage of every long-life combination. Sandbox tests exercised the 40 travel events and their outcomes with she/he/they/xe pronouns; that does not replace long simulation coverage.

## Found and addressed

- An early 50-life smoke reported 105 invariant violations involving local group memberships after travel moves. Departure and return now invoke the existing group-move hook.
- A subsequent 100-life smoke reported 45 invariant violations involving historical earnings after moving to a country with a lower earnings cap. The invariant now accepts historical earnings under any modeled country's cap, with regression coverage. Pension calculations retain the existing current-country approximation.
- A temporary-work phone test expected dollar amounts for a UK destination. Its expectation was corrected to the existing finance conversion; the final phone rerun passed.
- The unfinished full check reported three failures in `tools/simulate/run.test.ts`: life/report, marriage/divorce, and careful-versus-careless trading cases. Their observed durations were about 137, 139 and 126 seconds. The run was stopped before a final failure summary. The follow-up commit matches those tests to the headless runner's disabled Immer auto-freezing policy; a full passing run of that change was not obtained. The cause of the failures is not established by these logs.

An earlier check launched while content schemas were changing was discarded; it is not a final-head result.

## Cancelled or unverified

- Both 5,000-life acceptance processes were terminated. Each last logged 1,900 completed lives: at least 3,800 across the two batches, not an exact final count.
- Neither batch wrote its completed JSON report. Their aggregate invariant failures, W5 statistics and acceptance outcome are unknown. Progress messages contain no invariant results. The 10,000-life gate was not completed.
- The active full local check was terminated. No passing complete unit suite or complete final build/check gate was obtained.
- GitHub Actions run [38465198778](https://github.com/tnewc3/wiplife/actions/runs/38465198778) was requested to cancel, then force-cancelled because it remained in progress. GitHub subsequently confirmed `completed` with conclusion `cancelled`. Required CI was not verified green; the API exposed no step logs for this job.
- No tests or simulations were restarted after the user's stop request. This report-only follow-up uses `[skip ci]`.

## Deviations and open questions

- A semester occupies one annual turn, with a smaller intensive immersion gain than a year exchange, because the existing simulation advances annually. Whether a later stage should add fractional-year stays remains open.
- Temporary stays are solo and require rental/family housing. Dependents, home-care responsibilities and active business/crew/public-career commitments block departure. These limits preserve existing household and commitment rules; accompanying families and property management remain unimplemented.
- Cross-country pension portability still uses W4a's current-country approximation. A dedicated portability model remains open.
- Vacation-only destinations do not add full country economies or residence systems. Encountered fellow travelers have homes in modeled countries.
- The remaining acceptance criteria, full-suite reliability and large-sample outcome rates remain unverified. No claim of complete W5 acceptance is made.
