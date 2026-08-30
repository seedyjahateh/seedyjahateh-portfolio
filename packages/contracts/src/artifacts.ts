/**
 * Generated artifact contracts v1.
 *
 * Authority: PRD 5.1.5 (generated artifacts and budgets), 5.3.2 (bitset
 * representation), 7.3 (cache and invalidation).
 *
 * These are the shapes the compiler (Workstream A) emits and the catalog engine
 * (Workstream B) consumes. Both sides import from here so neither can drift.
 */

import { z } from "zod";

import { canonicalJsonCompact } from "./canonical-json.js";
import { cardVariantSchema, proofLevelSchema, projectTierSchema } from "./enums.js";
import { isoDateTimeSchema, projectIdSchema, slugSchema, termSchema } from "./project.js";

const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

/**
 * The bootstrap manifest. PRD 7.3: this is the ONLY short-TTL document; it
 * points at immutable hashed artifacts, and a deployment publishes artifacts
 * before it, so it never names content that does not exist yet.
 */
export const manifestSchema = z.strictObject({
  schemaVersion: z.int(),
  buildVersion: z.string().min(1),
  /** Commit SHA of the build. Every RUM event carries this (PRD 10.5). */
  commitSha: z.string().regex(/^[a-f0-9]{7,40}$/),
  builtAt: isoDateTimeSchema,
  /** Identity of this catalog build; the search worker refuses mismatches. */
  catalogHash: contentHashSchema,
  counts: z.strictObject({
    public: z.int().min(0),
    unlisted: z.int().min(0),
    total: z.int().min(0),
    featured: z.int().min(0),
  }),
  artifacts: z.strictObject({
    catalogCore: z.strictObject({
      url: z.string(),
      hash: contentHashSchema,
      bytes: z.int().min(0),
    }),
    facets: z.strictObject({ url: z.string(), hash: contentHashSchema, bytes: z.int().min(0) }),
    facetBits: z.strictObject({ url: z.string(), hash: contentHashSchema, bytes: z.int().min(0) }),
    search: z.strictObject({ url: z.string(), hash: contentHashSchema, bytes: z.int().min(0) }),
    searchDocs: z.strictObject({ url: z.string(), hash: contentHashSchema, bytes: z.int().min(0) }),
    featured: z.strictObject({ url: z.string(), hash: contentHashSchema, bytes: z.int().min(0) }),
  }),
});

export type Manifest = z.infer<typeof manifestSchema>;

/**
 * One entry in catalog-core: the compact card record.
 *
 * PRD 0.7: "The initial route does not contain full project records. It
 * receives a compact card catalog." Budget is 500 KB Brotli for 1,300 entries
 * (PRD 5.1.5), which is about 390 bytes per record uncompressed-equivalent -
 * hence dictionary ids for repeated vocabulary terms rather than raw strings.
 */
export const catalogCardSchema = z.strictObject({
  /** Stable zero-based ordinal for this build (PRD 5.3.2). */
  o: z.int().min(0),
  id: projectIdSchema,
  slug: slugSchema,
  t: z.string(),
  /** Short claim shown on the card. */
  c: z.string(),
  tier: projectTierSchema,
  proof: proofLevelSchema,
  /** Dictionary ids, not strings (PRD 9.5). */
  roles: z.array(z.int().min(0)),
  stack: z.array(z.int().min(0)),
  year: z.int(),
  variant: cardVariantSchema,
  accent: termSchema,
  priority: z.int(),
  /** Card image; null renders the branded neutral placeholder (PRD 9.7). */
  img: z
    .strictObject({
      src: z.string(),
      w: z.int().min(1),
      h: z.int().min(1),
      alt: z.string(),
      /**
       * Derivative widths for `srcset`, so the grid can serve a card-sized
       * image rather than a full-width one (PRD 9.5). Widths rather than
       * assembled URLs: catalog-core measures 469 KB Brotli against a 500 KB
       * budget at 10,000 records, and repeating a URL prefix per entry per
       * card would spend that headroom on redundancy.
       */
      widths: z.array(z.int().min(1)).default([]),
    })
    .nullable(),
});

export type CatalogCard = z.infer<typeof catalogCardSchema>;

export const catalogCoreSchema = z.strictObject({
  catalogHash: contentHashSchema,
  count: z.int().min(0),
  cards: z.array(catalogCardSchema),
});

