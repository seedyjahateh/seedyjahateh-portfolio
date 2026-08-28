# ADR 0002 - TypeScript strictness and compiler version

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 4 requires "TypeScript with `strict`, `noUncheckedIndexedAccess`, and exact
schema-derived types" to prevent catalog/data-contract drift. PRD 12.2 forbids
`any` and disabled lint rules without a reviewed exception.

## Decision

`strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
`noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules`,
and `erasableSyntaxOnly`.

Pinned to `typescript@5.9.3`, not the newly published `7.0.2`. TypeScript 7 is
the native compiler port; the ecosystem around ESLint and Vitest has not settled
on it, and Phase 0''s job is to freeze contracts, not to absorb toolchain risk.

`noUncheckedIndexedAccess` is the consequential one: it makes every array index
return `T | undefined`, which is exactly right for a codebase whose central data
structure is an ordinal-indexed catalog.

## Consequences

Easier: index-out-of-range and optional-field bugs surface at compile time.
Harder: array access needs explicit narrowing, which shows up throughout the
bitset and virtualization code.

## Compressed cost

None. Types are erased.

## Fallback

None needed; this is a compiler setting.

## Removal path

Relaxing any flag requires an ADR. PRD 12.2 forbids doing it to make a build pass.

## Revisit trigger

Upgrade to the TypeScript 7 line once ESLint and Vitest both support it in a
released version.