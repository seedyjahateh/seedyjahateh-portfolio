# ADR 0015 - No runtime database or API in v1

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 0.8: "No runtime database is required for v1." PRD 15: "Do not build a
database or runtime API for static portfolio content." PRD 10.2 treats static
rendering as the default attack-surface reduction.

## Decision

No database, no runtime API, no public write endpoint. Content lives in reviewed
JSON manifests compiled at build time into immutable CDN artifacts.

This is a security decision as much as an architectural one: with no write path
there is no injection surface, no authentication to get wrong, and no data to
leak. PRD 10.2 names it first among mitigations.

## Consequences

Easier: no operational database, no runtime attack surface, trivially cacheable.
Harder: content changes require a deploy, and there is no authenticated editing.

## Compressed cost

None.

## Fallback

Not applicable.

## Removal path

Not applicable.

## Revisit trigger

PRD 0.8: authenticated editorial workflows, or measured client search limits per
PRD 7.4.