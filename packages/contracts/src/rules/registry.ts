/**
 * Validation rule registry.
 *
 * Authority: PRD 5.1.3 (ingestion rejections), 5.1.6 (error reporting shape),
 * 8.3 (validation rules), and the promotion thresholds in
 * portfolio-project-selection.md ("Selection and promotion score").
 *
 * WHY THIS EXISTS. PRD 5.1.6 requires every invalid record to produce "file
 * path, JSON pointer, rule ID, rejected value, and suggested repair". A rule ID
 * is only meaningful if it is stable and enumerable, so every rejection in the
 * PRD is registered here exactly once. Two CI checks depend on that:
 *
 *   1. Coverage - every RuleId has at least one invalid fixture that triggers
 *      exactly it (mechanizes PRD 11.1's "invalid fixtures for every field,
 *      enum, cross-field rule").
 *   2. Traceability - every rule cites the PRD section it enforces, so a
 *      reviewer can confirm the contract matches the document.
 *
 * Rules are NOT edited to make tests pass (PRD 12.2). Changing a rule's
 * semantics requires an ADR and a fixture migration.
 */

/**
 * Where a rule can be enforced. This drives what the JSON Schema emitter can
 * and cannot express, which is a real constraint rather than an implementation
 * detail - see ADR 0003.
 */
export const RULE_LAYERS = [
  /** Shape, type, enum, regex, length. Expressible in JSON Schema 2020-12. */
  "structural",
  /**
   * Relationships between fields of ONE record. Partly expressible via
   * if/then/allOf; date ordering is not expressible at all and is Zod-only.
   */
  "cross-field",
  /** Relationships ACROSS records. Never expressible in JSON Schema. */
  "corpus",
  /** Build-time I/O: link reachability, media probing, enrichment, determinism. */
  "pipeline",
] as const;

export type RuleLayer = (typeof RULE_LAYERS)[number];

export type RuleSeverity = "error" | "warning";

export interface RuleDefinition {
  readonly id: string;
  readonly layer: RuleLayer;
  readonly severity: RuleSeverity;
  /** PRD section (or selection-doc heading) this rule enforces. */
  readonly source: string;
  /** What the rule asserts, in one sentence. */
  readonly summary: string;
  /** Actionable repair shown to the author. Never a restatement of `summary`. */
  readonly repair: string;
  /**
   * True when the rule cannot be represented in generated JSON Schema and is
   * therefore enforced by Zod refinements or corpus passes only. The
   * conformance test uses this to decide whether Ajv and Zod must agree.
   */
  readonly zodOnly?: boolean;
}

/**
 * PRD 5.1.6: the exact payload an invalid record must produce.
 * `pointer` is an RFC 6901 JSON Pointer into the source document.
 */
export interface ValidationIssue {
  readonly ruleId: RuleId;
  readonly severity: RuleSeverity;
  readonly filePath: string;
  readonly pointer: string;
  readonly rejectedValue: unknown;
  readonly message: string;
  readonly repair: string;
}

const defineRules = <const T extends readonly RuleDefinition[]>(rules: T): T => rules;

