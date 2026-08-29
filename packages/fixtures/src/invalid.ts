/**
 * Invalid-record corpus.
 *
 * Authority: PRD 11.1 ("Schema tests: valid/invalid fixtures for every field,
 * enum, cross-field rule, and schema migration"), 11.2 (Catalog release gate).
 *
 * Each case is a MINIMAL mutation of one valid base record, targeting exactly
 * one rule. The coverage test then asserts a bijection: every rule the schema
 * can enforce has a case, and every case actually trips the rule it claims.
 * Without the second half, a fixture that stopped triggering its rule would
 * still "pass" while silently testing nothing.
 *
 * EXEMPTIONS ARE EXPLICIT. Corpus rules need several records and pipeline rules
 * need build I/O, so neither can be expressed as a single invalid document.
 * They are listed below with the phase that owns them, rather than being
 * quietly dropped from the coverage count.
 */

import type { RuleId } from "@atlas/contracts/rules";
import { SCHEMA_VERSION } from "@atlas/contracts/project";

export interface InvalidCase {
  readonly ruleId: RuleId;
  /** What was mutated, for the failure message when a case stops working. */
  readonly mutation: string;
  readonly record: Record<string, unknown>;
}

/**
 * A minimal record that passes every rule. Every case below is this object with
 * exactly one thing wrong, so a failure names one rule rather than a cascade.
 */
export function validBaseRecord(): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "TST-01",
    slug: "baseline-valid-fixture-record",
    title: "Baseline Valid Fixture Record",
    summary:
      "A deliberately unremarkable record used as the mutation base for the invalid corpus, long enough to satisfy the eighty character minimum.",
    status: "planned",
    visibility: "private",
    tier: "focused-exhibit",
    proofLevel: "code",
    track: "quality-engineering",
    roles: ["backend-engineer"],
    domains: [],
    capabilities: [],
    complexity: "service",
    dates: { started: null, completed: null, lastVerified: null },
    ownership: { kind: "solo", responsibilities: [], collaborators: [] },
    stack: { languages: [], frameworks: [], data: [], infrastructure: [], ai: [], testing: [] },
    links: { canonical: "/projects/baseline-valid-fixture-record" },
    evidence: [],
    metrics: [],
    media: { gallery: [] },
    content: { problem: null, limitations: [] },
    search: { aliases: [], keywords: [], excludeFromSearch: false },
    layout: {
      cardVariant: "standard",
      accentToken: "slate",
      gridPriority: 50,
      spatialGroup: null,
      allowSpatialView: true,
    },
    integrity: {
      reviewedBy: "fixture",
      reviewedAt: null,
      contentHash: null,
      sourcePath: "fixtures/invalid/base.json",
    },
  };
}

/** Deep-clone helper so cases never share structure. */
function base(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(validBaseRecord())) as Record<string, unknown>;
}

function withPublicScaffold(): Record<string, unknown> {
  const record = base();
  record["visibility"] = "public";
  record["tagline"] = "A tagline of entirely adequate length for the schema bounds.";
  record["content"] = {
    problem:
      "A problem statement long enough to satisfy the forty character minimum imposed by the schema.",
    limitations: [],
  };
  record["media"] = {
    card: {
      src: "/media/base/card.avif",
      width: 800,
      height: 450,
      alt: "A descriptive alt text for the card image.",
      placeholder: false,
    },
    gallery: [],
  };
  record["evidence"] = [
    {
      id: "primary-evidence",
      type: "design-doc",
      title: "A design document with an adequate title",
      url: "/evidence/base/design",
      primary: true,
      verifiedAt: null,
      external: false,
    },
  ];
  record["selection"] = {
    dimensions: {
      roleRelevance: 20,
      engineeringDepth: 16,
      productionEvidence: 16,
      demoClarity: 12,
      differentiation: 8,
      portfolioReuse: 8,
    },
    score: 80,
    scoredAt: "2026-01-15",
  };
  return record;
}

function validMetric(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "metric-01",
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
    ...overrides,
  };
}

