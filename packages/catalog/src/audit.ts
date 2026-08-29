/**
 * Catalog audit.
 *
 * Authority: PRD 5.1.3 — "Produce an audit report listing additions, removals,
 * field changes, stale records, broken evidence, taxonomy changes, and budget
 * deltas." PRD 8.3 (ids are permanent after publication; a changed slug needs a
 * redirect). PRD 14 (metrics become stale; `lastVerified` exceeding policy is a
 * trigger to demote the proof level).
 *
 * WHY A COMMITTED BASELINE. Three rules — COR-ID-PERMANENCE-001,
 * COR-SLUG-REDIRECT-001 and GEN-FIELD-001 — are about how the catalog CHANGED,
 * which no single build can see. They were exempt from fixture coverage for
 * exactly that reason. A baseline snapshot committed to the repo gives the
 * build a previous state to compare against, so "this id used to exist and was
 * public" becomes a checkable fact rather than a promise for a later phase.
 *
 * The baseline is deliberately small: identity and the fields whose change
 * matters. It is not a copy of the catalog, so it does not double every diff.
 */

import { createHash } from "node:crypto";

import { canonicalJsonCompact } from "@atlas/contracts/canonical-json";
import { issue, type ValidationIssue } from "@atlas/contracts/rules";
import type { ProjectRecord } from "@atlas/contracts/project";

import { FACET_GROUPS, facetValuesFor } from "./stages/artifacts.js";

/** PRD 14: a record whose claims have not been re-checked in this long is stale. */
export const STALE_AFTER_DAYS = 180;

export interface BaselineRecord {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly visibility: string;
  readonly proofLevel: string;
  /** Fingerprint of the whole record, for detecting any field change. */
  readonly hash: string;
}

export interface BaselineArtifact {
  readonly id: string;
  readonly kb: number;
}

export interface Baseline {
  readonly version: 1;
  readonly catalogHash: string;
  readonly commitSha: string;
  readonly records: readonly BaselineRecord[];
  readonly artifacts: readonly BaselineArtifact[];
  /**
   * Every taxonomy term the catalog actually uses, as `dimension:term`.
   *
   * PRD 5.1.3 names "taxonomy changes" as an audit output. A term appearing or
   * vanishing changes what a visitor can filter by, and a vanished term
   * silently empties a facet that used to have results — worth seeing in a
   * diff even though it breaks no rule.
   */
  readonly taxonomyTerms: readonly string[];
}

/** slug -> current slug, for records whose slug has changed (PRD 10.4). */
export interface RedirectMap {
  readonly version: 1;
  readonly redirects: Readonly<Record<string, string>>;
}

export function fingerprint(record: ProjectRecord): string {
  return createHash("sha256")
    .update(canonicalJsonCompact(record), "utf8")
    .digest("hex")
    .slice(0, 16);
}

export function toBaselineRecord(record: ProjectRecord): BaselineRecord {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    visibility: record.visibility,
    proofLevel: record.proofLevel,
    hash: fingerprint(record),
  };
}

/** Every `dimension:term` pair the catalog uses, sorted and deduplicated. */
export function taxonomyTermsOf(records: readonly ProjectRecord[]): string[] {
  const terms = new Set<string>();
  for (const record of records) {
    for (const group of FACET_GROUPS) {
      for (const value of facetValuesFor(record, group)) {
        terms.add(`${group}:${value}`);
      }
    }
  }
  return [...terms].sort();
}

export function buildBaseline(
  records: readonly ProjectRecord[],
  catalogHash: string,
  commitSha: string,
  artifacts: readonly BaselineArtifact[],
): Baseline {
  return {
    version: 1,
    catalogHash,
    commitSha,
    records: [...records].map(toBaselineRecord).sort((a, b) => a.id.localeCompare(b.id)),
    artifacts: [...artifacts].sort((a, b) => a.id.localeCompare(b.id)),
    taxonomyTerms: taxonomyTermsOf(records),
  };
}