export const RULES = defineRules([
  // ---------------------------------------------------------------------------
  // CAT-* structural: shape, identifiers, lengths, formats. PRD 8.3.
  // ---------------------------------------------------------------------------
  {
    id: "CAT-ID-001",
    layer: "structural",
    severity: "error",
    source: "PRD 8.3",
    summary: "`id` must match ^[A-Z]{2,4}-[0-9]{2,4}$.",
    repair:
      "Use an uppercase track prefix and a zero-padded number, e.g. RAG-01. Prefixes come from content/taxonomy/tracks.v1.json.",
  },
  {
    id: "CAT-SLUG-001",
    layer: "structural",
    severity: "error",
    source: "PRD 8.3",
    summary: "`slug` must match ^[a-z0-9]+(?:-[a-z0-9]+)*$.",
    repair:
      "Lowercase, digits and single hyphens only; no leading, trailing or repeated hyphens. Derive it from the title.",
  },
  {
    id: "CAT-SCHEMA-001",
    layer: "structural",
    severity: "error",
    source: "PRD 8.3",
    summary: "`schemaVersion` must equal the current schema version.",
    repair:
      "Run the migration script for your record's version before validating. Records are never silently upgraded.",
  },
  {
    id: "CAT-ADDL-001",
    layer: "structural",
    severity: "error",
    source: "PRD 8.3",
    summary:
      "Unknown properties are rejected at every object boundary (additionalProperties: false).",
    repair:
      "Remove the property, or add it to the schema through a reviewed migration. Manifests cannot carry ad-hoc fields.",
  },
  {
    id: "CAT-LEN-TITLE-001",
    layer: "structural",
    severity: "error",
    source: "PRD 8.3",
    summary: "`title` must be 8-90 characters.",
    repair: "Name the system, not the category. Move qualifiers into `tagline` or `summary`.",
  },
  {
    id: "CAT-LEN-TAGLINE-001",
    layer: "structural",
    severity: "error",
    source: "PRD 8.3",
    summary: "`tagline`, when present, must be 20-160 characters.",
    repair:
      "State one hard claim. If you cannot state it yet, omit the field rather than padding it.",
  },
  {
    id: "CAT-LEN-SUMMARY-001",
    layer: "structural",
    severity: "error",
    source: "PRD 8.3",
    summary: "`summary` must be 80-320 characters.",
    repair:
      "Describe the problem and the system in two or three clauses. Do not restate the title, and do not paste the case study.",
  },
  {
    id: "CAT-DATE-VALID-001",
    layer: "structural",
    severity: "error",
    source: "PRD 8.3",
    summary: "A date field has valid ISO shape but is not a real calendar date.",
    repair:
      "Correct the day or month, e.g. 2026-02-30 does not exist. JSON Schema can check the pattern but not the calendar, so this rule is Zod-only.",
    zodOnly: true,
  },
  {
    id: "CAT-URL-HTTPS-001",
    layer: "structural",
    severity: "error",
    source: "PRD 8.3",
    summary: "Remote links must use HTTPS, except explicit localhost fixtures.",
    repair: "Replace the http:// URL with https://, or mark it as a localhost fixture link.",
  },
  {
    id: "CAT-URL-CANONICAL-001",
    layer: "structural",
    severity: "error",
    source: "PRD 8.3 / 6.1",
    summary: "`links.canonical` must be the site-relative path /projects/{slug}.",
    repair:
      "Set links.canonical to /projects/ followed by this record's slug. PRD 0.3 makes the dedicated URL mandatory and canonical.",
    zodOnly: true,
  },

  // ---------------------------------------------------------------------------
  // MED-* media. PRD 5.1.3.
  // ---------------------------------------------------------------------------
  {
    id: "MED-DIM-001",
    layer: "structural",
    severity: "error",
    source: "PRD 5.1.3 / 9.6",
    summary: "Every image record must declare intrinsic width and height.",
    repair:
      "Add width and height in pixels. PRD 9.3 budgets zero layout shift from project media, which requires reserved geometry.",
  },
  {
    id: "MED-ALT-001",
    layer: "cross-field",
    severity: "error",
    source: "PRD 5.1.3 / 10.1",
    summary: "A public project's card and hero images must have non-empty alt text.",
    repair:
      "Describe what the image shows, not that it is a screenshot. Empty alt is only valid for decorative media, which a card image is not.",
    zodOnly: true,
  },

  // ---------------------------------------------------------------------------
  // MET-* metric truth. PRD 5.1.3, 0.10, 3.3.
  // ---------------------------------------------------------------------------
  {
    id: "MET-ENV-001",
    layer: "structural",
    severity: "error",
    source: "PRD 5.1.3",
    summary: "Every metric must declare `environment`.",
    repair:
      "State the hardware, load profile, dataset and duration. A number without its environment is not evidence.",
  },
  {
    id: "MET-DATE-001",
    layer: "structural",
    severity: "error",
    source: "PRD 5.1.3",
    summary: "Every metric must declare `measuredAt`.",
    repair: "Add the ISO 8601 timestamp of the measurement run.",
  },
  {
    id: "MET-EVIDENCE-001",
    layer: "structural",
    severity: "error",
    source: "PRD 5.1.3",
    summary: "Every metric must declare `evidenceUrl`.",
    repair: "Link the raw result file, report, or run log that produced this number.",
  },
  {
    id: "MET-SYNTHETIC-001",
    layer: "structural",
    severity: "error",
    source: "PRD 0.10 / 5.1.3",
    summary: "Every metric must declare an explicit boolean `synthetic` status.",
    repair:
      "Set synthetic: true for benchmark and simulated load results, false only for measurements taken against real traffic. Never omit it.",
  },
  {
    id: "MET-UNIT-001",
    // Corpus layer, not cross-field: deciding whether "ms" suits a "latency"
    // metric requires the unit and category vocabularies, which the record
    // itself does not carry. Enforced by the taxonomy-aware validation pass.
    layer: "corpus",
    severity: "error",
    source: "PRD 5.3.1",
    summary: "A metric's `unit` must belong to a dimension compatible with its `category`.",
    repair:
      "Numeric comparison requires compatible units. Use a unit from content/taxonomy/metrics.v1.json whose dimension is accepted by the metric's category.",
    zodOnly: true,
  },

  // ---------------------------------------------------------------------------
  // XFD-* cross-field, single record. PRD 8.3.
  // ---------------------------------------------------------------------------
  {
    id: "XFD-DATE-001",
    layer: "cross-field",
    severity: "error",
    source: "PRD 8.3",
    summary: "`dates.completed` cannot precede `dates.started`.",
    repair: "Correct whichever date is wrong. A project cannot finish before it begins.",
    zodOnly: true,
  },
  {
    id: "XFD-DATE-002",
    layer: "cross-field",
    severity: "error",
    source: "PRD 8.3",
    summary: "`dates.lastVerified` cannot precede `dates.completed` when completed is present.",
    repair:
      "Re-verify the project and update lastVerified, or correct the completed date. Verification happens after completion.",
    zodOnly: true,
  },
  {
    id: "XFD-PROOF-001",
    layer: "cross-field",
    severity: "error",
    source: "PRD 8.3",
    summary: "proofLevel `measured` requires at least one metric carrying evidence.",
    repair:
      "Add a metric with environment, measuredAt, evidenceUrl and synthetic status, or lower proofLevel to `live` or `code`.",
    zodOnly: true,
  },
  {
    id: "XFD-PROOF-002",
    layer: "cross-field",
    severity: "error",
    source: "PRD 8.3",
    summary:
      "proofLevel `externally-validated` requires at least one evidence item with external: true.",
    repair:
      "Link the upstream acceptance, third-party audit, or external publication. Self-published reports are not external validation.",
    zodOnly: true,
  },
  {
    id: "XFD-FEAT-001",
    layer: "cross-field",
    severity: "error",
    source: "PRD 8.3",
    summary:
      "`featured.global: true` requires tier `flagship`, proofLevel `measured` or better, and a non-placeholder card image.",
    repair:
      "A flagship is a finished, measured system with real media. Until it is, leave featured.global false; intent belongs in the track's flagship rotation, not on the record.",
    zodOnly: true,
  },
  {
    id: "XFD-PUB-001",
    layer: "cross-field",
    severity: "error",
    source: "PRD 5.1.3",
    summary:
      "A public project must have summary, roles, proofLevel, status, a primary evidence item, image alt text, and a canonical URL.",
    repair:
      "Complete the missing fields, or set visibility to `private` until the work has evidence. Publication is an editorial act, not a default.",
    zodOnly: true,
  },
  {
    id: "XFD-PUB-002",
    layer: "cross-field",
    severity: "error",
    source: "PRD 8.3",
    summary:
      "A public `complete` or `maintained` project requires at least one evidence item and at least one source, live, or case-study link.",
    repair:
      "Link the repository, the running system, or the written case study. A finished project with nothing to inspect cannot be published.",
    zodOnly: true,
  },
  {
    id: "XFD-PUB-TAGLINE-001",
    layer: "cross-field",
    severity: "error",
    source: "PRD 6.3 / 8.3",
    summary: "A public project must have a `tagline`.",
    repair:
      "Write the one hard claim the project supports. The field is optional for planned and private records precisely so it is never fabricated.",
    zodOnly: true,
  },
  {
    id: "XFD-EVID-PRIMARY-001",
    layer: "cross-field",
    severity: "error",
    source: "PRD 6.3",
    summary: "At most one evidence item may be marked `primary: true`.",
    repair:
      "Pick the single strongest artifact as primary. The detail route leads with it; a tie means the ordering is undefined.",
    zodOnly: true,
  },
  {
    id: "XFD-EVID-ID-001",
    layer: "cross-field",
    severity: "error",
    source: "PRD 8.1",
    summary: "Evidence `id` values must be unique within a record.",
    repair: "Rename the duplicate. Evidence IDs are anchors for deep links into the detail page.",
    zodOnly: true,
  },
  {
    id: "XFD-METRIC-ID-001",
    layer: "cross-field",
    severity: "error",
    source: "PRD 8.1",
    summary: "Metric `id` values must be unique within a record.",
    repair: "Rename the duplicate so each measurement is addressable.",
    zodOnly: true,
  },

  // ---------------------------------------------------------------------------
  // SEL-* promotion gates. portfolio-project-selection.md.
  // ---------------------------------------------------------------------------
  {
    id: "SEL-SCORE-001",
    layer: "cross-field",
    severity: "error",
    source: "portfolio-project-selection.md, Selection and promotion score",
    summary:
      "A public `keystone` or `flagship` record must carry a selection score of at least 85/100.",
    repair:
      "Score the project across the six dimensions before promoting it. If it scores below 85 it is a focused exhibit, not a keystone.",
    zodOnly: true,
  },
  {
    id: "SEL-SCORE-002",
    layer: "cross-field",
    severity: "error",
    source: "portfolio-project-selection.md, Selection and promotion score",
    summary: "A public `focused-exhibit` or `case-study` record must score at least 70/100.",
    repair:
      "Below 70 the project does not earn a public card. Strengthen the evidence or leave it private.",
    zodOnly: true,
  },
  {
    id: "SEL-SCORE-003",
    layer: "cross-field",
    severity: "error",
    source: "portfolio-project-selection.md, Selection and promotion score",
    summary: "`selection.score` must equal the sum of its six dimension scores.",
    repair:
      "Recompute: roleRelevance(25) + engineeringDepth(20) + productionEvidence(20) + demoClarity(15) + differentiation(10) + portfolioReuse(10).",
    zodOnly: true,
  },

  // ---------------------------------------------------------------------------
  // TAX-* controlled vocabularies. PRD 5.1.3, 8.3.
  // ---------------------------------------------------------------------------
  {
    id: "TAX-UNKNOWN-001",
    layer: "corpus",
    severity: "error",
    source: "PRD 5.1.3 / 8.3",
    summary:
      "Facet values must exist in the versioned vocabulary for their group (languages, frameworks, capabilities, domains, evidence types, metric categories, accent tokens, tracks).",
    repair:
      "Use an existing vocabulary entry or its alias. Adding a term is a reviewed taxonomy change, not a manifest edit.",
  },
  {
    id: "TAX-DEPRECATED-001",
    layer: "corpus",
    severity: "warning",
    source: "PRD 5.1.3",
    summary: "A referenced vocabulary term is deprecated.",
    repair: "Migrate to the term named in the vocabulary entry's `deprecated.replacedBy`.",
  },
  {
    id: "TAX-TRACK-PREFIX-001",
    layer: "corpus",
    severity: "error",
    source: "portfolio-project-selection.md, track structure",
    summary: "A record's `id` prefix must match the ID prefix declared by its `track`.",
    repair:
      "Either correct the track or renumber the record. RAG-07 cannot belong to the systems track.",
  },

  // ---------------------------------------------------------------------------
  // COR-* corpus uniqueness and continuity. PRD 5.1.3, 8.3.
  // ---------------------------------------------------------------------------
  {
    id: "COR-DUP-ID-001",
    layer: "corpus",
    severity: "error",
    source: "PRD 5.1.3",
    summary: "Duplicate `id` across the catalog.",
    repair: "IDs are permanent and unique. Renumber the newer record.",
  },
  {
    id: "COR-DUP-SLUG-001",
    layer: "corpus",
    severity: "error",
    source: "PRD 5.1.3",
    summary: "Duplicate `slug` across the catalog.",
    repair: "Slugs are the canonical URL. Disambiguate the newer record's slug.",
  },
  {
    id: "COR-DUP-REPO-001",
    layer: "corpus",
    severity: "error",
    source: "PRD 5.1.3",
    summary: "Duplicate canonical repository URL across the catalog.",
    repair:
      "Two cards cannot claim the same repository root. Point subprojects at their directory or package path, per the selection document's monorepo topology.",
  },
  {
    id: "COR-DUP-CASESTUDY-001",
    layer: "corpus",
    severity: "error",
    source: "PRD 5.1.3",
    summary: "Duplicate case-study URL across the catalog.",
    repair: "Each case study belongs to exactly one project record.",
  },
  {
    id: "COR-ID-PERMANENCE-001",
    layer: "corpus",
    severity: "error",
    source: "PRD 8.3",
    summary: "A published `id` was removed or reassigned.",
    repair:
      "IDs are permanent after publication. Restore the record, or archive it with status `archived` rather than deleting it.",
  },
  {
    id: "COR-SLUG-REDIRECT-001",
    layer: "corpus",
    severity: "error",
    source: "PRD 8.3 / 10.4",
    summary: "A slug changed without a generated redirect from the previous value.",
    repair:
      "Add the old slug to the redirect map so existing deep links and search-engine results keep resolving.",
  },
  {
    id: "COR-FEAT-RANK-001",
    layer: "corpus",
    severity: "error",
    source: "PRD 8.1 / 6.2",
    summary: "`featured.rank` must be unique among globally featured projects.",
    repair: "The home page shows five ordered flagships. Two projects cannot hold the same rank.",
  },
  {
    id: "COR-FEAT-COUNT-001",
    layer: "corpus",
    severity: "error",
    source: "PRD 6.2 / 3.1",
    summary: "At most five projects may be globally featured.",
    repair:
      "The home page leads with exactly five proofs. Demote the extra record or rotate it out of the pin set.",
  },

  // ---------------------------------------------------------------------------
  // GEN-* generated-field protection. PRD 8.3.
  // ---------------------------------------------------------------------------
  {
    id: "GEN-FIELD-001",
    layer: "corpus",
    severity: "error",
    source: "PRD 8.3",
    summary:
      "A generated field (contentHash, GitHub enrichment, derived facets, ordinals, media variants, index records) was hand-edited.",
    repair:
      "Revert the field and re-run the owning generator. CI verifies a clean regeneration diff; hand edits are lost on the next build.",
  },

  // ---------------------------------------------------------------------------
  // LNK-* link integrity. PRD 5.1.3, 8.3.
  // ---------------------------------------------------------------------------
  {
    id: "LNK-INTERNAL-001",
    layer: "pipeline",
    severity: "error",
    source: "PRD 5.1.3",
    summary: "An internal link does not resolve to a generated route or evidence artifact.",
    repair:
      "Fix the path or generate the missing artifact. Internal links are verified on every build.",
  },
  {
    id: "LNK-EXTERNAL-001",
    layer: "pipeline",
    severity: "warning",
    source: "PRD 5.1.3",
    summary: "An external link failed scheduled verification.",
    repair:
      "Confirm the destination still exists. Known anti-bot responses belong on the allowlist rather than being silenced globally.",
  },
  {
    id: "LNK-PLACEHOLDER-001",
    layer: "structural",
    severity: "error",
    source: "PRD 8.3",
    summary:
      "A placeholder domain (example.com, example.invalid, localhost) appears in a production build.",
    repair:
      "Replace it with the real destination, or keep the record private until the destination exists.",
    zodOnly: true,
  },

  // ---------------------------------------------------------------------------
  // GHE-* GitHub enrichment. PRD 5.1.1, 5.1.4.
  // ---------------------------------------------------------------------------
  {
    id: "GHE-CONFLICT-001",
    layer: "pipeline",
    severity: "warning",
    source: "PRD 5.1.1",
    summary: "GitHub and the manifest disagree on a factual field.",
    repair:
      "A human resolves the conflict. The manifest value is preserved until then - GitHub enriches the catalog, it does not own it.",
  },
  {
    id: "GHE-OVERWRITE-001",
    layer: "pipeline",
    severity: "error",
    source: "PRD 5.1.1",
    summary:
      "Enrichment attempted to overwrite a curated field (title, summary, role, proof level, metric, display order, visibility).",
    repair:
      "Restrict enrichment to the objective field allowlist in PRD 5.1.4. Curated fields are human-owned by definition.",
  },
  {
    id: "GHE-STALE-001",
    layer: "pipeline",
    severity: "error",
    source: "PRD 5.1.4",
    summary: "Cached enrichment is older than 7 days and the API budget is exhausted.",
    repair:
      "Fail the production build rather than publishing stale repository facts. Restore API budget or refresh the cache.",
  },
  {
    id: "GHE-BUDGET-001",
    layer: "pipeline",
    severity: "error",
    source: "PRD 5.1.4",
    summary: "Remaining GitHub API budget fell below 10 percent; enrichment aborted.",
    repair:
      "Wait for the rate-limit reset. Publish from a cache younger than 7 days, or defer the build.",
  },

  // ---------------------------------------------------------------------------
  // BLD-* build integrity. PRD 5.1.3, 5.1.6.
  // ---------------------------------------------------------------------------
  {
    id: "BLD-DETERMINISM-001",
    layer: "pipeline",
    severity: "error",
    source: "PRD 5.1.3",
    summary: "Two builds from identical normalized inputs produced different bytes.",
    repair:
      "Find the nondeterminism: wall-clock timestamps, Math.random, unsorted object keys, locale-sensitive sorting, or platform line endings.",
  },
  {
    id: "BLD-BUDGET-001",
    layer: "pipeline",
    severity: "error",
    source: "PRD 5.1.5 / 9.4",
    summary: "A generated artifact exceeded its compressed transfer budget.",
    repair:
      "Reduce the payload. PRD 12.2 forbids raising the budget to make the check pass; the effect is removed, not excused.",
  },
  {
    id: "BLD-SLO-001",
    layer: "pipeline",
    severity: "warning",
    source: "PRD 5.1.6",
    summary: "A build stage exceeded its service-level objective.",
    repair:
      "Profile the stage. Warm incremental builds target 30s, full 1,300-project builds 120s, cold builds 5 minutes.",
  },
] as const);

