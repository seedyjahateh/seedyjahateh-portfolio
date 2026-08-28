# ADR 0008 - Fuse.js prebuilt index in a dedicated worker

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 0.6: "Search and filtering never block the main thread." PRD 4: at 1,300
entries "a hosted search system" does not earn its complexity. PRD 7.4 defines
the measured conditions under which that stops being true.

## Decision

Fuse.js, index built in CI and serialized to `search.{hash}.json`, hydrated
inside a dedicated Web Worker. The main thread never constructs the index and
never imports Fuse - an acceptance criterion on ATLAS-002, not a guideline.

The worker sits behind the versioned `SearchRequest`/`SearchResponse` contract in
`packages/contracts/src/search-protocol.ts`, which mentions neither Fuse nor the
DOM. PRD 7.4 requires a future hosted service to slot in behind the identical
contract without rewriting view or filter components, and that is only true if
nothing Fuse-shaped leaks into it.

Results cross the boundary as a transferable `Uint32Array` of ordinals, per PRD
9.5''s requirement that result arrays store ordinals rather than copied objects.

Tuning lives in `config/search.v1.json` so a relevance change is a reviewable diff
measured against the labelled suite, per PRD 5.2.2.

## Consequences

Easier: no query blocks input; no search infrastructure to operate; migration is
a swap behind one interface. Harder: the index is a build artifact, so stale
content needs a rebuild.

## Compressed cost

50 KB incremental for worker plus Fuse plus protocol, loaded on intent, never on
first paint. The index itself is budgeted at 900 KB and is not fetched until
search is activated.

## Fallback

PRD 5.2.1: on worker failure, submit to `/projects?q=...` and run a bounded
main-thread search after navigation.

## Removal path

Replace the worker with an edge search service behind the same contract.

## Revisit trigger

PRD 7.4, when any two persist for three releases: index over 2 MB Brotli, init
over 250 ms p95 on reference mobile, query over 50 ms p95, catalog over 10,000
records, or a requirement for stemming, typo analytics, or access-controlled
results.
