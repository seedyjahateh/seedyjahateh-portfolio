# ADR 0028 - The site consumes artifacts; webpack stays, for a new reason

- Status: accepted
- Date: 2026-08-28
- Phase: 2
- Amends: ADR 0023

## Context

ADR 0023 said `apps/web/lib/content.ts` read manifests directly only until
Phase 2 emitted artifacts, and named a specific consequence: the `--webpack`
pin existed because the site imported TypeScript source from sibling packages
using NodeNext `.js` specifiers, which Turbopack cannot alias onto `.ts`. Remove
the import, and Turbopack becomes available again.

## Decision

The site now reads compiled artifacts. `content.ts` keeps every exported
signature - that was ADR 0023's promise - and the Phase 1 export and end-to-end
suites pass **unchanged**, which is the evidence the migration preserved
behaviour rather than the claim that it did.

Two things worth stating:

**It reads detail payloads, not catalog-core.** `catalog-core` exists for the
client: PRD 0.7 gives the initial route a compact card catalog and PRD 9.5 has it
store dictionary ids rather than repeated strings. Neither helps static
generation, which runs on a build machine with no transfer budget and needs the
full record to render a page. catalog-core is left for the Phase 3 engine that
actually ships to a browser.

**It does not re-validate.** The compiler already validated every record and
refused to publish on any error. Re-validating would duplicate the definition of
validity and - the point that matters - would keep a runtime import of
TypeScript source, which is what forced the webpack pin. The site now takes only
`import type`, and types are erased.

**Turbopack was then measured and rejected on budget.** With the resolution
constraint gone, Turbopack built successfully - and emitted **111.1 KB** Brotli
for the home route against webpack's **106.9 KB**, where `JS-HOME` is 110 KB.
Reproducible across repeated builds. PRD 12.2 forbids raising a budget to
accommodate a tool, so the build stays on webpack.

The reason for the pin has therefore changed from mechanical to measured, which
is a better reason: it is now backed by a number that CI checks on every push.

## Consequences

Easier: one definition of validity, enforced once, at compile time. The site
cannot render a private record because the compiler never emits one.

Harder: the site cannot build without a catalog, handled by a `prebuild` script.
And Turbopack remains unavailable, now for a budget reason rather than a
resolution one.

## Compressed cost

Unchanged: 106.9 KB on home, 97% of `JS-HOME`. The migration neither helped nor
hurt, because the JS is Next's baseline runtime rather than anything the site
wrote.

## Fallback

`pnpm catalog:build` must run first; the site fails with an explicit message
naming the command rather than a missing-file stack trace.

## Removal path

Point `content.ts` back at `content/projects`. The webpack pin would then be
required for both reasons again.

## Revisit trigger

Turbopack closing the 4 KB gap, or the Next baseline runtime shrinking enough
that home has real headroom. Phase 3 has to fit a search worker into 3 KB of
remaining home budget, so this number matters more than it looks.
