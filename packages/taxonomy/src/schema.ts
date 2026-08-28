/**
 * Taxonomy file format v1.
 *
 * Authority: PRD 5.1.3 ("Reject unknown facet values unless the manifest adds
 * them to the controlled vocabulary through a reviewed taxonomy change"), 8.3
 * ("Project roles, languages, frameworks, capabilities, evidence types, metric
 * categories, and accent tokens come from versioned vocabularies").
 *
 * ONE SOURCE, TWO CONSUMERS. `aliases` feeds both ingest normalization
 * (PRD 5.1.3) and query alias expansion (PRD 5.2.3). The search layer must
 * never carry its own copy - a drifted alias list produces a search that finds
 * things the filters cannot, which reads as a bug and is one.
 */

import { z } from "zod";

const termIdSchema = z.string().regex(/^[a-z0-9]+(?:[-.+][a-z0-9]+)*$/, {
  message: "Vocabulary term ids are lowercase, hyphen/dot separated identifiers.",
});

/** Deprecation carries a replacement so migration is mechanical, not archaeological. */
export const deprecationSchema = z.strictObject({
  replacedBy: termIdSchema.nullable(),
  since: z.int().min(1),
  reason: z.string().min(10).max(300),
});

export const termSchema = z.strictObject({
  id: termIdSchema,
  label: z.string().min(1).max(80),
  /** Lowercased on load. Must be globally unique across a vocabulary file. */
  aliases: z.array(z.string().min(1).max(60)),
  order: z.int().min(0),
  /** Taxonomy version that introduced this term. */
  since: z.int().min(1),
  deprecated: deprecationSchema.nullish(),

  // -- Track-specific fields (tracks.v1.json) ------------------------------
  /** Project id prefix owned by this track, e.g. "RAG" (rule TAX-TRACK-PREFIX-001). */
  idPrefix: z
    .string()
    .regex(/^[A-Z]{2,4}$/)
    .nullish(),
  /** Repository from the selection catalog's topology section. */
  repository: z.string().min(1).max(80).nullish(),
  /** Roles the track's header line assigns. */
  roles: z.array(z.string()).nullish(),
  /** The track's star-marked keystone project id. */
  keystone: z
    .string()
    .regex(/^[A-Z]{2,4}-[0-9]{2,4}$/)
    .nullish(),

  // -- Metric-specific fields (metrics.v1.json) ----------------------------
  /** Unit only: the physical dimension this unit measures. */
  dimension: z.string().min(1).max(40).nullish(),
  /** Unit only: multiplier converting this unit to its dimension's base unit. */
  toBase: z.number().positive().nullish(),
  /** Category only: dimensions a metric in this category may use. */
  dimensions: z.array(z.string().min(1).max(40)).nullish(),
});

export type Term = z.infer<typeof termSchema>;

export const groupSchema = z.strictObject({
  label: z.string().min(1).max(80),
  /** URL parameter this group filters through, or null if it is not a facet. */
  facetGroup: z.string().min(1).max(40).nullable(),
  order: z.int().min(0),
  terms: z.array(termSchema).min(1),
});

export type Group = z.infer<typeof groupSchema>;

/** A file with a single flat term list (tracks.v1.json). */
export const flatVocabularySchema = z.strictObject({
  $schema: z.string().optional(),
  vocabulary: z.string().min(1),
  version: z.int().min(1),
  closed: z.boolean(),
  description: z.string().min(20),
  terms: z.array(termSchema).min(1),
});

/** A file with named groups (closed-enums, technology, classification, metrics). */
export const groupedVocabularySchema = z.strictObject({
  $schema: z.string().optional(),
  vocabulary: z.string().min(1),
  version: z.int().min(1),
  closed: z.boolean(),
  description: z.string().min(20),
  groups: z.record(z.string(), groupSchema),
});

export const vocabularyFileSchema = z.union([groupedVocabularySchema, flatVocabularySchema]);

export type FlatVocabulary = z.infer<typeof flatVocabularySchema>;
export type GroupedVocabulary = z.infer<typeof groupedVocabularySchema>;
export type VocabularyFile = z.infer<typeof vocabularyFileSchema>;

export function isGrouped(file: VocabularyFile): file is GroupedVocabulary {
  return "groups" in file;
}
