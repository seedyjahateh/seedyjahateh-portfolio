/**
 * Deterministic synthetic catalog generator.
 *
 * Authority: PRD 9.2 ("Catalog fixtures: 240, 1,300, and 10,000 deterministic
 * project records with representative tags and text lengths"), 5.1.3
 * (byte-identical builds), 11.1 (virtualization tests at 1,300 and 10,000).
 *
 * These are NOT the seed catalog. content/projects/ holds the real 240 records
 * imported from the selection document; this module produces synthetic records
 * for performance and scale testing, where realistic SHAPE matters and truth
 * does not apply. Every record here is obviously synthetic - the titles say so -
 * so no fixture can ever be mistaken for a claim (PRD 0.10, 12.2).
 *
 * "Representative" is doing real work in that PRD sentence. A fixture whose
 * fields are all the same length would hide exactly the bugs the budgets in
 * PRD 9.3 exist to catch: text that wraps to a second line changes card height,
 * and a long tail of tag counts changes bitset density and DOM size. So text
 * lengths sweep their full legal range including both boundaries, and tag
 * cardinality follows a long tail.
 */

import { SCHEMA_VERSION } from "@atlas/contracts/project";

import { createRng, type Rng } from "./prng.js";

export const FIXTURE_SIZES = [240, 1300, 10000] as const;
export type FixtureSize = (typeof FIXTURE_SIZES)[number];

/** Frozen so a fixture regenerated a year from now is byte-identical. */
export const FIXTURE_SEED_PREFIX = "project-atlas/fixtures/v1";

const TRACK_PREFIXES = [
  "SYS", "DEV", "API", "DB", "DST", "SEC", "TST", "OPS",
  "FE", "FS", "DE", "ML", "DL", "RAG", "AGT", "SD",
] as const;

const TRACK_IDS = [
  "systems", "developer-tooling", "api-backend", "data-internals",
  "distributed-systems", "security", "quality-engineering", "cloud-sre",
  "frontend", "full-stack-product", "data-engineering", "machine-learning",
  "deep-learning", "retrieval-rag", "agents-llmops", "system-design",
] as const;

const COMPLEXITIES = [
  "single-process", "service", "distributed-system",
  "data-platform", "ml-system", "ai-system",
] as const;

const ROLES = ["ai-engineer", "backend-engineer", "full-stack-engineer"] as const;
const TIERS = ["flagship", "keystone", "case-study", "focused-exhibit"] as const;
const PROOF_LEVELS = ["code", "live", "measured", "externally-validated"] as const;
const STATUSES = ["planned", "in-progress", "complete", "maintained", "archived"] as const;
const ACCENTS = ["violet", "cyan", "amber", "emerald", "rose", "slate"] as const;
const VARIANTS = ["standard", "wide", "feature"] as const;
const SPATIAL_GROUPS = [
  "ai-systems", "backend-systems", "data-systems", "product-systems", "platform-systems",
] as const;

const LANGUAGES = ["typescript", "python", "go", "java", "rust", "sql", "c", "bash"] as const;
const FRAMEWORKS = ["nextjs", "react", "fastapi", "spring-boot", "django", "dbt", "airflow"] as const;
const DATA_STORES = ["postgresql", "redis", "kafka", "qdrant", "pgvector", "elasticsearch"] as const;
const INFRA = ["docker", "kubernetes", "terraform", "opentelemetry", "prometheus", "aws"] as const;
const AI_STACK = ["pytorch", "vllm", "transformers", "xgboost", "mlflow"] as const;
const TESTING = ["pytest", "vitest", "playwright", "k6", "junit"] as const;

const CAPABILITIES = [
  "api", "distributed-systems", "security", "sre", "data", "ml", "model-serving",
  "rag", "agents", "accessibility", "performance", "system-design", "concurrency",
  "observability", "testing", "search",
] as const;

const DOMAINS = [
  "developer-tools", "knowledge-management", "commerce", "fintech", "mobility",
  "collaboration", "infrastructure", "analytics",
] as const;

const EVIDENCE_TYPES = [
  "benchmark", "evaluation", "adr", "runbook", "postmortem",
  "threat-model", "design-doc", "test-report",
] as const;

const METRIC_CATEGORIES = ["latency", "throughput", "reliability", "quality"] as const;
const METRIC_UNITS: Readonly<Record<string, string>> = {
  latency: "ms",
  throughput: "rps",
  reliability: "percent",
  quality: "ratio",
};

