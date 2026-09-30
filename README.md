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
| `npm run simulate -- --lives 1000` | Plays random lives headless and reports invariant failures, lifespans, events per year and how often each event fired (`--seed`, `--json report.json`); fails on any invariant failure |
| `npm run lint` | ESLint, including the engine boundary rules |
| `npm run typecheck` | TypeScript for the app, the engine (without DOM types) and the Node tools |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests at phone size (Playwright; builds and serves the app first) |
| `npm run check` | Lint, typecheck, unit tests and build |

First-time Playwright setup: `npx playwright install chromium`.

App icons in `public/` are generated from `public/favicon.svg` with `npx pwa-assets-generator`.
