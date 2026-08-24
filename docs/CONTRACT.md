Contract version: v1.0 (2026-08-24)

# Prediction output schema

The fields `/api/predict` returns and the frontend binds to. Renaming or removing
anything here is a breaking change: bump the version, add a changelog entry, and
update the frontend in the same commit.

`pipeline/preflight.py` asserts the required fields are present, so a rename that
skips this document still fails the gate.

## Always present

| Field | Type | Meaning |
|---|---|---|
| `game_name` | string | Echo of the query |
| `category` | string | Coarse bucket, e.g. "Day One (Xbox Game Pass Ultimate)", "6-12 months" |
| `tier` | string | Which part of the cascade answered. Diagnostic, shown under Technical Details |
| `reasoning` | string | Prose explanation. May contain newlines |
| `grain` | string | How precisely the answer may be stated. See below |
| `basis` | string | One sentence naming what the answer rests on |
| `confidence` | number | 0-100. **Retained for compatibility, not displayed.** See note |

## Present when the answer came from the model

| Field | Type | Meaning |
|---|---|---|
| `predicted_months` | number | P50 months from now. Negative means the estimate has passed |
| `predicted_months_low` | number | P10 bound, months from now |
| `predicted_months_high` | number | P90 bound, months from now |
| `projected_arrival` | string | P50 as an absolute month, e.g. "March 2028" |
| `projected_arrival_low` | string | P10 as an absolute month |
| `projected_arrival_high` | string | P90 as an absolute month |
| `predicted_total_days` | number | Total wait from release, not from now |
| `publisher_game_count` | number | Games from this publisher already on the service |
| `publisher_avg_wait_days` | number | That publisher's mean wait |
| `publisher_consistency` | number | Coefficient of variation. Higher means more erratic |
| `metacritic_score_used` | number | Score fed to the model, real or imputed |

## Present on the history path

| Field | Type | Meaning |
|---|---|---|
| `last_appearance_date` | string | When it was last on the service |
| `sample_size` | number | How many times it has appeared |
| `recently_appeared` | bool | Still likely available, so the prediction may be moot |

## `grain` values

Resolved in the backend, never recomputed in the UI, so the thresholds live in
one place. Driven by the width of the calibrated band: a 40-month range does not
support naming a month.

| Value | Meaning | Rendered as |
|---|---|---|
| `month` | Band under 24 months | "March 2028" plus a drawn range |
| `year` | Band 24-48 months | "sometime in 2028" plus a range |
| `floor` | Band 48-96 months | "not before 2029", open at the top |
| `suppressed` | Band over 96 months | "we can't narrow this down", no range |
| `overdue` | P50 already passed | "could be any time now" |
| `rule` | Publisher policy or first-party | Category badge, no range |
| `repeat` | The game's own history | Date plus range |
| `ineligible` | Not on this platform | Category badge |
| `no-interval` | Answered without a band | Category badge |

Rule answers carry no range on purpose: their risk is a policy changing, not
statistical spread, so a confidence band would misrepresent it.

## On `confidence`

Still returned so nothing breaks, and **no longer displayed**.

It was a stack of hand-picked constants: a base from publisher sample size,
adjustments for variance and whether a Metacritic score existed, a per-platform
multiplier, then a cap. It was not the probability of any event, so no
observation could ever contradict it.

`basis` replaces it. "Based on 34 previous games from Devolver Digital" is
checkable against the publisher stats on the same page; "71% confident" is not.

Removing the field entirely is deferred to v2.0, so any consumer still reading it
keeps working.

## Interval meaning

`predicted_months_low` to `predicted_months_high` is an **80% interval**,
conformally calibrated: over many predictions the true arrival should fall inside
it about four in five times. Measured coverage on out-of-time data is 85%.

The bounds are ordered before being returned. The three quantile models are
fitted independently and can cross, so sorting is what guarantees
low <= mid <= high.

## Changelog

### v1.0 - 2026-08-24
First versioned schema. Adds `grain` and `basis`. Marks `confidence` retained but
undisplayed. Documents the interval as an 80% conformally calibrated band and the
ordering guarantee on its bounds.
