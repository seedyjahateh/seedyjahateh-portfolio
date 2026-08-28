# ADR 0019 - Selection score as a publication gate

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

`portfolio-project-selection.md` defines a 100-point promotion score across six
dimensions and states: "A focused exhibit should score at least 70/100; a
keystone should score at least 85/100." That gate is real editorial policy, but
it is not in PRD 8.1''s record, so nothing would enforce it.

PRD 8.1 describes its record as "illustrative", which leaves room for the
extension.

## Decision

An optional `selection` block: the six dimension scores with their individual
caps (25/20/20/15/10/10), a declared total, and a scoring date.

Three rules enforce it. `SEL-SCORE-003` requires the declared total to equal the
sum of its parts - a score is a computation, not an assertion. `SEL-SCORE-001`
and `SEL-SCORE-002` require a public record to meet its tier''s threshold.

The block is optional because a planned project has not been scored, and
requiring a score would produce fabricated ones. It becomes mandatory only at
`visibility: "public"` - the exact moment the claim becomes public.

## Consequences

Easier: promoting a project is checkable rather than a judgement call, and the
catalog cannot fill with weak public cards. Harder: publishing anything requires
scoring it first.

## Compressed cost

Roughly 120 bytes per record, and only on records that carry a score. Not shipped
in `catalog-core`.

## Fallback

None. Absent the block, a public record simply fails the gate.

## Removal path

Delete the block and the three rules. The catalog loses its quality floor.

## Revisit trigger

If the thresholds reject work that is obviously strong, the dimensions are
mis-weighted - change them in the selection document first, here second.
