/**
 * The catalog compiler.
 *
 * Authority: PRD 5.1.2 (stage order), 5.1.5 (artifacts), 5.1.6 (build SLOs),
 * 7.3 (publish ordering and cache policy).
 *
 * Stages are invoked one at a time rather than folded into a generic chain,
 * because each hand-off has a different type and a typed chain would need
 * either a large tuple type or a cast. Explicit calls keep every boundary
 * checked by the compiler, which matters more here than brevity.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canonicalJson } from "@atlas/contracts/canonical-json";
import type { ValidationIssue } from "@atlas/contracts/rules";
import { loadTaxonomy } from "@atlas/taxonomy";

import {
  createContext,
  formatReport,
  runStage,
  summarize,
  type BuildClock,
  type BuildReport,
  type StageEffect,
  type StageReport,
} from "./pipeline.js";
import {
  bitsetStage,
  catalogCoreStage,
  facetStage,
  orderStage,
  searchStage,
  type FacetIndex,
  type OrderedCatalog,
} from "./stages/artifacts.js";
import {
  deduplicateStage,
  discoverStage,
  normalizeStage,
  parseStage,
  taxonomyStage,
  validateStage,
} from "./stages/ingest.js";
import {
  budgetStage,
  featuredStage,
  feedStage,
  hashOf,
  publishStage,
  shortHash,
  type ArtifactFile,
  type BudgetRow,
} from "./stages/publish.js";

export interface CompileOptions {
  readonly repoRoot: string;
  /** Directory of manifests, or a preloaded corpus for fixture builds. */
  readonly sourceDir?: string;
  readonly records?: readonly unknown[];
  readonly outDir: string;
  readonly siteUrl: string;
  readonly clock: BuildClock;
  readonly commitSha: string;
  /** Refuse any stage declaring a network effect. Always true in CI. */
  readonly offline: boolean;
  readonly verbose?: boolean;
  /** Skip writing to disk. Used by the determinism check. */
  readonly dryRun?: boolean;
}

export interface CompileResult {
  readonly report: BuildReport;
  readonly budgets: readonly BudgetRow[];
  readonly files: readonly ArtifactFile[];
  readonly manifest: Record<string, unknown>;
  readonly catalogHash: string;
  readonly issues: readonly ValidationIssue[];
}

const ALLOWED_OFFLINE: readonly StageEffect[] = ["pure", "read-fs", "write-fs"];

