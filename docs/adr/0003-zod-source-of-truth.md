# ADR 0003 - Zod as schema source of truth; JSON Schema generated

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 4 requires both "JSON Schema 2020-12 plus Zod runtime/build validation".
Maintaining two hand-written encodings of one schema guarantees they drift, and
a drifted schema is worse than one schema: the pipeline accepts records an
external validator rejects.

## Decision

Zod is authored by hand. `content/schema/*.json` is GENERATED from it via
`z.toJSONSchema(..., { target: "draft-2020-12", io: "input" })`, committed, and
CI verifies a clean regeneration diff. Ajv2020 validates against the generated
artifact in the conformance suite.

`io: "input"` is deliberate: manifests are authored documents validated before
Zod applies defaults, so the schema must describe the input shape.

The important finding, verified against `zod@4.4.3`: **a `superRefine`d schema
still emits, with the refinement silently dropped.** JSON Schema therefore cannot
express cross-field rules, calendar-date validity, or corpus rules. Rather than
pretend otherwise, every such rule is flagged `zodOnly` in the registry, the
emitted schema advertises them under `x-zodOnlyRules`, and the conformance test
asserts that Ajv *does not* catch them. That last assertion is what keeps the
classification honest - if JSON Schema ever gains the ability to express one, the
test fails and the flag comes off.

19 of 53 rules are currently zod-only.

## Consequences

Easier: one source, TypeScript types for free, a machine-readable contract that
states its own limits. Harder: consumers validating with Ajv alone get strictly
less checking, and must read `x-zodOnlyRules` to know how much less.

## Compressed cost

Zod is build-time only here. It is not shipped to the browser by any Phase 0 code.

## Fallback

Hand-author JSON Schema and generate Zod. Strictly worse: Zod is the more
expressive of the two.

## Removal path

Freeze the generated JSON Schema and delete the emitter. Loses drift protection.

## Revisit trigger

If Zod ever emits `if`/`then` for refinements, re-evaluate the zod-only list.