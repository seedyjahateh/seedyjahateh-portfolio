/**
 * Corpus-level and enrichment rules.
 *
 * These are the rules Phase 0 had to exempt from invalid-fixture coverage: a
 * single malformed document cannot express "duplicate across records",
 * "unknown vocabulary term", or "GitHub disagreed with the manifest". The
 * compiler has the whole corpus and the taxonomy, so this is where they get
 * tested — and why their entries in COVERAGE_EXEMPTIONS now name a test
 * instead of promising a future phase.
 */

import { describe, expect, it } from "vitest";

import { compileCatalog } from "@atlas/catalog";
import { fixedClock } from "@atlas/catalog/pipeline";
import {
  backoffMs,
  cacheIsFresh,
  enrichRepositories,
  mergeEnrichment,
  normalizeFacts,
  shouldAbort,
  type EnrichmentCache,
  type Fetcher,
} from "@atlas/catalog/github";
import { validBaseRecord } from "@atlas/fixtures";

const BASE = {
  repoRoot: process.cwd(),
  outDir: "<dry-run>",
  siteUrl: "https://example.test",
  clock: fixedClock("2026-01-01T00:00:00Z"),
  commitSha: "0123456789abcdef",
  offline: true,
  dryRun: true,
};

const build = (records: readonly unknown[]) => compileCatalog({ ...BASE, records });
const rulesFrom = async (records: readonly unknown[]): Promise<string[]> =>
  (await build(records)).issues.map((i) => i.ruleId);

/** A second record that differs only where the test needs it to. */
function variant(overrides: Record<string, unknown>): Record<string, unknown> {
  const record = validBaseRecord();
  return { ...record, ...overrides };
}

describe("corpus uniqueness (COR-DUP-*)", () => {
  it("COR-DUP-SLUG-001: two records cannot share a slug", async () => {
    const a = variant({});
    const b = variant({ id: "TST-02", slug: "baseline-valid-fixture-record" });
    expect(await rulesFrom([a, b])).toContain("COR-DUP-SLUG-001");
  });

  it("COR-DUP-REPO-001: two records cannot claim one repository", async () => {
    const url = "https://github.com/example-owner/shared-repo";
    const a = variant({
      links: { canonical: "/projects/baseline-valid-fixture-record", source: url },
    });
    const b = variant({
      id: "TST-02",
      slug: "second-fixture-record",
      links: { canonical: "/projects/second-fixture-record", source: url },
    });
    expect(await rulesFrom([a, b])).toContain("COR-DUP-REPO-001");
  });

  it("COR-DUP-CASESTUDY-001: one case study belongs to one project", async () => {
    const study = "/writing/shared-case-study";
    const a = variant({
      links: { canonical: "/projects/baseline-valid-fixture-record", caseStudy: study },
    });
    const b = variant({
      id: "TST-02",
      slug: "second-fixture-record",
      links: { canonical: "/projects/second-fixture-record", caseStudy: study },
    });
    expect(await rulesFrom([a, b])).toContain("COR-DUP-CASESTUDY-001");
  });
});

describe("controlled vocabularies (TAX-*, MET-UNIT-001)", () => {
  it("TAX-UNKNOWN-001: rejects an unknown accent token", async () => {
    expect(
      await rulesFrom([
        variant({
          layout: { ...(validBaseRecord()["layout"] as object), accentToken: "chartreuse" },
        }),
      ]),
    ).toContain("TAX-UNKNOWN-001");
  });

  it("TAX-UNKNOWN-001: rejects an unknown evidence type", async () => {
    const record = variant({
      evidence: [
        {
          id: "e1",
          type: "vibes-report",
          title: "An artifact of an unknown kind",
          url: "/evidence/x",
          primary: true,
          verifiedAt: null,
          external: false,
        },
      ],
    });
    expect(await rulesFrom([record])).toContain("TAX-UNKNOWN-001");
  });

  it("MET-UNIT-001: a latency metric cannot be measured in dollars", async () => {
    // PRD 5.3.1: "Numeric comparison requires compatible units." The unit's
    // dimension and the category's accepted dimensions both live in the
    // taxonomy, which is why this cannot be a single-record fixture.
    const record = variant({
      metrics: [
        {
          id: "m1",
          category: "latency",
          label: "Answer latency p95",
          value: 1420,
          unit: "usd",
          direction: "lower-is-better",
          environment: "Synthetic fixture environment description of sufficient length.",
          sampleSize: 500,
          synthetic: true,
          measuredAt: "2026-01-15T12:00:00Z",
          evidenceUrl: "/evidence/base/load",
        },
      ],
    });
    expect(await rulesFrom([record])).toContain("MET-UNIT-001");
  });

  it("accepts a latency metric measured in milliseconds", async () => {
    const record = variant({
      metrics: [
        {
          id: "m1",
          category: "latency",
          label: "Answer latency p95",
          value: 1420,
          unit: "ms",
          direction: "lower-is-better",
          environment: "Synthetic fixture environment description of sufficient length.",
          sampleSize: 500,
          synthetic: true,
          measuredAt: "2026-01-15T12:00:00Z",
          evidenceUrl: "/evidence/base/load",
        },
      ],
    });
    expect(await rulesFrom([record])).not.toContain("MET-UNIT-001");
  });
});

