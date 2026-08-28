# ADR 0006 - Next.js App Router, static-first rendering

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 4 selects the App Router for "static generation, server-rendered metadata,
route-level code splitting, canonical detail routes, React Server Components".
PRD 0.1 makes the catalog static-first and PRD 8 forbids a runtime database in v1.

## Decision

Next.js App Router, pinned exactly, with static generation as the default and
small client islands. Routes are those in PRD 6.1. Per PRD 15, the framework
"serves routing, static generation, metadata, and code splitting; it does not own
the data model" - which is why the catalog engine is framework-neutral and lives
outside `apps/web`.

Version 16.3.3 is current; the exact pin lands with the Phase 1 scaffold.

## Consequences

Easier: crawlable HTML, per-route budgets, metadata and sitemaps at build time.
Harder: the framework''s caching model is a real source of surprise and needs
per-route review.

## Compressed cost

Counted against JS-HOME (110 KB), JS-ROLE-DETAIL (125 KB) and JS-ARCHIVE (170 KB).

## Fallback

Any static site generator. The engine is framework-neutral precisely so this
stays possible.

## Removal path

Replace the renderer; keep `packages/contracts`, `catalog`, and `catalog-engine`.

## Revisit trigger

If initial JS on any route cannot be brought under budget with the framework''s
own splitting.