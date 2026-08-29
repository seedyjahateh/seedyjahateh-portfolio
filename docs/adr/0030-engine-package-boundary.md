# ADR 0030 - The retrieval engine is a package; webpack resolution returns

- Status: accepted
- Date: 2026-08-29
- Phase: 3
- Amends: ADR 0028

## Context

Phase 3 needs filtering, sorting and result ordering to run in a browser. PRD
4.1 requires catalog logic "behind framework-neutral TypeScript interfaces", and
PRD 7.4 requires that when client search is outgrown, an edge service goes
"behind the same SearchRequest/SearchResponse contract. Do not rewrite view or
filter components."

That code is client code wherever it lives. The only question was which
directory, and the answer was not free: ADR 0028 had just removed
`transpilePackages` and the webpack `extensionAlias` when Phase 2 stopped
importing TypeScript source from sibling packages, and noted that the site now
took only `import type`.

Two options.

**`apps/web/lib/engine/`.** No config change at all. But the boundary is
convention only, and PRD 7.4's migration becomes "find every import and hope".

**`packages/engine`.** A real boundary, testable in vitest with no DOM — which
is what lets the 10,000-case property tests run at all — at the cost of bringing
both webpack settings back.

## Decision

`packages/engine`, and `transpilePackages: ["@atlas/engine"]` plus the
`extensionAlias` return to `next.config.ts`.

The package imports nothing from React, Next or the DOM. It takes already-loaded
artifacts rather than fetching them, because fetching is the part that differs
between a browser, vitest and the property-test harness — and filtering is not.

**This does not weaken the webpack pin.** ADR 0028 re-justified that pin on a
measured budget, not on module resolution: Turbopack emits 111.1 KB Brotli for
home against webpack's 106.9 KB, and `JS-HOME` is 110 KB. PRD 12.2 forbids
raising a budget to accommodate a tool. Restoring the resolution settings
changes nothing about that number; it means the pin now has two reasons again
instead of one.

## Consequences

Easier: the property tests run in node, so `FILTER-PROPERTY-CASES` (10,000
randomized selections against a reference filter) costs under a second rather
than needing a browser. The views cannot filter, because the only thing they
receive is an ordered `Uint32Array`.

Harder: `apps/web` again compiles TypeScript from a sibling package, so a syntax
error in the engine surfaces as a Next build failure rather than a package one.

## Compressed cost

`JS-ARCHIVE` went 107.6 -> 135.2 KB of 170. That figure covers the engine,
react-window and the archive island together; the engine alone is a few KB of
it. `JS-HOME` is unchanged at 107.6, because none of this is on home.

## Fallback

Move the four source files into `apps/web/lib/engine/` and drop both config
settings. The tests would need a different import path and the boundary would
become convention.

## Removal path

If PRD 7.4's migration ever happens, the package is replaced by a client for the
edge service behind the same types. That is the case this layout exists for.

## Revisit trigger

Turbopack closing the 4 KB gap on home would remove the budget reason for the
webpack pin, but not this one — the resolution requirement stands on its own
while the engine is a package of TypeScript source.
