/**
 * Bitset facet engine.
 *
 * Authority: PRD 5.3.2 (OR within a group, AND across groups), 5.3.3 (filter
 * budgets), 11.2 / `FILTER-PROPERTY-CASES` (10,000 randomized cases against a
 * reference filter), 5.4 (VisibleProjectIds).
 *
 * WHAT THE PROPERTY TEST ACTUALLY PROVES. The reference below derives each
 * record's facet values with `facetValuesFor` — the same function the compiler
 * uses — and then applies the OR/AND semantics in plain JavaScript over
 * strings. So the definition of membership is shared, deliberately, and what is
 * under test is everything built on top of it: bitset encoding, the dictionary
 * id assignment, word-level OR and AND, and the expansion back to ordinals.
 * Those are where an off-by-one or an endianness slip hides, and they are
 * invisible to any test that only checks one facet at a time.
 */

import { join } from "node:path";

import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";

import { compileCatalog, type FACET_GROUPS, facetValuesFor } from "@atlas/catalog";
import { fixedClock } from "@atlas/catalog/pipeline";
import type { Facets } from "@atlas/contracts/artifacts";
import type { ProjectRecord } from "@atlas/contracts/project";
import {
  computeVisible,
  FacetEngine,
  loadBitsets,
  loadCatalog,
  type CatalogCore,
  type LoadedCatalog,
  type Selection,
} from "@atlas/engine";
import { generateCatalog } from "@atlas/fixtures";

const repoRoot = process.cwd();

interface Harness {
  catalog: LoadedCatalog;
  engine: FacetEngine;
  records: readonly ProjectRecord[];
}

/** Compile a corpus and load its artifacts exactly as a browser would. */
async function harnessFor(size: number): Promise<Harness> {
  const result = await compileCatalog({
    repoRoot,
    records: generateCatalog(size),
    outDir: join(repoRoot, "apps", "web", "public", "catalog"),
    siteUrl: "https://example.test",
    clock: fixedClock("2026-01-01T00:00:00Z"),
    commitSha: "0123456789abcdef",
    offline: true,
    dryRun: true,
  });

  const errors = result.issues.filter((i) => i.severity === "error");
  expect(errors, `fixture corpus of ${size} failed to compile`).toEqual([]);

  const find = (prefix: string) => {
    const file = result.files.find((f) => f.path.startsWith(prefix));
    if (file === undefined) throw new Error(`no artifact starting with '${prefix}'`);
    return file;
  };

  const core = JSON.parse(find("catalog-core").contents as string) as CatalogCore;
  const facets = JSON.parse(find("facets").contents as string) as Facets;

  const raw = find("facet-bits").contents as Uint8Array;
  // Copied into a standalone ArrayBuffer: the zero-copy Uint32Array view needs
  // a buffer with no byteOffset, which is also how `fetch` hands it over.
  const buffer = new ArrayBuffer(raw.byteLength);
  new Uint8Array(buffer).set(raw);

  const catalog = loadCatalog(core, facets);
  return {
    catalog,
    engine: new FacetEngine(catalog, loadBitsets(buffer)),
    records: result.records,
  };
}

/**
 * Reference filter: plain strings, no bitsets.
 *
 * Deliberately the naive implementation — a record matches when, for every
 * group with selections, at least one selected value is among the values that
 * group contributes.
 */
function referenceMatch(record: ProjectRecord, selection: Selection): boolean {
  for (const group of Object.keys(selection)) {
    const wanted = selection[group] ?? [];
    if (wanted.length === 0) continue;
    const actual = new Set(facetValuesFor(record, group as (typeof FACET_GROUPS)[number]));
    if (!wanted.some((value) => actual.has(value))) return false;
  }
  return true;
}

function referenceOrdinals(records: readonly ProjectRecord[], selection: Selection): number[] {
  const out: number[] = [];
  for (const [ordinal, record] of records.entries()) {
    if (referenceMatch(record, selection)) out.push(ordinal);
  }
  return out;
}

/**
 * First value of a facet group, or a loud failure.
 *
 * These tests pick a real term out of the compiled dictionaries rather than
 * hard-coding one, so they keep working as the corpus changes. Throwing beats a
 * non-null assertion: if the fixture ever stops producing a group, the message
 * says which one instead of the test failing later on `undefined`.
 */
function firstValue(group: string): string {
  const value = small.catalog.facets.groups.find((g) => g.group === group)?.values[0]?.value;
  if (value === undefined) throw new Error(`fixture corpus produced no '${group}' facet values`);
  return value;
}

