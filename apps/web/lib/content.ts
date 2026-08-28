/**
 * Build-time content access.
 *
 * Reads the artifacts produced by `@atlas/catalog` (Phase 2), replacing the
 * direct manifest reads Phase 1 used. ADR 0023 promised this swap and named the
 * exported signatures as the contract; they are unchanged, which is why the
 * Phase 1 export and end-to-end suites still pass untouched.
 *
 * WHY THIS READS DETAIL PAYLOADS RATHER THAN catalog-core.
 *
 * `catalog-core.{hash}.json` exists for the CLIENT: PRD 0.7 says the initial
 * route receives a compact card catalog rather than full records, and PRD 9.5
 * has it store dictionary ids instead of repeated strings. None of that helps
 * static generation, which runs on a build machine with no transfer budget and
 * needs the full record to render a detail page. So the build reads the
 * per-project payloads, and catalog-core is left for the Phase 3 catalog engine
 * that actually ships to the browser.
 *
 * WHY THERE IS NO VALIDATION HERE. The compiler already validated every record
 * against `projectSchema` and refused to publish on any error. Re-validating
 * would be slower, would duplicate the definition of validity, and — the point
 * that matters — would keep a runtime import of TypeScript source from a
 * sibling package, which is exactly what forced the `--webpack` pin. Types are
 * erased, so `import type` costs nothing at runtime and Turbopack works again.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { ProjectRecord } from "@atlas/contracts/project";
import type { TrackInfo } from "@atlas/taxonomy";

import { filterDetailPages, filterIndexed, filterPublished, isInSitemap } from "./visibility";

/** PRD 5.4.2: the semantic fallback paginates at 50 per page. */
export const PROJECTS_PER_PAGE = 50;

/** Next runs the build with cwd at the app root. */
const CATALOG_DIR = join(process.cwd(), "public", "catalog");
const PROJECTS_DIR = join(CATALOG_DIR, "projects");

interface CatalogManifest {
  readonly catalogHash: string;
  readonly builtAt: string;
  readonly commitSha: string;
  readonly counts: { public: number; unlisted: number; total: number; featured: number };
}

let cachedProjects: ProjectRecord[] | null = null;
let cachedManifest: CatalogManifest | null = null;

function missingCatalog(): never {
  throw new Error(
    "No compiled catalog found at apps/web/public/catalog.\n" +
      "Run `pnpm catalog:build` first — the site consumes compiler output, not raw manifests.\n" +
      "(`pnpm --filter @atlas/web build` does this automatically via its prebuild script.)",
  );
}

export function loadManifest(): CatalogManifest {
  if (cachedManifest !== null) return cachedManifest;
  const path = join(CATALOG_DIR, "manifest.json");
  if (!existsSync(path)) missingCatalog();
  cachedManifest = JSON.parse(readFileSync(path, "utf8")) as CatalogManifest;
  return cachedManifest;
}

/**
 * Every record the compiler published.
 *
 * Private records are absent by construction — the compiler does not emit a
 * payload for them — so the site cannot accidentally render one.
 */
export function loadAllProjects(): ProjectRecord[] {
  if (cachedProjects !== null) return cachedProjects;
  if (!existsSync(PROJECTS_DIR)) missingCatalog();

  cachedProjects = readdirSync(PROJECTS_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(PROJECTS_DIR, file), "utf8")) as ProjectRecord);

  return cachedProjects;
}

/** Records that get a detail route: public and unlisted. */
export function getRoutedProjects(): ProjectRecord[] {
  return filterDetailPages(loadAllProjects());
}

/**
 * Records listed in the site's own atlas — navigation, including the roadmap.
 * Ordered exactly as the compiler ordered them (ADR 0025), so the ordinals in
 * catalog-core line up with what the page shows.
 */
export function getIndexedProjects(): ProjectRecord[] {
  return filterIndexed(loadAllProjects()).sort(
    (a, b) => b.layout.gridPriority - a.layout.gridPriority || a.id.localeCompare(b.id),
  );
}

/**
 * Records that have cleared the publication gates.
 *
 * Used wherever the site asserts something: flagships, the proof bar, and
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
  // than 404ing when nothing is published yet.
  return Math.max(1, Math.ceil(getIndexedProjects().length / PROJECTS_PER_PAGE));
}

export function getIndexPage(page: number): ProjectRecord[] {
  const start = (page - 1) * PROJECTS_PER_PAGE;
  return getIndexedProjects().slice(start, start + PROJECTS_PER_PAGE);
}

/**
 * Projects for one role lens, strongest evidence first.
 *
 * Proof level dominates, then curated priority, then id for a stable tie-break
 * so the build stays deterministic (PRD 5.1.3).
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
  const published = getPublishedProjects();
  const evidenceOfType = (types: readonly string[]): number =>
    published.filter((p) => p.evidence.some((e) => types.includes(e.type))).length;

  return {
    productionSystems: published.filter(
      (p) => p.links.live != null && (p.status === "complete" || p.status === "maintained"),
    ).length,
    measuredReports: published.filter((p) => p.metrics.length > 0).length,
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
 * Track structure for the atlas.
 *
 * Read from the compiled facet dictionary rather than the taxonomy loader, so
 * the site no longer imports taxonomy source at runtime — the other half of
 * what unblocks Turbopack. `total` counts catalog entries; `published` counts
 * only what cleared the gates, so the two can never be conflated.
 */
export function getTrackSummaries(): TrackSummary[] {
  const all = loadAllProjects();
  const published = new Set(getPublishedProjects().map((p) => p.id));

  const tracks = JSON.parse(
    readFileSync(join(process.cwd(), "..", "..", "content", "taxonomy", "tracks.v1.json"), "utf8"),
  ) as { terms: TrackInfo[] };

  return tracks.terms.map((track) => {
    const members = all.filter((p) => p.track === track.id);
    return {
      track,
      total: members.length,
      published: members.filter((p) => published.has(p.id)).length,
    };
  });
}
