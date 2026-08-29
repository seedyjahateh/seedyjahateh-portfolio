# ADR 0031 - Search worker lifecycle, preload, and fallback

- Status: accepted
- Date: 2026-08-29
- Phase: 3

## Context

PRD 5.2.1 gives the palette a 50 ms shell-open budget, asks for preloading on
"search-button hover, search-button focus, 2-second idle callback, or explicit
shortcut", and requires that "if JavaScript or the worker fails, submit the query
to `/projects?q=...`". PRD 7.4 budgets worker init at 250 ms p95 on reference
mobile hardware and treats exceeding it as a migration trigger.

The binding constraint was elsewhere. ADR 0028 measured home at 106.9 KB against
a 110 KB `JS-HOME` budget and warned that "Phase 3 has to fit a search worker
into 3 KB of remaining home budget". PRD 12.2 forbids raising the budget.

## Decision

**The visible affordance is HTML, not JavaScript.** The search box is a real
`<form method="get" action="/projects">` rendered on the server. With scripting
off it navigates to `/projects?q=…`, which is precisely the fallback PRD 5.2.1
specifies. The client half is a stub that attaches one `keydown` listener and
dynamic-imports the dialog; it renders `null`, because the UI already exists.

Measured: **0.6 KB**, taking `JS-HOME` to 107.6 of 110. Site-wide `Cmd/Ctrl+K`
is therefore affordable, with 2.4 KB still spare.

**Everything else is lazy.** Dialog, engine, Fuse and the worker are separate
chunks. Worker plus Fuse plus protocol measure 16.4 KB Brotli against
`JS-SEARCH-WORKER`'s 50 KB.

**The dialog is imperative DOM, not React.** Creating a root and reconciling on
every keystroke spends most of a 50 ms open budget and a 16 ms `SEARCH-PAINT`
budget. PRD 5.2.3 also requires highlighting to "render text nodes from range
boundaries" rather than injecting HTML, which direct node construction does
literally. The cost is that this file owns its own listener cleanup.

**The worker refuses rather than guesses.** The protocol version is checked
before message shape, per PRD 7.1, and an unknown version self-terminates. An
index whose `catalogHash` differs from the manifest's is rejected with
`CATALOG_MISMATCH` — mixed artifacts would join one build's results against
another build's ordinals and silently render the wrong projects (PRD 9.7).

**Fuse options travel with the index.** The search artifact carries the
`config/search.v1.json` block it was built from. A second copy compiled into the
worker could drift from the index it searches, and relevance tuning would then
require two edits to stay correct.

## Consequences

Easier: the no-JS path and the enhanced path are the same markup, so they cannot
diverge. A dead worker degrades to a working link rather than a broken palette.

Harder: palette options cannot be anchors. An `<a>` inside `role="option"` is
`nested-interactive`, which axe reports at serious impact against a zero budget,
so options are spans carrying their destination on a data attribute. Middle-click
and open-in-new-tab do not work inside the palette; the archive renders real
anchors and reaches every one of the same destinations.

## Compressed cost

0.6 KB on every route; 16.4 KB in the lazy worker chunk.

## Fallback

Already specified and implemented: `/projects?q=…`.

## Revisit trigger

`SEARCH-WORKER-INIT` exceeding 250 ms p95 on reference mobile hardware, which
PRD 7.4 makes a trigger to move search behind an edge service — behind the same
protocol, which is what ADR 0030's package boundary exists to allow.
