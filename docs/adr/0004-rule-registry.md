# ADR 0004 - Rule-ID registry and the ValidationIssue contract

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 5.1.6 requires an invalid record to produce "file path, JSON pointer, rule
ID, rejected value, and suggested repair". PRD 11.1 requires "valid/invalid
fixtures for every field, enum, cross-field rule". Neither is satisfiable unless
rule IDs are stable and enumerable.

## Decision

Every rejection in PRD 5.1.3 and 8.3, plus the promotion gates from the selection
catalog, is registered exactly once in
`packages/contracts/src/rules/registry.ts` with an id, layer, severity, PRD
citation, summary, and a repair distinct from the summary.

Four layers, chosen because they map onto *where enforcement is possible*:
`structural` (JSON Schema can express it), `cross-field` (one record, mostly
cannot), `corpus` (many records, never), `pipeline` (needs build I/O).

Two CI checks make the registry load-bearing: coverage asserts every rule has an
invalid fixture or a documented exemption, and the fixture test asserts each
fixture still trips the rule it claims. Without the second, a fixture that
drifted into passing would keep counting toward coverage while testing nothing.

## Consequences

Easier: error messages are consistent across compiler, CLI and audit report; a
reviewer can trace every rule to a PRD clause. Harder: adding a rule means adding
a fixture, by construction.

## Compressed cost

None. Build-time only.

## Fallback

Ad-hoc error strings. Loses traceability and the coverage gate.

## Removal path

Inline the messages. PRD 5.1.6 would no longer be satisfied.

## Revisit trigger

If the exemption list grows past roughly a third of the registry, the layering is
wrong and needs rework.