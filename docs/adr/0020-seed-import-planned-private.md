# ADR 0020 - Seed catalog imports as planned, not public

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 11.3 requires the 240-project seed catalog to import "through the production
schema without manual runtime transformation". But none of the 240 projects has
been built. PRD 0.10 forbids fabricated claims, PRD 5.1.1 ends its source
precedence with "Never: unreviewed generative inference", and PRD 12.2 forbids
inventing metrics or outcomes.

The tension is only apparent. The schema does not require a project to be
finished - it requires a project to be honest about not being finished.

## Decision

Every seed record imports as `status: "planned"`, `visibility: "unlisted"`,
`proofLevel: "code"`, with empty evidence, metrics, dates, and stack, and no
tagline.

Consequences that follow from the rules rather than from preference:

- **No record is `featured.global`.** `XFD-FEAT-001` requires tier `flagship`,
  proof `measured` or better, and non-placeholder media. Flagship _intent_ lives
  in `content/editorial/flagship-rotation.v1.json`.
- **No stack is extracted from prose.** The selection document names
  technologies in sentences ("Implement HTTP/1.1 parsing ... in Go"), and reading
  them out is inference. Left empty for an author.
- **No taglines.** A tagline is a claim.
- **`tagline` is schema-optional**, required only for public records via
  `XFD-PUB-TAGLINE-001`, precisely so it is never invented to satisfy a validator.

What IS copied is what the document states: id, title, description, keystone
marking, and the roles from each track''s own "Primary roles" header.

Track-level editorial defaults - complexity, accent, spatial group, capabilities,
domains - live in `content/taxonomy/track-defaults.v1.json`, deliberately
separate from `tracks.v1.json`, which holds only facts from the document. A
default declared once at track level in a reviewed file is an editorial choice; a
value guessed per project is inference.

One judgement call is recorded rather than hidden: the tracks whose header reads
"AI infrastructure" map to `ai-engineer`, since PRD 8.2 defines exactly three
roles. Documented in `docs/contracts/import-mapping-v1.md`.

## Consequences

Easier: 240 records exist, are searchable in development, and carry zero claims.
Promotion to public stays a deliberate human act. Harder: the catalog is not
publicly useful until records are authored - which is the honest state.

## Compressed cost

None. Private records are excluded from published artifacts.

## Fallback

None needed.

## Removal path

Delete `content/projects/` and re-run `pnpm seed:import`.

## Amendment (Phase 1, 2026-08-28)

The visibility default changed from `private` to `unlisted`. The truth
constraint is unchanged - what matters is that nothing is `public`, because
`public` is the state PRD 8.3''s publication gates guard.

`private` generates no page at all, which left the roadmap unreachable, the
detail template untested, and the static export unable to build (ADR 0021:
`generateStaticParams()` may not return an empty array). `unlisted` gives each
record a `noindex` page that is absent from the sitemap and carries a "planned"
banner. See ADR 0024.

## Revisit trigger

None. This is a truth constraint, not a tuning parameter.
