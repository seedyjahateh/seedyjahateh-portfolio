/**
 * Artifact-building stages.
 *
 * Authority: PRD 5.1.5 (generated artifacts and budgets), 5.3.2 (bitset
 * representation), 5.2.2 (search documents), 9.5 (dictionary ids rather than
 * repeated strings).
 *
 * Every shape here already exists in `@atlas/contracts/artifacts`; this module
 * only fills them. That separation is deliberate — the shapes were frozen in
 * Phase 0 so the search worker (Phase 3) and the views (Phase 4) could be built
 * against them before any compiler existed.
 */

import Fuse from "fuse.js";

import {
  encodeFacetBits,
  wordsPerSet,
  type CatalogCard,
  type Facets,
} from "@atlas/contracts/artifacts";
import { PROOF_LEVEL_RANK } from "@atlas/contracts/enums";
import type { ProjectRecord } from "@atlas/contracts/project";
import type { SearchDocument } from "@atlas/contracts/search-protocol";
import type { Taxonomy } from "@atlas/taxonomy";

import type { Stage } from "../pipeline.js";
import type { ValidatedRecord } from "./ingest.js";

// -----------------------------------------------------------------------------
// Ordering and ordinals
// -----------------------------------------------------------------------------

/**
 * The canonical catalog order.
 *
 * PRD 5.3.2 needs "a stable zero-based ordinal for the current build", and that
 * ordinal indexes every bitset. So the sort has to be total and deterministic:
 * curated priority first, then id, which is unique. Anything less would make
 * bitsets shift between builds and break byte-identical output.
 */
export function catalogOrder(a: ProjectRecord, b: ProjectRecord): number {
  return b.layout.gridPriority - a.layout.gridPriority || a.id.localeCompare(b.id);
}

export interface OrderedCatalog {
  /** In catalog order; index === ordinal. */
  readonly records: readonly ProjectRecord[];
  readonly ordinalById: ReadonlyMap<string, number>;
}

export const orderStage: Stage<readonly ValidatedRecord[], OrderedCatalog> = {
  name: "assign-ordinals",
  effects: ["pure"],
  count: (out) => out.records.length,
  run(entries) {
    const records = entries.map((e) => e.record).sort(catalogOrder);
    return {
      records,
      ordinalById: new Map(records.map((record, index) => [record.id, index])),
    };
  },
};

// -----------------------------------------------------------------------------
// Facet dictionaries
// -----------------------------------------------------------------------------

/**
 * The facet groups exposed to the URL, per PRD 5.3.1 and the URL grammar.
 *
 * `year` and `status` come from record fields rather than the taxonomy, so they
 * are built from observed values; the rest resolve against controlled
 * vocabularies.
 */
export const FACET_GROUPS = [
  "role",
  "tier",
  "proof",
  "lang",
  "tech",
  "capability",
  "artifact",
  "complexity",
  "year",
  "status",
] as const;

export type FacetGroup = (typeof FACET_GROUPS)[number];

/**
 * Which values a record contributes to each group.
 *
 * Exported because the audit's taxonomy diff must see exactly the terms the
 * site filters by. A second hand-maintained list would drift, and the drift
 * would be invisible until a facet quietly stopped matching.
 */
export function facetValuesFor(record: ProjectRecord, group: FacetGroup): string[] {
  switch (group) {
    case "role":
      return [...record.roles];
    case "tier":
      return [record.tier];
    case "proof":
      return [record.proofLevel];
    case "lang":
      return [...record.stack.languages];
    case "tech":
      return [
        ...record.stack.frameworks,
        ...record.stack.data,
        ...record.stack.infrastructure,
        ...record.stack.ai,
        ...record.stack.testing,
      ];
    case "capability":
      return [...record.capabilities];
    case "artifact":
      return [...new Set(record.evidence.map((e) => e.type))];
    case "complexity":
      return [record.complexity];
    case "year":
      return [String(yearOf(record))];
    case "status":
      return [record.status];
    default:
      return [];
  }
}

/** The year a record is filed under. Falls back through the date fields. */
export function yearOf(record: ProjectRecord): number {
  const source =
    record.dates.completed ?? record.dates.lastVerified ?? record.dates.started ?? null;
  if (source === null) return 0;
  return Number(source.slice(0, 4));
}