export interface FieldChange {
  readonly id: string;
  readonly field: string;
  readonly from: string;
  readonly to: string;
}

export interface BudgetDelta {
  readonly id: string;
  readonly fromKb: number;
  readonly toKb: number;
  readonly deltaKb: number;
  readonly percent: number;
}

export interface AuditReport {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly FieldChange[];
  readonly stale: readonly { id: string; lastVerified: string; ageDays: number }[];
  readonly taxonomyAdded: readonly string[];
  readonly taxonomyRemoved: readonly string[];
  readonly budgetDeltas: readonly BudgetDelta[];
  readonly issues: readonly ValidationIssue[];
  readonly baselineCatalogHash: string;
  readonly currentCatalogHash: string;
}

export interface AuditInput {
  readonly records: readonly ProjectRecord[];
  readonly catalogHash: string;
  readonly artifacts: readonly BaselineArtifact[];
  readonly baseline: Baseline | null;
  readonly redirects: RedirectMap;
  readonly now: Date;
}

/**
 * Compare the current catalog against the committed baseline.
 *
 * With no baseline (a first build) everything is an addition and nothing is an
 * error — the alternative would be failing every fresh clone.
 */
export function auditCatalog(input: AuditInput): AuditReport {
  const issues: ValidationIssue[] = [];
  const current = new Map(input.records.map((r) => [r.id, r]));
  const baselineRecords = new Map((input.baseline?.records ?? []).map((r) => [r.id, r]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: FieldChange[] = [];

  for (const [id, record] of current) {
    const before = baselineRecords.get(id);
    if (before === undefined) {
      added.push(id);
      continue;
    }

    const now = toBaselineRecord(record);

    /**
     * The tracked fields are compared DIRECTLY, never gated on the hash.
     *
     * An earlier version returned early when the hashes matched, on the
     * reasoning that identical hashes mean an identical record. That makes the
     * hash a single point of failure: a hand-edited baseline, a change to the
     * hash function, or a schema version that alters serialization all produce
     * a hash that no longer describes the fields beside it, and the audit then
     * reports "no change" over a renamed slug. Comparing four strings is free,
     * and it cannot go blind.
     */
    for (const field of ["slug", "title", "visibility", "proofLevel"] as const) {
      if (now[field] !== before[field]) {
        changed.push({ id, field, from: before[field], to: now[field] });
      }
    }

    // COR-SLUG-REDIRECT-001: a changed slug breaks every existing deep link
    // unless the old one still resolves.
    if (now.slug !== before.slug && input.redirects.redirects[before.slug] !== now.slug) {
      issues.push(
        issue(
          "COR-SLUG-REDIRECT-001",
          { filePath: record.integrity.sourcePath, pointer: "/slug", rejectedValue: now.slug },
          `Was '${before.slug}'. Add "${before.slug}": "${now.slug}" to content/redirects.v1.json.`,
        ),
      );
    }

    // The hash's remaining job: catch a change in a field nobody tracks by
    // name. Only reported when no named field already explains the difference,
    // so one edit does not produce two rows.
    if (now.hash !== before.hash && changed.find((c) => c.id === id) === undefined) {
      changed.push({ id, field: "(content)", from: before.hash, to: now.hash });
    }
  }

  for (const [id, before] of baselineRecords) {
    if (current.has(id)) continue;
    removed.push(id);

    // COR-ID-PERMANENCE-001: PRD 8.3 makes an id permanent once published.
    // Removing an unpublished record is ordinary editorial pruning.
    if (before.visibility === "public") {
      issues.push(
        issue(
          "COR-ID-PERMANENCE-001",
          { filePath: "content/projects", pointer: `/${id}`, rejectedValue: id },
          `'${id}' was published as '${before.slug}' and has been removed. Archive it with status 'archived' instead of deleting it.`,
        ),
      );
    }
  }

  // PRD 14: stale verification. A warning, not a failure — the response is to
  // re-verify or demote the proof level, both of which are human decisions.
  const stale: { id: string; lastVerified: string; ageDays: number }[] = [];
  for (const record of input.records) {
    const verified = record.dates.lastVerified;
    if (verified === null) continue;
    const ageDays = Math.floor(
      (input.now.getTime() - new Date(verified).getTime()) / (24 * 60 * 60 * 1000),
    );
    if (ageDays > STALE_AFTER_DAYS) {
      stale.push({ id: record.id, lastVerified: verified, ageDays });
    }
  }

  // Taxonomy drift. Only meaningful against a baseline: on a first build every
  // term is trivially "new", which says nothing.
  const currentTerms = taxonomyTermsOf(input.records);
  const baselineTerms = new Set(input.baseline?.taxonomyTerms ?? []);
  const taxonomyAdded =
    input.baseline === null ? [] : currentTerms.filter((t) => !baselineTerms.has(t));
  const currentTermSet = new Set(currentTerms);
  const taxonomyRemoved = [...baselineTerms].filter((t) => !currentTermSet.has(t)).sort();

  const baselineArtifacts = new Map((input.baseline?.artifacts ?? []).map((a) => [a.id, a.kb]));
  const budgetDeltas: BudgetDelta[] = [];
  for (const artifact of input.artifacts) {
    const before = baselineArtifacts.get(artifact.id);
    if (before === undefined || before === 0) continue;
    const deltaKb = Math.round((artifact.kb - before) * 10) / 10;
    if (deltaKb === 0) continue;
    budgetDeltas.push({
      id: artifact.id,
      fromKb: before,
      toKb: artifact.kb,
      deltaKb,
      percent: Math.round((deltaKb / before) * 1000) / 10,
    });
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort((a, b) => a.id.localeCompare(b.id) || a.field.localeCompare(b.field)),
    stale,
    taxonomyAdded,
    taxonomyRemoved,
    budgetDeltas: budgetDeltas.sort((a, b) => Math.abs(b.deltaKb) - Math.abs(a.deltaKb)),
    issues,
    baselineCatalogHash: input.baseline?.catalogHash ?? "(none)",
    currentCatalogHash: input.catalogHash,
  };
}

export function formatAudit(report: AuditReport): string {
  const lines: string[] = [];
  const section = (title: string, rows: readonly string[]): void => {
    if (rows.length === 0) return;
    lines.push(`\n${title} (${rows.length})`);
    for (const row of rows.slice(0, 25)) lines.push(`  ${row}`);
    if (rows.length > 25) lines.push(`  ... and ${rows.length - 25} more`);
  };

  lines.push(
    `baseline ${report.baselineCatalogHash.slice(0, 23)}`,
    `current  ${report.currentCatalogHash.slice(0, 23)}`,
  );

  if (
    report.added.length === 0 &&
    report.removed.length === 0 &&
    report.changed.length === 0 &&
    report.budgetDeltas.length === 0 &&
    report.stale.length === 0 &&
    report.taxonomyAdded.length === 0 &&
    report.taxonomyRemoved.length === 0
  ) {
    lines.push("\nNo change since the baseline.");
    return lines.join("\n");
  }

  section("Added", report.added);
  section("Removed", report.removed);
  section(
    "Changed",
    report.changed.map((c) => `${c.id} ${c.field}: ${c.from} -> ${c.to}`),
  );
  section(
    "Stale",
    report.stale.map((s) => `${s.id} last verified ${s.lastVerified} (${s.ageDays} days)`),
  );
  section("Taxonomy terms added", report.taxonomyAdded);
  section("Taxonomy terms no longer used", report.taxonomyRemoved);
  section(
    "Budget deltas",
    report.budgetDeltas.map(
      (d) => `${d.id} ${d.fromKb} -> ${d.toKb} KB (${d.deltaKb > 0 ? "+" : ""}${d.percent}%)`,
    ),
  );

  return lines.join("\n");
}