/** Filler vocabulary. Deliberately bland: fixtures must not read as real claims. */
const NOUNS = [
  "pipeline", "gateway", "scheduler", "index", "ledger", "router", "cache",
  "planner", "collector", "resolver", "broker", "registry", "sandbox", "harness",
] as const;
const ADJECTIVES = [
  "bounded", "deterministic", "replicated", "streaming", "layered", "isolated",
  "observable", "incremental", "partitioned", "idempotent",
] as const;
const VERBS = [
  "Validates", "Coordinates", "Compacts", "Replicates", "Reconciles",
  "Streams", "Schedules", "Indexes", "Partitions", "Verifies",
] as const;

/**
 * Build a string of a target length from whole words.
 * Padding to an exact length matters: PRD 8.3's bounds are 8-90, 20-160 and
 * 80-320, and the fixture set must include records sitting exactly on each edge.
 */
function textOfLength(rng: Rng, target: number, words: readonly string[]): string {
  let text = "";
  while (text.length < target) {
    const word = rng.pick(words);
    text = text.length === 0 ? word : `${text} ${word}`;
  }
  if (text.length > target) {
    text = text.slice(0, target).replace(/\s+\S*$/u, "");
    while (text.length < target) text += "x";
  }
  return text;
}

/**
 * Long-tailed count: usually small, occasionally large.
 * Uniform tag counts would give every card the same footprint and hide the DOM
 * and bitset-density behavior the budgets in PRD 9.3 and 5.3.2 constrain.
 */
function longTailCount(rng: Rng, min: number, max: number): number {
  const r = rng.next();
  const skewed = r * r * r;
  return min + Math.floor(skewed * (max - min + 1));
}

function pad(value: number, width: number): string {
  return value.toString().padStart(width, "0");
}

