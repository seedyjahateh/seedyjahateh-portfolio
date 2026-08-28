# ADR 0023 - Phase 1 reads manifests directly

- Status: accepted
- Date: 2026-08-28
- Phase: 1

## Context

The static routes need project data. Phase 2 (ATLAS-001) owns catalog
compilation and will emit `catalog-core.{hash}.json`, facet dictionaries,
bitsets and detail payloads. Phase 1 must not build any of that, and PRD 12.2
forbids it from touching `packages/catalog/**`, which ATLAS-001 owns.

## Decision

`apps/web/lib/content.ts` reads `content/projects/*.json` at build time and
validates each record through the same `projectSchema` the pipeline will use.

It is a seam, not an architecture. When Phase 2 lands, this one file is replaced
by an artifact loader and the routes above it do not change. Reusing
`projectSchema`, `loadTaxonomy` and `trackByPrefix` rather than reimplementing
them means the data contract is already identical.

An invalid manifest fails the build rather than being skipped, and the message
carries file path, JSON pointer, rule id and repair per PRD 5.1.6.

**This also explains the webpack choice in `next.config.ts`.** `packages/*` use
`moduleResolution: "NodeNext"`, which requires explicit `.js` extensions on
relative imports of `.ts` files. Correct for tsc, tsx and vitest; but a bundler
must then map `./schema.js` onto `schema.ts`. webpack does that in one line with
`extensionAlias`; Turbopack has no equivalent today. The coupling disappears
when Phase 2 lands and `apps/web` reads JSON instead of importing TypeScript
source, at which point Turbopack becomes available again.

## Consequences

Easier: Phase 1 ships without waiting on Phase 2, and workstream boundaries stay
intact.

Harder: the web build depends on TypeScript source in sibling packages, which is
why it is pinned to webpack.

## Compressed cost

None. All of it runs at build time.

## Fallback

None needed.

## Removal path

Replace the module body with an artifact loader. The exported function
signatures are the contract, and they do not change.

## Revisit trigger

Phase 2 merge (ATLAS-001). At that point, move to the compiled artifacts and
re-evaluate Turbopack.
