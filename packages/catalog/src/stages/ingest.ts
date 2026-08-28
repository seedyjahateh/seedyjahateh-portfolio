/**
 * Ingestion stages: discover -> parse -> validate -> normalize -> deduplicate.
 *
 * Authority: PRD 5.1.2 (stage order), 5.1.3 (ingestion requirements), 5.1.6
 * (error reporting shape).
 *
 * Everything here reuses the Phase 0 contracts rather than restating them:
 * `projectSchema` for validity, the rule registry for issue shape and repair
 * text, and the taxonomy loader for controlled vocabularies. The compiler, the
 * seed importer and the website therefore share one definition of "valid",
 * which is the whole point of freezing the contracts first.
 */

import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

import { issue, ruleIdFromIssue, type ValidationIssue } from "@atlas/contracts/rules";
import { projectSchema, type ProjectRecord } from "@atlas/contracts/project";
import { getGroup, loadTaxonomy, loadTracks, trackByPrefix, type Taxonomy } from "@atlas/taxonomy";

import type { Stage, StageContext } from "../pipeline.js";
import { StageError } from "../pipeline.js";

/** PRD 5.1.3: "Discover only allowlisted extensions and directories." */
const ALLOWED_EXTENSIONS = new Set([".json"]);

export interface SourceFile {
  /** Repo-relative, POSIX separators, for stable error messages across platforms. */
  readonly path: string;
  readonly absolutePath: string;
  readonly contents: string;
}

export interface ParsedRecord {
  readonly file: SourceFile;
  readonly raw: unknown;
}

// -----------------------------------------------------------------------------
// discover
// -----------------------------------------------------------------------------

export interface DiscoverInput {
  /** Directory of one-file-per-record manifests, e.g. content/projects. */
  readonly sourceDir?: string;
  /** A pre-loaded corpus (the fixture generator emits one array per size). */
  readonly records?: readonly unknown[];
  readonly repoRoot: string;
}

/**
 * Find manifests.
 *
 * Accepts either a directory or an in-memory corpus so that the fixture builds
 * exercise exactly the same downstream code as a real build. If fixtures took a
 * different path, the exit-gate 1,300 build would prove nothing about the
 * pipeline that actually ships.
 */
export const discoverStage: Stage<DiscoverInput, SourceFile[]> = {
  name: "discover",
  effects: ["read-fs"],
  count: (files) => files.length,
  run(input) {
    if (input.records !== undefined) {
      return input.records.map((record, index) => ({
        path: `<fixture>/${String(index).padStart(5, "0")}.json`,
        absolutePath: `<fixture>/${String(index).padStart(5, "0")}.json`,
        contents: JSON.stringify(record),
      }));
    }

    const dir = input.sourceDir;
    if (dir === undefined) {
      throw new StageError("discover", "discover needs either sourceDir or records.");
    }

    const root = resolve(input.repoRoot);
    const files: SourceFile[] = [];

    for (const name of readdirSync(dir).sort()) {
      if (!ALLOWED_EXTENSIONS.has(extname(name))) continue;

      const absolutePath = join(dir, name);

      // PRD 5.1.3: "Ignore symlinks that resolve outside the repository."
      // A symlink escaping the repo would let a build read arbitrary files, so
      // this is a containment check, not tidiness.
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        const target = resolve(realpathSync(absolutePath));
        if (!target.startsWith(root + sep)) continue;
      }

      files.push({
        path: absolutePath
          .slice(root.length + 1)
          .split(sep)
          .join("/"),
        absolutePath,
        contents: readFileSync(absolutePath, "utf8"),
      });
    }

    return files;
  },
};

// -----------------------------------------------------------------------------
// parse
// -----------------------------------------------------------------------------

export const parseStage: Stage<readonly SourceFile[], ParsedRecord[]> = {
  name: "parse",
  effects: ["pure"],
  count: (records) => records.length,
  run(files, ctx) {
    const parsed: ParsedRecord[] = [];
    for (const file of files) {
      try {
        parsed.push({ file, raw: JSON.parse(file.contents) });
      } catch (error) {
        ctx.issues.push({
          ruleId: "CAT-ADDL-001",
          severity: "error",
          filePath: file.path,
          pointer: "",
          rejectedValue: null,
          message: `File is not valid JSON: ${String(error)}`,
          repair: "Fix the syntax error. A manifest must parse before any rule can be checked.",
        });
      }
    }
    return parsed;
  },
};