/** A selection is expected to match something; null means "no filter at all". */
function selected(selection: Selection): Uint32Array {
  const bitset = small.engine.select(selection);
  if (bitset === null) throw new Error(`selection ${JSON.stringify(selection)} produced no filter`);
  return bitset;
}

let small: Harness;

beforeAll(async () => {
  small = await harnessFor(240);
}, 120_000);

describe("loading", () => {
  it("indexes every facet term with its bitset position", () => {
    expect(small.catalog.terms.size).toBe(small.catalog.facets.valueCount);
    for (const [, term] of small.catalog.terms) {
      expect(term.setIndex).toBeGreaterThanOrEqual(0);
      expect(term.setIndex).toBeLessThan(small.catalog.facets.valueCount);
    }
  });

  it("refuses artifacts from two different builds", () => {
    // PRD 9.7: a version mismatch is reported, never silently rendered. Mixed
    // artifacts would test one build's bitsets against another's ordinals.
    const wrong = { ...small.catalog.facets, catalogHash: "sha256:" + "0".repeat(64) };
    expect(() => loadCatalog(small.catalog.core, wrong)).toThrow(/catalog mismatch/i);
  });
});

describe("selection semantics", () => {
  it("returns null for an empty selection rather than an all-ones bitset", () => {
    // The unfiltered path is the common one; null lets callers skip the
    // membership test entirely instead of walking every word.
    expect(small.engine.select({})).toBeNull();
    expect(small.engine.select({ role: [] })).toBeNull();
  });

  it("ORs values inside one group", () => {
    const groups = small.catalog.facets.groups.find((g) => g.group === "role");
    const values = (groups?.values ?? []).slice(0, 2).map((v) => v.value);
    expect(values.length).toBe(2);

    const [a, b] = values as [string, string];
    const onlyA = FacetEngine.count(small.engine.select({ role: [a] }) ?? new Uint32Array());
    const onlyB = FacetEngine.count(small.engine.select({ role: [b] }) ?? new Uint32Array());
    const either = FacetEngine.count(small.engine.select({ role: [a, b] }) ?? new Uint32Array());

    expect(either).toBeGreaterThanOrEqual(Math.max(onlyA, onlyB));
    expect(either).toBeLessThanOrEqual(onlyA + onlyB);
  });

  it("ANDs across groups", () => {
    const role = firstValue("role");
    const status = firstValue("status");

    const both = FacetEngine.count(selected({ role: [role], status: [status] }));
    const justRole = FacetEngine.count(selected({ role: [role] }));

    expect(both).toBeLessThanOrEqual(justRole);
  });

  it("matches nothing when every value in a group is unknown", () => {
    expect(FacetEngine.count(selected({ tech: ["definitely-not-a-real-technology"] }))).toBe(0);
  });

  it("does not depend on the order groups are given in", () => {
    const role = firstValue("role");
    const status = firstValue("status");

    const forward = Array.from(
      FacetEngine.ordinals(selected({ role: [role], status: [status] }), 240),
    );
    const reverse = Array.from(
      FacetEngine.ordinals(selected({ status: [status], role: [role] }), 240),
    );
    expect(forward).toEqual(reverse);
  });
});

