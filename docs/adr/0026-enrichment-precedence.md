# ADR 0026 - GitHub cache format and enrichment precedence

- Status: accepted
- Date: 2026-08-28
- Phase: 2

## Context

PRD 0.2 is the governing sentence: "GitHub enriches the catalog; it is not the
source of truth." PRD 5.1.1 lists the fields it may never overwrite - title,
summary, role, proof level, metric, display order, visibility - and PRD 5.1.4
specifies conditional requests, queueing, and rate-limit behaviour.

No manifest currently declares a repository, so this has zero live input. It was
still built now because the cache format and the precedence rules are
contract-level: getting them wrong later means rewriting cached data and
re-auditing what GitHub was allowed to touch.

## Decision

`mergeEnrichment` returns a record whose only modified field is
`repository.enrichment`. Curated fields are safe **by construction rather than
by check**: the returned object literal never names one, so there is no code
path that could write a title even if a future contributor wanted one.

A factual disagreement - GitHub reporting a different licence or default branch
than the manifest states - is `GHE-CONFLICT-001`, severity **warning**, and the
manifest value is preserved. PRD 5.1.1 requires exactly this. Failing the build
instead would let a stale GitHub field block a deploy, which inverts the
ownership the PRD establishes.

The client uses ETag conditional requests (a 304 reuses the cached normalized
response), concurrency 2, a 10-second timeout, at most two retries, exponential
backoff with **full** jitter, and `Retry-After` always winning. Full jitter
rather than a fixed multiplier because several repositories failing together
would otherwise retry in lockstep and rebuild the burst that caused the failure.

Enrichment aborts below 10% remaining rate limit, and a cache older than 7 days
with an exhausted budget fails the production build rather than publishing stale
repository facts.

The fetcher is injected, so tests drive recorded responses and CI never reaches
the network. The token is read from the environment only inside an explicit
maintainer command.

## Consequences

Easier: enrichment works the day a manifest names a repo, with no format
migration. The precedence rule is unbreakable rather than merely documented.

Harder: the code is written against an interface nothing exercises live yet.

## Compressed cost

None. Build-time only, and no token or response reaches the client.

## Fallback

Publish from the last valid cache when it is younger than 7 days; otherwise fail.

## Removal path

Delete the `github/` directory. Records keep whatever `repository.enrichment`
they were last given.

## Revisit trigger

The first manifest that declares a repository - at which point the recorded
fixtures should be refreshed against a real response.
