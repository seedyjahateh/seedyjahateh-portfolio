# Project Atlas

An IDE-grade public engineering archive — a proof-retrieval system, not a cinematic résumé. Static-first, evidence-driven, sized for 1,300 projects with a defined migration path to 10,000.

**Status: Phase 1 (static proof shell) complete.** Phases 2–6 not started.

## What exists today

A working static site plus the frozen contract layer beneath it.

**The site** (`apps/web`) — home, three role lenses, a project detail template,
résumé, contact, and a paginated atlas. Fully static (`output: "export"`), and
every route works with JavaScript disabled. 240 catalog entries are browsable, two of them authored;
none are published, because none are built.

**The contracts**, frozen and enforced:

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

205 tests (contract + export structure) plus 27 end-to-end checks covering axe, keyboard journeys, and the whole site with JavaScript off. 24 ADRs. Seven workstream packets with verified non-overlapping path ownership.

## Verify it

```bash
corepack enable pnpm
pnpm install
pnpm verify:all      # typecheck, lint, tests, contracts, build, budgets
pnpm test:e2e        # axe, keyboard journeys, and the no-JS exit gate
pnpm profile:verify  # what still needs authoring
```

`verify:all` covers typecheck, lint, formatting, 205 tests, schema regeneration
diff, taxonomy exhaustiveness, seed re-derivation, fixture determinism, packet
isolation, budget governance, the static export, and route budget measurement.

## Design commitments worth stating up front

**Nothing claims to be finished that isn't.** Seed records import as `planned`/`private` with empty stacks, no taglines, and no metrics. The selection catalog names technologies in prose, but extracting them would be inference, and a tagline is a claim. This is enforced by the schema, not by convention — see [ADR 0020](docs/adr/0020-seed-import-planned-private.md).

**The generated JSON Schema states its own limits.** Zod refinements don't survive `z.toJSONSchema`, so 19 of 53 rules are invisible to a plain Ajv validator. They're flagged in the emitted schema under `x-zodOnlyRules`, and the conformance test asserts Ajv genuinely misses them — so the list can't quietly rot. See [ADR 0003](docs/adr/0003-zod-source-of-truth.md).

**Budgets are not negotiable by the people implementing against them.** `config/budgets.v1.json` is CODEOWNERS-gated and CI fails a change to it without an ADR reference. A visual effect that breaks a budget is removed, not excused.

**Nothing is styled yet, on purpose.** Phase 1 is semantic HTML with a 1.6 KB
stylesheet. The design system is Phase 4, and building it before the structure
and budgets are measurable is how the PRD''s top-listed risk happens.

## Layout

```
apps/web              the static site (Phase 1)
packages/contracts    frozen schema, rules, protocols   (read-only to workstreams)
packages/taxonomy     vocabulary loader and checks
packages/fixtures     deterministic 240/1,300/10,000 corpora + invalid cases
content/projects      the 240 project manifests
content/schema        GENERATED — do not hand-edit
config                budgets and search tuning
docs/prd              PRD + selection catalog
docs/adr              20 decisions, each with a revisit trigger
docs/contracts        frozen interface specifications
docs/tasks            workstream packets
```

Working agreement for contributors and agents: [CONTRIBUTING.md](CONTRIBUTING.md).

## Known open items

- ~~CommerceFlow flagship~~ — resolved 2026-08-28: FS-15 merged into DST-01.
- The **150-query relevance gate** is `pending`: 164 judgements derive from seed content, but 3 of 8 classes need authored stack and evidence fields.
- **238 records need authoring** before any can be published. FS-01 and FS-15 are authored and still need evidence, media, and a score to go public.
- **`content/profile.v1.json` is empty** — name, positioning sentence, résumé and
  contact are personal facts, so they are not generated. Run `pnpm profile:verify`.
- **Home sits at 97% of its JS budget** with zero interactivity: that is Next''s
  baseline client runtime, and Phase 3 has to fit search into what remains.

## License

MIT
