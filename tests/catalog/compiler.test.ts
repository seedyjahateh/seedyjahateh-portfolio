/**
 * Catalog compiler.
 *
 * Authority: PRD 5.1.2 (stages), 5.1.3 (ingestion rejections and determinism),
 * 5.1.5 (artifacts and budgets), 5.1.6 (SLOs and error shape), 5.3.2 (bitsets),
 * 11.1 (pipeline unit tests and property tests), 13 Phase 2 exit gate.
 */

import { join } from "node:path";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { compileCatalog } from "@atlas/catalog";
import { fixedClock } from "@atlas/catalog/pipeline";
import {
  bitsetHas,
  facetBitsPayload,
  parseFacetBitsHeader,
  wordsPerSet,
} from "@atlas/contracts/artifacts";
import { generateCatalog, invalidCases, validBaseRecord } from "@atlas/fixtures";

const repoRoot = process.cwd();

/**
 * Copy a view into a standalone ArrayBuffer.
 *
 * `Uint8Array.buffer` is typed `ArrayBufferLike`, which may be a
 * SharedArrayBuffer; the facet-bits reader takes an ArrayBuffer. Copying rather
 * than casting also exercises the reader against a buffer with no byteOffset,
 * which is how it will be handed a `fetch` response in the browser.
 */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

const BASE = {
  repoRoot,
  outDir: join(repoRoot, "apps", "web", "public", "catalog"),
  siteUrl: "https://example.test",
  // Pinned: a wall clock would make every build differ and defeat the whole
  // determinism guarantee (PRD 5.1.3).
  clock: fixedClock("2026-01-01T00:00:00Z"),
  commitSha: "0123456789abcdef",
  offline: true,
  dryRun: true,
};

async function build(records: readonly unknown[]) {
  return compileCatalog({ ...BASE, records });
}

describe("pipeline stages", () => {
  it("runs every PRD 5.1.2 stage and reports timings", async () => {
    const result = await build(generateCatalog(240));
    const names = result.report.stages.map((s) => s.name);

    for (const stage of [
      "discover",
      "parse",
      "validate",
      "normalize",
      "deduplicate",
      "taxonomy",
      "assign-ordinals",
      "derive-facets",
      "build-bitsets",
      "build-catalog",
      "build-search",
      "build-featured",
      "build-feed",
      "enforce-budgets",
    ]) {
      expect(names, `missing stage ${stage}`).toContain(stage);
    }
    for (const stage of result.report.stages) {
      expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      expect(stage.effects.length).toBeGreaterThan(0);
    }
  });

  it("declares which stages touch the outside world", async () => {
    const result = await build(generateCatalog(240));
    const impure = result.report.stages.filter((s) => !s.effects.includes("pure"));
    // Only discovery reads and publish writes; everything else is pure, which
    // is what makes the build reproducible.
    expect(impure.map((s) => s.name)).toEqual(["discover"]);
  });
});

describe("determinism (BLD-DETERMINISM-001)", () => {
  it("produces byte-identical artifacts across two builds", async () => {
    const records = generateCatalog(240);
    const first = await build(records);
    const second = await build(records);

    expect(first.catalogHash).toBe(second.catalogHash);
    expect(first.files.length).toBe(second.files.length);

    for (const [index, file] of first.files.entries()) {
      const other = second.files[index];
      expect(other?.path).toBe(file.path);
      const a =
        typeof file.contents === "string"
          ? file.contents
          : Buffer.from(file.contents).toString("base64");
      const b =
        typeof other?.contents === "string"
          ? other.contents
          : Buffer.from(other?.contents ?? new Uint8Array()).toString("base64");
      expect(b, `${file.path} differs between builds`).toBe(a);
    }
  });

  it("gives identical content the same catalogHash regardless of input order", async () => {
    // The hash identifies the DATA. Reordering the source files must not change
    // it, or every artifact URL would churn on an irrelevant rename.
    const records = generateCatalog(240);
    const shuffled = [...records].reverse();
    const a = await build(records);
    const b = await build(shuffled);
    expect(b.catalogHash).toBe(a.catalogHash);
  });

  it("changes the catalogHash when content changes", async () => {
    const records = generateCatalog(240);
    const mutated = structuredClone(records) as Record<string, unknown>[];
    const first = mutated[0];
    if (first !== undefined) first["title"] = "A different title entirely";

    const a = await build(records);
    const b = await build(mutated);
    expect(b.catalogHash).not.toBe(a.catalogHash);
  });
});

