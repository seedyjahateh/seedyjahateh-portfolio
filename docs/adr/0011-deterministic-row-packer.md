# ADR 0011 - Deterministic row packer instead of masonry

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 14 rates "Bento design requires runtime height measurement" as medium
probability, high impact, detected by "ResizeObserver churn or forced layout".
PRD 5.4.1 requires deterministic card variants and forbids arbitrary
content-driven masonry. PRD 9.3 budgets zero forced synchronous layouts during
scroll.

## Decision

Three fixed variants - `standard`, `wide`, `feature` - with declared column
spans. Rows are packed during data preparation from spans and breakpoint rules,
so the virtualizer only ever sees rows of known height. `ResizeObserver` updates
container width and nothing else; geometry is computed from width and design
tokens.

The causal chain the PRD is guarding against: measuring unknown card heights
during scroll forces layout, which destabilises scroll anchoring, which
invalidates the virtualizer''s cache, which causes more measurement. Removing
measurement removes the loop, not just its symptoms.

## Consequences

Easier: row heights are known before render; scroll restoration is exact. Harder:
card content must fit its variant, so text needs bounded line clamps and expanded
content belongs on the detail route.

## Compressed cost

None beyond the packer itself, a few hundred bytes.

## Fallback

Single-column fixed rows at narrow widths.

## Removal path

Use the dense row view alone. PRD 13 already ships rows before the grid.

## Revisit trigger

If a design genuinely needs a fourth variant, add a span - never a measurement.
