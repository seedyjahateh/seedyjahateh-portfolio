# ADR 0034 - Grid geometry, card media, and visual baselines

- Status: accepted
- Date: 2026-08-30
- Phase: 4

## Context

Phase 4 builds the evidence grid PRD 5.4.1 makes the default archive view.
Three decisions had to be made before any of it could be written, and one of
them closed a gap in a frozen contract.

## Decision 1 — rows are uniform height; variants differ by span alone

`CARD_VARIANT_SPAN` already gives `wide` and `feature` the same span of 2, so a
variant is a width. A card spanning two ROWS was considered and rejected: it
would make each row's geometry depend on the rows above it, which is masonry
under another name and is the loop ADR 0011 exists to break — measuring unknown
heights during scroll forces layout, which destabilises scroll anchoring, which
invalidates the virtualizer's cache, which causes more measurement.

A `feature` therefore differs in treatment rather than geometry: the same box,
more of it given to media and accent.

Row height comes from `gridMetrics(containerWidth)` — a pure function of width
and tokens, per PRD 5.4.1's "row geometry is computed from width and design
tokens". The single `ResizeObserver` reports width and nothing else, and the
grid tests assert that by **counting observer constructions**, not by reading
the source.

## Decision 2 — images carry their derivative widths

`imageSchema` had `src`, `fallbackSrc`, `width`, `height`, `alt` and no way to
express the other derivatives the media pipeline had already produced. Every
card would have received one fixed width whatever size it rendered at: FS-01's
card image is 736 px wide and a grid slot is nearer 300. That is the waste
PRD 1.1 quantifies at 1.87 GB for a naive 1,300-card grid, and the reason
`MEM-DECODED-IMAGES` budgets 64 MB.

**Widths, not assembled srcset strings.** `catalog-core` measures 469 KB Brotli
against a 500 KB budget at 10,000 records; repeating a ~40-character URL prefix
per entry per card would spend that headroom on redundancy. The field is
optional and defaulted, so records authored before it stay valid and the schema
version does not move.

`packages/contracts/src/media.ts` is the **only** module that knows the
`${hash}-${width}.${ext}` filename shape. A renderer reconstructing URLs itself
would be a second owner of that convention, free to drift. `buildSrcSet`
returns null rather than a URL unchanged when the pattern does not match: an
unchanged URL in a srcset advertises one image at several widths and the browser
trusts it. Failing to build a srcset is recoverable; a lying one is not.

The widths are **printed by `media:build`** for pasting, not derived by the
compiler. That command is the only thing that knows which derivatives it
actually emitted, and a srcset naming a file that was never written is worse
than no srcset.

### The bug this caught

`sizes` first claimed `100vw` at one column and `33vw` at three, ignoring the
page gutter, the container max-width and the gaps between columns. Every clause
overstated the slot, so the browser fetched a **larger** derivative than the
card could use — at a 420 px viewport it chose the 736 px image for a 388 px
slot, which is precisely the waste the budget exists to catch. Overstating is
the dangerous direction: understating costs sharpness, overstating spends
decoded memory on pixels nobody sees.

`grid.spec.ts` now asserts `currentSrc` resolves to the 400 px derivative at a
narrow viewport, so the memory argument rests on what the browser actually chose
rather than on the markup looking correct.

## Decision 3 — visual baselines are Linux, generated on CI

PRD 11.2 requires "deterministic screenshots for themes, view modes,
breakpoints, long text, missing media, and filtered empty states". Playwright
renders differently on Windows and Linux; font rasterisation alone guarantees
it, and this workstation has neither Docker nor WSL to produce Linux images
locally.

One authoritative set is kept, generated on the runner that enforces the gate.
Two sets would mean every card change regenerates both, or one goes stale and
starts lying. `*-win32.png` is gitignored so a local run cannot accidentally
commit a second set.

Regeneration is a manual `workflow_dispatch` run that uploads the new images as
an artifact to download and commit. Nothing writes to the repository from CI.

## Consequences

Easier: row heights are known before render, so scroll restoration is exact and
`FORCED-LAYOUTS-SCROLL` has no layout to force. Card size cannot depend on image
load, which PRD 9.3 requires.

Harder: card content must fit its variant, so text is line-clamped and expanded
content belongs on the detail route. And a deliberate visual change costs a CI
round trip rather than a local update.

**The archive looks sparse, and that is content rather than a defect.** 239 of
240 records have no card image, so the branded neutral placeholder is the
ordinary case. It renders from the card's accent token so an imageless grid
reads as designed.

## What is not measured

`MEM-DECODED-IMAGES` is reported **NOT MEASURED**, and not for want of tooling.
The real catalog has one card image; the 1,300 fixture corpus references 1,194
files that do not exist. Nothing decodes at scale, so any number read would be
near zero and would pass a 64 MB budget while proving nothing. The `currentSrc`
assertion above is what actually protects it.

`FORCED-LAYOUTS-SCROLL` remains not measured, unchanged from ADR 0033.

## Revisit trigger

Real card media for a meaningful share of the catalog. That makes
`MEM-DECODED-IMAGES` measurable for the first time, and it is the point at which
the srcset work stops being precautionary and starts being load-bearing.
