# W4b validation record

Validation stopped on 2026-10-13 at the user's request to finish the tests already running, document bugs, and start no further runs. This is not a claim that every acceptance gate passed.

## Verified results

- The final local `npm run check` passed content compilation, lint and TypeScript, then finished unit tests with **1,421 passing and five failing** (1,426 total). Its production-build phase did not run because unit tests failed. An earlier independent production PWA build passed.
- Three failures were outdated test expectations exposed by the added seeded native-language draws: the creation golden snapshot, a group-membership assertion assuming 3–5 instead of the configured 2–4 people, and a sports assertion treating preexisting health conditions as new injuries. These expectations were corrected without changing their production systems; all **112 tests across those three files passed** in a focused run already completed before the stop request. The complete suite was not rerun afterward.
- **17 focused language, migration and report tests passed** on the final functional implementation.
- The complete phone-sized browser suite passed **127 tests** before the final native-assignment RNG/curriculum/content refinements. The **two language browser tests passed again after those refinements**, covering Profile persistence and paid-course receipt/yearly limits. The full browser suite was not repeated at that point.
- GitHub Actions run [38423309135](https://github.com/tnewc3/wiplife/actions/runs/38423309135), for commit `5814c0b158e3752b62581d5809d1103094235655`, completed with failure in the unit-test step. Content compilation, lint and type checking passed. Subsequent simulation, production-build and browser-test steps were skipped. Detailed failed-log retrieval returned Forbidden, so the precise CI failures remain unverified. Deployment preview checks passed.

## Unresolved failures

The final local full suite timed out in:

1. `src/engine/lifespan-1.test.ts`: the 625-life first shard exceeded its 600,000 ms test timeout.
2. `tools/simulate/run.test.ts`: the 30-life relationship-report test exceeded its 60,000 ms test timeout.

These timeouts are unresolved. Their cause and the runtime contribution of W4b have not been established. No timeout budgets were raised to hide them. The final fixture/documentation commit skips automatic CI, following the user's instruction to start no additional runs; it has no fresh complete-suite or CI result. The pull request remains draft and must not merge while required CI is not green.

## Simulation and acceptance gap

The requested **10,000-life W4b simulation was not completed**. Four 2,500-life batches started during implementation were stopped after code changes, and produced no completed reports. They were not restarted following the user's stop instruction.

An earlier ten-life careful-player smoke run completed with zero invariant failures, median lifespan 79, and language-report output: seven lives learned a non-native language, 58 paid courses, 420 school points, 688 paid-class points, 423 immersion points, and 1,073 faded points. It observed 11 language-blocked job openings and 187 shared-language meetings, with no barrier meetings in that small sample. These numbers describe an earlier implementation, not the final commit or a balancing result. There is no verified final 10,000-life language distribution, learning-rate or friendship-impact result.

## Implementation choices and open verification

Schooling uses the country's ordered foreign-language curriculum automatically, rather than adding a new school-selection screen. Old saves receive known local/family languages without inventing unavailable historical heritage or consuming the saved RNG. Native flags persist when skills fade, with the floor configured in balance. Friendship reporting is observational and does not establish a causal effect.

No W5 travel or W6 emigration work was added. Outstanding verification is the two local timeouts, the exact CI failure details, a green complete run, and the unmet 10,000-life acceptance gate. There are no additional user decisions required to review this draft.
