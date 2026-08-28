# ADR 0014 - No service worker in v1

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 7.3: "Service workers are excluded from v1. They add update and invalidation
failure modes without a validated offline requirement."

## Decision

No service worker. Caching is handled by immutable content-hashed assets with
`Cache-Control: public, max-age=31536000, immutable`, plus a short-TTL bootstrap
manifest at 5 minutes.

The failure mode being avoided is specific: a service worker that caches a stale
manifest can pin visitors to a dead deployment, and diagnosing it requires the
visitor''s cooperation. PRD 7.3''s ordering rule - artifacts published before HTML
and manifest pointers - already gives correct behaviour without one.

## Consequences

Easier: no cache-invalidation failure mode, no update dance, no debugging by
proxy. Harder: no offline support, and repeat visits rely on HTTP caching alone.

## Compressed cost

None. Nothing is shipped.

## Fallback

Not applicable.

## Removal path

Not applicable; this is a decision not to add.

## Revisit trigger

A validated offline requirement, which PRD 13.1 currently lists under "could
ship" rather than "must ship".