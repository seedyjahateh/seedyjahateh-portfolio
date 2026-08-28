/**
 * Catalog build CLI.
 *
 * Usage:
 *   pnpm catalog:build                      real content -> apps/web/public/catalog
 *   pnpm catalog:build --fixture 1300       the exit-gate build
 *   pnpm catalog:build --verify-deterministic
 *   pnpm catalog:build --dry-run
 *
 * PRD 5.1.4: enrichment runs "only in CI or an explicit maintainer command".
 * This command is offline by default; `--online` is the explicit opt-in.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJsonCompact } from "@atlas/contracts/canonical-json";

import { compileCatalog, formatReport } from "../compile.js";
import { fixedClock } from "../pipeline.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? "";
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

/**
 * A deterministic build clock.
 *
 * PRD 5.1.3 requires byte-identical artifacts from identical inputs, and
 * `manifest.builtAt` is part of an artifact. Reading the wall clock would make
 * every build differ from the last, so the timestamp comes from the commit
 * being built - a property of the input, not of when the build happened.
 */
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
    // No git history (a fresh clone in a sandbox). Pin to the epoch rather than
    // silently reintroducing nondeterminism.
    return { iso: "1970-01-01T00:00:00Z", sha: "0000000" };
  }
}

function loadFixture(size: string): unknown[] {
  const path = join(repoRoot, "fixtures", `catalog-${size}`, "catalog.json");
  return JSON.parse(readFileSync(path, "utf8")) as unknown[];
}

async function main(): Promise<void> {
  const fixture = arg("fixture");
  const { iso, sha } = commitClock();
  const outDir = join(repoRoot, "apps", "web", "public", "catalog");

  const base = {
    repoRoot,
    outDir,
    siteUrl: process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://seedyjahateh.com",
    clock: fixedClock(iso),
    commitSha: sha,
    offline: !has("online"),
    verbose: has("verbose"),
  };

  const source =
    fixture === null
      ? { sourceDir: join(repoRoot, "content", "projects") }
      : { records: loadFixture(fixture) };

  const label = fixture === null ? "content/projects" : `fixture ${fixture}`;
  process.stdout.write(`Building catalog from ${label}${base.offline ? " (offline)" : ""}\n`);

  // -- determinism check ----------------------------------------------------
  if (has("verify-deterministic")) {
    const first = await compileCatalog({ ...base, ...source, dryRun: true });
    const second = await compileCatalog({ ...base, ...source, dryRun: true });

    const fingerprint = (result: Awaited<ReturnType<typeof compileCatalog>>): string =>
      canonicalJsonCompact(
        result.files.map((f) => ({
          path: f.path,
          bytes:
            typeof f.contents === "string"
              ? Buffer.from(f.contents, "utf8").toString("base64")
              : Buffer.from(f.contents).toString("base64"),
        })),
      );

    if (fingerprint(first) !== fingerprint(second)) {
      process.stderr.write(
        "\nBLD-DETERMINISM-001: two builds of identical input produced different bytes.\n" +
          "Look for Date.now(), Math.random, locale-sensitive sorting, or Set/Map iteration order.\n",
      );
      process.exit(1);
    }
    process.stdout.write(
      `deterministic: ${first.files.length} artifacts byte-identical across two builds\n`,
    );
    process.stdout.write(`catalogHash ${first.catalogHash.slice(0, 23)}...\n`);
    return;
  }

  // -- normal build ---------------------------------------------------------
  const result = await compileCatalog({
    ...base,
    ...source,
    ...(has("dry-run") ? { dryRun: true } : {}),
  });

  process.stdout.write(formatReport(result.report));
  process.stdout.write("\n\nArtifacts\n");
  for (const row of result.budgets) {
    const limit = row.limitKb === null ? "     —" : `${String(row.limitKb).padStart(6)}`;
    // One line per budgeted artifact; detail payloads are summarised below.
    if (row.path.startsWith("projects/")) continue;
    process.stdout.write(
      `  ${row.ok ? "PASS" : "FAIL"}  ${row.path.padEnd(44)} ${String(row.kb).padStart(7)} /${limit} KB\n`,
    );
  }
  const details = result.budgets.filter((r) => r.path.startsWith("projects/"));
  if (details.length > 0) {
    const worst = details.reduce((a, b) => (a.kb > b.kb ? a : b));
    const failed = details.filter((r) => !r.ok).length;
    process.stdout.write(
      `  ${failed === 0 ? "PASS" : "FAIL"}  ${`projects/*.json (${details.length})`.padEnd(44)} ` +
        `${String(worst.kb).padStart(7)} /${String(worst.limitKb ?? 0).padStart(6)} KB  (largest)\n`,
    );
  }

  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");

  if (warnings.length > 0) {
    process.stdout.write(`\n${warnings.length} warning(s):\n`);
    for (const w of warnings.slice(0, 10)) {
      process.stdout.write(`  ${w.ruleId} ${w.filePath}${w.pointer} — ${w.message}\n`);
    }
  }

  if (errors.length > 0) {
    process.stderr.write(`\n${errors.length} error(s); no artifacts published:\n`);
    for (const e of errors.slice(0, 25)) {
      process.stderr.write(`  ${e.ruleId}  ${e.filePath}${e.pointer}\n`);
      process.stderr.write(`      ${e.message}\n`);
      process.stderr.write(`      repair: ${e.repair}\n`);
    }
    if (errors.length > 25) process.stderr.write(`  ... and ${errors.length - 25} more\n`);
    process.exit(1);
  }

  process.stdout.write(
    `\n${result.manifest["counts"] === undefined ? "" : ""}` +
      `published ${result.files.length} artifacts to apps/web/public/catalog\n`,
  );
}

await main();
