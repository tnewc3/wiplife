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

## Consistency rules (if it doesn't make sense, it doesn't happen)
- Category contracts: every event category has required conditions, enforced by the content build (school events need enrollment; work events need a current job and no retirement; partner events need a partner). See src/content/registries/categories.yaml.
- Presence: every cast role declares where the person must be (household, city, nearby, elsewhere or anywhere). Casting respects where people live and who lives with you. Never cast a live-in partner as visiting. In-person actions need the same city.
- Evidence: any text that states something about your past (a sport you played, a habit, a debt) must require the flag, memory or earlier event that proves it.
- Time: never write fixed gaps like "years later" in follow-ups. Use the elapsed-time placeholder {since}, or no time phrase.
- Money: any event or interaction that mentions money must change money, and any money change must be shown with the amount and your new balance. Amounts that depend on your situation (rent, wages, big costs) scale with it.
- Household: if you live with a partner, events about your home and wellbeing must account for them (cast them, or branch the text).
- Status-aware text: text that depends on relationship status, job or school must branch on it or require it.
- The content build warns on wording it can't judge exactly (fixed time gaps in follow-ups, money words without money effects, claims about your past without evidence). Fix each warning, or give the reason in the event's `justified` field.

## Commands
See README.md for build, test and check commands.

## Git workflow
- Branch from the latest main. Open pull requests into main only, never into another feature branch.
- One stage (or one follow-up task) per pull request. Don't bring in unrelated commits.
- At the end of every stage, open its pull request into main without asking.
- A pull request merges only when CI is green.

## When finished
Report what you built, any deviations from the docs and why, anything left undone, and open questions.
Only report facts you checked in the code, tests, files or CI logs. Label anything you didn't check as unverified.
