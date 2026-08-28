# Project Atlas

An IDE-grade public engineering archive — a proof-retrieval system, not a cinematic résumé. Static-first, evidence-driven, sized for 1,300 projects with a defined migration path to 10,000.

**Status: Phase 0 (contracts) complete.** Phases 1–6 not started.

## What exists today

The contract layer the rest of the build depends on, frozen and enforced:

|                           |                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------- |
| **Project schema v3**     | Zod as source of truth → JSON Schema 2020-12 generated and committed                   |
| **Validation rules**      | 53 registered rejections, each citing its PRD clause and carrying an actionable repair |
| **Taxonomy v1**           | 19 vocabulary groups, 191 terms, closed-enum exhaustiveness checked both ways          |
| **URL grammar v1**        | Canonical, idempotent, property-tested — the URL _is_ the catalog state                |
| **Search protocol v1**    | Versioned worker messages, deliberately free of any Fuse or DOM detail                 |
| **Artifact contracts v1** | Compact catalog, facets, and the little-endian facet-bits binary layout                |
| **Seed catalog**          | All 240 projects, imported through the production schema, zero manual transformation   |
| **Budgets**               | 83 numeric gates in one reviewed file, gated by CODEOWNERS and an ADR check            |

140 contract tests. 20 ADRs. Six workstream task packets with verified non-overlapping path ownership.

## Verify it

```bash
corepack enable pnpm
pnpm install
pnpm verify:all
```

Runs typecheck, the contract suite, schema regeneration diff, taxonomy exhaustiveness, seed re-derivation, fixture determinism, packet isolation, and budget governance.

## Design commitments worth stating up front

**Nothing claims to be finished that isn't.** All 240 seed records import as `planned`/`private` with empty stacks, no taglines, and no metrics. The selection catalog names technologies in prose, but extracting them would be inference, and a tagline is a claim. This is enforced by the schema, not by convention — see [ADR 0020](docs/adr/0020-seed-import-planned-private.md).

**The generated JSON Schema states its own limits.** Zod refinements don't survive `z.toJSONSchema`, so 19 of 53 rules are invisible to a plain Ajv validator. They're flagged in the emitted schema under `x-zodOnlyRules`, and the conformance test asserts Ajv genuinely misses them — so the list can't quietly rot. See [ADR 0003](docs/adr/0003-zod-source-of-truth.md).

**Budgets are not negotiable by the people implementing against them.** `config/budgets.v1.json` is CODEOWNERS-gated and CI fails a change to it without an ADR reference. A visual effect that breaks a budget is removed, not excused.

## Layout

```
packages/contracts    frozen schema, rules, protocols   (read-only to workstreams)
packages/taxonomy     vocabulary loader and checks
packages/fixtures     deterministic 240/1,300/10,000 corpora + invalid cases
content/projects      the 240 seed manifests
content/schema        GENERATED — do not hand-edit
config                budgets and search tuning
docs/prd              PRD + selection catalog
docs/adr              20 decisions, each with a revisit trigger
docs/contracts        frozen interface specifications
docs/tasks            workstream packets
```

Working agreement for contributors and agents: [CONTRIBUTING.md](CONTRIBUTING.md).

## Known open items

- The **CommerceFlow flagship** is unresolved between `DST-01` and `FS-15` — recorded, not guessed.
- The **150-query relevance gate** is `pending`: 164 judgements derive from seed content, but 3 of 8 classes need authored stack and evidence fields.
- **240 records need authoring** before any can be published. Expected work, not a defect.

## License

MIT