describe("editorial limits (COR-FEAT-*)", () => {
  function featured(id: string, slug: string, rank: number): Record<string, unknown> {
    const record = validBaseRecord();
    return {
      ...record,
      id,
      slug,
      visibility: "public",
      tier: "flagship",
      proofLevel: "measured",
      status: "complete",
      tagline: "A tagline of entirely adequate length for the schema bounds.",
      featured: { global: true, roles: ["backend-engineer"], rank },
      links: { canonical: `/projects/${slug}`, source: `https://github.com/example/${slug}` },
      content: {
        problem: "A problem statement long enough to satisfy the forty character minimum here.",
        limitations: [],
      },
      media: {
        card: {
          src: `/media/${slug}/card.avif`,
          width: 800,
          height: 450,
          alt: "A descriptive alt text for the card image.",
          placeholder: false,
        },
        gallery: [],
      },
      evidence: [
        {
          id: "primary",
          type: "benchmark",
          title: "A benchmark report with an adequate title",
          url: `/evidence/${slug}/bench`,
          primary: true,
          verifiedAt: null,
          external: false,
        },
      ],
      metrics: [
        {
          id: "m1",
          category: "latency",
          label: "Answer latency p95",
          value: 1420,
          unit: "ms",
          direction: "lower-is-better",
          environment: "Synthetic fixture environment description of sufficient length.",
          sampleSize: 500,
          synthetic: true,
          measuredAt: "2026-01-15T12:00:00Z",
          evidenceUrl: `/evidence/${slug}/load`,
        },
      ],
      selection: {
        dimensions: {
          roleRelevance: 24,
          engineeringDepth: 19,
          productionEvidence: 19,
          demoClarity: 14,
          differentiation: 9,
          portfolioReuse: 9,
        },
        score: 94,
        scoredAt: "2026-01-15",
      },
    };
  }

  it("COR-FEAT-RANK-001: two flagships cannot hold the same rank", async () => {
    const rules = await rulesFrom([
      featured("TST-01", "flagship-one", 1),
      featured("TST-02", "flagship-two", 1),
    ]);
    expect(rules).toContain("COR-FEAT-RANK-001");
  });

  it("COR-FEAT-COUNT-001: at most five projects are globally featured", async () => {
    // The sixth record reuses rank 5 rather than taking rank 6, because the
    // schema caps `featured.rank` at 5 — a rank-6 record is rejected before it
    // can be counted. So the only way to flag six is to collide a rank, and
    // this build legitimately reports both rules.
    const ranks = [1, 2, 3, 4, 5, 5];
    const six = ranks.map((rank, i) => featured(`TST-0${i + 1}`, `flagship-${i + 1}`, rank));
    const rules = await rulesFrom(six);
    expect(rules).toContain("COR-FEAT-COUNT-001");
    expect(rules).toContain("COR-FEAT-RANK-001");
  });

  it("accepts exactly five", async () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      featured(`TST-0${i + 1}`, `flagship-${i + 1}`, i + 1),
    );
    const rules = await rulesFrom(five);
    expect(rules).not.toContain("COR-FEAT-COUNT-001");
    expect(rules).not.toContain("COR-FEAT-RANK-001");
  });
});

// -----------------------------------------------------------------------------
// GitHub enrichment
// -----------------------------------------------------------------------------

const FACTS = {
  defaultBranch: "main",
  description: "A repository",
  topics: ["a", "b"],
  primaryLanguage: "TypeScript",
  license: "MIT",
  stars: 12,
  forks: 3,
  openIssues: 1,
  archived: false,
  lastPush: "2026-01-01T00:00:00Z",
  latestRelease: null,
  homepage: null,
};

function withRepository(): Record<string, unknown> {
  const record = validBaseRecord();
  return {
    ...record,
    repository: {
      provider: "github",
      owner: "example",
      name: "thing",
      defaultBranch: "main",
      visibility: "public",
      license: "Apache-2.0",
      archived: false,
    },
  };
}