export const facetValueSchema = z.strictObject({
  /** Integer id used by the bitset layer (PRD 5.3.2). */
  id: z.int().min(0),
  value: termSchema,
  label: z.string().min(1),
  count: z.int().min(0),
  order: z.int(),
});

export const facetGroupSchema = z.strictObject({
  group: z.string().min(1),
  label: z.string().min(1),
  order: z.int(),
  values: z.array(facetValueSchema),
});

export const facetsSchema = z.strictObject({
  catalogHash: contentHashSchema,
  /** Total facet values; determines the bitset count in facet-bits.bin. */
  valueCount: z.int().min(0),
  groups: z.array(facetGroupSchema),
});

export type Facets = z.infer<typeof facetsSchema>;

export const featuredEntrySchema = z.strictObject({
  ordinal: z.int().min(0),
  id: projectIdSchema,
  slug: slugSchema,
  rank: z.int().min(1),
});

export const featuredArtifactSchema = z.strictObject({
  catalogHash: contentHashSchema,
  /** PRD 6.2: five flagship proofs on the home page. */
  global: z.array(featuredEntrySchema).max(5),
  /** PRD 6.1: role lenses reorder the same evidence. */
  byRole: z.record(z.string(), z.array(featuredEntrySchema)),
});

// -----------------------------------------------------------------------------
// facet-bits.bin binary layout
// -----------------------------------------------------------------------------

/**
 * Packed facet membership bitsets.
 *
 * PRD 5.3.2: "Store membership as Uint32Array(Math.ceil(projectCount / 32))".
 * At 1,300 projects one set is 41 words = 164 bytes; 200 facet values are about
 * 32.8 KB, against a 100 KB budget.
 *
 * LAYOUT (all integers little-endian):
 *
 *   offset  size  field
 *   ------  ----  -----------------------------------------------------------
 *        0     4  magic       ASCII "ATLB"
 *        4     2  version     uint16, currently 1
 *        6     2  reserved    uint16, must be 0
 *        8     4  projectCount
 *       12     4  wordsPerSet Math.ceil(projectCount / 32)
 *       16     4  setCount    number of facet values
 *       20     4  dictHash32  low 32 bits of the facets.json hash
 *       24     -  payload     setCount * wordsPerSet uint32 words
 *
 * The header is 24 bytes - a multiple of 4 - so the payload can be exposed as a
 * zero-copy Uint32Array view over the same ArrayBuffer.
 *
 * ENDIANNESS IS NOT DECORATIVE. A Uint32Array view reads in HOST byte order,
 * so a zero-copy view on a big-endian machine would silently return wrong
 * memberships rather than failing. Readers must call assertLittleEndian below,
 * or byte-swap. This is why the layout is frozen in Phase 0 rather than
 * discovered later.
 *
 * Bit addressing: project ordinal n lives at word (n >>> 5), bit (n & 31).
 */
export const FACET_BITS_MAGIC = 0x424c5441; // "ATLB" read little-endian
export const FACET_BITS_MAGIC_ASCII = "ATLB";
export const FACET_BITS_VERSION = 1;
export const FACET_BITS_HEADER_BYTES = 24;

export interface FacetBitsHeader {
  readonly version: number;
  readonly projectCount: number;
  readonly wordsPerSet: number;
  readonly setCount: number;
  readonly dictHash32: number;
}

/** Words needed to hold `projectCount` membership bits. */
export function wordsPerSet(projectCount: number): number {
  return Math.ceil(projectCount / 32);
}

/** Total file size for a given shape, header included. */
export function facetBitsByteLength(projectCount: number, setCount: number): number {
  return FACET_BITS_HEADER_BYTES + setCount * wordsPerSet(projectCount) * 4;
}

/**
 * True on a little-endian host. Every mainstream target is little-endian; this
 * exists so the failure is explicit rather than silent if that ever changes.
 */
export function isLittleEndian(): boolean {
  const probe = new ArrayBuffer(2);
  new DataView(probe).setUint16(0, 0x0102, true);
  return new Uint8Array(probe)[0] === 0x02;
}

