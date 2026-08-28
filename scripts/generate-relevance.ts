/**
 * Relevance judgement generator.
 *
 * Authority: PRD 5.2.2 ("A labeled relevance suite of at least 150 queries
 * decides changes. It must cover exact IDs, title prefixes, misspellings,
 * acronyms, technologies, cross-field queries, role queries, and no-result
 * cases"), 11.1, 11.2.
 *
 * WHAT IS DERIVABLE AND WHAT IS NOT.
 *
 * A judgement is only useful if its expected answer is defensible. Five of the
 * eight required classes can be derived mechanically from the seed catalog,
 * because the expected result follows from data that already exists:
 *
 *   exact-id       every id is unique, so the top-1 answer is definitional
 *   title-prefix   a prefix of a unique title has one obvious best match
 *   acronym        acronyms that appear verbatim in titles (DNS, TLS, RAG...)
 *   misspelling    a single-character transposition of a real title still has
 *                  one correct answer; which typo is arbitrary, tolerance is not
 *   no-result      a query with no lexical overlap must return nothing
 *
 * Three classes are NOT derivable yet and are deliberately absent:
 *
 *   technology     needs stack fields, which are empty by design (ADR 0020)
 *   cross-field    needs stack + capability + evidence together
 *   role           derivable, but every project in a track shares its roles,
 *                  so a role query has 30-45 equally correct answers and the
 *                  judgement would assert nothing
 *
 * Writing those now would mean inventing expected answers for data that does
 * not exist - the exact failure PRD 12.2 forbids. So the generator emits what
 * it can, records the gap in the file, and the SEARCH-RELEVANCE-QUERIES budget
 * stays status: "pending" until real content lands.
 *
 * Deterministic: no clock, no randomness, stable ordering.
 */

import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "@atlas/contracts/canonical-json";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const projectsDir = join(repoRoot, "content", "projects");
const outDir = join(repoRoot, "fixtures", "relevance");

type JudgementKind =
  | "exact-id"
  | "title-prefix"
  | "acronym"
  | "misspelling"
  | "no-result";

interface Judgement {
  readonly id: string;
  readonly kind: JudgementKind;
  readonly query: string;
  /** Expected best match, or null for a no-result case. */
  readonly expectTop1: string | null;
  /** Ids that must appear in the top five. */
  readonly expectTop5: readonly string[];
  readonly note?: string;
}

/** Acronyms that appear verbatim in seed titles; the expected match is lexical. */
const ACRONYMS = [
  "DNS", "TLS", "TCP", "HTTP", "RESP", "OAuth", "OIDC", "CDC", "SBOM",
  "RBAC", "SSRF", "eBPF", "GPT", "OCR", "LoRA", "vLLM", "CQRS", "Raft",
  "GitOps", "SLO", "WCAG", "PII", "ETA", "API",
] as const;

/** Queries with no lexical overlap with any seed title. */
const NO_RESULT_QUERIES = [
  "quantum blockchain casino",
  "zzzzzz nonexistent",
  "horoscope generator",
  "cryptocurrency arbitrage bot",
  "mlm downline tracker",
  "psychic hotline crm",
  "roulette martingale simulator",
  "tarot card api",
  "penny stock pump signals",
  "fake review generator",
] as const;

interface SeedRecord {
  id: string;
  title: string;
  track: string;
}

/** Swap two adjacent characters - a deterministic, realistic single typo. */
function transpose(text: string, index: number): string {
  if (index < 0 || index + 1 >= text.length) return text;
  return text.slice(0, index) + text[index + 1] + text[index] + text.slice(index + 2);
}