export function generateCatalog(size: number): unknown[] {
  const rng = createRng(`${FIXTURE_SEED_PREFIX}/${size}`);
  const records: unknown[] = [];

  for (let i = 0; i < size; i += 1) {
    const trackIndex = i % TRACK_PREFIXES.length;
    const prefix = TRACK_PREFIXES[trackIndex] as string;
    const track = TRACK_IDS[trackIndex] as string;
    // Ids stay within ^[A-Z]{2,4}-[0-9]{2,4}$, so the fixture exercises the real
    // pattern rather than a relaxed one.
    const id = `${prefix}-${pad((Math.floor(i / TRACK_PREFIXES.length) % 9999) + 1, 4)}`;
    const slug = `fixture-${id.toLowerCase()}-${pad(i, 5)}`;

    // Sweep the legal ranges, hitting both boundaries within the first records
    // of each size so even the 240-record fixture covers the edges.
    const titleLength = i % 83 === 0 ? 8 : i % 79 === 0 ? 90 : rng.int(18, 64);
    const summaryLength = i % 71 === 0 ? 80 : i % 67 === 0 ? 320 : rng.int(96, 240);
    const taglineLength = i % 61 === 0 ? 20 : i % 59 === 0 ? 160 : rng.int(40, 120);

    const proofLevel = rng.pick(PROOF_LEVELS);
    const status = rng.pick(STATUSES);
    const tier = rng.pick(TIERS);
    const year = rng.int(2019, 2026);

    // Evidence and metrics are consistent with proofLevel so the fixture stays
    // schema-valid: a "measured" record without a metric would trip
    // XFD-PROOF-001, which is the invalid corpus's job, not this generator's.
    const needsMetric = proofLevel === "measured" || proofLevel === "externally-validated";
    const needsExternal = proofLevel === "externally-validated";
    const evidenceCount = Math.max(needsExternal ? 2 : 1, longTailCount(rng, 1, 6));

    const evidence = Array.from({ length: evidenceCount }, (_, e) => ({
      id: `evidence-${pad(e, 2)}`,
      type: rng.pick(EVIDENCE_TYPES),
      title: textOfLength(rng, rng.int(20, 90), NOUNS),
      url: `/evidence/${slug}/item-${pad(e, 2)}`,
      primary: e === 0,
      verifiedAt: `${year}-0${rng.int(1, 9)}-${pad(rng.int(1, 28), 2)}`,
      external: needsExternal ? e === 1 : false,
    }));

    const metricCount = needsMetric ? longTailCount(rng, 1, 4) : longTailCount(rng, 0, 2);
    const metrics = Array.from({ length: metricCount }, (_, m) => {
      const category = rng.pick(METRIC_CATEGORIES);
      return {
        id: `metric-${pad(m, 2)}`,
        category,
        label: textOfLength(rng, rng.int(12, 60), NOUNS),
        value: rng.int(1, 5000),
        unit: METRIC_UNITS[category] ?? "count",
        direction: category === "latency" ? "lower-is-better" : "higher-is-better",
        // Every fixture metric is explicitly synthetic. PRD 0.10 allows no
        // other answer for generated data.
        environment: `Synthetic fixture record ${id}; generated by @atlas/fixtures, not measured on real hardware.`,
        sampleSize: rng.int(100, 10000),
        synthetic: true,
        measuredAt: `${year}-0${rng.int(1, 9)}-${pad(rng.int(1, 28), 2)}T12:00:00Z`,
        evidenceUrl: `/evidence/${slug}/metric-${pad(m, 2)}`,
      };
    });

    const hasCard = rng.chance(0.92);

    records.push({
      schemaVersion: SCHEMA_VERSION,
      id,
      slug,
      title: `${textOfLength(rng, Math.max(8, titleLength - 8), ADJECTIVES)} fixture`.slice(0, 90),
      tagline: textOfLength(rng, taglineLength, VERBS),
      summary: textOfLength(rng, summaryLength, NOUNS),
      status,
      visibility: "unlisted",
      tier,
      proofLevel,
      track,
      roles: rng.sample(ROLES, longTailCount(rng, 1, 3)),
      domains: rng.sample(DOMAINS, longTailCount(rng, 0, 3)),
      capabilities: rng.sample(CAPABILITIES, longTailCount(rng, 1, 8)),
      complexity: rng.pick(COMPLEXITIES),
      dates: {
        started: `${year}-0${rng.int(1, 6)}-${pad(rng.int(1, 28), 2)}`,
        completed: null,
        lastVerified: `${year}-1${rng.int(0, 2)}-${pad(rng.int(1, 28), 2)}`,
      },
      ownership: {
        kind: "solo",
        responsibilities: rng.sample(
          ["architecture", "implementation", "evaluation", "deployment", "testing"],
          longTailCount(rng, 1, 5),
        ),
        collaborators: [],
      },
      stack: {
        languages: rng.sample(LANGUAGES, longTailCount(rng, 1, 5)),
        frameworks: rng.sample(FRAMEWORKS, longTailCount(rng, 0, 4)),
        data: rng.sample(DATA_STORES, longTailCount(rng, 0, 4)),
        infrastructure: rng.sample(INFRA, longTailCount(rng, 0, 4)),
        ai: rng.sample(AI_STACK, longTailCount(rng, 0, 3)),
        testing: rng.sample(TESTING, longTailCount(rng, 0, 3)),
      },
      links: { canonical: `/projects/${slug}` },
      evidence,
      metrics,
      media: {
        card: hasCard
          ? {
              src: `/media/${slug}/card.avif`,
              fallbackSrc: `/media/${slug}/card.webp`,
              width: 800,
              height: 450,
              alt: textOfLength(rng, rng.int(30, 110), NOUNS),
              placeholder: false,
            }
          : null,
        hero: null,
        gallery: [],
      },
      content: {
        problem: textOfLength(rng, rng.int(60, 300), NOUNS),
        limitations: [textOfLength(rng, rng.int(20, 120), NOUNS)],
      },
      search: {
        aliases: rng.sample(["alpha", "beta", "gamma", "delta"], longTailCount(rng, 0, 3)),
        keywords: rng.sample([...NOUNS], longTailCount(rng, 0, 5)),
        excludeFromSearch: false,
      },
      layout: {
        cardVariant: rng.pick(VARIANTS),
        accentToken: rng.pick(ACCENTS),
        gridPriority: rng.int(0, 1000),
        spatialGroup: rng.pick(SPATIAL_GROUPS),
        allowSpatialView: true,
      },
      integrity: {
        reviewedBy: "fixture-generator",
        reviewedAt: null,
        contentHash: null,
        sourcePath: `fixtures/catalog-${size}/${id}-${pad(i, 5)}.json`,
      },
    });
  }

  return records;
}