export async function compileCatalog(options: CompileOptions): Promise<CompileResult> {
  const ctx = createContext({
    clock: options.clock,
    offline: options.offline,
    ...(options.verbose === undefined ? {} : { verbose: options.verbose }),
  });
  const reports: StageReport[] = [];
  const run = { ctx, ...(options.offline ? { allowEffects: ALLOWED_OFFLINE } : {}) };

  // -- ingest ---------------------------------------------------------------
  const files = await runStage(
    discoverStage,
    {
      repoRoot: options.repoRoot,
      ...(options.sourceDir === undefined ? {} : { sourceDir: options.sourceDir }),
      ...(options.records === undefined ? {} : { records: options.records }),
    },
    run,
    reports,
  );
  const parsed = await runStage(parseStage, files, run, reports);
  const validated = await runStage(validateStage, parsed, run, reports);
  const normalized = await runStage(normalizeStage, validated, run, reports);
  const deduped = await runStage(deduplicateStage, normalized, run, reports);

  const taxonomy = loadTaxonomy();
  const checked = await runStage(taxonomyStage, { records: deduped, taxonomy }, run, reports);

  // -- ordinals and identity ------------------------------------------------
  const catalog: OrderedCatalog = await runStage(orderStage, checked, run, reports);

  /**
   * The catalog hash identifies the DATA, not the build.
   *
   * Computed from the ordered records alone, so it is stable across builds of
   * identical content and changes only when content does. The search worker
   * refuses to serve results whose catalogHash does not match (PRD 9.7), which
   * only works if this excludes build metadata such as the timestamp.
   */
  const catalogHash = await hashOf(catalog.records);

  // -- derived artifacts ----------------------------------------------------
  const facets: FacetIndex = await runStage(
    facetStage,
    { catalog, taxonomy, catalogHash },
    run,
    reports,
  );

  const dictHash32 = Number.parseInt(shortHash(await hashOf(facets.facets)).slice(0, 8), 16);
  const bits = await runStage(bitsetStage, { catalog, facets, dictHash32 }, run, reports);
  const core = await runStage(catalogCoreStage, { catalog, facets, catalogHash }, run, reports);

  const searchConfig = JSON.parse(
    readFileSync(join(options.repoRoot, "config", "search.v1.json"), "utf8"),
  ) as { fuse: { keys: { name: string; weight: number }[] } };
  const search = await runStage(
    searchStage,
    { catalog, catalogHash, fuseKeys: searchConfig.fuse.keys },
    run,
    reports,
  );

  const featured = await runStage(featuredStage, { catalog, catalogHash }, run, reports);
  const builtAt = ctx.clock.now();
  const feed = await runStage(
    feedStage,
    { catalog, siteUrl: options.siteUrl, builtAt },
    run,
    reports,
  );

  // -- assemble the artifact set -------------------------------------------
  const coreJson = canonicalJson(core);
  const facetsJson = canonicalJson(facets.facets);
  const searchJson = canonicalJson({
    catalogHash,
    docs: search.docs,
    index: search.index,
  });
  const featuredJson = canonicalJson(featured);

  const nameOf = (base: string, contents: string, ext = "json"): string =>
    `${base}.${shortHash(hashSync(contents))}.${ext}`;

  const coreName = nameOf("catalog-core", coreJson);
  const facetsName = nameOf("facets", facetsJson);
  const searchName = nameOf("search", searchJson);
  const featuredName = nameOf("featured", featuredJson);
  const bitsName = `facet-bits.${shortHash(hashSync(Buffer.from(bits).toString("base64")))}.bin`;

  const artifactFiles: ArtifactFile[] = [
    { path: coreName, contents: coreJson, budgetId: "ARTIFACT-CATALOG-CORE", immutable: true },
    { path: facetsName, contents: facetsJson, budgetId: "ARTIFACT-FACETS", immutable: true },
    {
      path: bitsName,
      contents: new Uint8Array(bits),
      budgetId: "ARTIFACT-FACET-BITS",
      immutable: true,
    },
    { path: searchName, contents: searchJson, budgetId: "ARTIFACT-SEARCH", immutable: true },
    { path: featuredName, contents: featuredJson, budgetId: "ARTIFACT-FEATURED", immutable: true },
    { path: "feed.xml", contents: feed.rss, budgetId: null, immutable: false },
    { path: "feed.json", contents: feed.json, budgetId: null, immutable: false },
  ];

  // Per-project detail payloads (PRD 5.1.5, 100 KB each).
  for (const record of catalog.records) {
    if (record.visibility === "private") continue;
    artifactFiles.push({
      path: `projects/${record.slug}.json`,
      contents: canonicalJson(record),
      budgetId: "ARTIFACT-PROJECT-DETAIL",
      immutable: false,
    });
  }

  // -- budgets --------------------------------------------------------------
  const budgetsFile = JSON.parse(
    readFileSync(join(options.repoRoot, "config", "budgets.v1.json"), "utf8"),
  ) as { budgets: { id: string; value: number; unit: string; section: string }[] };
  const budgetMap = new Map(
    budgetsFile.budgets.map((b) => [b.id, { value: b.value, unit: b.unit, section: b.section }]),
  );
  const budgetRows = await runStage(
    budgetStage,
    { files: artifactFiles, budgets: budgetMap },
    run,
    reports,
  );

  // -- manifest -------------------------------------------------------------
  const counts = {
    public: catalog.records.filter((r) => r.visibility === "public").length,
    unlisted: catalog.records.filter((r) => r.visibility === "unlisted").length,
    total: catalog.records.length,
    featured: featured.global.length,
  };

  const manifest = {
    schemaVersion: 3,
    buildVersion: "1",
    commitSha: options.commitSha,
    builtAt,
    catalogHash,
    counts,
    artifacts: {
      catalogCore: entry(coreName, coreJson),
      facets: entry(facetsName, facetsJson),
      facetBits: { url: `/catalog/${bitsName}`, hash: catalogHash, bytes: bits.byteLength },
      search: entry(searchName, searchJson),
      searchDocs: entry(searchName, searchJson),
      featured: entry(featuredName, featuredJson),
    },
  };

  const manifestJson = canonicalJson(manifest);

  if (options.dryRun !== true) {
    await runStage(
      publishStage,
      {
        files: artifactFiles,
        outDir: options.outDir,
        // Unhashed, 5-minute TTL, written last (PRD 7.3).
        bootstrap: { path: "manifest.json", contents: manifestJson },
      },
      run,
      reports,
    );
  }

  return {
    report: summarize(reports, ctx),
    budgets: budgetRows,
    files: [
      ...artifactFiles,
      {
        path: "manifest.json",
        contents: manifestJson,
        budgetId: "ARTIFACT-MANIFEST",
        immutable: false,
      },
    ],
    manifest,
    catalogHash,
    issues: ctx.issues,
  };
}

function entry(name: string, contents: string): { url: string; hash: string; bytes: number } {
  return {
    url: `/catalog/${name}`,
    hash: hashSync(contents),
    bytes: Buffer.byteLength(contents, "utf8"),
  };
}

/**
 * Synchronous SHA-256, for filenames computed mid-pipeline.
 *
 * `hashOf` is async because it uses WebCrypto for parity with the browser-side
 * `hashCanonical` in the contracts; node:crypto is used here where the value is
 * already a string and an await would only add ceremony.
 */
function hashSync(contents: string): string {
  return `sha256:${createHash("sha256").update(contents, "utf8").digest("hex")}`;
}

export { formatReport };
