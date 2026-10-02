# End-to-end test content pack

`npm run content` lays this folder over `src/content` to build
`src/content/compiled/test-content.json`. Files here replace the real file at
the same path; this `events/` folder replaces every real event. Test builds
load the pack with `?content=test`, so flow tests don't change when real
events are added or tuned.

What a life in this pack does, for any seed (one event per year when one fits):

| Age | Event |
|---|---|
| 1 | `test_hello`: two choices, each with outcome text |
| 2 | nothing (a quiet year) |
| 3 | `test_auto`: no choices, just Continue |
| 4 | `test_crossroads`: live on, or end the life here |
| 5–17 | nothing |
| 18 | `test_meet`: you meet someone you're attracted to (and who is attracted to you); no choices |
| 19+ | nothing |

Management actions on a person's page each answer with one predictable
event (`registries/actions.yaml` here replaces the real one): asking out
always gets a yes (or "Never mind"), proposing and marrying always succeed,
and breaking up, divorcing, cutting contact and reconciling do just that.

Money trouble (a missed payment, collections, garnishment, eviction or
foreclosure) answers with `test_money_trouble`, a single card with no
choices (`registries/triggers.yaml` here replaces the real one).

Work is predictable (`balance/careers.yaml` here replaces the real one):
every job track is hiring every year, every application is accepted,
nobody is fired or laid off, and the yearly review promotes you after a
year at a level. A job application answers with `test_hired` (or
`test_rejected`), and asking for a raise with `test_raise`, which always
gives it (`registries/work.yaml` here replaces the real one).

Health, the law and self-discovery (Stage 9) stay out of the way of the
flows above (`balance/health.yaml`, `balance/legal.yaml` and
`balance/discovery.yaml` here replace the real ones):

- No condition ever starts on its own. Seeing a doctor answers with
  `test_doctor`, a single card (`registries/health.yaml`).
- At 27, `test_arrest` offers a getaway drive: "Stay home", or two years in
  prison. The first year inside begins with `test_prison_intake`, every
  year inside has one `test_prison_day`, and release answers with
  `test_release`, followed by a year of parole. No probation events.
- From 26 (no other flow gets that old), a latent trait surfaces at once
  with `test_discovery` (accept or push it down), and one pushed down comes
  back the next year with `test_resurface`. Hidden talents never surface,
  and there are no crises. Asking to tell people in the Profile sheet
  answers the next year with `test_coming_out`.

Interactions (E1) are the real ones, but `balance/interactions.yaml` here
replaces the real balance so every interaction goes the same way: neutral,
with no roll. A fight (picking one, then throwing the first punch) always
ends in an injury and a charge (for a minor, a suspension).
`registries/interactions.yaml` here answers being found out with two
predictable events (`test_flirting_found_out`, `test_cheating_found_out`).
