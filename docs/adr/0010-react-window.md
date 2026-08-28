# ADR 0010 - react-window for fixed rows and grids

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 4 selects "`react-window` for fixed row/grid primitives; custom deterministic
row packer for bento spans", because "fixed geometry avoids measurement thrash".
PRD 14 names variable-height masonry as a high-impact risk.

## Decision

`react-window` for the dense row view and fixed grids. The bento grid uses our
own deterministic row packer feeding fixed-height rows into the same virtualizer.

**Version note:** `react-window@2.x` replaced v1''s `FixedSizeList` and
`FixedSizeGrid` with a `List` plus `rowComponent` API. PRD 4 and 15 reference the
library generally and predate that change, so the API in the PRD''s mental model
is v1''s. This is an API difference, not a decision change - fixed geometry is
still the point. ATLAS-004 pins the exact version.

## Consequences

Easier: bounded mounted items, so DOM-ARCHIVE-STEADY and MOUNTED-CARDS-MAX are
achievable. Harder: every card variant needs a declared span, and PRD 5.4.1
forbids content-driven heights.

## Compressed cost

Roughly 6-8 KB Brotli, on `/projects` only.

## Fallback

A hand-written windowing loop over `transform: translateY`. More code, same model.

## Removal path

PRD 5.4.1 permits normal rendering when a filtered set holds 60 or fewer cards,
so small result sets already work without it.

## Revisit trigger

If the v2 API cannot preserve scroll and focus restoration across view switches.