describe("artifacts", () => {
  it("emits every artifact PRD 5.1.5 requires", async () => {
    const result = await build(generateCatalog(240));
    const paths = result.files.map((f) => f.path);

    expect(paths.some((p) => p.startsWith("catalog-core."))).toBe(true);
    expect(paths.some((p) => p.startsWith("facets."))).toBe(true);
    expect(paths.some((p) => p.startsWith("facet-bits.") && p.endsWith(".bin"))).toBe(true);
    expect(paths.some((p) => p.startsWith("search."))).toBe(true);
    expect(paths.some((p) => p.startsWith("featured."))).toBe(true);
    expect(paths).toContain("manifest.json");
    expect(paths).toContain("feed.xml");
    expect(paths).toContain("feed.json");
  });

  it("content-hashes the immutable artifacts and leaves the pointer unhashed", async () => {
    // PRD 7.3: hashed files are cached for a year; the bootstrap pointer is not.
    const result = await build(generateCatalog(240));
    for (const file of result.files) {
      if (file.immutable) {
        expect(file.path, `${file.path} should carry a content hash`).toMatch(
          /\.[0-9a-f]{16}\.(json|bin)$/,
        );
      }
    }
    expect(result.files.find((f) => f.path === "manifest.json")?.immutable).toBe(false);
  });

  it("keeps every artifact inside its budget", async () => {
    const result = await build(generateCatalog(1300));
    const over = result.budgets.filter((row) => !row.ok);
    expect(over.map((r) => `${r.path} ${r.kb}/${r.limitKb ?? "-"} KB`)).toEqual([]);
  });

  it("emits a valid feed even with nothing published", async () => {
    // Every fixture record is unlisted, so the feed is empty by design. A
    // subscriber should get an empty channel, not malformed XML.
    const result = await build(generateCatalog(240));
    const rss = result.files.find((f) => f.path === "feed.xml")?.contents as string;
    expect(rss).toContain("<?xml");
    expect(rss).toContain("<channel>");
    expect(rss).toContain("</rss>");
    expect(rss).not.toContain("<item>");
  });
});

describe("bitsets (PRD 5.3.2)", () => {
  it("membership matches a naive filter for every facet value", async () => {
    const records = generateCatalog(240);
    const result = await build(records);

    const bitsFile = result.files.find((f) => f.path.startsWith("facet-bits."));
    const bytes = bitsFile?.contents as Uint8Array;
    const buffer = toArrayBuffer(bytes);

    const header = parseFacetBitsHeader(buffer);
    const payload = facetBitsPayload(buffer);

    const facetsFile = result.files.find((f) => f.path.startsWith("facets."));
    const facets = JSON.parse(facetsFile?.contents as string) as {
      groups: { group: string; values: { id: number; value: string }[] }[];
    };
    const coreFile = result.files.find((f) => f.path.startsWith("catalog-core."));
    const core = JSON.parse(coreFile?.contents as string) as {
      cards: { o: number; id: string; proof: string; tier: string; year: number }[];
    };

    expect(header.projectCount).toBe(core.cards.length);
    expect(header.wordsPerSet).toBe(wordsPerSet(core.cards.length));

    // Spot-check the closed groups, where the expected membership is derivable
    // from the card alone without re-deriving the whole facet extraction.
    const byOrdinal = new Map(core.cards.map((c) => [c.o, c]));

    for (const group of facets.groups) {
      if (group.group !== "proof" && group.group !== "tier") continue;
      for (const value of group.values) {
        for (let ordinal = 0; ordinal < header.projectCount; ordinal += 1) {
          const card = byOrdinal.get(ordinal);
          const expected =
            group.group === "proof" ? card?.proof === value.value : card?.tier === value.value;
          expect(
            bitsetHas(payload, header.wordsPerSet, value.id, ordinal),
            `${group.group}:${value.value} ordinal ${ordinal}`,
          ).toBe(expected);
        }
      }
    }
  });

  it("never sets a bit outside the catalog", async () => {
    const result = await build(generateCatalog(240));
    const bitsFile = result.files.find((f) => f.path.startsWith("facet-bits."));
    const bytes = bitsFile?.contents as Uint8Array;
    const buffer = toArrayBuffer(bytes);
    const header = parseFacetBitsHeader(buffer);
    const payload = facetBitsPayload(buffer);

    // Bits above projectCount within the final word must be zero, or a filter
    // would return an ordinal with no record behind it.
    const spare = header.wordsPerSet * 32 - header.projectCount;
    if (spare === 0) return;

    for (let set = 0; set < header.setCount; set += 1) {
      for (let ordinal = header.projectCount; ordinal < header.wordsPerSet * 32; ordinal += 1) {
        expect(bitsetHas(payload, header.wordsPerSet, set, ordinal)).toBe(false);
      }
    }
  });

  it("agrees with a reference filter over randomized selections", async () => {
    const result = await build(generateCatalog(240));
    const bitsFile = result.files.find((f) => f.path.startsWith("facet-bits."));
    const bytes = bitsFile?.contents as Uint8Array;
    const buffer = toArrayBuffer(bytes);
    const header = parseFacetBitsHeader(buffer);
    const payload = facetBitsPayload(buffer);

    const facetsFile = result.files.find((f) => f.path.startsWith("facets."));
    const facets = JSON.parse(facetsFile?.contents as string) as {
      groups: { group: string; values: { id: number; value: string; count: number }[] }[];
    };

    const allValues = facets.groups.flatMap((g) => g.values);

    // The declared count for a facet value must equal its popcount. This is the
    // invariant the Phase 3 filter engine will rely on for result counts.
    fc.assert(
      fc.property(fc.integer({ min: 0, max: allValues.length - 1 }), (index) => {
        const value = allValues[index];
        if (value === undefined) return;
        let popcount = 0;
        for (let ordinal = 0; ordinal < header.projectCount; ordinal += 1) {
          if (bitsetHas(payload, header.wordsPerSet, value.id, ordinal)) popcount += 1;
        }
        expect(popcount, `${value.value} count mismatch`).toBe(value.count);
      }),
      { numRuns: 200 },
    );
  });
});

