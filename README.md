# WIPlife

A free, mobile-first life simulator that runs entirely on the player's device. Every life is a work in progress.

- Game design: [docs/design.md](docs/design.md)
- Architecture, data model and roadmap: [docs/technical.md](docs/technical.md)
- Rules for coding AIs: [AGENTS.md](AGENTS.md)

## Commands

Requires Node 22.22+ or 24.15+ (see `.nvmrc`).

| Command | What it does |
|---|---|
| `npm run dev` | Builds content, then starts the dev server |
| `npm run build` | Builds content, then the production app (with service worker) into `dist/` |
| `npm run preview` | Serves `dist/` locally |
| `npm run content` | Compiles and validates `src/content/**/*.yaml` into `src/content/compiled/content.json`, and prints the C1 consistency warnings for review |
| `npm run simulate -- --lives 1000` | Plays random lives headless (random choices, plus a simple player model for relationship, money, home, school and work actions) and reports invariant failures, lifespans, events per year, how often each event fired, marriage and divorce rates, savings, debt and net worth over lifetimes, education outcomes (diplomas, college, degrees, student debt) by family wealth, and careers (income by education path, promotion, firing and layoff rates, how far people get in each job track) with every target in `balance/targets.yaml` marked met or not, how many lives reach each trade, health (each condition's rate, treatment and deaths, doctor visits, medical debt, causes of death), the law (records by offense and outcome, probation, prison and release) and self-discovery (what surfaced, was accepted or pushed down, crises, coming out), with the careful player picking event choices by personality (Risk-taking toward risky and illegal choices, Discipline away from them, Kindness toward kind ones) and a count of the events that offer an illegal choice and how often one was taken, and the same seeds played by a careless player (random actions, no caution rules) side by side with the careful one (`--seed`, `--player both|all|careful|careless|spammer`, `--json report.json`; `all` adds the spammer, who is slower), and (E1) each player's use of the interaction menu: interactions per year, outcome tier rates (and by repeats), relationships that reach maximum affection, money given and borrowed, fights leading to charges and new health risks, and lives rebuilt exactly from their input logs, with a spamming player who repeats one interaction with one person, and (E2a) children and parenting (births per life, adoption, IVF and surrogacy, pregnancies and miscarriages, children lost and their grief chains, custody and child support, child costs, how a warm, strict or involved style shapes grades and personality, and how children's starting values sit between their parents') with its targets; fails on any invariant failure in any run |
| `npm run coverage -- --lives 300` | The content coverage report (Stage 10): events by life stage, category, tone and rarity; memory tags written but never read; flags set but never checked; events no chain can reach; and, from simulated lives, how many events are eligible each year by stage, age and situation (dry spots), and how often events repeat within a life. Checks against `coverage` in `balance/targets.yaml` and fails if one isn't met (`--static` skips the simulated part, `--seed`, `--json report.json`) |
| `npm run samples` | Plays 20 lives and writes them, with their obituaries and life histories, to `docs/sample-lives.md` for human review (`--lives`, `--seed`, `--out`) |
| `npm run lint` | ESLint, including the engine boundary rules |
| `npm run typecheck` | TypeScript for the app, the engine (without DOM types) and the Node tools |
| `npm test` | Unit tests (Vitest), including a 2,500-life lifespan and invariant test; the nightly workflow runs 10,000 (`LIFESPAN_LIVES=10000 npx vitest run src/engine/lifespan`) and a 10,000-life simulation |
| `npm run test:e2e` | End-to-end tests at phone size (Playwright; builds and serves the app first) |
| `npm run check` | Lint, typecheck, unit tests and build |

First-time Playwright setup: `npx playwright install chromium`.

Development and test builds have an event sandbox at `/?sandbox`: it previews any event with any pronoun set and character state. Production builds leave it out.

App icons in `public/` are generated from `public/favicon.svg` with `npx pwa-assets-generator`.
