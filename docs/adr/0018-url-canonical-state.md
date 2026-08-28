# ADR 0018 - The URL is the canonical catalog state

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 0.3 makes dedicated project URLs mandatory. PRD 5.3.3 requires canonical
state in search parameters, stable share links, and back/forward restoring "the
exact query, filters, sort, view, and focused project". PRD 10.4 constrains which
of those URLs may be indexed.

## Decision

A closed parameter set - `q`, ten multi-value filter groups, `sort`, `view`, and
`focus` - with one serializer in `packages/contracts/src/url-state.ts`. No view
or component builds a query string itself.

Canonical form: defaults omitted, parameter names sorted, values sorted within a
parameter, `%20` never `+`. Sorting is what makes two users who clicked the same
filters in a different order produce the same link and the same CDN cache entry.

`focus` is in the URL because PRD 5.3.3 requires restoring the focused project,
but it never makes a URL indexable - a focused card is transient UI state, and
indexing it would hand search engines N near-duplicate copies of the archive.

`density` is deliberately NOT a URL parameter. PRD 5.3.3 confines it to local
storage and forbids stored state from overriding an explicit URL.

Parsing is total: unknown parameters and values are dropped and reported in
diagnostics, never thrown. A stale bookmark degrades to a working page.

Round-trip and idempotence are property-tested with fast-check.

## Consequences

Easier: shareable, restorable, cacheable state with one implementation to audit.
Harder: every new filter needs a grammar change and a contract bump.

## Compressed cost

Under 2 KB, on every route that filters.

## Fallback

None needed - it is pure string manipulation with no runtime dependency.

## Removal path

Move state into memory. Breaks PRD 0.3, 5.3.3 and 10.4 simultaneously.

## Revisit trigger

If a URL routinely exceeds ~2,000 characters, introduce a compact encoding for
long multi-select lists.
