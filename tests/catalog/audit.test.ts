/**
 * Catalog audit.
 *
 * Authority: PRD 5.1.3 (the audit report), 8.3 (ids permanent after
 * publication; a changed slug needs a redirect), 14 (stale verification).
 *
 * WHY THIS FILE MATTERS BEYOND ITS OWN COVERAGE. COR-ID-PERMANENCE-001 and
 * COR-SLUG-REDIRECT-001 were exempt from fixture coverage because no single
 * build can see them: both are statements about how the catalog CHANGED. The
 * baseline gives the compiler a previous state, so these assertions are the
 * first time either rule has actually been observed firing.
 */

import { describe, expect, it } from "vitest";

import {
  auditCatalog,
  buildBaseline,
  formatAudit,
  taxonomyTermsOf,
  STALE_AFTER_DAYS,
  type Baseline,
  type RedirectMap,
} from "@atlas/catalog/audit";
import type { ProjectRecord } from "@atlas/contracts/project";
import { validBaseRecord } from "@atlas/fixtures";

const NO_REDIRECTS: RedirectMap = { version: 1, redirects: {} };
const NOW = new Date("2026-01-01T00:00:00Z");

function record(overrides: Record<string, unknown> = {}): ProjectRecord {
  return { ...validBaseRecord(), ...overrides } as unknown as ProjectRecord;
}

function baselineOf(records: readonly ProjectRecord[]): Baseline {
  return buildBaseline(records, "sha256:baseline", "abc1234", [
    { id: "catalog-core.json", kb: 100 },
  ]);
}

function audit(
  records: readonly ProjectRecord[],
  baseline: Baseline | null,
  redirects: RedirectMap = NO_REDIRECTS,
) {
  return auditCatalog({
    records,
    catalogHash: "sha256:current",
    artifacts: [{ id: "catalog-core.json", kb: 100 }],
    baseline,
    redirects,
    now: NOW,
  });
}

describe("audit — first build", () => {
  it("treats everything as an addition and raises nothing", () => {
    const report = audit([record()], null);

    expect(report.added).toEqual(["TST-01"]);
    expect(report.removed).toEqual([]);
    expect(report.issues).toEqual([]);
    // With no previous state, "every term is new" is noise, not information.
    expect(report.taxonomyAdded).toEqual([]);
  });
});

describe("audit — an unchanged catalog", () => {
  it("reports no change and no issues", () => {
    const records = [record()];
    const report = audit(records, baselineOf(records));

    expect(report.added).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(report.changed).toEqual([]);
    expect(report.issues).toEqual([]);
    expect(formatAudit(report)).toContain("No change since the baseline.");
  });
});

describe("COR-ID-PERMANENCE-001", () => {
  it("fires when a PUBLISHED id disappears", () => {
    const before = [record({ id: "TST-01", visibility: "public" })];
    const report = audit([], baselineOf(before));

    expect(report.removed).toEqual(["TST-01"]);
    const ids = report.issues.map((i) => i.ruleId);
    expect(ids).toContain("COR-ID-PERMANENCE-001");
    expect(report.issues[0]?.severity).toBe("error");
    // PRD 5.1.6: the message must say what to do, not just what is wrong.
    expect(report.issues[0]?.repair).toMatch(/archive/i);
  });

  it("does NOT fire when an unpublished id disappears", () => {
    // Deleting a record that was never public breaks no link and orphans no
    // search result. Treating it as an error would make ordinary editorial
    // pruning impossible.
    const before = [record({ id: "TST-01", visibility: "private" })];
    const report = audit([], baselineOf(before));

    expect(report.removed).toEqual(["TST-01"]);
    expect(report.issues).toEqual([]);
  });
});

