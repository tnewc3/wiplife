# AGENTS.md — rules for working on WIPlife

## Read first
- docs/design.md (game design) and docs/technical.md (architecture, data model, stage gates).
- Inspect the existing code before changing anything.

## Scope
- Implement only the stage you were asked to implement. Never start the next stage.
- Do not rewrite working systems. Do not create a second system that does the same job as an existing one.
- If something is ambiguous or would change the architecture, stop and ask.

## Architecture boundaries
- src/engine is pure TypeScript: no React, no DOM, no browser APIs, no Math.random, no Date.now.
- All randomness goes through the seeded rng stored in the life state.
- Game content lives in src/content as YAML. Never hardcode events, jobs, names or other content in code or UI.
- Exception: fixed interface words for built-in values (wealth levels, relationship labels such as Mother, Father or Parent, housing types) live in one file, src/ui/labels.ts. Anything story-like belongs in content.
- Tuning numbers (rates, curves, budgets, prices, odds) live in src/content/balance as YAML, never inline in code.
- The UI reads state through selectors and changes it only through store actions that call the engine.
- Persistence code lives only in src/persistence.

## Quality
- TypeScript strict mode. No `any` without a comment explaining why.
- Validate every player input and every loaded save.
- Every new system gets unit tests. Every new screen gets a phone-sized end-to-end test.
- Run lint, type check, tests and content build before finishing. All must pass.
- Mobile first: touch targets at least 44px, respect safe areas, nothing depends on hover.

## Content rules
- Mature and taboo themes are allowed and must carry consequences. Write frankly, suggestive rather than graphic.
- No romantic or sexual content involving anyone under 18. Dating and romance are for adults only.
- Childhood mistreatment is never sexual and never graphic.
- Sexual violence is never a player choice.
- The player is "you". Use pronoun placeholders for every NPC; never hardcode he or she.

## Commands
See README.md for build, test and check commands.

## Git workflow
- Branch from the latest main. Open pull requests into main only, never into another feature branch.
- One stage (or one follow-up task) per pull request. Don't bring in unrelated commits.
- A pull request merges only when CI is green.

## When finished
Report what you built, any deviations from the docs and why, anything left undone, and open questions.
Only report facts you checked in the code, tests, files or CI logs. Label anything you didn't check as unverified.
