# Import mapping v1 — selection catalog → Project schema v3

**Status:** approved · **Phase:** 0 · **Implements:** PRD 11.3, PRD 13 Phase 0 exit gate
**Source:** `docs/prd/portfolio-project-selection.md`
**Implementation:** `scripts/import-selection.ts` · **Tests:** `tests/contracts/seed-catalog.test.ts`

## What this closes

PRD §13's Phase 0 exit gate reads *"all contracts reviewed; 240-project import mapping approved."* This document is the mapping. It is executable — `pnpm seed:import` produces the 240 manifests in `content/projects/`, and `pnpm seed:verify` re-derives them without writing.

## Parsing

The selection document is structured enough to parse rather than transcribe.

| Element | Pattern |
|---|---|
| Track heading | `## Track {n} — {name}` |
| Repository | `**Repository:** \`{repo}\`` |
| Primary roles | `**Primary roles:** {role} · {role}` |
| Project line | `{n}. **{ID} ★? {Title}** — {Description}` |

The parser stops collecting at `## Build order`, because later sections reuse bold text and em dashes without describing projects.

Result: **240 projects, 16 tracks, 15 each, 16 keystones.** The importer asserts all four numbers and fails rather than proceeding on a partial parse.

## Field mapping

| Target | Source | Notes |
|---|---|---|
| `id` | project line | Already satisfies `^[A-Z]{2,4}-[0-9]{2,4}$`. No renumbering. |
| `title` | project line | Markdown stripped, NFC-normalized. Observed range 17–45 chars against a bound of 8–90. |
| `summary` | description | Backticks and bold removed. Observed range 93–164 against a bound of 80–320. |
| `slug` | derived from title | Lowercase, non-alphanumeric → hyphen, `++` → `-plus-plus`. Collisions are a hard failure. |
| `track` | track heading | Via `content/taxonomy/tracks.v1.json`. |
| `tier` | ★ marker | ★ → `keystone`, otherwise `focused-exhibit`. |
| `roles` | track header line | Stated per track, not per project. |
| `links.canonical` | derived | `/projects/{slug}`. |
| `complexity`, `layout.*`, `capabilities`, `domains` | `track-defaults.v1.json` | Track-level editorial defaults — see below. |

### Independent confirmation

`RAG-01` derives the slug `atlasops-governed-knowledge-platform`, byte-identical to the slug in PRD §8.1's illustrative record. The derivation matches the PRD author's own intent without being told to.

## What is deliberately not mapped

PRD §5.1.1 fixes source precedence and ends with *"Never: unreviewed generative inference."* The importer copies what the document states and leaves the rest empty.

| Field | Why empty |
|---|---|
| `stack.*` | The document names technologies in prose — *"Implement HTTP/1.1 parsing … in Go"*. Extracting them is inference. Author-supplied. |
| `tagline` | A tagline is a claim. Nothing is built. Schema-optional; required only for public records via `XFD-PUB-TAGLINE-001`. |
| `metrics`, `evidence`, `dates` | Nothing has been measured, evidenced, or started. |
| `featured` | `XFD-FEAT-001` requires flagship tier, measured proof, and real media. No seed record can qualify. |
| `content.problem` | Requires 40+ characters of authored problem framing. |

## Status and visibility

Every record imports as **`status: "planned"`, `visibility: "private"`, `proofLevel: "code"`.**

This is what lets a 240-entry catalog exist without making 240 claims. Promotion to `public` is a human editorial act gated by `XFD-PUB-001`, `XFD-PUB-002`, and the selection document's own scoring thresholds (`SEL-SCORE-001` ≥ 85 for keystones, `SEL-SCORE-002` ≥ 70 for exhibits).

## Track-level editorial defaults

`complexity`, `accentToken`, `spatialGroup`, `capabilities`, and `domains` come from `content/taxonomy/track-defaults.v1.json`, kept deliberately separate from `tracks.v1.json`.

The distinction matters: `tracks.v1.json` holds only facts stated in the selection document. `track-defaults.v1.json` holds editorial choices, declared **once at track level in a reviewed file**. A default applied uniformly to a track is a decision someone can review and disagree with; a value guessed per project from its description is inference.

## Judgement calls, recorded

**1. "AI infrastructure" → `ai-engineer`.** Tracks 1, 5, and 8 head with *"Backend Engineer · AI infrastructure"*. PRD §8.2 defines exactly three roles and AI infrastructure is not one. Mapped to `ai-engineer` as the nearest lens. Reversible: edit `roles` in `tracks.v1.json` and re-import.

**2. The CommerceFlow flagship is unresolved.** The pin table lists *"CommerceFlow — Event-Driven Marketplace"* with a backend hiring signal, matching `DST-01` (repository `commerceflow`). But `FS-15` is titled *"CommerceFlow Marketplace"* and is the full product surface. These are two records for one product.

Recorded in `content/editorial/flagship-rotation.v1.json` as `"resolved": false` with both candidates and the open question. **Not guessed** — picking one would fabricate an editorial decision that belongs to the author. The other four pins (RAG-01, FS-01, OPS-01, DE-01) and the SecureShare alternate (FS-02) are unambiguous.

## Re-running

`pnpm seed:import` refuses to overwrite a manifest whose `integrity.reviewedBy` is no longer `"seed-import"`. Once a human edits a record, the importer is no longer its source of truth (PRD §5.1.1 precedence 1) and reports it as skipped.

## Open items

- **CommerceFlow flagship** — needs an author decision.
- **Authoring** — 240 records need stack, tagline, problem, evidence, and scoring before any can go public. This is expected work, not a defect.
