/**
 * Verify fixture determinism against the committed lock.
 *
 * Enforces rule BLD-DETERMINISM-001: "Two builds from identical normalized
 * inputs produced different bytes." Generation runs TWICE in-process and the
 * results are compared to each other AND to the lock, so both intra-run
 * nondeterminism (Math.random, Date.now, Set iteration order) and cross-commit
 * drift are caught.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJsonCompact } from "@atlas/contracts/canonical-json";

import { FIXTURE_SIZES, generateCatalog } from "../generate.js";
import { computeLock, type FixtureLock } from "./generate.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const lockPath = join(repoRoot, "fixtures", "fixture.lock.json");

function main(): void {
  const problems: string[] = [];

  // 1. Same-process repeatability.
  for (const size of FIXTURE_SIZES) {
    const first = canonicalJsonCompact(generateCatalog(size));
    const second = canonicalJsonCompact(generateCatalog(size));
    if (first !== second) {
      problems.push(
        `BLD-DETERMINISM-001: catalog-${size} differs between two generations in the same process. ` +
          `Look for Math.random, Date.now, locale-sensitive sorting, or Set/Map iteration order.`,
      );
    } else {
      process.stdout.write(`catalog-${size}: repeatable (${first.length} bytes)\n`);
    }
  }

  // 2. Agreement with the committed lock.
  let lock: FixtureLock;
  try {
    lock = JSON.parse(readFileSync(lockPath, "utf8")) as FixtureLock;
  } catch {
    process.stderr.write(
      "fixtures/fixture.lock.json is missing or unreadable. Run `pnpm fixtures:generate`.\n",
    );
    process.exit(1);
  }

  const current = computeLock();
  if (current.seedPrefix !== lock.seedPrefix) {
    problems.push(
      `Seed prefix changed from '${lock.seedPrefix}' to '${current.seedPrefix}'. ` +
        `This invalidates every recorded benchmark; it needs an ADR, not a regeneration.`,
    );
  }
  for (const [name, entry] of Object.entries(current.sets)) {
    const expected = lock.sets[name];
    if (expected === undefined) {
      problems.push(`Lock has no entry for '${name}'.`);
      continue;
    }
    if (expected.hash !== entry.hash) {
      problems.push(
        `${name}: hash ${entry.hash.slice(0, 16)}... does not match locked ${expected.hash.slice(0, 16)}.... ` +
          `If the generator changed on purpose, regenerate the lock and say so in the commit.`,
      );
    }
    if (expected.count !== entry.count) {
      problems.push(`${name}: ${entry.count} records, lock expects ${expected.count}.`);
    }
  }
  if (current.invalid.hash !== lock.invalid.hash) {
    problems.push(
      `invalid corpus: hash drift (${current.invalid.count} cases vs locked ${lock.invalid.count}).`,
    );
  }

  if (problems.length > 0) {
    process.stderr.write(`\nfixture verification FAILED:\n`);
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    process.exit(1);
  }

  process.stdout.write("fixtures deterministic and lock-consistent\n");
}

main();
