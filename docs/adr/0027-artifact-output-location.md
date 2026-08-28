# ADR 0027 - Artifact output location and cache headers

- Status: accepted
- Date: 2026-08-28
- Phase: 2

## Context

PRD 5.1.5 defines eight generated artifacts with per-artifact compressed
budgets. PRD 7.3 requires content-hashed files served `immutable, max-age=
31536000`, an unhashed bootstrap manifest on a 5-minute TTL, and artifacts
published **before** the pointer that names them.

Static export (ADR 0021) cannot set response headers, which is the constraint
that shapes the answer.

## Decision

The compiler writes to `apps/web/public/catalog/`. Static export copies
`public/` verbatim into `out/`, so this is what makes the artifacts fetchable
without a server.

Hashed names carry a 16-hex-character content hash; `manifest.json` is unhashed
and written **last**. That ordering implements PRD 7.3's rule directly - a crash
midway leaves the previous pointer valid and the new artifacts merely
unreferenced, rather than a live pointer to a 404.

The catalog hash identifies the DATA, not the build: it is computed from the
ordered records alone, so it is stable across builds of identical content and
changes only when content does. The search worker refuses to serve results whose
catalogHash does not match (PRD 9.7), which only works if build metadata such as
the timestamp is excluded from it.

**Budget checking skips compression when a file cannot possibly exceed its
budget.** Brotli only exceeds its input for incompressible data, and then by a
few bytes of header, so a file whose raw size is already under budget is under
it compressed too. Quality-11 compression of 1,300 detail payloads sitting 75x
under budget cost 15 s of a 15.5 s build and would have broken the 30 s
incremental SLO. Anything near its budget is still measured exactly.

## Consequences

Easier: no server needed to serve artifacts; the site build and the catalog
build share one output tree.

Harder: `apps/web/public/catalog/` is generated and gitignored, so a fresh clone
must build the catalog before the site - which `apps/web`'s `prebuild` script
does automatically.

## Compressed cost

At 1,300 records: catalog-core 65.5 KB, search 93.1 KB, facet-bits 10 KB, facets
1.6 KB - each well inside its budget. At the 10,000-record soak, catalog-core
reaches 469 KB against a 500 KB budget, which is worth watching.

## Fallback

None needed; the files are static.

## Removal path

Point the compiler elsewhere and add a copy step.

## Revisit trigger

catalog-core at 94% of budget in the 10,000 soak. Before the catalog approaches
that size, the compact card will need fewer fields or a denser encoding.