export function parseFacetBitsHeader(buffer: ArrayBuffer): FacetBitsHeader {
  if (buffer.byteLength < FACET_BITS_HEADER_BYTES) {
    throw new Error(
      `facet-bits: buffer is ${buffer.byteLength} bytes, shorter than the ${FACET_BITS_HEADER_BYTES}-byte header.`,
    );
  }
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== FACET_BITS_MAGIC) {
    throw new Error(
      `facet-bits: bad magic 0x${magic.toString(16)}, expected "${FACET_BITS_MAGIC_ASCII}". The artifact is not a facet bitset file.`,
    );
  }
  const version = view.getUint16(4, true);
  if (version !== FACET_BITS_VERSION) {
    throw new Error(
      `facet-bits: unsupported version ${version}, expected ${FACET_BITS_VERSION}. Rebuild the catalog.`,
    );
  }
  const projectCount = view.getUint32(8, true);
  const words = view.getUint32(12, true);
  const setCount = view.getUint32(16, true);
  const dictHash32 = view.getUint32(20, true);

  const expectedWords = wordsPerSet(projectCount);
  if (words !== expectedWords) {
    throw new Error(
      `facet-bits: header says ${words} words per set but ${projectCount} projects need ${expectedWords}.`,
    );
  }
  const expectedBytes = facetBitsByteLength(projectCount, setCount);
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `facet-bits: buffer is ${buffer.byteLength} bytes, expected ${expectedBytes} for ${setCount} sets over ${projectCount} projects.`,
    );
  }
  return { version, projectCount, wordsPerSet: words, setCount, dictHash32 };
}

/**
 * Zero-copy view over the payload. Requires a little-endian host; the guard
 * turns a silent correctness bug into a loud one.
 */
export function facetBitsPayload(buffer: ArrayBuffer): Uint32Array {
  const header = parseFacetBitsHeader(buffer);
  if (!isLittleEndian()) {
    throw new Error(
      "facet-bits: host is big-endian; a zero-copy Uint32Array view would misread the little-endian payload. Byte-swap before use.",
    );
  }
  return new Uint32Array(buffer, FACET_BITS_HEADER_BYTES, header.setCount * header.wordsPerSet);
}

export function encodeFacetBits(
  projectCount: number,
  sets: readonly Uint32Array[],
  dictHash32: number,
): ArrayBuffer {
  const words = wordsPerSet(projectCount);
  const buffer = new ArrayBuffer(facetBitsByteLength(projectCount, sets.length));
  const view = new DataView(buffer);
  view.setUint32(0, FACET_BITS_MAGIC, true);
  view.setUint16(4, FACET_BITS_VERSION, true);
  view.setUint16(6, 0, true);
  view.setUint32(8, projectCount, true);
  view.setUint32(12, words, true);
  view.setUint32(16, sets.length, true);
  view.setUint32(20, dictHash32 >>> 0, true);

  // Written word by word through DataView so the file is little-endian
  // regardless of host byte order.
  let offset = FACET_BITS_HEADER_BYTES;
  for (const set of sets) {
    if (set.length !== words) {
      throw new Error(`facet-bits: set has ${set.length} words, expected ${words}.`);
    }
    for (let i = 0; i < words; i += 1) {
      view.setUint32(offset, set[i] ?? 0, true);
      offset += 4;
    }
  }
  return buffer;
}

/** Test whether project `ordinal` belongs to the facet set at `setIndex`. */
export function bitsetHas(
  payload: Uint32Array,
  wordsPer: number,
  setIndex: number,
  ordinal: number,
): boolean {
  const word = payload[setIndex * wordsPer + (ordinal >>> 5)];
  if (word === undefined) return false;
  return (word & (1 << (ordinal & 31))) !== 0;
}

// -----------------------------------------------------------------------------
// Budgets attached to artifacts (PRD 5.1.5)
// -----------------------------------------------------------------------------

/** Brotli-compressed transfer budgets at 1,300 projects, in kilobytes. */
export const ARTIFACT_BUDGETS_KB = {
  manifest: 20,
  catalogCore: 500,
  facets: 80,
  facetBits: 100,
  search: 900,
  featured: 25,
  /** Per project. */
  projectDetail: 100,
  /** Per page. */
  detailHtml: 250,
} as const satisfies Record<string, number>;

/** SHA-256 over canonical JSON. The single hashing convention for all artifacts. */
export async function hashCanonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJsonCompact(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}
