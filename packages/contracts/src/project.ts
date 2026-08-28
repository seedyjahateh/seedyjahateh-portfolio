/**
 * Project schema v3 - the canonical catalog record.
 *
 * Authority: PRD 8.1 (canonical object), 8.2 (enums), 8.3 (validation rules),
 * 5.1.3 (ingestion rejections).
 *
 * SOURCE OF TRUTH. This module is authored by hand; content/schema/*.json is
 * GENERATED from it (see cli/emit-schema.ts) and Ajv validates against the
 * generated artifact. A conformance test asserts both engines reach the same
 * verdict on every fixture, except for rules flagged `zodOnly` in the registry
 * - those are structurally inexpressible in JSON Schema and are documented as
 * such rather than quietly dropped.
 *
 * PRD 8.3 requires additionalProperties:false at EVERY object boundary, so every
 * object below is z.strictObject. There are no exceptions and no escape hatch.
 */

import { z } from "zod";

import {
  MIN_PROOF_LEVEL_FOR_FEATURED,
  PROOF_LEVEL_RANK,
  cardVariantSchema,
  complexitySchema,
  metricDirectionSchema,
  ownershipKindSchema,
  projectStatusSchema,
  projectTierSchema,
  proofLevelSchema,
  roleSchema,
  visibilitySchema,
} from "./enums.js";
import type { RuleId } from "./rules/registry.js";

/** Current schema version. Bumping this requires a migration script (PRD 8.3). */
export const SCHEMA_VERSION = 3 as const;

/** Maximum number of globally featured projects (PRD 6.2: five flagship proofs). */
export const MAX_GLOBAL_FEATURED = 5;

// -----------------------------------------------------------------------------
// Primitives
// -----------------------------------------------------------------------------

/** PRD 8.3: permanent after publication. */
export const PROJECT_ID_PATTERN = /^[A-Z]{2,4}-[0-9]{2,4}$/;
/** PRD 8.3 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Lowercase identifier used for vocabulary terms (PRD 5.1.3 normalization). */
export const TERM_PATTERN = /^[a-z0-9]+(?:[-.+][a-z0-9]+)*$/;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * Placeholder hosts that must never reach a production build (PRD 8.3).
 * `.invalid` and `.example` are reserved by RFC 2606 / RFC 6761; the rest are
 * the conventional documentation domains.
 */
export const PLACEHOLDER_HOST_PATTERN =
  /(^|\.)(example\.(com|org|net|invalid|edu)|example|invalid|test|localhost)$/i;

export const projectIdSchema = z.string().regex(PROJECT_ID_PATTERN, {
  message: "Project id must match ^[A-Z]{2,4}-[0-9]{2,4}$ (e.g. RAG-01).",
});

export const slugSchema = z.string().regex(SLUG_PATTERN, {
  message: "Slug must be lowercase alphanumeric segments joined by single hyphens.",
});

export const termSchema = z.string().regex(TERM_PATTERN, {
  message: "Vocabulary terms are lowercase, hyphen/dot separated identifiers.",
});

export const isoDateSchema = z.string().regex(ISO_DATE, {
  message: "Expected an ISO 8601 calendar date (YYYY-MM-DD).",
});

export const isoDateTimeSchema = z.string().regex(ISO_DATETIME, {
  message: "Expected an ISO 8601 UTC timestamp (YYYY-MM-DDTHH:MM:SSZ).",
});

/**
 * A site-relative path. Internal links are verified on every build
 * (PRD 5.1.3, rule LNK-INTERNAL-001).
 */