// -----------------------------------------------------------------------------
// validate
// -----------------------------------------------------------------------------

export interface ValidatedRecord {
  readonly file: SourceFile;
  readonly record: ProjectRecord;
}

/**
 * Validate against schema v3.
 *
 * PRD 5.1.6 requires every rejection to carry file path, JSON pointer, rule id,
 * rejected value and a suggested repair. Zod gives the first two; the registry
 * supplies the rest, so an author gets an actionable message rather than a type
 * error.
 */
export const validateStage: Stage<readonly ParsedRecord[], ValidatedRecord[]> = {
  name: "validate",
  effects: ["pure"],
  count: (records) => records.length,
  run(parsed, ctx) {
    const valid: ValidatedRecord[] = [];

    for (const entry of parsed) {
      const result = projectSchema.safeParse(entry.raw);
      if (result.success) {
        valid.push({ file: entry.file, record: result.data });
        continue;
      }

      for (const zodIssue of result.error.issues) {
        const ruleId = ruleIdFromIssue(zodIssue);
        const pointer = `/${zodIssue.path.join("/")}`;
        if (ruleId !== null) {
          ctx.issues.push(
            issue(
              ruleId,
              {
                filePath: entry.file.path,
                pointer,
                rejectedValue: readPointer(entry.raw, zodIssue.path),
              },
              zodIssue.message,
            ),
          );
        } else {
          // A structural rejection: Zod's own code rather than a refinement.
          ctx.issues.push({
            ruleId: structuralRuleFor(pointer),
            severity: "error",
            filePath: entry.file.path,
            pointer,
            rejectedValue: readPointer(entry.raw, zodIssue.path),
            message: zodIssue.message,
            repair:
              "Correct the field to match the schema in content/schema/project.v3.schema.json.",
          });
        }
      }
    }

    return valid;
  },
};

/** Best-effort mapping from a failing path to the registry rule that governs it. */
function structuralRuleFor(pointer: string): ValidationIssue["ruleId"] {
  if (pointer.startsWith("/id")) return "CAT-ID-001";
  if (pointer.startsWith("/slug")) return "CAT-SLUG-001";
  if (pointer.startsWith("/schemaVersion")) return "CAT-SCHEMA-001";
  if (pointer.startsWith("/title")) return "CAT-LEN-TITLE-001";
  if (pointer.startsWith("/tagline")) return "CAT-LEN-TAGLINE-001";
  if (pointer.startsWith("/summary")) return "CAT-LEN-SUMMARY-001";
  if (pointer.includes("/width") || pointer.includes("/height")) return "MED-DIM-001";
  if (pointer.includes("/environment")) return "MET-ENV-001";
  if (pointer.includes("/measuredAt")) return "MET-DATE-001";
  if (pointer.includes("/evidenceUrl")) return "MET-EVIDENCE-001";
  if (pointer.includes("/synthetic")) return "MET-SYNTHETIC-001";
  return "CAT-ADDL-001";
}

function readPointer(source: unknown, path: readonly PropertyKey[]): unknown {
  let cursor: unknown = source;
  for (const key of path) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<PropertyKey, unknown>)[key];
  }
  return cursor;
}

// -----------------------------------------------------------------------------
// normalize
// -----------------------------------------------------------------------------

/**
 * PRD 5.1.3: "Normalize Unicode to NFC, trim whitespace, lowercase identifiers,
 * canonicalize URLs, and sort unordered tag arrays."
 *
 * Sorting the tag arrays is what makes two manifests that list the same
 * technologies in different orders produce identical artifacts — without it,
 * reordering a stack array would change every downstream content hash.
 */
export const normalizeStage: Stage<readonly ValidatedRecord[], ValidatedRecord[]> = {
  name: "normalize",
  effects: ["pure"],
  count: (records) => records.length,
  run(records) {
    return records.map(({ file, record }) => ({
      file,
      record: normalizeRecord(record),
    }));
  },
};

const text = (value: string): string => value.normalize("NFC").trim();
const term = (value: string): string => value.normalize("NFC").trim().toLowerCase();
const sortedTerms = (values: readonly string[]): string[] => [...new Set(values.map(term))].sort();

