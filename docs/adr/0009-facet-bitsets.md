# ADR 0009 - Facet bitsets: layout, endianness, and budget

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 5.3.2 specifies `Uint32Array(Math.ceil(projectCount / 32))` per facet value,
OR within a group and AND across groups, with a 100 KB budget for the packed
artifact and a 4 ms median / 8 ms p95 filter target at 1,300 projects.

## Decision

A single binary artifact, `facet-bits.{hash}.bin`, with a 24-byte header
(`ATLB`, version, projectCount, wordsPerSet, setCount, dictHash32) followed by
contiguous uint32 words. Ordinal `n` lives at word `n >>> 5`, bit `n & 31`.

Two details are frozen now because getting them wrong later is expensive:

**The header is 24 bytes - a multiple of 4** - so the payload can be exposed as a
zero-copy `Uint32Array` view over the same `ArrayBuffer`. An unaligned header
would force a copy of the whole artifact on load.

**The file is little-endian, explicitly.** A `Uint32Array` view reads in _host_
byte order. On a big-endian host a zero-copy view would return silently wrong
memberships rather than failing - the worst kind of bug. `facetBitsPayload`
therefore asserts host endianness and throws with an actionable message.

Verified against the PRD''s own arithmetic: 1,300 projects gives 41 words = 164
bytes per set, and 200 facet values gives 32,800 bytes against the 100 KB budget.

## Consequences

Easier: filtering is word-wise AND/OR over typed arrays with no allocation per
query; the artifact is a quarter of its budget. Harder: the format is binary, so
debugging needs a reader rather than a text editor.

## Compressed cost

~33 KB Brotli at 1,300 projects and 200 facet values. Budget: 100 KB.

## Fallback

A JSON array of id arrays. Larger, slower, and allocates per query.

## Removal path

Replace with `Set<number>` per facet. Simpler, and misses the p95 filter budget
at 10,000 records.

## Revisit trigger

If facet values exceed roughly 600, or the artifact passes 80 KB, move to roaring
bitmaps.
