/**
 * Loaded catalog, ready to query.
 *
 * Authority: PRD 4.1 ("keep all catalog logic behind framework-neutral
 * TypeScript interfaces"), 9.5 (cards store dictionary ids, not repeated
 * strings), 5.3.2 (ordinals and facet integer ids), 5.4 (all views consume
 * VisibleProjectIds).
 *
 * WHY THIS TAKES DATA RATHER THAN FETCHING IT. The engine runs in a browser, in
 * vitest, and in the property-test harness. Fetching is environment-specific;
 * filtering is not. `apps/web` owns the fetch and hands the bytes here, which is
 * also what lets 10,000-case property tests run with no browser at all.
 *
 * Nothing in this package imports React, Next, or the DOM. That is the
 * PRD 7.4 migration promise: when client search is outgrown, an edge service
 * goes behind the same contract without rewriting view or filter components.
 */

import type { CatalogCard, Facets } from "@atlas/contracts/artifacts";

export interface CatalogCore {
  readonly catalogHash: string;
  readonly count: number;
  readonly cards: readonly CatalogCard[];
}

/**
 * A term's position in the facet dictionaries.
 *
 * `setIndex` is the bitset this term occupies in facet-bits.bin. It is the
 * dictionary id, assigned by the compiler across ALL groups in order, which is
 * why it is unique catalog-wide rather than per group.
 */
export interface TermRef {
  readonly group: string;
  readonly value: string;
  readonly label: string;
  readonly setIndex: number;
  readonly count: number;
}

export interface LoadedCatalog {
  readonly core: CatalogCore;
  readonly facets: Facets;
  /** Ordinal -> card. Cards are already in ordinal order, but never assume it. */
  readonly byOrdinal: readonly CatalogCard[];
  /** "group:value" -> term. The lookup the URL layer needs. */
  readonly terms: ReadonlyMap<string, TermRef>;
  /** Dictionary id -> label, for decoding a card's `roles` and `stack`. */
  readonly labels: ReadonlyMap<number, string>;
}

export function termKey(group: string, value: string): string {
  return `${group}:${value}`;
}

/**
 * Index the artifacts once, at load.
 *
 * Every lookup below is on the hot path of a keystroke, so the maps are built
 * here rather than scanned per query. At 1,300 projects and ~200 terms this is
 * a few milliseconds once, against a 4 ms median budget per filter.
 */
export function loadCatalog(core: CatalogCore, facets: Facets): LoadedCatalog {
  if (core.catalogHash !== facets.catalogHash) {
    // PRD 9.7 requires a version mismatch to be reported rather than silently
    // rendered: mixed artifacts would filter one build's bitsets against
    // another build's ordinals and quietly return wrong projects.
    throw new Error(
      `catalog mismatch: catalog-core is ${core.catalogHash} but facets is ${facets.catalogHash}. Reload the manifest.`,
    );
  }

  const byOrdinal: CatalogCard[] = new Array<CatalogCard>(core.cards.length);
  for (const card of core.cards) byOrdinal[card.o] = card;

  const terms = new Map<string, TermRef>();
  const labels = new Map<number, string>();
  for (const group of facets.groups) {
    for (const value of group.values) {
      terms.set(termKey(group.group, value.value), {
        group: group.group,
        value: value.value,
        label: value.label,
        setIndex: value.id,
        count: value.count,
      });
      labels.set(value.id, value.label);
    }
  }

  return { core, facets, byOrdinal, terms, labels };
}

/**
 * A vocabulary gate for `parseUrlState`.
 *
 * Without it, `?tech=nonexistent` silently produces an empty result set that
 * looks like a bug. With it the value is dropped and reported in diagnostics,
 * which is what PRD 5.3.3 asks for.
 */
export function vocabularyGate(catalog: LoadedCatalog): (group: string, value: string) => boolean {
  return (group, value) => catalog.terms.has(termKey(group, value));
}

/** Decode a card's dictionary ids back to display labels (PRD 9.5). */
export function decodeLabels(catalog: LoadedCatalog, ids: readonly number[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const label = catalog.labels.get(id);
    if (label !== undefined) out.push(label);
  }
  return out;
}