export interface FacetIndex {
  readonly facets: Facets;
  /** "group:value" -> global facet value id, which is also the bitset index. */
  readonly idByKey: ReadonlyMap<string, number>;
}

export interface FacetInput {
  readonly catalog: OrderedCatalog;
  readonly taxonomy: Taxonomy;
  readonly catalogHash: string;
}

/**
 * Build facet dictionaries.
 *
 * Value ids are assigned by walking groups in declaration order and values in
 * sorted order, so the same catalog always yields the same integer ids. Those
 * ids index into `facet-bits.bin`, so instability here would silently corrupt
 * every filter.
 */
export const facetStage: Stage<FacetInput, FacetIndex> = {
  name: "derive-facets",
  effects: ["pure"],
  count: (out) => out.facets.valueCount,
  run({ catalog, taxonomy, catalogHash }) {
    const labelFor = (group: FacetGroup, value: string): string => {
      const groupKey = TAXONOMY_GROUP_FOR[group];
      if (groupKey === null) return value;
      return taxonomy.byGroup.get(groupKey)?.get(value)?.label ?? value;
    };

    const idByKey = new Map<string, number>();
    const groups: Facets["groups"] = [];
    let nextId = 0;

    for (const [groupIndex, group] of FACET_GROUPS.entries()) {
      const counts = new Map<string, number>();
      for (const record of catalog.records) {
        for (const value of facetValuesFor(record, group)) {
          if (value === "" || value === "0") continue;
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }

      const values = [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, count], order) => {
          const id = nextId++;
          idByKey.set(`${group}:${value}`, id);
          return { id, value, label: labelFor(group, value), count, order };
        });

      groups.push({ group, label: GROUP_LABELS[group], order: groupIndex, values });
    }

    return {
      facets: { catalogHash, valueCount: nextId, groups },
      idByKey,
    };
  },
};

const GROUP_LABELS: Readonly<Record<FacetGroup, string>> = {
  role: "Role",
  tier: "Project tier",
  proof: "Proof level",
  lang: "Language",
  tech: "Technology",
  capability: "Capability",
  artifact: "Artifact",
  complexity: "System complexity",
  year: "Year",
  status: "Status",
};

/** Where a group's display labels come from, or null when the value is its own label. */
const TAXONOMY_GROUP_FOR: Readonly<Record<FacetGroup, string | null>> = {
  role: "closed-enums.role",
  tier: "closed-enums.tier",
  proof: "closed-enums.proof",
  lang: "technology.languages",
  tech: null,
  capability: "classification.capabilities",
  artifact: "classification.evidenceTypes",
  complexity: "closed-enums.complexity",
  year: null,
  status: "closed-enums.status",
};

// -----------------------------------------------------------------------------
// Bitsets
// -----------------------------------------------------------------------------

export interface BitsetInput {
  readonly catalog: OrderedCatalog;
  readonly facets: FacetIndex;
  readonly dictHash32: number;
}

/**
 * Pack facet membership.
 *
 * PRD 5.3.2: one `Uint32Array` per facet value, project ordinal n at word
 * `n >>> 5`, bit `n & 31`. The encoder itself lives in `@atlas/contracts` and
 * was tested in Phase 0 — this stage only fills the sets.
 */
export const bitsetStage: Stage<BitsetInput, ArrayBuffer> = {
  name: "build-bitsets",
  effects: ["pure"],
  count: (buffer) => buffer.byteLength,
  run({ catalog, facets, dictHash32 }) {
    const projectCount = catalog.records.length;
    const words = wordsPerSet(projectCount);
    const sets = Array.from({ length: facets.facets.valueCount }, () => new Uint32Array(words));

    for (const [ordinal, record] of catalog.records.entries()) {
      for (const group of FACET_GROUPS) {
        for (const value of facetValuesFor(record, group)) {
          const id = facets.idByKey.get(`${group}:${value}`);
          if (id === undefined) continue;
          const set = sets[id];
          if (set === undefined) continue;
          const word = ordinal >>> 5;
          set[word] = (set[word] ?? 0) | (1 << (ordinal & 31));
        }
      }
    }

    return encodeFacetBits(projectCount, sets, dictHash32);
  },
};

// -----------------------------------------------------------------------------
// catalog-core
// -----------------------------------------------------------------------------