describe("enrichment precedence (GHE-*)", () => {
  it("GHE-CONFLICT-001: a licence disagreement warns and preserves the manifest", () => {
    // PRD 5.1.1: "the build emits a review warning and preserves the manifest
    // until a human resolves it." Failing instead would let a stale GitHub
    // field block a deploy, inverting who owns the catalog.
    const record = withRepository() as unknown as Parameters<typeof mergeEnrichment>[0];
    const merged = mergeEnrichment(record, FACTS, "2026-01-01T00:00:00Z", 'W/"abc"');

    expect(merged.issues.map((i) => i.ruleId)).toContain("GHE-CONFLICT-001");
    expect(merged.issues.every((i) => i.severity === "warning")).toBe(true);
    // The manifest value survives.
    expect(merged.record.repository?.license).toBe("Apache-2.0");
  });

  it("writes only objective fields, never curated ones", () => {
    const record = withRepository() as unknown as Parameters<typeof mergeEnrichment>[0];
    const merged = mergeEnrichment(
      record,
      { ...FACTS, license: "Apache-2.0" },
      "2026-01-01T00:00:00Z",
      null,
    );

    expect(merged.record.title).toBe(record.title);
    expect(merged.record.summary).toBe(record.summary);
    expect(merged.record.proofLevel).toBe(record.proofLevel);
    expect(merged.record.visibility).toBe(record.visibility);
    expect(merged.record.repository?.enrichment?.stars).toBe(12);
  });

  it("GHE-STALE-001: a cache older than seven days is not fresh", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const fresh = {
      owner: "a",
      name: "b",
      etag: null,
      fetchedAt: "2026-01-09T00:00:00Z",
      facts: FACTS,
    };
    const stale = {
      owner: "a",
      name: "b",
      etag: null,
      fetchedAt: "2026-01-01T00:00:00Z",
      facts: FACTS,
    };
    expect(cacheIsFresh(fresh, now)).toBe(true);
    expect(cacheIsFresh(stale, now)).toBe(false);
  });

  it("GHE-BUDGET-001: aborts below ten percent of the rate limit", () => {
    expect(shouldAbort({ limit: 5000, remaining: 400, resetAt: 0 })).toBe(true);
    expect(shouldAbort({ limit: 5000, remaining: 600, resetAt: 0 })).toBe(false);
  });
});

describe("enrichment client", () => {
  const cache: EnrichmentCache = { version: 1, entries: {} };
  // Backoff delays are asserted directly via backoffMs; the client tests do
  // not need to spend real time sleeping.
  const noSleep = (): Promise<void> => Promise.resolve();

  it("reuses the cached response on a 304", async () => {
    const seeded: EnrichmentCache = {
      version: 1,
      entries: {
        "example/thing": {
          owner: "example",
          name: "thing",
          etag: 'W/"abc"',
          fetchedAt: "2026-01-01T00:00:00Z",
          facts: FACTS,
        },
      },
    };

    let sentEtag: string | undefined;
    const fetcher: Fetcher = (_url, init) => {
      sentEtag = init.headers["if-none-match"];
      return Promise.resolve({
        status: 304,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      });
    };

    const out = await enrichRepositories([{ owner: "example", name: "thing" }], seeded, {
      token: "t",
      fetcher,
      now: () => new Date("2026-01-02T00:00:00Z"),
      sleep: noSleep,
    });

    expect(sentEtag).toBe('W/"abc"');
    expect(out.notModified).toBe(1);
    expect(out.fetched).toBe(0);
    expect(out.cache.entries["example/thing"]?.facts.stars).toBe(12);
  });

  it("retries a 500 and gives up after two retries", async () => {
    let calls = 0;
    const fetcher: Fetcher = () => {
      calls += 1;
      return Promise.resolve({
        status: 500,
        headers: { get: () => null },
        json: () => Promise.resolve({}),
      });
    };

    const out = await enrichRepositories([{ owner: "a", name: "b" }], cache, {
      token: "t",
      fetcher,
      now: () => new Date(),
      sleep: noSleep,
      random: () => 0,
    });

    expect(calls).toBe(3); // initial + MAX_RETRIES
    expect(out.issues.length).toBeGreaterThan(0);
  });

  it("honours Retry-After over computed backoff", () => {
    expect(backoffMs(0, 42, () => 1)).toBe(42_000);
  });

  it("uses full jitter so retries do not synchronise", () => {
    // Two clients backing off from the same failure must not retry together.
    expect(backoffMs(3, null, () => 0)).toBe(0);
    expect(backoffMs(3, null, () => 0.999)).toBeGreaterThan(0);
  });

  it("keeps only the PRD 5.1.4 field allowlist", () => {
    const facts = normalizeFacts({
      default_branch: "trunk",
      stargazers_count: 7,
      secret_internal_field: "should not survive",
      license: { spdx_id: "MIT" },
    });
    expect(facts.defaultBranch).toBe("trunk");
    expect(facts.stars).toBe(7);
    expect(facts.license).toBe("MIT");
    expect(Object.keys(facts)).not.toContain("secret_internal_field");
  });
});
