# Frozen contracts (Phase 0)

PRD §17: *"Implementation may begin after Phase 0 contracts are extracted from this PRD into versioned schema, ADR, protocol, and benchmark files."*

Everything here is frozen. Implementation workstreams list these paths under `readOnlyPaths` in their task packets. Changing one requires an ADR and, where the schema is involved, a migration script plus fixture update (PRD §8.3).

## Where each contract lives

| Contract | Specification | Implementation | Tests |
|---|---|---|---|
| Project schema v3 | PRD §8.1–8.3 | `packages/contracts/src/project.ts` → `content/schema/project.v3.schema.json` | `conformance.test.ts` |
| Validation rules | PRD §5.1.3, §8.3 | `packages/contracts/src/rules/registry.ts` → `content/schema/validation-rules.v1.json` | `rule-coverage.test.ts` |
| Taxonomy v1 | PRD §5.3.1, §8.3 | `content/taxonomy/*.v1.json` + `packages/taxonomy` | `pnpm taxonomy:verify` |
| URL-state grammar v1 | PRD §5.3.3, §10.4 | `packages/contracts/src/url-state.ts` | `url-state.test.ts` |
| Search protocol v1 | PRD §5.2, §7.1, §7.4 | `packages/contracts/src/search-protocol.ts` | `search-protocol.test.ts` |
| Artifact contracts v1 | PRD §5.1.5, §5.3.2 | `packages/contracts/src/artifacts.ts` | `artifacts.test.ts` |
| Budgets | PRD §5.1.6, §9, §7.4 | `config/budgets.v1.json` | `pnpm budgets:verify` |
| Search tuning | PRD §5.2.2 | `config/search.v1.json` | relevance suite |
| Import mapping v1 | PRD §11.3 | [`import-mapping-v1.md`](./import-mapping-v1.md) · `scripts/import-selection.ts` | `seed-catalog.test.ts` |
| Task packets | PRD §12.3 | `docs/tasks/ATLAS-00N-*.json` | `pnpm packets:verify` |

## Three things worth knowing before you build on these

**1. JSON Schema enforces less than the pipeline does.** Zod refinements do not survive `z.toJSONSchema`, so cross-field rules, calendar-date validity, and every corpus rule are invisible to a plain Ajv validator. 19 of 53 rules are affected. The emitted schema lists them under `x-zodOnlyRules`, and the conformance test asserts Ajv genuinely misses them — so the list cannot silently rot. See ADR 0003.

**2. The bitset artifact is little-endian and its header is 24 bytes.** Both are load-bearing. A `Uint32Array` view reads in host byte order, so a big-endian host would return wrong memberships rather than failing; `facetBitsPayload` asserts host endianness. The 24-byte header is a multiple of 4 so the payload can be a zero-copy view. See ADR 0009.

**3. The search protocol mentions neither Fuse nor the DOM.** PRD §7.4 requires a future hosted search service to slot in behind the identical `SearchRequest`/`SearchResponse` contract without rewriting view or filter components. That only holds if nothing implementation-shaped leaks in. See ADR 0008.

## Verifying the contracts hold

```bash
pnpm verify:all
```

Runs typecheck, 140 contract tests, schema regeneration diff, taxonomy exhaustiveness, seed re-derivation, fixture determinism, packet isolation, and budget governance.
