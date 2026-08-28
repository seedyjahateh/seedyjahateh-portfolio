# ADR 0021 - Static export rather than a Next.js server

- Status: accepted
- Date: 2026-08-28
- Phase: 1

## Context

PRD 0.1 makes the catalog static-first, PRD 8 states "No runtime database is
required for v1", and PRD 10.2 opens with "Static rendering is the default
attack-surface reduction." Next.js can satisfy those while still running a
server. The question was whether to keep one.

## Decision

`output: "export"`. The build emits plain HTML, CSS and JS; no Node process runs
in production.

This is the strongest available reading of PRD 10.2. With no server there is no
request-time code path to attack, no runtime secret to leak, and nothing to keep
patched. It also makes the PRD 7.3 caching model trivial: every file is static
and content-addressed, so a CDN needs no revalidation logic.

What it costs, deliberately: route handlers, middleware, ISR, and Next-native
redirects. PRD 8 says v1 needs none of them. Redirects move to a generated
`vercel.json`, which is what PRD 10.4 calls the "generated redirect map".

Two consequences worth writing down because they surprised us:

**Metadata routes need `export const dynamic = "force-static"`.** `sitemap.ts`
and `robots.ts` otherwise fail the export with an unhelpful message.

**`generateStaticParams()` may not return an empty array.** A dynamic route with
no params is a build error under export. That constraint is what drove the seed
catalog to `unlisted` rather than `private` - see ADR 0024.

## Consequences

Easier: no server to operate or secure; deployment is a file copy; the whole
site can be served from any static host.

Harder: no dynamic routes without at least one known param, and no server-side
personalization ever. Both are acceptable - PRD 13.1 lists visitor
personalization under "will not ship in v1".

## Compressed cost

None added. The measured floor is Next's client runtime at ~107 KB Brotli - see
ADR 0022's note, which is a framework property rather than a consequence of this
decision.

## Fallback

None needed; there is no runtime to fail.

## Removal path

Drop `output: "export"` and deploy as a Next server. Nothing else changes.

## Revisit trigger

A validated requirement for request-time rendering: authenticated editorial
workflows (PRD 0.8) or on-demand social-card generation.
