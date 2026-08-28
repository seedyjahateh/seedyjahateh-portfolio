/**
 * Taxonomy loader.
 *
 * Loads content/taxonomy/*.v1.json, validates it, and exposes lookup by id or
 * alias. Pure and synchronous: the compiler, the importer, and the tests all
 * need the same view, and a deterministic build (PRD 5.1.3) cannot depend on
 * load order.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ROLE,
  PROJECT_TIER,
  PROOF_LEVEL,
  PROJECT_STATUS,
  COMPLEXITY,
} from "@atlas/contracts/enums";

import {
  isGrouped,
  vocabularyFileSchema,
  type Group,
  type Term,
  type VocabularyFile,
} from "./schema.js";

export * from "./schema.js";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "../../..");
export const TAXONOMY_DIR = join(REPO_ROOT, "content", "taxonomy");

export const VOCABULARY_FILES = [
  "tracks.v1.json",
  "closed-enums.v1.json",
  "technology.v1.json",
  "classification.v1.json",
  "metrics.v1.json",
] as const;

export interface LoadedGroup {
  /** "<file>.<group>", e.g. "technology.languages". */
  readonly key: string;
  readonly file: string;
  readonly name: string;
  readonly label: string;
  readonly facetGroup: string | null;
  readonly order: number;
  readonly terms: readonly Term[];
}

export interface Taxonomy {
  readonly groups: readonly LoadedGroup[];
  /** group key -> term id -> term */
  readonly byGroup: ReadonlyMap<string, ReadonlyMap<string, Term>>;
  /** Every term id across every group. Ambiguity is rejected at load. */
  readonly allTerms: ReadonlyMap<string, { group: string; term: Term }>;
  /** alias (lowercased) -> canonical term id, scoped per group. */
  readonly aliasIndex: ReadonlyMap<string, string>;
}