export const internalUrlSchema = z.string().regex(/^\/(?:[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*)$/, {
  message: "Internal links must be site-relative and start with '/'.",
});

/**
 * PRD 8.3: remote links use HTTPS except explicit localhost fixtures.
 *
 * Expressed as a REGEX rather than a .refine() on a parsed URL, deliberately.
 * Zod refinements do not survive into the emitted JSON Schema, so a refinement
 * here would leave Ajv silently accepting http:// links that the pipeline
 * rejects. A regex emits as `pattern` and both validators agree - which is why
 * CAT-URL-HTTPS-001 is NOT in the zod-only list while its neighbours are.
 */
export const HTTPS_OR_LOCALHOST_PATTERN =
  /^(?:https:\/\/|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[/?#]|$))/;

export const externalUrlSchema = z.string().regex(HTTPS_OR_LOCALHOST_PATTERN, {
  message: "Remote links must use HTTPS, except explicit localhost fixtures.",
});

export const anyUrlSchema = z.union([internalUrlSchema, externalUrlSchema]);

// -----------------------------------------------------------------------------
// Sub-objects
// -----------------------------------------------------------------------------

export const featuredSchema = z.strictObject({
  global: z.boolean(),
  /** Role lenses this project leads on (PRD 6.1 role pages). */
  roles: z.array(roleSchema),
  /** Display order among featured projects. Unique per PRD 6.2 (rule COR-FEAT-RANK-001). */
  rank: z.int().min(1).max(MAX_GLOBAL_FEATURED).nullable(),
});

export const datesSchema = z.strictObject({
  started: isoDateSchema.nullable(),
  completed: isoDateSchema.nullable(),
  /**
   * When the claims on this record were last confirmed true. PRD 14 treats a
   * stale lastVerified as a trigger to demote the proof level.
   */
  lastVerified: isoDateSchema.nullable(),
});

export const ownershipSchema = z.strictObject({
  kind: ownershipKindSchema,
  /** PRD 6.3 requires "the engineer's responsibility" to be explicit. */
  responsibilities: z.array(z.string().min(3).max(120)),
  collaborators: z.array(z.string().min(1).max(120)),
});

export const stackSchema = z.strictObject({
  languages: z.array(termSchema),
  frameworks: z.array(termSchema),
  data: z.array(termSchema),
  infrastructure: z.array(termSchema),
  ai: z.array(termSchema),
  testing: z.array(termSchema),
});

export const linksSchema = z.strictObject({
  /** PRD 0.3: the dedicated project URL is mandatory and canonical. */
  canonical: internalUrlSchema,
  live: externalUrlSchema.nullish(),
  source: externalUrlSchema.nullish(),
  caseStudy: anyUrlSchema.nullish(),
  documentation: anyUrlSchema.nullish(),
});

/**
 * PRD 5.1.4: store only fields the product uses. Every field here is objective
 * repository metadata; none of it may overwrite curated content (GHE-OVERWRITE-001).
 */
export const enrichmentSchema = z.strictObject({
  stars: z.int().min(0),
  forks: z.int().min(0),
  openIssues: z.int().min(0),
  lastPush: isoDateTimeSchema.nullable(),
  latestRelease: z.string().min(1).max(120).nullable(),
  fetchedAt: isoDateTimeSchema,
  etag: z.string().min(1).max(200).nullable(),
});

export const repositorySchema = z.strictObject({
  provider: z.literal("github"),
  owner: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  defaultBranch: z.string().min(1).max(120),
  visibility: z.enum(["public", "private"]),
  license: z.string().min(1).max(60).nullable(),
  archived: z.boolean(),
  /** Generated by the enrichment stage. Hand edits are rejected (GEN-FIELD-001). */
  enrichment: enrichmentSchema.nullish(),
});

export const evidenceSchema = z.strictObject({
  id: slugSchema,
  /** Vocabulary: content/taxonomy/evidence-types.v1.json (PRD 5.3.1 artifact facet). */
  type: termSchema,
  title: z.string().min(8).max(160),
  url: anyUrlSchema,
  /** PRD 6.3 leads the detail route with the primary artifact. At most one (XFD-EVID-PRIMARY-001). */
  primary: z.boolean(),
  verifiedAt: isoDateSchema.nullable(),
  /** PRD 8.3: `externally-validated` proof requires at least one external item. */
  external: z.boolean(),
});

export const metricSchema = z.strictObject({
  id: slugSchema,
  /** Vocabulary: content/taxonomy/metric-categories.v1.json (PRD 5.3.1). */
  category: termSchema,
  label: z.string().min(3).max(120),
  value: z.number().finite(),
  /** Vocabulary: content/taxonomy/metric-units.v1.json; dimension must match category. */
  unit: z.string().min(1).max(24),
  direction: metricDirectionSchema,
  /** PRD 5.1.3: a metric without its environment is not evidence. */
  environment: z.string().min(20).max(400),
  sampleSize: z.int().min(1).nullable(),
  /** PRD 0.10: synthetic benchmarks are labeled as synthetic. Never optional. */
  synthetic: z.boolean(),
  measuredAt: isoDateTimeSchema,
  evidenceUrl: anyUrlSchema,
});

export const imageSchema = z.strictObject({
  src: anyUrlSchema,
  fallbackSrc: anyUrlSchema.nullish(),
  /** PRD 5.1.3 / 9.3: intrinsic dimensions are mandatory; zero layout shift is a budget. */
  width: z.int().min(1).max(8000),
  height: z.int().min(1).max(8000),
  alt: z.string().max(300),
  blurDataUrl: z.string().nullish(),
  /**
   * True while this is a generated stand-in rather than real captured media.
   * PRD 8.3 blocks `featured.global` on placeholder card images.
   */
  placeholder: z.boolean().default(false),
});

export const mediaSchema = z.strictObject({
  card: imageSchema.nullish(),
  hero: imageSchema.nullish(),
  gallery: z.array(imageSchema),
});

export const architectureSchema = z.strictObject({
  style: termSchema,
  components: z.array(termSchema),
  dataStores: z.array(termSchema),
  qualities: z.array(termSchema),
  diagramUrl: anyUrlSchema.nullish(),
});

export const contentSchema = z.strictObject({
  /** PRD 6.3: problem, user, constraints, non-goals, system boundary. */
  problem: z.string().min(40).max(600).nullable(),
  hardestProblem: z.string().min(40).max(600).nullish(),
  /** PRD 6.3 requires limitations and the next scale threshold. */
  limitations: z.array(z.string().min(10).max(400)),
  caseStudyFile: z.string().min(1).max(300).nullish(),
});

export const searchMetaSchema = z.strictObject({
  /** PRD 5.2.3: curated aliases protect specialist work from fuzzy ranking. */
  aliases: z.array(z.string().min(2).max(80)),
  keywords: z.array(z.string().min(2).max(80)),
  excludeFromSearch: z.boolean(),
});

export const layoutSchema = z.strictObject({
  /** PRD 5.4.1: deterministic variants only. Card size never depends on content. */
  cardVariant: cardVariantSchema,
  /** Vocabulary: content/taxonomy/accent-tokens.v1.json. */
  accentToken: termSchema,
  gridPriority: z.int().min(0).max(1000),
  spatialGroup: termSchema.nullish(),
  allowSpatialView: z.boolean(),
});

/**
 * Selection and promotion score.
 *
 * Authority: portfolio-project-selection.md, "Selection and promotion score".
 * Not present in PRD 8.1's illustrative record - see ADR 0019. It encodes the
 * catalog's own publication gate so that promoting a project to `public` is a
 * checkable act rather than a judgement call.
 */
export const selectionSchema = z.strictObject({
  dimensions: z.strictObject({
    roleRelevance: z.int().min(0).max(25),
    engineeringDepth: z.int().min(0).max(20),
    productionEvidence: z.int().min(0).max(20),
    demoClarity: z.int().min(0).max(15),
    differentiation: z.int().min(0).max(10),
    portfolioReuse: z.int().min(0).max(10),
  }),
  /** Must equal the sum of the six dimensions (SEL-SCORE-003). */
  score: z.int().min(0).max(100),
  scoredAt: isoDateSchema,
});

export const integritySchema = z.strictObject({
  reviewedBy: z.string().min(1).max(120),
  reviewedAt: isoDateTimeSchema.nullable(),
  /** Generated at build. Hand edits are rejected (GEN-FIELD-001). */
  contentHash: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .nullable(),
  sourcePath: z.string().min(1).max(300),
});

// -----------------------------------------------------------------------------
// Root record
// -----------------------------------------------------------------------------

const projectBaseSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: projectIdSchema,
  slug: slugSchema,
  title: z.string().min(8).max(90),
  shortTitle: z.string().min(2).max(40).nullish(),
  /**
   * Optional by design. PRD 8.3 bounds it at 20-160 characters when present;
   * XFD-PUB-TAGLINE-001 requires it only for public records. A planned project
   * has no proven claim, and inventing one would violate PRD 12.2.
   */
  tagline: z.string().min(20).max(160).nullish(),
  summary: z.string().min(80).max(320),

  status: projectStatusSchema,
  visibility: visibilitySchema,
  tier: projectTierSchema,
  proofLevel: proofLevelSchema,

  /**
   * Owning track. Vocabulary: content/taxonomy/tracks.v1.json, derived from the
   * 16 tracks in portfolio-project-selection.md. The record's id prefix must
   * agree with the track (TAX-TRACK-PREFIX-001).
   */
  track: termSchema,

  featured: featuredSchema.nullish(),

  roles: z.array(roleSchema).min(1),
  domains: z.array(termSchema),
  capabilities: z.array(termSchema),
  complexity: complexitySchema,

  dates: datesSchema,
  ownership: ownershipSchema,
  stack: stackSchema,
  links: linksSchema,
  repository: repositorySchema.nullish(),

  evidence: z.array(evidenceSchema),
  metrics: z.array(metricSchema),
  media: mediaSchema,
  architecture: architectureSchema.nullish(),
  content: contentSchema,
  search: searchMetaSchema,
  layout: layoutSchema,
  selection: selectionSchema.nullish(),
  integrity: integritySchema,
});

export type ProjectInput = z.input<typeof projectBaseSchema>;
export type Project = z.output<typeof projectBaseSchema>;

/** Attach a registry rule id to a Zod issue so error reporting stays traceable. */
function ruleIssue(
  ctx: z.RefinementCtx,
  ruleId: RuleId,
  path: readonly (string | number)[],
  message: string,
  rejectedValue: unknown,
): void {
  ctx.addIssue({
    code: "custom",
    path: [...path],
    message,
    params: { ruleId, rejectedValue },
  });
}

/** Calendar-accurate date check; the regex only proves shape. */
function isRealDate(value: string): boolean {
  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/**
 * Cross-field rules (registry layer "cross-field").
 *
 * These run as refinements because they relate fields within one record. The
 * ones marked `zodOnly` in the registry cannot be represented in JSON Schema at
 * all; the rest are ALSO emitted as if/then conditionals so Ajv agrees.
 */
export const projectSchema = projectBaseSchema.superRefine((project, ctx) => {
  const isPublic = project.visibility === "public";

  // -- CAT-DATE-VALID-001: shape passed; confirm the calendar date exists.
  for (const [key, value] of Object.entries(project.dates)) {
    if (typeof value === "string" && !isRealDate(value)) {
      ruleIssue(
        ctx,
        "CAT-DATE-VALID-001",
        ["dates", key],
        `'${value}' is not a real calendar date.`,
        value,
      );
    }
  }

  // -- XFD-DATE-001 / 002: chronological ordering.
  const { started, completed, lastVerified } = project.dates;
  if (started !== null && completed !== null && completed < started) {
    ruleIssue(
      ctx,
      "XFD-DATE-001",
      ["dates", "completed"],
      `completed (${completed}) precedes started (${started}).`,
      completed,
    );
  }
  if (completed !== null && lastVerified !== null && lastVerified < completed) {
    ruleIssue(
      ctx,
      "XFD-DATE-002",
      ["dates", "lastVerified"],
      `lastVerified (${lastVerified}) precedes completed (${completed}).`,
      lastVerified,
    );
  }

  // -- XFD-EVID-PRIMARY-001 / XFD-EVID-ID-001
  const primaries = project.evidence.filter((item) => item.primary);
  if (primaries.length > 1) {
    ruleIssue(
      ctx,
      "XFD-EVID-PRIMARY-001",
      ["evidence"],
      `${primaries.length} items are marked primary.`,
      primaries.map((e) => e.id),
    );
  }
  const evidenceIds = project.evidence.map((item) => item.id);
  const duplicateEvidence = evidenceIds.filter((id, index) => evidenceIds.indexOf(id) !== index);
  if (duplicateEvidence.length > 0) {
    ruleIssue(
      ctx,
      "XFD-EVID-ID-001",
      ["evidence"],
      `Duplicate evidence ids: ${[...new Set(duplicateEvidence)].join(", ")}.`,
      duplicateEvidence,
    );
  }

  // -- XFD-METRIC-ID-001
  const metricIds = project.metrics.map((item) => item.id);
  const duplicateMetrics = metricIds.filter((id, index) => metricIds.indexOf(id) !== index);
  if (duplicateMetrics.length > 0) {
    ruleIssue(
      ctx,
      "XFD-METRIC-ID-001",
      ["metrics"],
      `Duplicate metric ids: ${[...new Set(duplicateMetrics)].join(", ")}.`,
      duplicateMetrics,
    );
  }

  // -- XFD-PROOF-001: `measured` needs a metric carrying evidence.
  if (project.proofLevel === "measured" || project.proofLevel === "externally-validated") {
    const withEvidence = project.metrics.filter((m) => m.evidenceUrl.length > 0);
    if (withEvidence.length === 0) {
      ruleIssue(
        ctx,
        "XFD-PROOF-001",
        ["proofLevel"],
        "No metric with evidence is present.",
        project.proofLevel,
      );
    }
  }

  // -- XFD-PROOF-002: `externally-validated` needs an external evidence item.
  if (project.proofLevel === "externally-validated") {
    if (!project.evidence.some((item) => item.external)) {
      ruleIssue(
        ctx,
        "XFD-PROOF-002",
        ["proofLevel"],
        "No evidence item is marked external.",
        project.proofLevel,
      );
    }
  }

  // -- XFD-FEAT-001: flagship gate.
  if (project.featured?.global === true) {
    const reasons: string[] = [];
    if (project.tier !== "flagship") reasons.push(`tier is '${project.tier}', not 'flagship'`);
    if (PROOF_LEVEL_RANK[project.proofLevel] < PROOF_LEVEL_RANK[MIN_PROOF_LEVEL_FOR_FEATURED]) {
      reasons.push(
        `proofLevel '${project.proofLevel}' is weaker than '${MIN_PROOF_LEVEL_FOR_FEATURED}'`,
      );
    }
    const card = project.media.card;
    if (card === null || card === undefined) reasons.push("no card image");
    else if (card.placeholder) reasons.push("card image is a placeholder");
    if (project.featured.rank === null) reasons.push("rank is null");
    if (reasons.length > 0) {
      ruleIssue(ctx, "XFD-FEAT-001", ["featured", "global"], reasons.join("; ") + ".", true);
    }
  }

  // -- MED-ALT-001: public media needs alt text.
  if (isPublic) {
    for (const key of ["card", "hero"] as const) {
      const image = project.media[key];
      if (image?.alt.trim().length === 0) {
        ruleIssue(ctx, "MED-ALT-001", ["media", key, "alt"], "Alt text is empty.", image.alt);
      }
    }
  }

  // -- XFD-PUB-001 / 002 / TAGLINE-001: publication requirements.
  if (isPublic) {
    if (!project.evidence.some((item) => item.primary)) {
      ruleIssue(
        ctx,
        "XFD-PUB-001",
        ["evidence"],
        "A public project needs one primary evidence item.",
        project.evidence.length,
      );
    }
    if (project.media.card === null || project.media.card === undefined) {
      ruleIssue(
        ctx,
        "XFD-PUB-001",
        ["media", "card"],
        "A public project needs a card image.",
        null,
      );
    }
    if (project.content.problem === null) {
      ruleIssue(
        ctx,
        "XFD-PUB-001",
        ["content", "problem"],
        "A public project needs a problem statement.",
        null,
      );
    }
    if (project.tagline === null || project.tagline === undefined) {
      ruleIssue(
        ctx,
        "XFD-PUB-TAGLINE-001",
        ["tagline"],
        "A public project needs a tagline.",
        // The branch is only reached when tagline is null or undefined, so the
        // rejected value reported to the author is always null.
        null,
      );
    }
    if (project.status === "complete" || project.status === "maintained") {
      if (project.evidence.length === 0) {
        ruleIssue(
          ctx,
          "XFD-PUB-002",
          ["evidence"],
          "A finished public project needs at least one evidence item.",
          0,
        );
      }
      const hasInspectableLink =
        Boolean(project.links.source) ||
        Boolean(project.links.live) ||
        Boolean(project.links.caseStudy);
      if (!hasInspectableLink) {
        ruleIssue(
          ctx,
          "XFD-PUB-002",
          ["links"],
          "Needs a source, live, or case-study link.",
          project.links,
        );
      }
    }
  }

  // -- SEL-SCORE-001 / 002 / 003: promotion thresholds.
  const selection = project.selection;
  if (selection !== null && selection !== undefined) {
    const dims = selection.dimensions;
    const sum =
      dims.roleRelevance +
      dims.engineeringDepth +
      dims.productionEvidence +
      dims.demoClarity +
      dims.differentiation +
      dims.portfolioReuse;
    if (sum !== selection.score) {
      ruleIssue(
        ctx,
        "SEL-SCORE-003",
        ["selection", "score"],
        `Declared ${selection.score}, dimensions sum to ${sum}.`,
        selection.score,
      );
    }
  }
  if (isPublic) {
    const score = selection?.score ?? null;
    const isAnchor = project.tier === "keystone" || project.tier === "flagship";
    const threshold = isAnchor ? 85 : 70;
    const ruleId: RuleId = isAnchor ? "SEL-SCORE-001" : "SEL-SCORE-002";
    if (score === null) {
      ruleIssue(
        ctx,
        ruleId,
        ["selection"],
        `A public ${project.tier} must carry a selection score of at least ${threshold}.`,
        null,
      );
    } else if (score < threshold) {
      ruleIssue(
        ctx,
        ruleId,
        ["selection", "score"],
        `Scored ${score}, needs at least ${threshold} for tier '${project.tier}'.`,
        score,
      );
    }
  }

  // -- CAT-URL-CANONICAL-001: canonical path must match the slug.
  const expectedCanonical = `/projects/${project.slug}`;
  if (project.links.canonical !== expectedCanonical) {
    ruleIssue(
      ctx,
      "CAT-URL-CANONICAL-001",
      ["links", "canonical"],
      `Expected '${expectedCanonical}'.`,
      project.links.canonical,
    );
  }

  // -- LNK-PLACEHOLDER-001: reserved documentation domains never ship.
  // Checked on every record, not only public ones: a private record with an
  // example.invalid link is a stub someone forgot to finish, and it becomes a
  // production link the moment it is promoted.
  for (const [key, value] of Object.entries(project.links)) {
    if (typeof value !== "string" || !value.startsWith("http")) continue;
    let host: string;
    try {
      host = new URL(value).hostname;
    } catch {
      continue;
    }
    if (PLACEHOLDER_HOST_PATTERN.test(host)) {
      ruleIssue(
        ctx,
        "LNK-PLACEHOLDER-001",
        ["links", key],
        `'${host}' is a reserved placeholder domain.`,
        value,
      );
    }
  }
});

export type ProjectRecord = z.output<typeof projectSchema>;

/** The unrefined shape, for the JSON Schema emitter and for partial tooling. */
export const projectStructuralSchema = projectBaseSchema;
