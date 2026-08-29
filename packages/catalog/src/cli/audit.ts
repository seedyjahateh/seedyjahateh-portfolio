/**
 * Catalog audit CLI.
 *
 * Usage:
 *   pnpm catalog:audit             diff the current catalog against the baseline
 *   pnpm catalog:audit --update    accept the current catalog as the new baseline
 *
 * PRD 5.1.3 requires an audit report of additions, removals, field changes,
 * stale records, taxonomy changes and budget deltas. Everything it needs comes
 * from a normal compile plus the committed baseline, so this never publishes
 * artifacts — it builds in dry-run and reports.
 *
 * `--update` is deliberately a separate, explicit action. If the audit silently
 * rewrote the baseline it could never fail: removing a published id would
 * become the new normal on the very run that was supposed to catch it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "@atlas/contracts/canonical-json";

import {
  auditCatalog,
  buildBaseline,
  formatAudit,
  type Baseline,
  type BaselineArtifact,
  type RedirectMap,
} from "../audit.js";
import { compileCatalog } from "../compile.js";
import { fixedClock } from "../pipeline.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const BASELINE_PATH = join(repoRoot, "content", "catalog-baseline.json");
const REDIRECTS_PATH = join(repoRoot, "content", "redirects.v1.json");

const EMPTY_REDIRECTS: RedirectMap = { version: 1, redirects: {} };

function commitClock(): { iso: string; sha: string } {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    const iso = execFileSync("git", ["show", "-s", "--format=%cI", sha], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    return { iso: new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z"), sha };
  } catch {
    return { iso: "1970-01-01T00:00:00Z", sha: "0000000" };
  }
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

async function main(): Promise<void> {
  const update = process.argv.includes("--update");
  const { iso, sha } = commitClock();

  const result = await compileCatalog({
    repoRoot,
    sourceDir: join(repoRoot, "content", "projects"),
    outDir: join(repoRoot, "apps", "web", "public", "catalog"),
    siteUrl: process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://seedyjahateh.com",
    clock: fixedClock(iso),
    commitSha: sha,
    offline: true,
    dryRun: true,
  });

  const blocking = result.issues.filter((i) => i.severity === "error");
  if (blocking.length > 0) {
    process.stderr.write(
      `The catalog does not compile; there is nothing to audit.\n` +
        `Run \`pnpm catalog:build\` to see all ${blocking.length} error(s).\n`,
    );
    process.exit(1);
  }

  const artifacts: BaselineArtifact[] = result.budgets
    .filter((row) => !row.path.startsWith("projects/"))
    .map((row) => ({ id: row.path, kb: row.kb }));

  if (update) {
    const next = buildBaseline(result.records, result.catalogHash, sha, artifacts);
    writeFileSync(BASELINE_PATH, canonicalJson(next), "utf8");
    process.stdout.write(
      `Baseline updated: ${next.records.length} records, ${next.artifacts.length} artifacts, ` +
        `${next.taxonomyTerms.length} taxonomy terms.\n` +
        `Commit content/catalog-baseline.json to make this the new reference point.\n`,
    );
    return;
  }

  const baseline = readJson<Baseline | null>(BASELINE_PATH, null);
  const report = auditCatalog({
    records: result.records,
    catalogHash: result.catalogHash,
    artifacts,
    baseline,
    redirects: readJson<RedirectMap>(REDIRECTS_PATH, EMPTY_REDIRECTS),
    // Staleness is measured against the commit being audited, not the wall
    // clock, so the same commit always reports the same age.
    now: new Date(iso),
  });

  process.stdout.write(`Catalog audit\n\n${formatAudit(report)}\n`);

  if (baseline === null) {
    process.stdout.write(
      `\nNo baseline at content/catalog-baseline.json.\n` +
        `Run \`pnpm catalog:audit --update\` to record the current catalog as the reference.\n`,
    );
    return;
  }

  const errors = report.issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    process.stderr.write(`\n${errors.length} error(s):\n`);
    for (const e of errors) {
      process.stderr.write(`  ${e.ruleId}  ${e.filePath}${e.pointer}\n`);
      process.stderr.write(`      ${e.message}\n`);
      process.stderr.write(`      repair: ${e.repair}\n`);
    }
    process.exit(1);
  }

  process.stdout.write("\nNo rule violations against the baseline.\n");
}

await main();
