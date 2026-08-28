# ADR 0012 - Motion via LazyMotion, deferred to Phase 4

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 4: "CSS transitions first; Motion `LazyMotion` only for stateful sequences."
PRD 9.4 budgets the motion chunk at 8 KB incremental. PRD 10.1 and 9.7 make
reduced motion a functional requirement.

## Decision

CSS owns hover, focus, disclosure, sticky positioning and simple transitions.
Motion is loaded only through `LazyMotion` for genuinely stateful sequences, and
only from Phase 4. No Motion import appears on the home or role routes.

`prefers-reduced-motion: reduce` removes nonessential transform and layout motion
and all ambient motion **without reducing information** - a reduced-motion user
sees the same content, not less of it.

## Consequences

Easier: common interactions stay off the JS animation path; the home route stays
under 110 KB. Harder: complex sequences need a deliberate dynamic import.

## Compressed cost

8 KB incremental, only on routes that use it.

## Fallback

CSS transitions and `@keyframes`.

## Removal path

Delete the chunk; CSS transitions remain.

## Revisit trigger

If the motion chunk exceeds 8 KB, drop the sequence rather than the budget
(PRD 0.9).