/** Strip a trailing slash and default port so two spellings of one URL agree. */
export function canonicalizeUrl(value: string): string {
  if (!value.startsWith("http")) return value.trim();
  try {
    const url = new URL(value.trim());
    url.hash = "";
    if (url.pathname.endsWith("/") && url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return value.trim();
  }
}

export function normalizeRecord(record: ProjectRecord): ProjectRecord {
  const links = Object.fromEntries(
    Object.entries(record.links).map(([key, value]) => [
      key,
      typeof value === "string" ? canonicalizeUrl(value) : value,
    ]),
  ) as ProjectRecord["links"];

  return {
    ...record,
    title: text(record.title),
    summary: text(record.summary),
    ...(record.tagline == null ? {} : { tagline: text(record.tagline) }),
    track: term(record.track),
    roles: [...record.roles].sort(),
    domains: sortedTerms(record.domains),
    capabilities: sortedTerms(record.capabilities),
    stack: {
      languages: sortedTerms(record.stack.languages),
      frameworks: sortedTerms(record.stack.frameworks),
      data: sortedTerms(record.stack.data),
      infrastructure: sortedTerms(record.stack.infrastructure),
      ai: sortedTerms(record.stack.ai),
      testing: sortedTerms(record.stack.testing),
    },
    links,
    search: {
      ...record.search,
      aliases: [...new Set(record.search.aliases.map(text))].sort(),
      keywords: [...new Set(record.search.keywords.map(text))].sort(),
    },
  };
}

// -----------------------------------------------------------------------------
// deduplicate + taxonomy membership
// -----------------------------------------------------------------------------

/**
 * Corpus-level rules. PRD 5.1.3.
 *
 * These are the rules Phase 0 had to exempt from fixture coverage because a
 * single invalid document cannot express them: uniqueness needs two records,
 * and vocabulary membership needs the taxonomy. Both are available here, so
 * this stage is what retires those exemptions.
 */
export const deduplicateStage: Stage<readonly ValidatedRecord[], ValidatedRecord[]> = {
  name: "deduplicate",
  effects: ["pure"],
  count: (records) => records.length,
  run(records, ctx) {
    const byId = new Map<string, string>();
    const bySlug = new Map<string, string>();
    const byRepo = new Map<string, string>();
    const byCaseStudy = new Map<string, string>();
    const kept: ValidatedRecord[] = [];

    const claim = (
      map: Map<string, string>,
      key: string | null | undefined,
      ruleId: Parameters<typeof issue>[0],
      entry: ValidatedRecord,
      pointer: string,
    ): boolean => {
      if (key == null || key.length === 0) return true;
      const owner = map.get(key);
      if (owner !== undefined) {
        ctx.issues.push(
          issue(
            ruleId,
            { filePath: entry.file.path, pointer, rejectedValue: key },
            `Already claimed by ${owner}.`,
          ),
        );
        return false;
      }
      map.set(key, entry.record.id);
      return true;
    };

    for (const entry of records) {
      const { record } = entry;
      let ok = claim(byId, record.id, "COR-DUP-ID-001", entry, "/id");
      ok = claim(bySlug, record.slug, "COR-DUP-SLUG-001", entry, "/slug") && ok;
      ok =
        claim(byRepo, record.links.source ?? null, "COR-DUP-REPO-001", entry, "/links/source") &&
        ok;
      ok =
        claim(
          byCaseStudy,
          record.links.caseStudy ?? null,
          "COR-DUP-CASESTUDY-001",
          entry,
          "/links/caseStudy",
        ) && ok;
      if (ok) kept.push(entry);
    }

    return kept;
  },
};

export interface TaxonomyCheckInput {
  readonly records: readonly ValidatedRecord[];
  readonly taxonomy: Taxonomy;
}

/**
 * Controlled-vocabulary membership and metric unit compatibility.
 *
 * PRD 5.1.3 rejects unknown facet values; PRD 5.3.1 requires compatible units
 * for numeric comparison, which needs the unit's dimension and the category's
 * accepted dimensions — data only the taxonomy has.
 */
export const taxonomyStage: Stage<TaxonomyCheckInput, ValidatedRecord[]> = {
  name: "taxonomy",
  effects: ["pure"],
  count: (records) => records.length,
  run({ records, taxonomy }, ctx) {
    const members = (groupKey: string): ReadonlyMap<string, { deprecated?: unknown }> =>
      taxonomy.byGroup.get(groupKey) ?? new Map();

    const tracks = loadTracks(taxonomy);
    const byPrefix = trackByPrefix(tracks);
    const capabilities = members("classification.capabilities");
    const domains = members("classification.domains");
    const evidenceTypes = members("classification.evidenceTypes");
    const accents = members("classification.accentTokens");
    const trackIds = members("tracks.tracks");
    const categories = getGroup(taxonomy, "metrics.categories");
    const units = getGroup(taxonomy, "metrics.units");

    const unitDimension = new Map(units.terms.map((t) => [t.id, t.dimension ?? null]));
    const categoryDimensions = new Map(categories.terms.map((t) => [t.id, t.dimensions ?? []]));

    for (const entry of records) {
      const { record, file } = entry;

      const checkTerm = (
        value: string,
        pool: ReadonlyMap<string, unknown>,
        pointer: string,
        label: string,
      ): void => {
        if (pool.has(value)) {
          const found = pool.get(value) as
            { deprecated?: { replacedBy?: string | null } } | undefined;
          if (found?.deprecated != null) {
            ctx.issues.push(
              issue(
                "TAX-DEPRECATED-001",
                { filePath: file.path, pointer, rejectedValue: value },
                `Replaced by '${found.deprecated.replacedBy ?? "nothing"}'.`,
              ),
            );
          }
          return;
        }
        ctx.issues.push(
          issue(
            "TAX-UNKNOWN-001",
            { filePath: file.path, pointer, rejectedValue: value },
            `Unknown ${label}.`,
          ),
        );
      };

      checkTerm(record.track, trackIds, "/track", "track");
      checkTerm(record.layout.accentToken, accents, "/layout/accentToken", "accent token");
      record.capabilities.forEach((value, i) =>
        checkTerm(value, capabilities, `/capabilities/${i}`, "capability"),
      );
      record.domains.forEach((value, i) => checkTerm(value, domains, `/domains/${i}`, "domain"));
      record.evidence.forEach((item, i) =>
        checkTerm(item.type, evidenceTypes, `/evidence/${i}/type`, "evidence type"),
      );

      // TAX-TRACK-PREFIX-001: the id prefix must belong to the declared track.
      const prefix = record.id.split("-")[0] ?? "";
      const owning = byPrefix.get(prefix);
      if (owning?.id !== record.track) {
        ctx.issues.push(
          issue(
            "TAX-TRACK-PREFIX-001",
            { filePath: file.path, pointer: "/track", rejectedValue: record.track },
            `Prefix '${prefix}' belongs to '${owning?.id ?? "no track"}'.`,
          ),
        );
      }

      // MET-UNIT-001: the unit's dimension must be one the category accepts.
      record.metrics.forEach((metric, i) => {
        const dimension = unitDimension.get(metric.unit);
        const accepted = categoryDimensions.get(metric.category);
        if (dimension == null) {
          ctx.issues.push(
            issue(
              "TAX-UNKNOWN-001",
              { filePath: file.path, pointer: `/metrics/${i}/unit`, rejectedValue: metric.unit },
              "Unknown metric unit.",
            ),
          );
          return;
        }
        if (accepted === undefined) {
          ctx.issues.push(
            issue(
              "TAX-UNKNOWN-001",
              {
                filePath: file.path,
                pointer: `/metrics/${i}/category`,
                rejectedValue: metric.category,
              },
              "Unknown metric category.",
            ),
          );
          return;
        }
        if (!accepted.includes(dimension)) {
          ctx.issues.push(
            issue(
              "MET-UNIT-001",
              { filePath: file.path, pointer: `/metrics/${i}/unit`, rejectedValue: metric.unit },
              `Unit '${metric.unit}' measures '${dimension}', which category '${metric.category}' does not accept (${accepted.join(", ")}).`,
            ),
          );
        }
      });
    }

    return [...records];
  },
};

export function loadCatalogTaxonomy(): Taxonomy {
  return loadTaxonomy();
}

export type { ValidationIssue, StageContext };