export type RuleId = (typeof RULES)[number]["id"];

/**
 * Widened view of RULES.
 *
 * `defineRules` narrows each entry to its literal shape so that RuleId is a
 * precise union - but that also means entries omitting the optional `zodOnly`
 * have no such property at the type level. Iterate this view whenever you need
 * to read optional fields; use RULES only for the RuleId type.
 */
export const RULE_LIST: readonly RuleDefinition[] = RULES;

const RULE_INDEX: ReadonlyMap<string, RuleDefinition> = new Map(
  RULE_LIST.map((rule) => [rule.id, rule]),
);

export const RULE_IDS: readonly RuleId[] = RULES.map((rule) => rule.id);

export function getRule(id: RuleId): RuleDefinition {
  const rule = RULE_INDEX.get(id);
  if (rule === undefined) {
    throw new Error(`Unknown rule id: ${id}`);
  }
  return rule;
}

export function isRuleId(value: string): value is RuleId {
  return RULE_INDEX.has(value);
}

export function rulesByLayer(layer: RuleLayer): readonly RuleDefinition[] {
  return RULE_LIST.filter((rule) => rule.layer === layer);
}

/** Rules the JSON Schema emitter cannot represent; Zod or corpus passes own them. */
export function zodOnlyRules(): readonly RuleDefinition[] {
  return RULE_LIST.filter((rule) => rule.zodOnly === true);
}

