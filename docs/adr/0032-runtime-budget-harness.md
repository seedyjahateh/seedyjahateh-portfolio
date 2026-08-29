# ADR 0032 - Runtime budget harness and scale-corpus builds

- Status: accepted
- Date: 2026-08-29
- Phase: 3

## Context

Phase 3's exit gate is "search/filter/DOM/a11y budgets pass at 1,300 and soak at
10,000" (PRD 13). Nothing could measure most of it.

`scripts/measure-routes.ts` reads the exported HTML and the bytes it references.
That is the right way to measure transfer size, and it is structurally blind to
every budget this phase is gated on: `MOUNTED-ROWS-MAX`, `DOM-ARCHIVE-STEADY`,
`FILTER-MEDIAN-1300`, `FILTER-P95-*`, `SEARCH-QUERY-*` and `LONG-TASK-CEILING`
are all properties of the page after hydration. Virtualization does not exist in
a file.

## Decision

**A Playwright project, not a standalone script.** The harness was first written
as `scripts/measure-runtime.ts`, launching its own browser and static server. It
reimplemented — badly, and then failed to launch Chromium at all — what
`playwright.config.ts` already does correctly for fifty other tests. It is now
`tests/e2e/runtime-budgets.perf.spec.ts` under a `perf` project, and the browser
and server code is gone.

`perf` runs with one worker and no parallelism, and is excluded from
`pnpm test:e2e`. Timing assertions mixed into a `fullyParallel` suite measure
contention rather than the page.

**Measurement uses User Timing, not a bespoke global.** The engine emits
`atlas:filter` measures and the search client republishes the worker's own
`queryMs` as `atlas:search`. The harness reads them with
`performance.getEntriesByName`. DevTools shows them in the timeline for free,
and nothing ships beyond a timing entry. Both emitters are wrapped: a runtime
without User Timing must not take the feature down with it.

**Thresholds come from `config/budgets.v1.json`.** Nothing is hard-coded, so
changing one stays a reviewed diff with an ADR behind it (PRD 12.2).

**Fixture builds cap the fan-out routes.** `ATLAS_FIXTURE=1300` publishes a
synthetic corpus and reaches the web build through its own `prebuild` hook.
Emitting every page for that corpus took roughly eleven minutes, dominated not
by the 1,300 detail pages but by **2,959 evidence artifact pages**. Both routes
cap at 25 entries when `ATLAS_FIXTURE` is set.

What the harness measures is untouched: `catalog-core`, `facets`,
`facet-bits` and the search index are produced by `catalog:build` and are
byte-identical either way, and every budget above is a property of `/projects`
alone. The one consequence is that some rows link to pages a fixture build did
not emit, so **a link-integrity check must never be run against one**.

## Consequences

Easier: the exit gate is a command. A regression in mounted rows or filter
timing fails with the budget id and the measured value beside it.

Harder: two measurement entry points to keep straight — `measure:routes` for
transfer size, `measure:runtime` for everything after hydration.

## Compressed cost

None. No harness code ships.

## Fallback

Read the numbers by hand in DevTools. The User Timing entries are there either
way; only the automation and the pass/fail would be lost.

## Revisit trigger

If the capped routes ever stop being irrelevant to a budget — a per-detail-page
runtime budget, say — the cap has to go and the build time has to be solved
another way.
