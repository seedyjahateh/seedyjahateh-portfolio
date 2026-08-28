# ADR 0017 - Budgets as reviewed configuration

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 0.9 makes performance a release feature: "A visual effect that breaks a
budget is removed, not excused." PRD 12.2 forbids workstreams from changing
"performance budgets, acceptance thresholds, security headers, schema strictness,
or accessibility requirements to make tests pass."

A prohibition that lives only in prose is broken by the first workstream under time
pressure, and the breakage looks like a green build.

## Decision

Every numeric gate in the PRD lives in `config/budgets.v1.json` - 83 entries
spanning artifact sizes, build SLOs, search and filter timings, Core Web Vitals,
DOM and event budgets, JS and CSS, memory, network and media, spatial caps,
accessibility thresholds, and the PRD 7.4 migration triggers. Nothing hard-codes
a threshold; CI reads this file.

Two mechanisms guard it. `config/**` is CODEOWNERS-gated. And
`scripts/verify-budgets.ts` fails when `config/` changed in a commit range with
no ADR reference - so relaxing a budget requires writing down why.

The script also checks internal coherence, including that a `failureThreshold` is
looser than its target rather than tighter, which catches the two being swapped.

One entry is marked `status: "pending"`: the 150-query relevance suite, which
cannot be met until the seed catalog carries real content. Marking it pending is
deliberately louder than omitting it.

## Consequences

Easier: one place to audit; a budget change is visible in review. Harder: tuning
a threshold during development needs a config edit.

## Compressed cost

None. Build-time only.

## Fallback

None needed.

## Removal path

Inline the thresholds into each test. Loses the review gate entirely.

## Revisit trigger

Per PRD 9.2, budgets are tied to reference profiles. If the reference hardware
changes, timings need re-derivation - with an ADR.
