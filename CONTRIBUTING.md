# Project Atlas — working agreement

An IDE-grade public engineering archive. Static-first, evidence-driven, sized for 1,300 projects with a migration path to 10,000.

**Authoritative documents:**

- `docs/prd/portfolio-platform-prd.md` — the PRD. Section numbers cited throughout the code refer to it.
- `docs/prd/portfolio-project-selection.md` — the 240-project selection catalog.
- `docs/adr/` — decisions, each with its revisit trigger.
- `docs/contracts/` — frozen interface specifications.

## Current state

**Phase 0 (contracts) is complete.** Phases 1–6 are not started. See `docs/tasks/ATLAS-00N-*.json` for the six workstream packets.

## Commands

```bash
pnpm verify:all          # everything below, in order
pnpm typecheck
pnpm test                # 140 contract tests
pnpm schema:emit         # regenerate content/schema/ from Zod
pnpm taxonomy:verify     # vocabulary + closed-enum exhaustiveness
pnpm seed:verify         # re-derive the 240 seed manifests without writing
pnpm fixtures:verify     # determinism against fixtures/fixture.lock.json
pnpm packets:verify      # task-packet schema + ownership non-overlap
pnpm budgets:verify      # budget coherence + ADR gate
```

## Rules that are not negotiable

These come from PRD §12.2 and §0. They are not style preferences.

1. **Do not change performance budgets, acceptance thresholds, security headers, schema strictness, or accessibility requirements to make tests pass.** A visual effect that breaks a budget is removed, not excused (§0.9). `config/budgets.v1.json` is CODEOWNERS-gated and requires an ADR reference to change.

2. **Do not invent project metrics, repository history, user counts, revenue, performance results, or external validation** (§12.2). Synthetic benchmarks are labeled `synthetic: true` with their environment and evidence (§0.10). This is why all 240 seed records are `planned`/`private` with empty stacks and no taglines — see ADR 0020.

3. **Do not edit another workstream's owned paths.** Ownership is declared in `docs/tasks/` and enforced by `pnpm packets:verify` and CODEOWNERS.

4. **`packages/contracts`, `packages/taxonomy`, `content/schema`, `content/taxonomy`, and `config` are frozen.** Read-only to implementation workstreams. Changes need an ADR and, for the schema, a migration script plus fixture update.

5. **No `any`, disabled lint rule, skipped test, blanket accessibility suppression, or catch-and-ignore** without a reviewed exception (§12.2).

6. **No new runtime dependency without an ADR** stating capability, compressed cost, fallback, and removal path (§4.1). Do not ship React Query, Redux, Zustand, D3, Motion, or Three.js on routes that do not use them.

7. **Generated artifacts are not hand-edited.** `content/schema/` is emitted from `packages/contracts/src/project.ts`; CI verifies a clean regeneration diff.

## Architectural invariants

- **The URL is canonical state.** Never build a query string outside `packages/contracts/src/url-state.ts` (ADR 0018).
- **The main thread never builds a search index.** Fuse is reachable only from the worker (ADR 0008).
- **Views consume `VisibleProjectIds`.** They do not implement independent filtering (§5.4).
- **Card geometry never depends on content.** Fixed variants and spans only; no measurement during scroll (ADR 0011).
- **No per-card observers, listeners, or animation controllers.** Pool observers, delegate at the view boundary (§9.3).
- **Search results are ordinals in a transferable `Uint32Array`,** never copied project objects (§9.5).

## Conventions

- Cite the PRD section in a comment when code exists to satisfy a specific clause. Explain _why_, not _what_.
- Every validation rejection goes through the rule registry (`packages/contracts/src/rules/registry.ts`) so it carries a stable id and an actionable repair (§5.1.6).
- All generated JSON goes through `canonicalJson` — sorted keys, trailing newline — so byte comparison is a meaningful determinism test (§5.1.3).
- LF line endings everywhere. `.gitattributes` enforces it; a Windows CRLF would break byte-identical builds on Linux CI.
- Windows PowerShell 5.1 note: `Out-File -Encoding utf8` writes a BOM, which breaks `JSON.parse`. Use the `Write` tool, or `[System.IO.File]::WriteAllText` with `UTF8Encoding($false)`.

## Phase 0 known-open items

- **CommerceFlow flagship** is unresolved between `DST-01` and `FS-15`. Recorded in `content/editorial/flagship-rotation.v1.json`; needs an author decision, not a guess.
- **The 150-query relevance suite** is marked `status: "pending"` in `config/budgets.v1.json`. Roughly 90 judgements are derivable from real seed titles and IDs; misspelling and acronym classes need human authoring once records carry real content.
- **19 of 53 validation rules are `zodOnly`** — JSON Schema cannot express them. The emitted schema declares this under `x-zodOnlyRules`, and the conformance test asserts Ajv genuinely misses them so the classification cannot rot.
