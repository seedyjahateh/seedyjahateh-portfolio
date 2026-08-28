/**
 * Seed catalog importer.
 *
 * Reads docs/prd/portfolio-project-selection.md and emits one Project v3
 * manifest per project into content/projects/.
 *
 * Authority: PRD 11.3 ("The 240-project seed catalog imports through the
 * production schema without manual runtime transformation"), 5.1.1 (source
 * precedence), 12.2 (no invented metrics or claims).
 *
 * WHAT THIS IMPORTER WILL NOT DO
 * ------------------------------
 * PRD 5.1.1 fixes source precedence and ends with "Never: unreviewed generative
 * inference". So the importer copies only what the document states and leaves
 * everything else empty for a human:
 *
 *   - No stack extraction from prose. "Implement HTTP/1.1 parsing ... in Go"
 *     names a language, but reading it out of a sentence is inference. Empty.
 *   - No taglines. A tagline is a claim; none of these projects is built.
 *   - No metrics, evidence, dates, or media. Nothing has been measured.
 *   - No featured.global. PRD 8.3 gates it on measured proof and real media,
 *     so every seed record fails that gate by construction. Flagship intent is
 *     recorded in content/editorial/flagship-rotation.v1.json instead.
 *
 * Every record therefore imports as status "planned" and visibility "private".
 * Promotion to "public" is a human editorial act, gated by the selection
 * document's own scoring thresholds (rules SEL-SCORE-001/002).
 *
 * Track-level EDITORIAL defaults (complexity, accent, capabilities, domains)
 * come from content/taxonomy/track-defaults.v1.json - a reviewed file, not an
 * inference, and applied uniformly rather than guessed per project.
 *
 * Usage:
 *   pnpm seed:import          write manifests
 *   pnpm seed:verify          parse and report without writing (--check)
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "@atlas/contracts/canonical-json";
import { SCHEMA_VERSION, projectSchema } from "@atlas/contracts/project";
import { ruleIdFromIssue } from "@atlas/contracts/rules";
import { loadTaxonomy, loadTracks, trackByPrefix, type TrackInfo } from "@atlas/taxonomy";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const SELECTION_DOC = join(repoRoot, "docs", "prd", "portfolio-project-selection.md");
const TRACK_DEFAULTS = join(repoRoot, "content", "taxonomy", "track-defaults.v1.json");
const OUTPUT_DIR = join(repoRoot, "content", "projects");
const EDITORIAL_DIR = join(repoRoot, "content", "editorial");

const EXPECTED_PROJECTS = 240;
const EXPECTED_TRACKS = 16;

interface TrackDefaults {
  readonly complexity: string;
  readonly accentToken: string;
  readonly spatialGroup: string;
  readonly capabilities: readonly string[];
  readonly domains: readonly string[];
}

interface ParsedProject {
  readonly id: string;
  readonly prefix: string;
  readonly title: string;
  readonly description: string;
  readonly keystone: boolean;
  readonly trackHeading: string;
  readonly lineNumber: number;
}

interface Gap {
  readonly id: string;
  readonly field: string;
  readonly detail: string;
}

/**
 * Matches lines like:
 *   1. **SYS-01 ★ Concurrent HTTP Server in Go** — Implement HTTP/1.1 parsing, ...
 *   9. **DL-09 Small GPT from Scratch** — Implement attention, masking, ...
 *
 * The star is optional and always follows the id. The separator is an em dash.
 */
const PROJECT_LINE =
  /^\s*\d+\.\s+\*\*(?<id>[A-Z]{2,4}-\d{2,4})\s*(?<star>★)?\s*(?<title>[^*]+?)\*\*\s*[—–-]\s*(?<description>.+?)\s*$/u;

const TRACK_HEADING = /^##\s+Track\s+(?<number>\d+)\s*[—–-]\s*(?<name>.+?)\s*$/u;

/** Strip inline markdown that carries no meaning once the text is JSON. */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/\s+/gu, " ")
    .normalize("NFC")
    .trim();
}

function toSlug(title: string): string {
  return stripInlineMarkdown(title)
    .toLowerCase()
    .replace(/\+\+/gu, "-plus-plus")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");
}

