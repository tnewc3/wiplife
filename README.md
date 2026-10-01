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
| `npm run content` | Compiles and validates `src/content/**/*.yaml` into `src/content/compiled/content.json` |
| `npm run simulate -- --lives 1000` | Plays random lives headless (random choices, plus a simple player model for relationship, money, home, school and work actions) and reports invariant failures, lifespans, events per year, how often each event fired, marriage and divorce rates, savings, debt and net worth over lifetimes, education outcomes (diplomas, college, degrees, student debt) by family wealth, and careers (income by education path, promotion, firing and layoff rates, how far people get in each job track) with every target in `balance/targets.yaml` marked met or not (`--seed`, `--json report.json`); fails on any invariant failure |
| `npm run lint` | ESLint, including the engine boundary rules |
| `npm run typecheck` | TypeScript for the app, the engine (without DOM types) and the Node tools |
| `npm test` | Unit tests (Vitest), including a 2,500-life lifespan and invariant test; the nightly workflow runs 10,000 (`LIFESPAN_LIVES=10000 npx vitest run src/engine/lifespan`) and a 10,000-life simulation |
| `npm run test:e2e` | End-to-end tests at phone size (Playwright; builds and serves the app first) |
| `npm run check` | Lint, typecheck, unit tests and build |

First-time Playwright setup: `npx playwright install chromium`.

App icons in `public/` are generated from `public/favicon.svg` with `npx pwa-assets-generator`.
