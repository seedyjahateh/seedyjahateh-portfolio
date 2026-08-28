# ADR 0022 - Plain CSS with custom properties in Phase 1

- Status: accepted
- Date: 2026-08-28
- Phase: 1

## Context

PRD 12.6 sequences the work: step 4 merges "static routes, project detail
template, sitemaps, and no-JS index", and step 5 merges "design tokens,
primitives, and Storybook states". PRD 12.1 gives the UI system to its own
workstream (ATLAS-003) in Phase 4. ADR 0007 already decided the eventual answer:
tokens are the design system, Tailwind is only an authoring tool.

The question for Phase 1 was whether to pull any of that forward.

## Decision

One `globals.css` using CSS custom properties. No Tailwind, no component
library, no token package.

Phase 1's exit gate is "crawlable and keyboard-usable without client catalog
code". None of that is helped by a styling framework, and adding one now would
commit the UI workstream to decisions it has not made yet. What Phase 1 does owe
is accessible defaults, and those are tokens: every colour is a custom property
so contrast can be verified per token in both themes, which is what PRD 10.1
means by "Tokens are tested in every theme".

Measured result: 1.6 KB Brotli against a 35 KB `CSS-ROUTE` budget, with axe
reporting zero serious or critical violations in light and dark.

## Consequences

Easier: nothing to undo in Phase 4; the stylesheet is small enough to read in
one sitting; no build-time CSS pipeline to configure.

Harder: no utility classes, so Phase 1 markup carries semantic class names that
the design system will likely rename.

## Compressed cost

1.6 KB Brotli per route.

## Fallback

None needed - it is a stylesheet.

## Removal path

Phase 4 replaces it wholesale. Nothing depends on its class names except Phase 1
templates and their tests.

## Revisit trigger

Phase 4 (ATLAS-003), which owns the design system and may adopt Tailwind per
ADR 0007.
