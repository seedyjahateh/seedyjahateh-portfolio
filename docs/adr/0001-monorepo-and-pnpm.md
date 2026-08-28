# ADR 0001 - Monorepo layout and pnpm workspaces

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 12.1 assigns six workstreams bounded, non-overlapping path ownership, and PRD
12.2 forbids a workstream from editing another workstream''s paths. That governance
only works if the paths are real package boundaries rather than folder
conventions. PRD 4.1 additionally requires the catalog logic to sit "behind
framework-neutral TypeScript interfaces so a future renderer can replace React
without replacing the data engine."

## Decision

One repository, pnpm workspaces, with packages mapped 1:1 onto the PRD 12.1
ownership table: `contracts`, `taxonomy`, `fixtures` (architect-owned, Phase 0),
then `catalog`, `catalog-engine`, `ui`, and `apps/web` (workstream-owned).

pnpm specifically, for two reasons. Its strict `node_modules` layout makes an
undeclared cross-package import fail at install rather than working by accident
through hoisting - which is the mechanism that would silently erode the
boundaries PRD 12.2 depends on. And the PRD''s own task packets already write
their evidence commands as `pnpm test:search`, `pnpm bench:search`.

## Consequences

Easier: ownership is enforceable by tooling; `pnpm --filter` runs one
workstream''s suite. Harder: contributors need corepack; a dependency used by two
packages must be declared twice.

## Compressed cost

None. Build-time only.

## Fallback

npm workspaces would work, at the cost of flat `node_modules` and rewritten
evidence commands.

## Removal path

Collapse to a single package. Loses enforceable ownership boundaries.

## Revisit trigger

If any package is never consumed by two others, it should be merged rather than
maintained as a boundary.