/**
 * Extract the rule id a Zod issue carries.
 *
 * Refinements attach `{ ruleId }` via the custom issue's `params`, but `params`
 * is not on Zod's base issue type - only custom issues have it. This narrows
 * once, here, so no caller needs an inline cast.
 */
export function ruleIdFromIssue(issue: unknown): RuleId | null {
  if (typeof issue !== "object" || issue === null) return null;
  const params = (issue as { params?: unknown }).params;
  if (typeof params !== "object" || params === null) return null;
  const candidate = (params as { ruleId?: unknown }).ruleId;
  return typeof candidate === "string" && isRuleId(candidate) ? candidate : null;
}

/**
 * Build a PRD 5.1.6-shaped issue. Callers supply the location and the offending
 * value; the message and repair come from the registry so wording stays
 * consistent across the compiler, the CLI, and the audit report.
 */
export function issue(
  ruleId: RuleId,
  location: { filePath: string; pointer: string; rejectedValue: unknown },
  detail?: string,
): ValidationIssue {
  const rule = getRule(ruleId);
  return {
    ruleId,
    severity: rule.severity,
    filePath: location.filePath,
    pointer: location.pointer,
    rejectedValue: location.rejectedValue,
    message: detail === undefined ? rule.summary : `${rule.summary} ${detail}`,
    repair: rule.repair,
  };
}