function parseSelectionDocument(): { projects: ParsedProject[]; trackCount: number } {
  const source = readFileSync(SELECTION_DOC, "utf8");
  const lines = source.split(/\r?\n/u);

  const projects: ParsedProject[] = [];
  let currentTrack = "";
  let trackCount = 0;
  let inBuildOrderSection = false;

  for (const [index, line] of lines.entries()) {
    const heading = TRACK_HEADING.exec(line);
    if (heading?.groups) {
      currentTrack = heading.groups["name"] ?? "";
      trackCount += 1;
      inBuildOrderSection = false;
      continue;
    }
    // Sections after the tracks (build order, lenses, topology) also contain
    // bold text and dashes; stop collecting once we leave the track listing.
    if (/^##\s+Build order/u.test(line)) inBuildOrderSection = true;
    if (inBuildOrderSection) continue;

    const match = PROJECT_LINE.exec(line);
    if (!match?.groups) continue;

    const id = match.groups["id"] ?? "";
    const prefix = id.split("-")[0] ?? "";
    projects.push({
      id,
      prefix,
      title: stripInlineMarkdown(match.groups["title"] ?? ""),
      description: stripInlineMarkdown(match.groups["description"] ?? ""),
      keystone: match.groups["star"] === "★",
      trackHeading: currentTrack,
      lineNumber: index + 1,
    });
  }

  return { projects, trackCount };
}

function buildManifest(
  parsed: ParsedProject,
  track: TrackInfo,
  defaults: TrackDefaults,
  gaps: Gap[],
): unknown {
  const slug = toSlug(parsed.title);

  if (parsed.title.length < 8 || parsed.title.length > 90) {
    gaps.push({
      id: parsed.id,
      field: "title",
      detail: `${parsed.title.length} characters; schema requires 8-90.`,
    });
  }
  if (parsed.description.length < 80 || parsed.description.length > 320) {
    gaps.push({
      id: parsed.id,
      field: "summary",
      detail: `${parsed.description.length} characters; schema requires 80-320. Left as-is - padding it would be fabrication.`,
    });
  }

  const isKeystone = parsed.keystone;

  return {
    schemaVersion: SCHEMA_VERSION,
    id: parsed.id,
    slug,
    title: parsed.title,
    summary: parsed.description,

    // Nothing is built, so nothing claims to be.
    status: "planned",

    /**
     * `unlisted`, not `public` and not `private`.
     *
     * NOT public: PRD 8.3's gates (XFD-PUB-001/002, SEL-SCORE-*) require
     * evidence, a primary artifact, media and a review score. A planned record
     * has none, and the schema correctly refuses it.
     *
     * NOT private either: a private record generates no page at all, which
     * would leave the roadmap unreachable and the detail template untested.
     *
     * `unlisted` is exactly the middle state ADR 0024 defines — the record has
     * a page and appears in the site's own atlas, but is `noindex` and absent
     * from the sitemap. It carries only the title and summary the owner wrote
     * in the selection catalog, shows a prominent "planned" banner, and asserts
     * nothing. Search engines see none of it until a human promotes it.
     */
    visibility: "unlisted",
    tier: isKeystone ? "keystone" : "focused-exhibit",
    proofLevel: "code",

    track: track.id,

    // Roles come from the track's own "Primary roles" header line - stated in
    // the document, not inferred from the project description.
    roles: [...track.roles],
    domains: [...defaults.domains],
    capabilities: [...defaults.capabilities],
    complexity: defaults.complexity,

    dates: { started: null, completed: null, lastVerified: null },
    ownership: { kind: "solo", responsibilities: [], collaborators: [] },

    // Deliberately empty: the document names technologies in prose, and
    // extracting them would be inference (PRD 5.1.1).
    stack: {
      languages: [],
      frameworks: [],
      data: [],
      infrastructure: [],
      ai: [],
      testing: [],
    },

    links: { canonical: `/projects/${slug}` },

    evidence: [],
    metrics: [],
    media: { gallery: [] },
    content: { problem: null, limitations: [] },

    search: {
      // The id and the track's own aliases are legitimate retrieval handles.
      aliases: [],
      keywords: [],
      excludeFromSearch: false,
    },

    layout: {
      cardVariant: isKeystone ? "feature" : "standard",
      accentToken: defaults.accentToken,
      gridPriority: isKeystone ? 100 : 50,
      spatialGroup: defaults.spatialGroup,
      allowSpatialView: true,
    },

    integrity: {
      reviewedBy: "seed-import",
      reviewedAt: null,
      contentHash: null,
      sourcePath: `content/projects/${parsed.id}.json`,
    },
  };
}

function main(): void {
  const checkOnly = process.argv.includes("--check");

  const taxonomy = loadTaxonomy();
  const tracks = loadTracks(taxonomy);
  const byPrefix = trackByPrefix(tracks);

  const defaultsFile = JSON.parse(readFileSync(TRACK_DEFAULTS, "utf8")) as {
    tracks: Record<string, TrackDefaults>;
  };

  const { projects, trackCount } = parseSelectionDocument();
  const problems: string[] = [];
  const gaps: Gap[] = [];

  process.stdout.write(`parsed ${projects.length} projects across ${trackCount} track headings\n`);

  if (trackCount !== EXPECTED_TRACKS) {
    problems.push(`Expected ${EXPECTED_TRACKS} track headings, found ${trackCount}.`);
  }
  if (projects.length !== EXPECTED_PROJECTS) {
    problems.push(
      `Expected ${EXPECTED_PROJECTS} projects, found ${projects.length}. ` +
        `The parser or the document changed; do not proceed until they agree.`,
    );
  }

  // Corpus uniqueness (rules COR-DUP-ID-001 / COR-DUP-SLUG-001).
  const seenIds = new Map<string, ParsedProject>();
  const seenSlugs = new Map<string, string>();
  const manifests: { id: string; record: unknown }[] = [];

  for (const parsed of projects) {
    const duplicate = seenIds.get(parsed.id);
    if (duplicate !== undefined) {
      problems.push(
        `COR-DUP-ID-001: '${parsed.id}' appears on lines ${duplicate.lineNumber} and ${parsed.lineNumber}.`,
      );
      continue;
    }
    seenIds.set(parsed.id, parsed);

    const track = byPrefix.get(parsed.prefix);
    if (track === undefined) {
      problems.push(
        `TAX-TRACK-PREFIX-001: '${parsed.id}' (line ${parsed.lineNumber}) uses prefix '${parsed.prefix}', which no track owns.`,
      );
      continue;
    }

    const defaults = defaultsFile.tracks[track.id];
    if (defaults === undefined) {
      problems.push(`track-defaults.v1.json has no entry for track '${track.id}'.`);
      continue;
    }

    const record = buildManifest(parsed, track, defaults, gaps);
    const slug = (record as { slug: string }).slug;
    const slugOwner = seenSlugs.get(slug);
    if (slugOwner !== undefined) {
      problems.push(`COR-DUP-SLUG-001: '${slug}' claimed by both ${slugOwner} and ${parsed.id}.`);
      continue;
    }
    seenSlugs.set(slug, parsed.id);

    // Validate through the SAME schema the production pipeline uses. PRD 11.3
    // requires the seed to import "without manual runtime transformation", so a
    // failure here is a real failure, never something to patch around.
    const result = projectSchema.safeParse(record);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const ruleId = ruleIdFromIssue(issue);
        problems.push(
          `${parsed.id} /${issue.path.join("/")}: ${issue.message}${ruleId ? ` [${ruleId}]` : ""}`,
        );
      }
      continue;
    }

    manifests.push({ id: parsed.id, record });
  }

  // Keystone count must match the document's own claim of 16.
  const keystones = projects.filter((p) => p.keystone).map((p) => p.id);
  if (keystones.length !== EXPECTED_TRACKS) {
    problems.push(
      `Expected ${EXPECTED_TRACKS} keystones (one per track), found ${keystones.length}: ${keystones.join(", ")}.`,
    );
  }
  for (const track of tracks) {
    if (!keystones.includes(track.keystone)) {
      problems.push(
        `Track '${track.id}' declares keystone '${track.keystone}', but that project is not starred in the document.`,
      );
    }
  }

  process.stdout.write(`validated ${manifests.length} manifests against Project schema v3\n`);
  process.stdout.write(`keystones: ${keystones.length} (${keystones.join(", ")})\n`);

  if (gaps.length > 0) {
    process.stdout.write(`\n${gaps.length} authoring gap(s) - fields a human must complete:\n`);
    for (const gap of gaps.slice(0, 20)) {
      process.stdout.write(`  ${gap.id} ${gap.field}: ${gap.detail}\n`);
    }
    if (gaps.length > 20) process.stdout.write(`  ... and ${gaps.length - 20} more\n`);
  }

  if (problems.length > 0) {
    process.stderr.write(`\nimport FAILED with ${problems.length} problem(s):\n`);
    for (const problem of problems.slice(0, 40)) process.stderr.write(`  - ${problem}\n`);
    if (problems.length > 40) {
      process.stderr.write(`  ... and ${problems.length - 40} more\n`);
    }
    process.exit(1);
  }

  if (checkOnly) {
    process.stdout.write("\ncheck passed; no files written (--check)\n");
    return;
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(EDITORIAL_DIR, { recursive: true });

  // Refuse to clobber human edits: once an author has touched a manifest, the
  // importer is no longer the source of truth for it (PRD 5.1.1 precedence 1).
  const existing = new Set(
    existsSync(OUTPUT_DIR) ? readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".json")) : [],
  );
  let written = 0;
  let skipped = 0;

  for (const { id, record } of manifests) {
    const fileName = `${id}.json`;
    if (existing.has(fileName)) {
      const onDisk = readFileSync(join(OUTPUT_DIR, fileName), "utf8");
      const authored = JSON.parse(onDisk) as { integrity?: { reviewedBy?: string } };
      if (authored.integrity?.reviewedBy !== "seed-import") {
        skipped += 1;
        continue;
      }
    }
    writeFileSync(join(OUTPUT_DIR, fileName), canonicalJson(record), "utf8");
    written += 1;
  }

  process.stdout.write(`\nwrote ${written} manifests to content/projects/`);
  process.stdout.write(skipped > 0 ? `, skipped ${skipped} human-authored\n` : "\n");
}

main();
