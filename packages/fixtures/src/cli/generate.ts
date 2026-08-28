/**
 * Generate the deterministic fixture corpora and their lock file.
 *
 * The corpora themselves are gitignored - 10,000 synthetic records would
 * dominate every diff - but fixtures/fixture.lock.json IS committed. CI
 * regenerates and compares against it, which is what makes rule
 * BLD-DETERMINISM-001 enforceable rather than aspirational.
 */

import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, canonicalJsonCompact } from "@atlas/contracts/canonical-json";

import { FIXTURE_SEED_PREFIX, FIXTURE_SIZES, generateCatalog } from "../generate.js";
import { invalidCases, validBaseRecord } from "../invalid.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const fixturesDir = join(repoRoot, "fixtures");

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface FixtureLock {
  readonly seedPrefix: string;
  readonly sets: Record<string, { count: number; hash: string }>;
  readonly invalid: { count: number; hash: string };
}

export function computeLock(): FixtureLock {
  const sets: Record<string, { count: number; hash: string }> = {};
  for (const size of FIXTURE_SIZES) {
    const records = generateCatalog(size);
    sets[`catalog-${size}`] = {
      count: records.length,
      hash: sha256(canonicalJsonCompact(records)),
    };
  }
  const cases = invalidCases();
  return {
    seedPrefix: FIXTURE_SEED_PREFIX,
    sets,
    invalid: {
      count: cases.length,
      hash: sha256(canonicalJsonCompact(cases)),
    },
  };
}

function main(): void {
  const writeCorpora = !process.argv.includes("--lock-only");
  mkdirSync(fixturesDir, { recursive: true });

  if (writeCorpora) {
    for (const size of FIXTURE_SIZES) {
      const dir = join(fixturesDir, `catalog-${size}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const records = generateCatalog(size);
      // One file per record, mirroring content/projects/ so the compiler reads
      // fixtures through exactly the same discovery path as real manifests.
      writeFileSync(join(dir, "catalog.json"), canonicalJson(records), "utf8");
      process.stdout.write(`generated fixtures/catalog-${size}/catalog.json (${records.length} records)\n`);
    }

    const invalidDir = join(fixturesDir, "invalid");
    rmSync(invalidDir, { recursive: true, force: true });
    mkdirSync(invalidDir, { recursive: true });
    writeFileSync(join(invalidDir, "base.json"), canonicalJson(validBaseRecord()), "utf8");
    writeFileSync(join(invalidDir, "cases.json"), canonicalJson(invalidCases()), "utf8");
    process.stdout.write(`generated fixtures/invalid/ (${invalidCases().length} cases)\n`);
  }

  const lock = computeLock();
  writeFileSync(join(fixturesDir, "fixture.lock.json"), canonicalJson(lock), "utf8");
  process.stdout.write("wrote fixtures/fixture.lock.json\n");
  for (const [name, entry] of Object.entries(lock.sets)) {
    process.stdout.write(`  ${name}: ${entry.count} records, ${entry.hash.slice(0, 16)}...\n`);
  }
  process.stdout.write(`  invalid: ${lock.invalid.count} cases, ${lock.invalid.hash.slice(0, 16)}...\n`);
}

main();
