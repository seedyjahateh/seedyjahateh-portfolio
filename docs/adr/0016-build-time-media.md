# ADR 0016 - Build-time media pipeline

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 4 requires a "build-time image pipeline producing AVIF/WebP/JPEG fallbacks
and intrinsic dimensions" with "no layout shift and no origin-time transformation
dependency". PRD 9.6 budgets card images at 45 KB and heroes at 140 KB. PRD 1.1
computes that 1,300 thumbnails at 800x450 would need about 1.87 GB of decoded
pixel memory.

## Decision

All derivatives are produced at build time with `sharp`, emitting AVIF and WebP
plus one broadly compatible fallback, with responsive `srcset`/`sizes`. Intrinsic
width and height are mandatory in the schema (`MED-DIM-001`), not advisory.

Mandatory dimensions are what make CLS <= 0.05 achievable at all: geometry is
reserved before the image loads, so a slow or failed image shifts nothing. PRD
9.7 requires a failed image to preserve geometry and show alt text.

Decoded-memory pressure is handled by the virtualizer unmounting offscreen cards
rather than by caching decoded images, per PRD 9.5.

## Consequences

Easier: no origin-time transformation service; zero layout shift by construction;
predictable transfer sizes. Harder: adding media means a rebuild, and `sharp` is
a native dependency in CI.

## Compressed cost

Build-time only. Nothing ships to the browser.

## Fallback

Pre-generated derivatives committed to the repository.

## Removal path

Swap `sharp` for another encoder. The schema contract is unchanged.

## Revisit trigger

If build time for media exceeds the cold-build SLO of five minutes.
