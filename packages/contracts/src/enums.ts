/**
 * Closed enumerations for Project schema v3.
 *
 * Authority: PRD 8.2 ("Required enums"). These are CLOSED sets. Adding a member
 * is a schema change requiring a migration script and fixture update (PRD 8.3),
 * not a taxonomy edit.
 *
 * Open vocabularies (languages, frameworks, capabilities, domains, evidence
 * types, metric categories, accent tokens, tracks) live in content/taxonomy/
 * and grow through reviewed taxonomy changes instead.
 */

import { z } from "zod";

/** PRD 8.2 */
export const PROJECT_STATUS = [
  "planned",
  "in-progress",
  "complete",
  "maintained",
  "archived",
] as const;

/** PRD 8.2 */
export const VISIBILITY = ["public", "unlisted", "private"] as const;

/**
 * PRD 8.2. Maps onto the selection catalog's three evidence levels
 * (portfolio-project-selection.md, "Executive decision"):
 *   flagship        <- the 5 rotating GitHub pins
 *   keystone        <- the 16 star-marked track case studies
 *   focused-exhibit <- the remaining 224
 * "case-study" sits between keystone and exhibit for work that earns a full
 * narrative without being its track's anchor.
 */
export const PROJECT_TIER = [
  "flagship",
  "keystone",
  "case-study",
  "focused-exhibit",
] as const;

/**
 * PRD 8.2, ordered weakest to strongest. Ordinal position is meaningful:
 * PRD 8.3 gates `featured.global` on "measured" or better, so comparisons
 * use PROOF_LEVEL_RANK below rather than string equality chains.
 */
export const PROOF_LEVEL = [
  "code",
  "live",
  "measured",
  "externally-validated",
] as const;

/** PRD 8.2. Exactly three; the role lenses in PRD 6.1 are 1:1 with these. */
export const ROLE = [
  "ai-engineer",
  "backend-engineer",
  "full-stack-engineer",
] as const;

/** PRD 8.2 */
export const COMPLEXITY = [
  "single-process",
  "service",
  "distributed-system",
  "data-platform",
  "ml-system",
  "ai-system",
] as const;

/** PRD 8.2 */
export const METRIC_DIRECTION = [
  "higher-is-better",
  "lower-is-better",
  "target-range",
  "informational",
] as const;

/** PRD 8.1 `ownership.kind`. */
export const OWNERSHIP_KIND = ["solo", "team", "contribution"] as const;

/** PRD 5.4.1: deterministic card variants. No content-driven masonry. */
export const CARD_VARIANT = ["standard", "wide", "feature"] as const;

/** PRD 7.2 CatalogState.sort */
export const SORT_ORDER = [
  "relevance",
  "proof",
  "year-desc",
  "year-asc",
  "title",
] as const;

/** PRD 7.2 CatalogState.view */
export const VIEW_MODE = ["grid", "rows", "spatial"] as const;

/** PRD 7.2 CatalogState.density */
export const DENSITY = ["compact", "comfortable"] as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export type Visibility = (typeof VISIBILITY)[number];
export type ProjectTier = (typeof PROJECT_TIER)[number];
export type ProofLevel = (typeof PROOF_LEVEL)[number];
export type Role = (typeof ROLE)[number];
export type Complexity = (typeof COMPLEXITY)[number];
export type MetricDirection = (typeof METRIC_DIRECTION)[number];
export type OwnershipKind = (typeof OWNERSHIP_KIND)[number];
export type CardVariant = (typeof CARD_VARIANT)[number];
export type SortOrder = (typeof SORT_ORDER)[number];
export type ViewMode = (typeof VIEW_MODE)[number];
export type Density = (typeof DENSITY)[number];

export const projectStatusSchema = z.enum(PROJECT_STATUS);
export const visibilitySchema = z.enum(VISIBILITY);
export const projectTierSchema = z.enum(PROJECT_TIER);
export const proofLevelSchema = z.enum(PROOF_LEVEL);
export const roleSchema = z.enum(ROLE);
export const complexitySchema = z.enum(COMPLEXITY);
export const metricDirectionSchema = z.enum(METRIC_DIRECTION);
export const ownershipKindSchema = z.enum(OWNERSHIP_KIND);
export const cardVariantSchema = z.enum(CARD_VARIANT);
export const sortOrderSchema = z.enum(SORT_ORDER);
export const viewModeSchema = z.enum(VIEW_MODE);
export const densitySchema = z.enum(DENSITY);

/** Rank for ordered comparison of proof strength. Higher is stronger. */
export const PROOF_LEVEL_RANK: Readonly<Record<ProofLevel, number>> = {
  code: 0,
  live: 1,
  measured: 2,
  "externally-validated": 3,
};

/**
 * PRD 8.3: `featured.global=true` requires proof level "measured" or
 * "externally-validated". Expressed once, here, so the Zod refinement, the
 * JSON Schema conditional, and the corpus rules cannot drift apart.
 */
export const MIN_PROOF_LEVEL_FOR_FEATURED: ProofLevel = "measured";

/** PRD 5.4.1 / 9.3: card variants map to fixed column spans, never measured heights. */
export const CARD_VARIANT_SPAN: Readonly<Record<CardVariant, number>> = {
  standard: 1,
  wide: 2,
  feature: 2,
};

/** Defaults for URL canonicalization (PRD 5.3.3). Omitted from serialized URLs. */
export const DEFAULT_SORT: SortOrder = "relevance";
export const DEFAULT_VIEW: ViewMode = "grid";
export const DEFAULT_DENSITY: Density = "comfortable";