describe("COR-SLUG-REDIRECT-001", () => {
  const before = [record({ slug: "old-slug" })];

  it("fires when a slug changes with no redirect", () => {
    const report = audit([record({ slug: "new-slug" })], baselineOf(before));

    expect(report.issues.map((i) => i.ruleId)).toContain("COR-SLUG-REDIRECT-001");
    expect(report.changed).toContainEqual({
      id: "TST-01",
      field: "slug",
      from: "old-slug",
      to: "new-slug",
    });
  });

  it("stays quiet when the redirect exists", () => {
    const redirects: RedirectMap = { version: 1, redirects: { "old-slug": "new-slug" } };
    const report = audit([record({ slug: "new-slug" })], baselineOf(before), redirects);

    expect(report.issues).toEqual([]);
    // The change is still REPORTED — it is a fact about the diff, and only the
    // rule violation was resolved by the redirect.
    expect(report.changed).toHaveLength(1);
  });

  it("still fires when the baseline's hash disagrees with its own fields", () => {
    // Regression. The first version returned early when the record hashes
    // matched, which made the whole audit trust one 16-character string. A
    // baseline edited by hand — or written by an older hash function, or a
    // schema version that serializes differently — then reported "no change"
    // over a renamed slug. Found by renaming a slug in the real baseline and
    // watching the audit stay silent.
    const stale: Baseline = {
      ...baselineOf([record({ slug: "new-slug" })]),
      records: [
        {
          id: "TST-01",
          slug: "old-slug",
          title: "Test",
          visibility: "public",
          proofLevel: "code",
          // Deliberately the hash of the CURRENT record, not of the fields above.
          hash: baselineOf([record({ slug: "new-slug" })]).records[0]!.hash,
        },
      ],
    };
    const report = audit([record({ slug: "new-slug" })], stale);

    expect(report.issues.map((i) => i.ruleId)).toContain("COR-SLUG-REDIRECT-001");
  });

  it("rejects a redirect that points somewhere else", () => {
    const redirects: RedirectMap = { version: 1, redirects: { "old-slug": "some-third-slug" } };
    const report = audit([record({ slug: "new-slug" })], baselineOf(before), redirects);

    expect(report.issues.map((i) => i.ruleId)).toContain("COR-SLUG-REDIRECT-001");
  });
});

describe("field changes", () => {
  it("names the field that changed", () => {
    const before = [record({ proofLevel: "code" })];
    const report = audit([record({ proofLevel: "live" })], baselineOf(before));

    expect(report.changed).toEqual([
      { id: "TST-01", field: "proofLevel", from: "code", to: "live" },
    ]);
  });

  it("still reports a change in an untracked field", () => {
    // The four named fields are the ones worth spelling out. Everything else
    // must still surface, or a silently rewritten summary would look like no
    // change at all.
    const before = [record({ summary: "a".repeat(80) })];
    const report = audit([record({ summary: "b".repeat(80) })], baselineOf(before));

    expect(report.changed).toHaveLength(1);
    expect(report.changed[0]?.field).toBe("(content)");
  });
});

describe("staleness (PRD 14)", () => {
  it("flags a record verified longer ago than the policy", () => {
    const old = new Date(NOW.getTime() - (STALE_AFTER_DAYS + 10) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const records = [
      record({ dates: { ...(validBaseRecord()["dates"] as object), lastVerified: old } }),
    ];
    const report = audit(records, baselineOf(records));

    expect(report.stale).toHaveLength(1);
    expect(report.stale[0]?.ageDays).toBeGreaterThan(STALE_AFTER_DAYS);
    // A warning for a human, not a build failure: the fix is to re-verify or
    // demote the proof level, and neither is a decision the compiler can make.
    expect(report.issues).toEqual([]);
  });

  it("ignores a record that has never been verified", () => {
    const records = [
      record({ dates: { ...(validBaseRecord()["dates"] as object), lastVerified: null } }),
    ];
    expect(audit(records, baselineOf(records)).stale).toEqual([]);
  });
});

describe("taxonomy drift", () => {
  it("reports a term that is no longer used anywhere", () => {
    const before = [record({ complexity: "moderate" }), record({ id: "TST-02", slug: "tst-02" })];
    const after = [record({ id: "TST-02", slug: "tst-02" })];
    const report = audit(after, baselineOf(before));

    expect(report.taxonomyRemoved).toContain("complexity:moderate");
  });

  it("emits stable dimension:term pairs", () => {
    const terms = taxonomyTermsOf([record()]);
    expect(terms).toEqual([...terms].sort());
    expect(terms.every((t) => t.includes(":"))).toBe(true);
  });
});

describe("budget deltas", () => {
  it("reports a size change with its percentage", () => {
    const records = [record()];
    const report = auditCatalog({
      records,
      catalogHash: "sha256:current",
      artifacts: [{ id: "catalog-core.json", kb: 110 }],
      baseline: baselineOf(records),
      redirects: NO_REDIRECTS,
      now: NOW,
    });

    expect(report.budgetDeltas).toEqual([
      { id: "catalog-core.json", fromKb: 100, toKb: 110, deltaKb: 10, percent: 10 },
    ]);
  });

  it("says nothing when a size is unchanged", () => {
    const records = [record()];
    expect(audit(records, baselineOf(records)).budgetDeltas).toEqual([]);
  });
});
