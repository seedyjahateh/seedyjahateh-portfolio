# ADR 0005 - Taxonomy versioning, aliases, and deprecation

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 8.3 requires roles, languages, frameworks, capabilities, evidence types,
metric categories and accent tokens to come "from versioned vocabularies". PRD
5.1.3 rejects unknown facet values unless added "through a reviewed taxonomy
change". PRD 5.2.3 separately requires query normalization of "common technology
aliases".

## Decision

Versioned JSON under `content/taxonomy/`, loaded and validated by
`@atlas/taxonomy`. Closed enums (PRD 8.2) keep their members in TypeScript and
take only labels and ordering from the taxonomy, with exhaustiveness checked in
both directions - a missing label renders a raw identifier, an orphan label
offers a filter that can never match.

**Aliases have exactly one home.** The same `aliases` array feeds ingest
normalization and query alias expansion. Two copies would drift, producing a
search that finds things the filters cannot - which reads as a bug and is one.

Metric units carry a `dimension` and a `toBase` factor, and metric categories
declare which dimensions they accept, so PRD 5.3.1''s "numeric comparison requires
compatible units" is enforceable rather than advisory.

Deprecation carries `replacedBy`, making migration mechanical.

## Consequences

Easier: vocabulary changes are reviewable diffs; facet labels cannot silently
disappear. Harder: adding a technology is a taxonomy commit, not a manifest edit.

## Compressed cost

Facet dictionaries ship in `facets.{hash}.json`, budgeted at 80 KB.

## Fallback

Free-text tags. PRD 5.3.1 rules this out for metrics explicitly.

## Removal path

Inline the vocabularies. Loses the reviewed-change gate.

## Revisit trigger

If a vocabulary passes ~300 terms, split it and give each part its own facet group.