function readVocabulary(fileName: string): VocabularyFile {
  const raw = readFileSync(join(TAXONOMY_DIR, fileName), "utf8");
  const parsed: unknown = JSON.parse(raw);
  const result = vocabularyFileSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid taxonomy file content/taxonomy/${fileName}:\n${detail}`);
  }
  return result.data;
}

export function loadTaxonomy(): Taxonomy {
  const groups: LoadedGroup[] = [];

  for (const fileName of VOCABULARY_FILES) {
    const file = readVocabulary(fileName);
    const base = fileName.replace(/\.v\d+\.json$/, "");

    if (isGrouped(file)) {
      for (const [name, group] of Object.entries(file.groups)) {
        groups.push(toLoadedGroup(base, name, group));
      }
    } else {
      groups.push(
        toLoadedGroup(base, base, {
          label: file.vocabulary,
          facetGroup: base === "tracks" ? "track" : null,
          order: 0,
          terms: file.terms,
        }),
      );
    }
  }

  groups.sort((a, b) => a.key.localeCompare(b.key));

  const byGroup = new Map<string, ReadonlyMap<string, Term>>();
  const allTerms = new Map<string, { group: string; term: Term }>();
  const aliasIndex = new Map<string, string>();

  for (const group of groups) {
    const terms = new Map<string, Term>();
    for (const term of group.terms) {
      if (terms.has(term.id)) {
        throw new Error(`Duplicate term '${term.id}' in taxonomy group '${group.key}'.`);
      }
      terms.set(term.id, term);

      // A term id may legitimately appear in two groups (e.g. "security" is
      // both a capability and a track). Scope the global index by group key.
      allTerms.set(`${group.key}:${term.id}`, { group: group.key, term });

      for (const alias of [term.id, ...term.aliases]) {
        const key = `${group.key}:${alias.toLowerCase()}`;
        const existing = aliasIndex.get(key);
        if (existing !== undefined && existing !== term.id) {
          throw new Error(
            `Alias '${alias}' in group '${group.key}' is claimed by both '${existing}' and '${term.id}'.`,
          );
        }
        aliasIndex.set(key, term.id);
      }
    }
    byGroup.set(group.key, terms);
  }

  return { groups, byGroup, allTerms, aliasIndex };
}

function toLoadedGroup(file: string, name: string, group: Group): LoadedGroup {
  return {
    key: `${file}.${name}`,
    file,
    name,
    label: group.label,
    facetGroup: group.facetGroup,
    order: group.order,
    terms: [...group.terms].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
  };
}

/** Resolve an id or alias to its canonical term id, or null if unknown. */
export function resolveTerm(taxonomy: Taxonomy, groupKey: string, value: string): string | null {
  return taxonomy.aliasIndex.get(`${groupKey}:${value.trim().toLowerCase()}`) ?? null;
}

export function getGroup(taxonomy: Taxonomy, groupKey: string): LoadedGroup {
  const group = taxonomy.groups.find((candidate) => candidate.key === groupKey);
  if (group === undefined) {
    const available = taxonomy.groups.map((g) => g.key).join(", ");
    throw new Error(`Unknown taxonomy group '${groupKey}'. Available: ${available}`);
  }
  return group;
}

/**
 * Exhaustiveness between the closed TypeScript enums (PRD 8.2) and their label
 * vocabularies, checked in BOTH directions.
 *
 * One direction alone is not enough: a missing label leaves a facet rendering a
 * raw identifier, and an extra label offers users a filter that can never match.
 */
export interface ExhaustivenessProblem {
  readonly group: string;
  readonly kind: "missing-label" | "orphan-label";
  readonly value: string;
}

export function checkClosedEnumExhaustiveness(taxonomy: Taxonomy): ExhaustivenessProblem[] {
  const pairs: readonly [string, readonly string[]][] = [
    ["closed-enums.role", ROLE],
    ["closed-enums.tier", PROJECT_TIER],
    ["closed-enums.proof", PROOF_LEVEL],
    ["closed-enums.status", PROJECT_STATUS],
    ["closed-enums.complexity", COMPLEXITY],
  ];

  const problems: ExhaustivenessProblem[] = [];

  for (const [groupKey, members] of pairs) {
    const terms = taxonomy.byGroup.get(groupKey);
    if (terms === undefined) {
      problems.push({ group: groupKey, kind: "missing-label", value: "<entire group>" });
      continue;
    }
    for (const member of members) {
      if (!terms.has(member)) {
        problems.push({ group: groupKey, kind: "missing-label", value: member });
      }
    }
    for (const id of terms.keys()) {
      if (!members.includes(id)) {
        problems.push({ group: groupKey, kind: "orphan-label", value: id });
      }
    }
  }

  return problems;
}

/**
 * Track integrity, derived from portfolio-project-selection.md.
 * Sixteen tracks, unique id prefixes, unique repositories, and a keystone whose
 * prefix belongs to its own track.
 */
export interface TrackInfo {
  readonly id: string;
  readonly label: string;
  readonly idPrefix: string;
  readonly repository: string;
  readonly roles: readonly string[];
  readonly keystone: string;
}

export function loadTracks(taxonomy: Taxonomy): readonly TrackInfo[] {
  const group = getGroup(taxonomy, "tracks.tracks");
  return group.terms.map((term) => {
    if (!term.idPrefix || !term.repository || !term.roles || !term.keystone) {
      throw new Error(
        `Track '${term.id}' is missing idPrefix, repository, roles, or keystone in tracks.v1.json.`,
      );
    }
    return {
      id: term.id,
      label: term.label,
      idPrefix: term.idPrefix,
      repository: term.repository,
      roles: term.roles,
      keystone: term.keystone,
    };
  });
}

/** Map an id prefix (e.g. "RAG") to its owning track. */
export function trackByPrefix(tracks: readonly TrackInfo[]): ReadonlyMap<string, TrackInfo> {
  const map = new Map<string, TrackInfo>();
  for (const track of tracks) {
    if (map.has(track.idPrefix)) {
      throw new Error(`Duplicate track id prefix '${track.idPrefix}'.`);
    }
    map.set(track.idPrefix, track);
  }
  return map;
}