describe("population count and expansion", () => {
  it("count agrees with the expanded ordinals", () => {
    const bitset = selected({ role: [firstValue("role")] });
    expect(FacetEngine.count(bitset)).toBe(FacetEngine.ordinals(bitset, 240).length);
  });

  it("never emits an ordinal outside the catalog", () => {
    // The last word holds padding bits beyond projectCount whenever the count
    // is not a multiple of 32. Emitting one would index past the card array.
    for (const group of small.catalog.facets.groups) {
      for (const value of group.values) {
        const bitset = selected({ [group.group]: [value.value] });
        for (const ordinal of FacetEngine.ordinals(bitset, 240)) {
          expect(ordinal).toBeLessThan(240);
          expect(ordinal).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("expands ordinals in ascending order", () => {
    const ordinals = Array.from(
      FacetEngine.ordinals(selected({ role: [firstValue("role")] }), 240),
    );
    expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
  });
});

describe("FILTER-PROPERTY-CASES: bitsets agree with a reference filter", () => {
  it("holds across randomized multi-group selections", () => {
    const groups = small.catalog.facets.groups.filter((g) => g.values.length > 0);

    const arbitrarySelection = fc
      .uniqueArray(fc.integer({ min: 0, max: groups.length - 1 }), {
        minLength: 1,
        maxLength: Math.min(4, groups.length),
      })
      .chain((groupIndexes) =>
        fc.tuple(
          ...groupIndexes.map((gi) => {
            const group = groups[gi];
            const values = group?.values ?? [];
            return fc
              .uniqueArray(fc.integer({ min: 0, max: values.length - 1 }), {
                minLength: 1,
                maxLength: Math.min(3, values.length),
              })
              .map((valueIndexes) => ({
                group: group?.group ?? "",
                values: valueIndexes.map((vi) => values[vi]?.value ?? ""),
              }));
          }),
        ),
      )
      .map((parts) => {
        const selection: Record<string, string[]> = {};
        for (const part of parts) selection[part.group] = part.values;
        return selection;
      });

    fc.assert(
      fc.property(arbitrarySelection, (selection) => {
        const bitset = small.engine.select(selection);
        const actual = Array.from(
          bitset === null ? new Uint32Array() : FacetEngine.ordinals(bitset, 240),
        );
        expect(actual).toEqual(referenceOrdinals(small.records, selection));
      }),
      // The budget is 10,000 cases (FILTER-PROPERTY-CASES). fast-check counts
      // runs, so this is the budget expressed directly rather than approximated.
      { numRuns: 10_000, verbose: false },
    );
  }, 180_000);
});

describe("computeVisible", () => {
  it("returns every project when nothing is selected", () => {
    const result = computeVisible(small.catalog, small.engine, {
      selection: {},
      sort: "relevance",
      searchOrder: null,
    });
    expect(result.total).toBe(240);
    expect(result.capped).toBe(false);
  });

  it("intersects a search ranking with facets without reordering it", () => {
    // PRD 5.2.3: proofLevel may break near-ties but cannot move a weak text
    // match above a strong one. On the relevance path the comparator is never
    // consulted, so editorial priority has no way in.
    const ranked = Uint32Array.from([9, 3, 7, 1, 5]);
    const result = computeVisible(small.catalog, small.engine, {
      selection: {},
      sort: "relevance",
      searchOrder: ranked,
    });
    expect(Array.from(result.ids)).toEqual([9, 3, 7, 1, 5]);
  });

  it("reorders a search ranking when an explicit sort is asked for", () => {
    const ranked = Uint32Array.from([9, 3, 7, 1, 5]);
    const result = computeVisible(small.catalog, small.engine, {
      selection: {},
      sort: "title",
      searchOrder: ranked,
    });
    expect(Array.from(result.ids).sort()).toEqual([1, 3, 5, 7, 9]);
    expect(Array.from(result.ids)).not.toEqual([9, 3, 7, 1, 5]);
  });

  it("reports a capped result set honestly", () => {
    // Showing "50 results" for a query matching 300 would be a false count.
    const ranked = Uint32Array.from([1, 2, 3]);
    const result = computeVisible(small.catalog, small.engine, {
      selection: {},
      sort: "relevance",
      searchOrder: ranked,
      searchTotal: 300,
    });
    expect(result.capped).toBe(true);
    expect(result.matchTotal).toBe(300);
    expect(result.total).toBe(3);
  });

  it("does not claim a cap once facets have narrowed the set below it", () => {
    const role = firstValue("role");
    const bitset = selected({ role: [role] });
    const inRole = Array.from(FacetEngine.ordinals(bitset, 240)).slice(0, 3);

    const outOfRole: number[] = [];
    for (let ordinal = 0; ordinal < 240 && outOfRole.length < 2; ordinal += 1) {
      if (!FacetEngine.has(bitset, ordinal)) outOfRole.push(ordinal);
    }
    expect(inRole.length).toBe(3);
    expect(outOfRole.length).toBe(2);

    // A ranking mixing matches with non-matches, so the facet genuinely
    // removes some and fewer rows survive than the worker returned.
    const ranked = Uint32Array.from([...inRole, ...outOfRole]);
    const result = computeVisible(small.catalog, small.engine, {
      selection: { role: [role] },
      sort: "relevance",
      searchOrder: ranked,
      searchTotal: 300,
    });
    expect(result.total).toBe(3);
    expect(result.total).toBeLessThan(ranked.length);
    // "top 50 of 300" printed beside 3 visible rows would be a false claim:
    // the cap is not what limited this list, the facet was.
    expect(result.capped).toBe(false);
  });
});