export function invalidCases(): InvalidCase[] {
  const cases: InvalidCase[] = [];
  const add = (
    ruleId: RuleId,
    mutation: string,
    mutate: (record: Record<string, unknown>) => void,
    scaffold: () => Record<string, unknown> = base,
  ): void => {
    const record = scaffold();
    mutate(record);
    cases.push({ ruleId, mutation, record });
  };

  // -- Structural -----------------------------------------------------------
  add("CAT-ID-001", "id uses a lowercase prefix", (r) => { r["id"] = "tst-01"; });
  add("CAT-SLUG-001", "slug has a trailing hyphen", (r) => {
    r["slug"] = "trailing-hyphen-";
    r["links"] = { canonical: "/projects/trailing-hyphen-" };
  });
  add("CAT-SCHEMA-001", "schemaVersion is 2", (r) => { r["schemaVersion"] = 2; });
  add("CAT-ADDL-001", "an unknown top-level property is present", (r) => {
    r["unreviewedField"] = "should be rejected";
  });
  add("CAT-LEN-TITLE-001", "title is 4 characters", (r) => { r["title"] = "Tiny"; });
  add("CAT-LEN-TAGLINE-001", "tagline is 5 characters", (r) => { r["tagline"] = "Short"; });
  add("CAT-LEN-SUMMARY-001", "summary is under 80 characters", (r) => {
    r["summary"] = "Far too short to be a summary.";
  });
  add("CAT-DATE-VALID-001", "started is 2026-02-30", (r) => {
    r["dates"] = { started: "2026-02-30", completed: null, lastVerified: null };
  });
  add("CAT-URL-HTTPS-001", "source link uses http on a public host", (r) => {
    r["links"] = {
      canonical: "/projects/baseline-valid-fixture-record",
      source: "http://github.com/example-owner/repo",
    };
  });
  add("CAT-URL-CANONICAL-001", "canonical path does not match the slug", (r) => {
    r["links"] = { canonical: "/projects/some-other-path" };
  });
  add("LNK-PLACEHOLDER-001", "live link points at example.invalid", (r) => {
    r["links"] = {
      canonical: "/projects/baseline-valid-fixture-record",
      live: "https://example.invalid/demo",
    };
  });
  add("MED-DIM-001", "card image omits intrinsic height", (r) => {
    r["media"] = {
      card: { src: "/media/base/card.avif", width: 800, alt: "Card", placeholder: false },
      gallery: [],
    };
  });
  add("MET-ENV-001", "metric omits environment", (r) => {
    const metric = validMetric();
    delete metric["environment"];
    r["metrics"] = [metric];
  });
  add("MET-DATE-001", "metric omits measuredAt", (r) => {
    const metric = validMetric();
    delete metric["measuredAt"];
    r["metrics"] = [metric];
  });
  add("MET-EVIDENCE-001", "metric omits evidenceUrl", (r) => {
    const metric = validMetric();
    delete metric["evidenceUrl"];
    r["metrics"] = [metric];
  });
  add("MET-SYNTHETIC-001", "metric omits the synthetic flag", (r) => {
    const metric = validMetric();
    delete metric["synthetic"];
    r["metrics"] = [metric];
  });

  // -- Cross-field ----------------------------------------------------------
  add("XFD-DATE-001", "completed precedes started", (r) => {
    r["dates"] = { started: "2026-06-01", completed: "2026-01-01", lastVerified: null };
  });
  add("XFD-DATE-002", "lastVerified precedes completed", (r) => {
    r["dates"] = { started: "2026-01-01", completed: "2026-06-01", lastVerified: "2026-03-01" };
  });
  add("XFD-PROOF-001", "proofLevel measured with no metric", (r) => {
    r["proofLevel"] = "measured";
    r["metrics"] = [];
  });
  add("XFD-PROOF-002", "externally-validated with no external evidence", (r) => {
    r["proofLevel"] = "externally-validated";
    r["metrics"] = [validMetric()];
    r["evidence"] = [
      {
        id: "internal-only",
        type: "benchmark",
        title: "An internal benchmark report",
        url: "/evidence/base/bench",
        primary: true,
        verifiedAt: null,
        external: false,
      },
    ];
  });
  add("XFD-FEAT-001", "featured.global true on a code-level exhibit", (r) => {
    r["featured"] = { global: true, roles: ["backend-engineer"], rank: 1 };
  });
  add("XFD-EVID-PRIMARY-001", "two evidence items marked primary", (r) => {
    r["evidence"] = [
      { id: "a", type: "adr", title: "First decision record", url: "/evidence/a", primary: true, verifiedAt: null, external: false },
      { id: "b", type: "adr", title: "Second decision record", url: "/evidence/b", primary: true, verifiedAt: null, external: false },
    ];
  });
  add("XFD-EVID-ID-001", "duplicate evidence ids", (r) => {
    r["evidence"] = [
      { id: "same", type: "adr", title: "First decision record", url: "/evidence/a", primary: true, verifiedAt: null, external: false },
      { id: "same", type: "adr", title: "Second decision record", url: "/evidence/b", primary: false, verifiedAt: null, external: false },
    ];
  });
  add("XFD-METRIC-ID-001", "duplicate metric ids", (r) => {
    r["metrics"] = [validMetric({ id: "dup" }), validMetric({ id: "dup" })];
  });

  // -- Publication gates (public scaffold) ----------------------------------
  add("XFD-PUB-001", "public record with no primary evidence", (r) => {
    r["evidence"] = [];
  }, withPublicScaffold);
  add("XFD-PUB-002", "public complete record with no inspectable link", (r) => {
    r["status"] = "complete";
    r["evidence"] = [];
  }, withPublicScaffold);
  add("XFD-PUB-TAGLINE-001", "public record without a tagline", (r) => {
    delete r["tagline"];
  }, withPublicScaffold);
  add("MED-ALT-001", "public card image has empty alt text", (r) => {
    (r["media"] as { card: Record<string, unknown> }).card["alt"] = "   ";
  }, withPublicScaffold);

  // -- Selection / promotion gates ------------------------------------------
  add("SEL-SCORE-001", "public keystone scoring below 85", (r) => {
    r["tier"] = "keystone";
  }, withPublicScaffold);
  add("SEL-SCORE-002", "public exhibit scoring below 70", (r) => {
    r["selection"] = {
      dimensions: {
        roleRelevance: 10, engineeringDepth: 10, productionEvidence: 10,
        demoClarity: 8, differentiation: 5, portfolioReuse: 5,
      },
      score: 48,
      scoredAt: "2026-01-15",
    };
  }, withPublicScaffold);
  add("SEL-SCORE-003", "declared score disagrees with its dimensions", (r) => {
    r["selection"] = {
      dimensions: {
        roleRelevance: 20, engineeringDepth: 16, productionEvidence: 16,
        demoClarity: 12, differentiation: 8, portfolioReuse: 8,
      },
      score: 95,
      scoredAt: "2026-01-15",
    };
  }, withPublicScaffold);

  return cases;
}

