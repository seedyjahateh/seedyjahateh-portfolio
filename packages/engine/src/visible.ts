/**
 * `VisibleProjectIds` — the one ordered output of search + facets + sort.
 *
 * Authority: PRD 5.4 ("All views consume VisibleProjectIds, the single ordered
 * output of search + facets + sort. Views may not implement independent
 * filtering logic"), 5.3.2 ("The search worker returns a result bitset or
 * ordered ID list; filters intersect it without rescanning text"), 5.2.3
 * (relevance dominates editorial priority), 5.3.3 (filter timing budgets).
 *
 * This module is the reason views cannot drift: rows, the future grid, and the
 * spatial view all render the same array in the same order, and none of them
 * can filter.
 */

import type { SortOrder } from "@atlas/contracts/enums";

import type { LoadedCatalog } from "./catalog.js";
import { FacetEngine, type Selection } from "./facets.js";
import { comparatorFor } from "./sort.js";

export interface VisibleInput {
  readonly selection: Selection;
  readonly sort: SortOrder;
  /**
   * Ranked ordinals from the search worker, best first, or null when no query
   * is active. Already capped at MAX_WORKER_RESULTS by the worker.
   */
  readonly searchOrder: Uint32Array | null;
  /**
   * The worker's pre-limit match count, used only to tell the visitor their
   * result list was capped. Ignored when `searchOrder` is null.
   */
  readonly searchTotal?: number;
}

export interface VisibleResult {
  /** Ordered catalog ordinals. The only thing views render. */
  readonly ids: Uint32Array;
  /** How many projects are visible, i.e. `ids.length`. */
  readonly total: number;
  /**
   * True when a query matched more projects than the worker returned.
   *
   * PRD 5.2.3 caps the worker at 50 ranked ids. Without this flag the archive
   * would show "50 results" for a query matching 300, which is a false count —
   * the UI says "top 50 of 300" instead.
   */
  readonly capped: boolean;
  /** Pre-cap match count when a query is active; equals `total` otherwise. */
  readonly matchTotal: number;
  /** Wall time for this computation, feeding the FILTER-* budgets (PRD 5.3.3). */
  readonly filterMs: number;
}

/**
 * Compute the visible set.
 *
 * Two paths, and which one runs is decided by whether a query is active:
 *
 * **No query.** Facets produce a bitset, the bitset expands to ordinals, and
 * the comparator orders them. This is the archive's normal state.
 *
 * **Query active.** The worker has already ranked the matches. Facets only
 * INTERSECT that ranking — text is never rescanned, per PRD 5.3.2 — and when
 * the sort is `relevance` the worker's order is preserved untouched. That is
 * how PRD 5.2.3's rule is enforced structurally rather than by convention:
 * editorial priority has no way to reorder a ranked result set, because the
 * relevance comparator is not even consulted on this path.
 */
export function computeVisible(
  catalog: LoadedCatalog,
  engine: FacetEngine,
  input: VisibleInput,
): VisibleResult {
  const started = performance.now();
  const bitset = engine.select(input.selection);

  if (input.searchOrder !== null) {
    const ranked = input.searchOrder;
    const kept = new Uint32Array(ranked.length);
    let n = 0;
    for (const ordinal of ranked) {
      if (bitset === null || FacetEngine.has(bitset, ordinal)) kept[n++] = ordinal;
    }
    const ids = kept.subarray(0, n);

    // Relevance keeps the worker's ranking. Any other sort is an explicit
    // request to reorder, so it wins.
    if (input.sort !== "relevance") {
      const sorted = Array.from(ids).sort(comparatorFor(catalog, input.sort));
      ids.set(sorted);
    }

    const searchTotal = input.searchTotal ?? n;
    record(started, performance.now() - started);
    return {
      ids,
      total: n,
      // Only claim a cap when facets did not already narrow the set below it;
      // otherwise "top 50 of 300" would be shown beside 4 visible rows.
      capped: searchTotal > ranked.length && n === ranked.length,
      matchTotal: searchTotal,
      filterMs: performance.now() - started,
    };
  }

  const ordinals =
    bitset === null
      ? allOrdinals(engine.projectCount)
      : FacetEngine.ordinals(bitset, engine.projectCount);

  // Sorted through a plain array: TypedArray.prototype.sort takes no
  // comparator that returns a stable ordering for our tie rules.
  const sorted = Array.from(ordinals).sort(comparatorFor(catalog, input.sort));
  const ids = Uint32Array.from(sorted);

  const filterMs = performance.now() - started;
  record(started, filterMs);
  return {
    ids,
    total: ids.length,
    capped: false,
    matchTotal: ids.length,
    filterMs,
  };
}

/**
 * Emit a User Timing measure for the FILTER-* budgets (PRD 5.3.3).
 *
 * Standard `performance.measure` rather than a bespoke `window.__metrics`
 * global: the budget harness reads it through the platform API, DevTools shows
 * it in the timeline for free, and nothing extra ships to production beyond a
 * timing entry. Wrapped because a runtime without User Timing must not take
 * the filter down with it — measurement is never allowed to break the feature.
 */
function record(started: number, duration: number): void {
  try {
    performance.measure("atlas:filter", { start: started, duration });
  } catch {
    // No User Timing here. Callers still get `filterMs` on the result.
  }
}

function allOrdinals(count: number): Uint32Array {
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) out[i] = i;
  return out;
}
