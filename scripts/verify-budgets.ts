/**
 * Budget governance.
 *
 * Authority: PRD 12.2 - "Workstreams cannot change performance budgets, acceptance
 * thresholds, security headers, schema strictness, or accessibility
 * requirements to make tests pass." PRD 0.9 - "A visual effect that breaks a
 * budget is removed, not excused."
 *
 * A rule that lives only in prose gets broken by the first workstream under time
 * pressure. This makes it mechanical:
 *
 *   1. The file must be internally well-formed (unique ids, known units,
 *      sane comparators) - a malformed budget silently gates nothing.
 *   2. If config/budgets.v1.json changed relative to the base ref, the commit
 *      range must reference an ADR. CI supplies BASE_REF; locally it is a
 *      no-op so day-to-day work is not obstructed.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const budgetsPath = join(repoRoot, "config", "budgets.v1.json");

const KNOWN_UNITS = new Set([
  "KB",
  "MB",
  "ms",
  "s",
  "days",
  "count",
  "percent",
  "ratio",
  "score",
  "elements",
  "px",
]);
const KNOWN_COMPARATORS = new Set(["<=", ">=", "<", ">"]);

interface Budget {
  id: string;
  section: string;
  value: number;
  unit: string;
  comparator: string;
  appliesTo: string;
  percentile?: number;
  failureThreshold?: number;
  status?: string;
  kind?: string;
  note?: string;
}

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function main(): void {
  const problems: string[] = [];
  const file = JSON.parse(readFileSync(budgetsPath, "utf8")) as {
    version: number;
    budgets: Budget[];
  };

  const seen = new Set<string>();
  for (const budget of file.budgets) {
    if (seen.has(budget.id)) problems.push(`Duplicate budget id '${budget.id}'.`);
    seen.add(budget.id);

    if (!KNOWN_UNITS.has(budget.unit)) {
      problems.push(`Budget '${budget.id}' uses unknown unit '${budget.unit}'.`);
    }
    if (!KNOWN_COMPARATORS.has(budget.comparator)) {
      problems.push(`Budget '${budget.id}' uses unknown comparator '${budget.comparator}'.`);
    }
    if (!Number.isFinite(budget.value)) {
      problems.push(`Budget '${budget.id}' has a non-numeric value.`);
    }
    if (!/^\d+(\.\d+)*$/.test(budget.section)) {
      problems.push(`Budget '${budget.id}' must cite a PRD section, got '${budget.section}'.`);
    }
    if (budget.percentile !== undefined && (budget.percentile < 1 || budget.percentile > 100)) {
      problems.push(`Budget '${budget.id}' has an out-of-range percentile.`);
    }
    // A failure threshold looser than the target is the point; one that is
    // tighter means the two were swapped.
    if (budget.failureThreshold !== undefined) {
      const looser = budget.comparator.startsWith("<")
        ? budget.failureThreshold >= budget.value
        : budget.failureThreshold <= budget.value;
      if (!looser) {
        problems.push(
          `Budget '${budget.id}': failureThreshold ${budget.failureThreshold} is stricter than the target ${budget.value}. They look swapped.`,
        );
      }
    }
  }

  process.stdout.write(`validated ${file.budgets.length} budgets\n`);

  const pending = file.budgets.filter((b) => b.status === "pending");
  if (pending.length > 0) {
    process.stdout.write(`${pending.length} budget(s) marked pending:\n`);
    for (const budget of pending) process.stdout.write(`  ${budget.id}: ${budget.note ?? ""}\n`);
  }

  // Change gate. Only meaningful in CI, where BASE_REF names the merge base.
  const baseRef = process.env["BASE_REF"];
  if (baseRef !== undefined && baseRef.length > 0) {
    const changed = git(["diff", "--name-only", `${baseRef}...HEAD`, "--", "config/"]);
    if (changed !== null && changed.length > 0) {
      const messages = git(["log", `${baseRef}...HEAD`, "--format=%B"]) ?? "";
      if (!/\bADR[- ]?\d{4}\b/i.test(messages) && !/docs\/adr\//i.test(messages)) {
        problems.push(
          `config/ changed (${changed.split("\n").join(", ")}) but no commit in ${baseRef}...HEAD references an ADR.\n` +
            `    PRD 12.2 forbids changing budgets to make tests pass. If the change is legitimate, ` +
            `write an ADR under docs/adr/ and cite it (e.g. "ADR-0017") in the commit body.`,
        );
      }
    }
  }

  if (problems.length > 0) {
    process.stderr.write(`\nbudget verification FAILED:\n`);
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    process.exit(1);
  }
  process.stdout.write("budgets OK\n");
}

main();
