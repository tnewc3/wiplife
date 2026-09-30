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