export interface CatalogCoreInput {
  readonly catalog: OrderedCatalog;
  readonly facets: FacetIndex;
  readonly catalogHash: string;
}

/**
 * The compact card catalog.
 *
 * PRD 0.7: the initial route receives this, not full project records. PRD 9.5
 * asks for dictionary ids rather than repeated long strings, which is why roles
 * and stack are integers here — at 1,300 records the repeated strings would
 * dominate the 500 KB budget.
 */
export const catalogCoreStage: Stage<
  CatalogCoreInput,
  { catalogHash: string; count: number; cards: CatalogCard[] }
> = {
  name: "build-catalog",
  effects: ["pure"],
  count: (out) => out.cards.length,
  run({ catalog, facets, catalogHash }) {
    const cards = catalog.records.map((record, ordinal): CatalogCard => {
      const roleIds = record.roles
        .map((role) => facets.idByKey.get(`role:${role}`))
        .filter((id): id is number => id !== undefined);

      const stackIds = [
        ...record.stack.languages.map((v) => facets.idByKey.get(`lang:${v}`)),
        ...record.stack.frameworks.map((v) => facets.idByKey.get(`tech:${v}`)),
        ...record.stack.data.map((v) => facets.idByKey.get(`tech:${v}`)),
        ...record.stack.infrastructure.map((v) => facets.idByKey.get(`tech:${v}`)),
        ...record.stack.ai.map((v) => facets.idByKey.get(`tech:${v}`)),
        ...record.stack.testing.map((v) => facets.idByKey.get(`tech:${v}`)),
      ].filter((id): id is number => id !== undefined);

      const card = record.media.card;

      return {
        o: ordinal,
        id: record.id,
        slug: record.slug,
        t: record.title,
        c: record.tagline ?? record.summary,
        tier: record.tier,
        proof: record.proofLevel,
        roles: roleIds,
        stack: stackIds,
        year: yearOf(record),
        variant: record.layout.cardVariant,
        accent: record.layout.accentToken,
        priority: record.layout.gridPriority,
        img: card == null ? null : { src: card.src, w: card.width, h: card.height, alt: card.alt },
      };
    });

    return { catalogHash, count: cards.length, cards };
  },
};

// -----------------------------------------------------------------------------
// Search index
// -----------------------------------------------------------------------------

export interface SearchArtifact {
  readonly catalogHash: string;
  readonly docs: readonly SearchDocument[];
  /** Serialized Fuse index, hydrated by the worker rather than rebuilt. */
  readonly index: unknown;
}

export interface SearchInput {
  readonly catalog: OrderedCatalog;
  readonly catalogHash: string;
  readonly fuseKeys: readonly { name: string; weight: number }[];
}

/**
 * Build the search documents and the prebuilt Fuse index.
 *
 * PRD 0.6 and 5.2.2: the index is built in CI and hydrated in a worker; the
 * main thread must never construct it. Serializing it here is what makes that
 * possible.
 *
 * Records excluded from search still get an ordinal and a card - they are
 * simply absent from the index.
 */
export const searchStage: Stage<SearchInput, SearchArtifact> = {
  name: "build-search",
  effects: ["pure"],
  count: (out) => out.docs.length,
  run({ catalog, catalogHash, fuseKeys }) {
    const docs: SearchDocument[] = [];

    for (const [ordinal, record] of catalog.records.entries()) {
      if (record.search.excludeFromSearch) continue;
      docs.push({
        i: ordinal,
        id: record.id,
        slug: record.slug,
        t: record.title,
        c: record.tagline ?? record.summary,
        x: [
          ...record.stack.languages,
          ...record.stack.frameworks,
          ...record.stack.data,
          ...record.stack.infrastructure,
          ...record.stack.ai,
        ],
        r: [...record.roles],
        d: [...record.domains],
        a: [...new Set(record.evidence.map((e) => e.type))],
        y: yearOf(record),
        p: PROOF_LEVEL_RANK[record.proofLevel],
      });
    }

    const index = Fuse.createIndex(
      fuseKeys.map((key) => ({ name: key.name, weight: key.weight })),
      docs as unknown as readonly Record<string, unknown>[],
    ).toJSON();

    return { catalogHash, docs, index };
  },
};
