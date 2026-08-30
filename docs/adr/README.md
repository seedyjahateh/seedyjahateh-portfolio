# Architecture decision records

Every ADR follows the same template, because PRD 4.1 requires more than a
decision: each client dependency needs "an ADR stating capability, compressed
cost, fallback, and removal path."

```
# ADR NNNN - Title

- Status: proposed | accepted | superseded by ADR-NNNN
- Date: YYYY-MM-DD
- Phase: 0-6

## Context
What forced the decision. Cite the PRD section.

## Decision
What we are doing, stated so a reader can disagree with it.

## Consequences
What becomes easier, and what becomes harder.

## Compressed cost
Brotli KB added to which route, or "none - build-time only".

## Fallback
What happens when this fails at runtime.

## Removal path
How to take it out, and what breaks.

## Revisit trigger
The measurable condition that reopens this decision.
```

An ADR is not a formality. PRD 12.2 forbids workstreams from installing a dependency
before its ADR exists, and `scripts/verify-budgets.ts` requires an ADR reference
in the commit range before any value in `config/` may change.

| ADR  | Title                                                 | Status   |
| ---- | ----------------------------------------------------- | -------- |
| 0001 | Monorepo layout and pnpm workspaces                   | accepted |
| 0002 | TypeScript strictness and compiler version            | accepted |
| 0003 | Zod as schema source of truth; JSON Schema generated  | accepted |
| 0004 | Rule-ID registry and the ValidationIssue contract     | accepted |
| 0005 | Taxonomy versioning, aliases, and deprecation         | accepted |
| 0006 | Next.js App Router, static-first rendering            | accepted |
| 0007 | Tailwind as an authoring tool, tokens as the system   | accepted |
| 0008 | Fuse.js prebuilt index in a dedicated worker          | accepted |
| 0009 | Facet bitsets: layout, endianness, and budget         | accepted |
| 0010 | react-window for fixed rows and grids                 | accepted |
| 0011 | Deterministic row packer instead of masonry           | accepted |
| 0012 | Motion via LazyMotion, deferred to Phase 4            | accepted |
| 0013 | Three.js deferred to Phase 6 with a deletion path     | accepted |
| 0014 | No service worker in v1                               | accepted |
| 0015 | No runtime database or API in v1                      | accepted |
| 0016 | Build-time media pipeline                             | accepted |
| 0017 | Budgets as reviewed configuration                     | accepted |
| 0018 | The URL is the canonical catalog state                | accepted |
| 0019 | Selection score as a publication gate                 | accepted |
| 0020 | Seed catalog imports as planned and private           | accepted |
| 0021 | Static export rather than a Next.js server            | accepted |
| 0022 | Plain CSS with custom properties in Phase 1           | accepted |
| 0023 | Phase 1 reads manifests directly                      | accepted |
| 0024 | `unlisted` means unlisted from external indexes       | accepted |
| 0025 | Pipeline stage contract and deterministic build clock | accepted |
| 0026 | GitHub cache format and enrichment precedence         | accepted |
| 0027 | Artifact output location and cache headers            | accepted |
| 0028 | The site consumes artifacts; webpack stays            | accepted |
| 0029 | The audit baseline is committed to the repository     | accepted |
| 0030 | Retrieval engine package; webpack resolution returns  | accepted |
| 0031 | Search worker lifecycle, preload, and fallback        | accepted |
| 0032 | Runtime budget harness and scale-corpus builds        | accepted |
| 0033 | What the search budget was actually measuring         | accepted |
| 0034 | Grid geometry, card media, and visual baselines       | accepted |