function main(): void {
  const records: SeedRecord[] = readdirSync(projectsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(projectsDir, f), "utf8")) as SeedRecord);

  const judgements: Judgement[] = [];
  let counter = 0;
  const nextId = (): string => `REL-${String(++counter).padStart(4, "0")}`;

  // 1. Exact ids. PRD 5.2.3 requires these to bypass fuzzy ranking entirely.
  // Every 4th record keeps the suite representative without letting one class
  // dominate the count.
  for (const record of records.filter((_, i) => i % 4 === 0)) {
    judgements.push({
      id: nextId(),
      kind: "exact-id",
      query: record.id,
      expectTop1: record.id,
      expectTop5: [record.id],
      note: "Exact project id must bypass fuzzy ranking (PRD 5.2.3).",
    });
  }

  // 2. Title prefixes. First three words, where that is unambiguous.
  const titleWords = new Map<string, string[]>();
  for (const record of records) {
    const prefix = record.title.split(" ").slice(0, 3).join(" ").toLowerCase();
    const owners = titleWords.get(prefix) ?? [];
    owners.push(record.id);
    titleWords.set(prefix, owners);
  }
  for (const [prefix, owners] of [...titleWords.entries()].sort()) {
    if (owners.length !== 1 || prefix.length < 8) continue;
    if (judgements.filter((j) => j.kind === "title-prefix").length >= 45) break;
    const owner = owners[0];
    if (owner === undefined) continue;
    judgements.push({
      id: nextId(),
      kind: "title-prefix",
      query: prefix,
      expectTop1: owner,
      expectTop5: [owner],
    });
  }

  // 3. Acronyms appearing verbatim in titles.
  for (const acronym of ACRONYMS) {
    const matches = records
      .filter((r) => r.title.toLowerCase().includes(acronym.toLowerCase()))
      .map((r) => r.id);
    if (matches.length === 0) continue;
    // Spread the note conditionally: exactOptionalPropertyTypes distinguishes
    // "absent" from "present and undefined", and canonicalJson drops the former.
    judgements.push({
      id: nextId(),
      kind: "acronym",
      query: acronym.toLowerCase(),
      expectTop1: matches.length === 1 ? (matches[0] ?? null) : null,
      expectTop5: matches.slice(0, 5),
      ...(matches.length === 1
        ? {}
        : { note: `${matches.length} titles contain this acronym; any of them may rank first.` }),
    });
  }

  // 4. Misspellings: one adjacent transposition in a distinctive title word.
  for (const record of records.filter((_, i) => i % 8 === 3)) {
    const word = record.title
      .split(" ")
      .filter((w) => w.length >= 7)
      .sort((a, b) => b.length - a.length)[0];
    if (word === undefined) continue;
    const typo = transpose(word.toLowerCase(), Math.floor(word.length / 2));
    if (typo === word.toLowerCase()) continue;
    judgements.push({
      id: nextId(),
      kind: "misspelling",
      query: typo,
      expectTop1: record.id,
      expectTop5: [record.id],
      note: `Single transposition of "${word}". Fuzzy matching must tolerate one typo.`,
    });
  }

  // 5. No-result cases. An empty result set is a correct answer, and PRD 10.1
  // requires the no-result state to be announced.
  for (const query of NO_RESULT_QUERIES) {
    judgements.push({
      id: nextId(),
      kind: "no-result",
      query,
      expectTop1: null,
      expectTop5: [],
      note: "Must return zero results rather than a weak fuzzy match.",
    });
  }

  const byKind = judgements.reduce<Record<string, number>>((acc, j) => {
    acc[j.kind] = (acc[j.kind] ?? 0) + 1;
    return acc;
  }, {});

  const output = {
    version: 1,
    description:
      "Labelled relevance judgements for the search worker (PRD 5.2.2). Generated " +
      "deterministically from the seed catalog by scripts/generate-relevance.ts. " +
      "Do not hand-edit; add human-authored judgements in a separate file so the " +
      "generated set stays regenerable.",
    generatedFrom: "content/projects/",
    target: 150,
    total: judgements.length,
    byKind,
    missingClasses: {
      technology:
        "Requires stack fields, which are empty by design until records are authored (ADR 0020).",
      "cross-field":
        "Requires stack, capability and evidence together on the same record.",
      role:
        "Derivable, but every project in a track shares its roles, so a role query has 30-45 equally correct answers and the judgement would assert nothing.",
    },
    judgements,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "judgments.v1.json"), canonicalJson(output), "utf8");

  process.stdout.write(`wrote ${judgements.length} judgements to fixtures/relevance/judgments.v1.json\n`);
  for (const [kind, count] of Object.entries(byKind).sort()) {
    process.stdout.write(`  ${kind}: ${count}\n`);
  }
  process.stdout.write(
    judgements.length >= 150
      ? `\nReached the PRD 5.2.2 target of 150, but three classes are still missing (technology, cross-field, role).\n` +
          `The SEARCH-RELEVANCE-QUERIES budget stays pending until those are authorable.\n`
      : `\n${150 - judgements.length} short of the PRD 5.2.2 target; budget remains pending.\n`,
  );
}

main();
