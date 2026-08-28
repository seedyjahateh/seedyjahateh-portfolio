/**
 * Build-time content access.
 *
 * TEMPORARY BY DESIGN — see ADR 0023.
 *
 * Phase 2's compiler (task ATLAS-001) is what actually owns catalog
 * compilation: it emits `catalog-core.{hash}.json`, facet dictionaries,
 * bitsets, and detail payloads with content hashes and budgets. Phase 1 must
 * not build any of that, and must not touch `packages/catalog/**`, which
 * ATLAS-001 owns under PRD 12.2.
 *
 * So this module is the seam. It reads reviewed manifests directly, validates
 * them through the SAME `projectSchema` the pipeline will use, and exposes the
 * few queries the static routes need. When Phase 2 lands, only this file is
 * replaced by an artifact loader; the routes above it do not change.
 *
 * Everything here runs at build time. None of it reaches the browser.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { projectSchema, type ProjectRecord } from "@atlas/contracts/project";
import { ruleIdFromIssue } from "@atlas/contracts/rules";
import { loadTaxonomy, loadTracks, trackByPrefix, type TrackInfo } from "@atlas/taxonomy";

import { filterDetailPages, filterIndexed, filterPublished, isInSitemap } from "./visibility";

/** PRD 5.4.2: the semantic fallback paginates at 50 per page. */
export const PROJECTS_PER_PAGE = 50;

const CONTENT_DIR = join(process.cwd(), "..", "..", "content", "projects");

let cached: ProjectRecord[] | null = null;

/**
 * Load and validate every manifest.
 *
 * A record that fails validation is a build failure, not a skip. PRD 5.1.6
 * requires the file path, JSON pointer, rule id and a repair, so the message
 * carries all four rather than a bare "invalid".
 */
export function loadAllProjects(): ProjectRecord[] {
  if (cached !== null) return cached;

  const files = readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const projects: ProjectRecord[] = [];
  const problems: string[] = [];

  for (const file of files) {
    const raw: unknown = JSON.parse(readFileSync(join(CONTENT_DIR, file), "utf8"));
    const result = projectSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const rule = ruleIdFromIssue(issue);
        problems.push(
          `content/projects/${file} /${issue.path.join("/")}: ${issue.message}` +
            (rule === null ? "" : ` [${rule}]`),
        );
      }
      continue;
    }
    projects.push(result.data);
  }

  if (problems.length > 0) {
    throw new Error(
      `${problems.length} invalid project manifest(s); the build cannot continue:\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
  }

  cached = projects;
  return projects;
}

/** Records that get a detail route: public and unlisted. */
export function getRoutedProjects(): ProjectRecord[] {
  return filterDetailPages(loadAllProjects());
}

/**
 * Records listed in the site's own atlas — navigation, including the roadmap.
 * Keystones first, then curated priority, then id for a stable order.
 */
export function getIndexedProjects(): ProjectRecord[] {
  return filterIndexed(loadAllProjects()).sort(
    (a, b) => b.layout.gridPriority - a.layout.gridPriority || a.id.localeCompare(b.id),
  );
}

/**
 * Records that have cleared the publication gates.
 *
 * Used everywhere the site asserts something: flagships, the proof bar, and
 * role-page evidence. Keeping this separate from the atlas listing is what
 * stops planned work from ever being counted as proof.
 */
export function getPublishedProjects(): ProjectRecord[] {
  return filterPublished(loadAllProjects());
}

export function getSitemapProjects(): ProjectRecord[] {
  return loadAllProjects().filter(isInSitemap);
}

export function getProjectBySlug(slug: string): ProjectRecord | null {
  return getRoutedProjects().find((p) => p.slug === slug) ?? null;
}

export function totalIndexPages(): number {
  // Always at least one page, so /projects renders its empty state rather
  // than 404ing when nothing is public yet.
  return Math.max(1, Math.ceil(getIndexedProjects().length / PROJECTS_PER_PAGE));
}

export function getIndexPage(page: number): ProjectRecord[] {
  const start = (page - 1) * PROJECTS_PER_PAGE;
  return getIndexedProjects().slice(start, start + PROJECTS_PER_PAGE);
}

/**
 * Projects for one role lens, strongest evidence first.
 *
 * PRD 5.2.3's ordering principle applied to editorial listing: proof level
 * dominates, then curated grid priority, then id for a stable tie-break so the
 * build stays deterministic (PRD 5.1.3).
 */
const PROOF_RANK: Readonly<Record<string, number>> = {
  "externally-validated": 3,
  measured: 2,
  live: 1,
  code: 0,
};

export function getProjectsForRole(role: string): ProjectRecord[] {
  return getPublishedProjects()
    .filter((p) => (p.roles as readonly string[]).includes(role))
    .sort(
      (a, b) =>
        (PROOF_RANK[b.proofLevel] ?? 0) - (PROOF_RANK[a.proofLevel] ?? 0) ||
        b.layout.gridPriority - a.layout.gridPriority ||
        a.id.localeCompare(b.id),
    );
}

/** Globally featured projects, rank order. PRD 6.2 item 3: at most five. */
export function getFlagships(): ProjectRecord[] {
  return getPublishedProjects()
    .filter((p) => p.featured?.global === true)
    .sort((a, b) => (a.featured?.rank ?? 99) - (b.featured?.rank ?? 99))
    .slice(0, 5);
}

/**
 * The proof bar counts from PRD 6.2 item 4.
 *
 * Deliberately NOT commit counts or line counts - PRD 6.2 forbids that "flex"
 * explicitly, and PRD 15 repeats it. These count evidence artifacts that exist.
 */
export interface ProofCounts {
  readonly productionSystems: number;
  readonly measuredReports: number;
  readonly acceptedContributions: number;
  readonly reliabilityArtifacts: number;
  readonly securityAndAccessibility: number;
}

export function getProofCounts(): ProofCounts {
  const indexed = getPublishedProjects();
  const evidenceOfType = (types: readonly string[]): number =>
    indexed.filter((p) => p.evidence.some((e) => types.includes(e.type))).length;

  return {
    productionSystems: indexed.filter(
      (p) => p.links.live != null && (p.status === "complete" || p.status === "maintained"),
    ).length,
    measuredReports: indexed.filter((p) => p.metrics.length > 0).length,
    acceptedContributions: evidenceOfType(["upstream-contribution"]),
    reliabilityArtifacts: evidenceOfType(["postmortem", "runbook", "slo"]),
    securityAndAccessibility: evidenceOfType(["threat-model", "accessibility-report"]),
  };
}

/** True when every proof count is zero, so the bar is omitted entirely. */
export function proofBarIsEmpty(counts: ProofCounts): boolean {
  return Object.values(counts).every((n) => n === 0);
}

export interface TrackSummary {
  readonly track: TrackInfo;
  readonly total: number;
  readonly published: number;
}

/**
 * Track structure for the index empty state.
 *
 * Shows the 16 tracks as the shape of the work. `total` counts every manifest
 * including private ones; `published` counts only what is actually visible, so
 * the two can never be conflated into an achievement claim.
 */
export function getTrackSummaries(): TrackSummary[] {
  const all = loadAllProjects();
  const published = new Set(getPublishedProjects().map((p) => p.id));
  const tracks = loadTracks(loadTaxonomy());
  const byPrefix = trackByPrefix(tracks);

  return tracks.map((track) => {
    const members = all.filter((p) => byPrefix.get(p.id.split("-")[0] ?? "")?.id === track.id);
    return {
      track,
      total: members.length,
      published: members.filter((p) => published.has(p.id)).length,
    };
  });
}
