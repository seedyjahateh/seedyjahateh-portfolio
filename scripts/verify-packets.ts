/**
 * Task-packet verification.
 *
 * Authority: PRD 12.3 (machine-readable task packet), 12.2 ("Each workstream
 * uses a separate worktree/branch and an issue ID. No workstream edits another
 * workstream's owned paths without an explicit handoff.").
 *
 * The ownership rule is the one that keeps six parallel workstreams from corrupting
 * each other's work, and prose cannot enforce it. This checks that no two
 * packets claim overlapping paths, that no packet lists a path as both owned
 * and read-only, and that the frozen Phase 0 contracts are read-only to
 * everyone.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const tasksDir = join(repoRoot, "docs", "tasks");

interface Packet {
  taskId: string;
  workstream: string;
  phase: number;
  objective: string;
  ownedPaths: string[];
  readOnlyPaths: string[];
  prohibitedChanges: string[];
  inputs: string[];
  deliverables: string[];
  acceptance: string[];
  evidenceCommands: string[];
}

/**
 * What JSON.parse actually hands back.
 *
 * Typing an unvalidated file as `Packet` would be a lie: it claims every field
 * is present, which is precisely what this script exists to check. Declaring
 * the fields optional keeps the defensive checks below honest - and type-aware
 * linting agrees, instead of reporting them as unnecessary.
 */
type RawPacket = Partial<Packet>;

const REQUIRED_FIELDS: readonly (keyof Packet)[] = [
  "taskId",
  "workstream",
  "phase",
  "objective",
  "ownedPaths",
  "readOnlyPaths",
  "prohibitedChanges",
  "inputs",
  "deliverables",
  "acceptance",
  "evidenceCommands",
];

/**
 * Paths that must never be owned by an implementation workstream.
 * These are the frozen Phase 0 contracts and the reviewed governance files.
 */
const ARCHITECT_ONLY = [
  "packages/contracts/",
  "packages/taxonomy/",
  "content/schema/",
  "content/taxonomy/",
  "config/",
  "docs/prd/",
  "docs/adr/",
  "docs/contracts/",
  "docs/tasks/",
];

/** Turn a glob prefix into a comparable directory prefix. */
function normalizePrefix(glob: string): string {
  const withoutGlob = glob.replace(/\*\*.*$/u, "").replace(/\*.*$/u, "");
  return withoutGlob.endsWith("/") ? withoutGlob : `${withoutGlob}/`;
}

function overlaps(a: string, b: string): boolean {
  const pa = normalizePrefix(a);
  const pb = normalizePrefix(b);
  return pa.startsWith(pb) || pb.startsWith(pa);
}

function main(): void {
  const problems: string[] = [];
  const files = readdirSync(tasksDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const packets: Packet[] = [];

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(tasksDir, file), "utf8")) as RawPacket;

    const missing = REQUIRED_FIELDS.filter((field) => raw[field] === undefined);
    for (const field of missing) {
      problems.push(`${file}: missing required field '${String(field)}' (PRD 12.3).`);
    }
    if (missing.length > 0) continue;

    if (raw.ownedPaths?.length === 0) {
      problems.push(`${file}: a packet with no owned paths cannot be executed.`);
    }
    if (raw.acceptance?.length === 0) {
      problems.push(
        `${file}: no acceptance criteria. PRD 12.1 requires workstreams to produce evidence, not self-reported completion.`,
      );
    }
    if (raw.evidenceCommands?.length === 0) {
      problems.push(`${file}: no evidence commands; acceptance would be unverifiable.`);
    }

    // Every required field is present, so the narrowing is sound here.
    packets.push(raw as Packet);
  }

  const ids = packets.map((p) => p.taskId);
  if (new Set(ids).size !== ids.length) problems.push("Duplicate taskId across packets.");

  // The core invariant: owned paths must not overlap between packets.
  for (let i = 0; i < packets.length; i += 1) {
    for (let j = i + 1; j < packets.length; j += 1) {
      const a = packets[i];
      const b = packets[j];
      if (!a || !b) continue;
      for (const ownedA of a.ownedPaths) {
        for (const ownedB of b.ownedPaths) {
          if (overlaps(ownedA, ownedB)) {
            problems.push(
              `Ownership conflict: ${a.taskId} owns '${ownedA}' and ${b.taskId} owns '${ownedB}'. ` +
                `PRD 12.2 requires disjoint ownership.`,
            );
          }
        }
      }
    }
  }

  for (const packet of packets) {
    for (const owned of packet.ownedPaths) {
      for (const readOnly of packet.readOnlyPaths) {
        if (overlaps(owned, readOnly)) {
          problems.push(`${packet.taskId}: '${owned}' is listed as both owned and read-only.`);
        }
      }
      const prefix = normalizePrefix(owned);
      for (const frozen of ARCHITECT_ONLY) {
        if (prefix.startsWith(frozen)) {
          problems.push(
            `${packet.taskId} claims ownership of '${owned}', but '${frozen}' is architect-owned. ` +
              `Phase 0 contracts are read-only to implementation workstreams.`,
          );
        }
      }
    }
  }

  process.stdout.write(`verified ${packets.length} task packets\n`);
  for (const packet of packets) {
    process.stdout.write(
      `  ${packet.taskId} (phase ${packet.phase}) owns ${packet.ownedPaths.length} path(s), ` +
        `${packet.acceptance.length} acceptance criteria\n`,
    );
  }

  if (problems.length > 0) {
    process.stderr.write(`\npacket verification FAILED:\n`);
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    process.exit(1);
  }
  process.stdout.write("packets OK\n");
}

main();