/**
 * Rules the single-record corpus cannot express, with the owner of each.
 *
 * The coverage test reads this list, so removing a rule from it without adding
 * a fixture fails the build - the exemption cannot rot into a silent gap.
 */
export const COVERAGE_EXEMPTIONS: Readonly<Record<string, string>> = {
  // Corpus layer: needs multiple records or the taxonomy.
  "TAX-UNKNOWN-001": "Needs the taxonomy. Covered: tests/catalog/corpus.test.ts.",
  "TAX-DEPRECATED-001": "Needs a deprecated term, and none exists yet. Enforced in the compiler taxonomy stage.",
  "TAX-TRACK-PREFIX-001": "Needs the track table. Covered: tests/catalog/compiler.test.ts.",
  "MET-UNIT-001": "Needs unit/category dimensions. Covered: tests/catalog/corpus.test.ts.",
  "COR-DUP-ID-001": "Needs two records. Covered: tests/catalog/compiler.test.ts.",
  "COR-DUP-SLUG-001": "Needs two records. Covered: tests/catalog/corpus.test.ts.",
  "COR-DUP-REPO-001": "Needs two records. Covered: tests/catalog/corpus.test.ts.",
  "COR-DUP-CASESTUDY-001": "Needs two records. Covered: tests/catalog/corpus.test.ts.",
  "COR-ID-PERMANENCE-001":
    "Needs a previous build to diff against, so no single-record fixture can reach it. Covered: tests/catalog/audit.test.ts.",
  "COR-SLUG-REDIRECT-001":
    "Needs a previous build and the redirect map. Covered: tests/catalog/audit.test.ts.",
  "COR-FEAT-RANK-001": "Needs two featured records. Covered: tests/catalog/corpus.test.ts.",
  "COR-FEAT-COUNT-001": "Needs six flagged records. Covered: tests/catalog/corpus.test.ts.",
  // The audit baseline now exists, but it does not reach this rule: the
  // compiler RECOMPUTES contentHash, enrichment and ordinals from source, so a
  // hand-edited value is silently overwritten rather than compared. Detecting
  // it needs the compiler to read the authored value first and diff it.
  "GEN-FIELD-001": "Needs the compiler to compare authored generated fields before overwriting them.",
  // Pipeline layer: needs build I/O.
  "LNK-INTERNAL-001": "Needs generated routes. Covered for site links: tests/web/export.test.ts. Evidence-artifact links await real evidence.",
  "LNK-EXTERNAL-001": "Needs network verification; scheduled job, Phase 5.",
  "GHE-CONFLICT-001": "Needs a GitHub response. Covered: tests/catalog/corpus.test.ts.",
  "GHE-OVERWRITE-001": "Structurally impossible: mergeEnrichment only ever returns objective fields. Covered: tests/catalog/corpus.test.ts.",
  "GHE-STALE-001": "Needs a timestamped cache. Covered: tests/catalog/corpus.test.ts.",
  "GHE-BUDGET-001": "Needs rate-limit headers. Covered: tests/catalog/corpus.test.ts.",
  "BLD-DETERMINISM-001": "Needs two builds. Covered: tests/catalog/compiler.test.ts and pnpm catalog:verify-deterministic.",
  "BLD-BUDGET-001": "Needs compressed artifact sizes. Covered: tests/catalog/compiler.test.ts budget assertions.",
  "BLD-SLO-001": "Timings are reported by the pipeline runner; the warning threshold lands with CI reference hardware in Phase 5.",
};
