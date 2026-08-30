# ADR 0033 - What the search budget was actually measuring

- Status: accepted
- Date: 2026-08-30
- Phase: 3

## Context

Phase 3 was signed off on "5 of 6 runtime budgets pass". That was six budgets
chosen for the harness, not the set PRD 13's gate covers. An audit against
`config/budgets.v1.json` found six more never measured at all
(`PALETTE-OPEN`, `SEARCH-PAINT`, `SEARCH-WORKER-MEMORY`, `SEARCH-WORKER-INIT`,
`FILTER-TO-PAINT`, `FORCED-LAYOUTS-SCROLL`), and one PRD requirement never
built: §5.2.3's match highlighting, whose `MatchRange`s the worker had been
computing and nothing consumed.

`SEARCH-QUERY-1300` was over budget and had been made advisory to keep CI
meaningful. The question was what to do about it.

## What measurement found

Three theories were tested and two were wrong.

**"Match-range conversion is the overhead."** Wrong by two orders of magnitude:
`toRanges` over fifty results costs **0.06 ms p95**. A fix was nearly built on
this.

**"The worker is descheduled while the archive re-renders."** Wrong. The
harness now runs the same forty queries twice — once on `/projects`, which
re-renders 1,300 rows per keystroke, and once through the palette on an idle
home page. Overhead is **0.2–1.5 ms on both**. Essentially all of `queryMs` is
`fuse.search`.

**"The paint budgets are over budget."** Wrong, and the instrument was at fault.
`SEARCH-PAINT` closed its measure with a nested `requestAnimationFrame`. A rAF
callback runs _before_ the paint of its frame, so a nested one runs at the start
of the _next_ frame — up to a full 16.7 ms interval after the pixels appeared,
most of it idle. CI reported 31.8 ms against a 16 ms budget, and roughly a frame
of that was the technique. Measured through a `MessageChannel` task posted from
inside the rAF callback, which runs after the frame's rendering steps, it passes.

## Decision

**Highlighting is built.** `includeMatches` costs +0.3 ms, so no performance
argument ever justified leaving a PRD requirement unmet. Ranges paint as text
nodes split at range boundaries and wrapped in `<mark>` — never `innerHTML`, per
PRD §5.2.3 — and are clamped, sorted and de-overlapped rather than trusted, so a
malformed range degrades to plain text instead of dropping characters.

**Five of the six unmeasured budgets are now measured**, all through the shared
`check()` helper so each reports its value and honours `ATLAS_ADVISORY_BUDGETS`.
`SEARCH-WORKER-MEMORY` reads the worker's own isolate over CDP rather than the
page's, which would have been the wrong number under the right name.

**`FORCED-LAYOUTS-SCROLL` is reported as NOT MEASURED.** CDP exposes
`LayoutCount`, which counts all layout rather than forced synchronous layout,
and a virtualizer legitimately lays out as rows mount. Asserting a pass from that
number would claim something the measurement cannot support.

**`SEARCH-QUERY-1300` stays advisory.** Across five CI runs it has measured
**26.4, 32.2, 32.5, 35.0 and 39.3 ms** against a 30 ms budget, with no causal
change to the search path between them. It straddles the line by runner. One
passing reading is not grounds to enforce it; enforcing it would make CI red
intermittently, which is the failure mode the advisory list exists to prevent.

## The levers, if it has to close

Measured on interleaved runs with warmup, so machine load hits every config
equally:

| Change                       | p95         | vs base  | Relevance risk |
| ---------------------------- | ----------- | -------- | -------------- |
| baseline                     | 17.6 ms     | —        | —              |
| drop `includeMatches`        | 17.9 ms     | +0.3     | none           |
| threshold 0.32 → 0.25 / 0.20 | 18.4 / 17.3 | ±0.5     | yes            |
| clip `c` to 120 chars        | 17.2 ms     | −0.4     | yes            |
| **drop the `c` key**         | 12.3 ms     | **−31%** | yes            |
| **drop `c` and `a`**         | 10.5 ms     | **−40%** | yes            |

Only dropping search keys moves the number, and PRD §5.2.2 reserves that for a
150-query labelled suite: "These values are acceptance-test baselines, not
sacred defaults. A labeled relevance suite of at least 150 queries decides
changes."

**That suite cannot decide it.** `SEARCH-RECALL-TOP5` measures **98.2%** against
a 95% budget on the five available classes, and dropping `c` changes it by
**0.00 pp** — which is not evidence the change is safe. Every available class
(exact-id, title-prefix, acronym, misspelling, no-result) is id- or
title-driven and never exercises `c` or `a`. The suite is blind to this change
by construction, and the three missing classes — technology, cross-field, role —
are exactly the ones that would see it.

So the lever exists, and the evidence that would authorise pulling it does not.
It is not pulled.

## Consequences

Phase 3's budgets are measured rather than assumed, and the two paint budgets
pass now that they are measured correctly rather than a frame late.

`SEARCH-QUERY-1300` remains tracked. The harness annotates its measured value on
every push and, on runs where it passes, asks for its own exemption to be
removed — which is what stops a tracked violation becoming a forgotten one.

## Revisit trigger

Authoring enough real records to derive the technology, cross-field and role
relevance classes. That makes `SEARCH-RELEVANCE-QUERIES` measurable, which in
turn makes dropping a search key a decision with evidence behind it rather than
a guess. Failing that, PRD §7.4's edge service — which PRD §8 excludes from v1.