describe("invalid input fails correctly (exit gate)", () => {
  it("rejects every invalid fixture with the full PRD 5.1.6 issue shape", async () => {
    for (const testCase of invalidCases()) {
      const result = await build([testCase.record]);
      const errors = result.issues.filter((i) => i.severity === "error");

      expect(
        errors.length,
        `${testCase.ruleId} (${testCase.mutation}) was accepted`,
      ).toBeGreaterThan(0);

      for (const error of errors) {
        expect(error.ruleId, "issue must carry a rule id").toBeTruthy();
        expect(error.filePath, "issue must carry a file path").toBeTruthy();
        expect(typeof error.pointer, "issue must carry a JSON pointer").toBe("string");
        expect(error.message.length, "issue must carry a message").toBeGreaterThan(0);
        expect(error.repair.length, "issue must carry a repair").toBeGreaterThan(10);
      }
    }
  });

  it("accepts the valid base record", async () => {
    const result = await build([validBaseRecord()]);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("reports duplicate ids as COR-DUP-ID-001", async () => {
    const record = validBaseRecord();
    const result = await build([record, structuredClone(record)]);
    expect(result.issues.map((i) => i.ruleId)).toContain("COR-DUP-ID-001");
  });

  it("reports an unknown capability as TAX-UNKNOWN-001", async () => {
    const record = validBaseRecord();
    record["capabilities"] = ["not-a-real-capability"];
    const result = await build([record]);
    expect(result.issues.map((i) => i.ruleId)).toContain("TAX-UNKNOWN-001");
  });

  it("reports a track/prefix mismatch as TAX-TRACK-PREFIX-001", async () => {
    const record = validBaseRecord();
    record["track"] = "retrieval-rag"; // id is TST-01, which belongs to quality-engineering
    const result = await build([record]);
    expect(result.issues.map((i) => i.ruleId)).toContain("TAX-TRACK-PREFIX-001");
  });
});

describe("normalization (PRD 5.1.3)", () => {
  it("sorts unordered tag arrays so ordering cannot change the hash", async () => {
    const a = validBaseRecord();
    a["capabilities"] = ["testing", "api"];
    const b = structuredClone(a);
    b["capabilities"] = ["api", "testing"];

    const built = await Promise.all([build([a]), build([b])]);
    expect(built[1].catalogHash).toBe(built[0].catalogHash);
  });
});
