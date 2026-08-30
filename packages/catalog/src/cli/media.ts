/**
 * Media build.
 *
 * Walks `content/media/{projectId}/` and produces responsive AVIF, WebP and
 * JPEG derivatives into `apps/web/public/media/{projectId}/`, then reports the
 * intrinsic dimensions and the largest modern-format size against the PRD 9.6
 * budgets.
 *
 * Sources are COMMITTED, derivatives are GENERATED. A screenshot living only on
 * someone's desktop makes the build unreproducible, and the derivatives are
 * deterministic output that would otherwise bloat every diff.
 *
 * Usage:
 *   pnpm media:build            process everything
 *   pnpm media:build --check    report without writing
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { budgetFor, largestModernBytes, processImage, type MediaKind } from "../media/processor.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const SOURCE_ROOT = join(repoRoot, "content", "media");
const OUT_ROOT = join(repoRoot, "apps", "web", "public", "media");
const CACHE_ROOT = join(repoRoot, "node_modules", ".cache", "atlas-media");

const SOURCE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

/**
 * Which budget a file is judged against.
 *
 * Anything named `hero*` is a hero; everything else is a card. A convention
 * rather than a config file, because one naming rule is easier to keep right
 * than a mapping nobody remembers to update.
 */
function kindFor(fileName: string): MediaKind {
  return fileName.toLowerCase().startsWith("hero") ? "hero" : "card";
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");

  if (!existsSync(SOURCE_ROOT)) {
    process.stdout.write("No content/media directory; nothing to process.\n");
    return;
  }

  const failures: string[] = [];
  let processed = 0;
  let cached = 0;

  process.stdout.write("Media\n\n");

  for (const projectId of readdirSync(SOURCE_ROOT).sort()) {
    const projectDir = join(SOURCE_ROOT, projectId);
    const files = readdirSync(projectDir)
      .filter((f) => SOURCE_EXTENSIONS.has(extname(f).toLowerCase()))
      .sort();

    for (const file of files) {
      const kind = kindFor(file);
      const budget = budgetFor(kind);

      const result = await processImage({
        sourcePath: join(projectDir, file),
        outDir: join(OUT_ROOT, projectId),
        urlPrefix: `/media/${projectId}`,
        kind,
        cacheDir: join(CACHE_ROOT, projectId),
      });

      if (result.cached) cached += 1;
      else processed += 1;

      const largestKb = Math.round((largestModernBytes(result) / 1024) * 10) / 10;
      const ok = largestKb <= budget.limitKb;
      if (!ok) {
        failures.push(
          `${projectId}/${file}: ${largestKb} KB AVIF against a ${budget.limitKb} KB budget (${budget.id}).`,
        );
      }

      process.stdout.write(
        `  ${ok ? "PASS" : "FAIL"}  ${`${projectId}/${file}`.padEnd(38)} ` +
          `${result.width}x${result.height}  ${String(largestKb).padStart(6)} / ${budget.limitKb} KB  ` +
          `${result.derivatives.length} derivatives${result.cached ? " (cached)" : ""}\n`,
      );

      // The manifest needs the intrinsic dimensions; print them so they can be
      // copied in rather than guessed (MED-DIM-001 rejects a guess).
      const avif = result.derivatives.filter((d) => d.format === "avif");
      const widest = avif.reduce((a, b) => (a.width > b.width ? a : b));
      process.stdout.write(
        `        src ${widest.path}  width ${result.width}  height ${result.height}\n`,
      );
      // And the widths, for `media.card.widths`. Printed rather than derived by
      // the compiler: this command is the only thing that knows which
      // derivatives it actually emitted, and a srcset naming a file that was
      // never written is worse than no srcset at all.
      const widths = [...new Set(avif.map((d) => d.width))].sort((a, b) => a - b);
      process.stdout.write(`        widths [${widths.join(", ")}]\n`);
    }
  }

  process.stdout.write(`\n${processed} processed, ${cached} reused from cache\n`);

  if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} media budget failure(s):\n`);
    for (const failure of failures) process.stderr.write(`  - ${failure}\n`);
    process.stderr.write(
      "\nPRD 12.2: the budget is not raised. Crop or resize the source instead.\n",
    );
    process.exit(1);
  }

  if (check) process.stdout.write("check only; derivatives were still written to cache\n");
}

await main();
