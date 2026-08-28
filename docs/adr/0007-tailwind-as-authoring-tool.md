# ADR 0007 - Tailwind as an authoring tool, tokens as the system

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 15: "Use Tailwind as an authoring tool, not a design system. Tokens and
component contracts define the visual system." PRD 4 wants constrained utilities
plus CSS custom-property tokens, with no runtime styling cost.

## Decision

CSS custom properties are the design system and are framework-independent.
Tailwind is a way of writing them down. Component contracts, not utility strings,
define the visual language.

PRD 10.1 requires contrast to be "tested in every theme", so tokens are the unit
of contrast testing - which only works if tokens, not ad-hoc utilities, carry the
colors.

## Consequences

Easier: no runtime style computation; tokens survive a framework change; contrast
is testable at the token level. Harder: discipline is needed to keep values in
tokens rather than inline utilities.

## Compressed cost

Within CSS-ROUTE (35 KB) after purging.

## Fallback

Plain CSS modules. The tokens are unaffected.

## Removal path

Remove Tailwind, keep the token layer. Utility classes would need rewriting.

## Revisit trigger

If route CSS approaches 35 KB after purge.
