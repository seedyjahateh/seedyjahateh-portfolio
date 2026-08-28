/**
 * URL-state grammar v1.
 *
 * Authority: PRD 5.3.3 (canonical state lives in URL search parameters),
 * 7.2 (CatalogState), 10.4 (SEO / indexability), 12.6 step 1 ("freeze ...
 * URL-state grammar v1").
 *
 * WHY THE URL IS CANONICAL. PRD 0.3 makes dedicated URLs mandatory and 5.3.3
 * requires back/forward to restore "the exact query, filters, sort, view, and
 * focused project". That only holds if serialization is total and idempotent,
 * so this module is the single implementation. Views and components never
 * hand-roll query strings.
 *
 * Framework-neutral by design (PRD 4.1: "keep all catalog logic behind
 * framework-neutral TypeScript interfaces"). It takes and returns strings.
 */

import {
  DEFAULT_SORT,
  DEFAULT_VIEW,
  SORT_ORDER,
  VIEW_MODE,
  type SortOrder,
  type ViewMode,
} from "./enums.js";

/**
 * The closed parameter set from PRD 5.3.3, plus `focus`.
 *
 * `focus` is present because PRD 5.3.3 requires back/forward to restore the
 * focused project and because a shared link should be able to point at one.
 * It is excluded from the indexability key below - focus is a view detail, not
 * a distinct document.
 *
 * `density` is deliberately ABSENT. PRD 5.3.3 confines it to local storage:
 * "Persist only presentation preferences such as density and last view in local
 * storage. Do not allow stored state to silently override an explicit URL."
 */
export const MULTI_VALUE_PARAMS = [
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

export const SINGLE_VALUE_PARAMS = ["q", "sort", "view", "focus"] as const;

export type MultiValueParam = (typeof MULTI_VALUE_PARAMS)[number];
export type SingleValueParam = (typeof SINGLE_VALUE_PARAMS)[number];
export type UrlParam = MultiValueParam | SingleValueParam;

export const ALL_PARAMS: readonly UrlParam[] = [...MULTI_VALUE_PARAMS, ...SINGLE_VALUE_PARAMS];

const MULTI_SET: ReadonlySet<string> = new Set(MULTI_VALUE_PARAMS);
const SINGLE_SET: ReadonlySet<string> = new Set(SINGLE_VALUE_PARAMS);

/** The URL-representable slice of PRD 7.2's CatalogState. */
export interface UrlState {
  readonly q: string;
  readonly filters: Readonly<Record<MultiValueParam, readonly string[]>>;
  readonly sort: SortOrder;
  readonly view: ViewMode;
  readonly focus: string | null;
}

export const EMPTY_FILTERS: Readonly<Record<MultiValueParam, readonly string[]>> = Object.freeze({
  role: [],
  tier: [],
  proof: [],
  lang: [],
  tech: [],
  capability: [],
  artifact: [],
  complexity: [],
  year: [],
  status: [],
});

export const EMPTY_URL_STATE: UrlState = Object.freeze({
  q: "",
  filters: EMPTY_FILTERS,
  sort: DEFAULT_SORT,
  view: DEFAULT_VIEW,
  focus: null,
});

/** Diagnostics from parsing. PRD 5.3.3 drops unknown input rather than throwing. */
export interface ParseDiagnostics {
  /** Parameter names outside the closed set. */
  readonly unknownParams: readonly string[];
  /** Values rejected because they are not in the enum / vocabulary. */
  readonly droppedValues: readonly { readonly param: string; readonly value: string }[];
}

export interface ParseResult {
  readonly state: UrlState;
  readonly diagnostics: ParseDiagnostics;
}

/**
 * Optional vocabulary gate. The engine passes the compiled facet dictionaries so
 * that `?tech=nonexistent` is dropped instead of producing an empty result set
 * that looks like a bug. Omit it and only enum-backed params are checked.
 */
export type VocabularyGate = (param: MultiValueParam, value: string) => boolean;

const ENUM_GATES: Partial<Record<MultiValueParam, ReadonlySet<string>>> = {
  // `role`, `tier`, `proof`, `complexity`, `status` are closed enums (PRD 8.2).
  // They are validated here; open vocabularies need the VocabularyGate.
};

function isValidYear(value: string): boolean {
  return /^\d{4}$/.test(value) && Number(value) >= 1990 && Number(value) <= 2999;
}

/**
 * Parse a query string into canonical state.
 *
 * Total: never throws. Unknown parameters and values are reported in
 * diagnostics and discarded, per PRD 5.3.3.
 */
export function parseUrlState(
  search: string,
  gate?: VocabularyGate,
): ParseResult {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const unknownParams: string[] = [];
  const droppedValues: { param: string; value: string }[] = [];

  const filters: Record<MultiValueParam, string[]> = {
    role: [], tier: [], proof: [], lang: [], tech: [],
    capability: [], artifact: [], complexity: [], year: [], status: [],
  };

  let q = "";
  let sort: SortOrder = DEFAULT_SORT;
  let view: ViewMode = DEFAULT_VIEW;
  let focus: string | null = null;

  for (const key of new Set(params.keys())) {
    if (!MULTI_SET.has(key) && !SINGLE_SET.has(key)) {
      unknownParams.push(key);
      continue;
    }

    if (MULTI_SET.has(key)) {
      const param = key as MultiValueParam;
      const seen = new Set<string>();
      for (const raw of params.getAll(key)) {
        const value = raw.trim().toLowerCase();
        if (value.length === 0 || seen.has(value)) continue;

        const enumGate = ENUM_GATES[param];
        const valid =
          param === "year"
            ? isValidYear(value)
            : enumGate !== undefined
              ? enumGate.has(value)
              : gate === undefined || gate(param, value);

        if (!valid) {
          droppedValues.push({ param, value });
          continue;
        }
        seen.add(value);
        filters[param].push(value);
      }
      // PRD 5.3.3: sort values so share links are stable regardless of click order.
      filters[param].sort();
      continue;
    }

    // Single-valued: last occurrence wins, matching URLSearchParams.get semantics.
    const value = params.get(key) ?? "";
    switch (key) {
      case "q":
        // PRD 5.2.3: preserve the displayed text verbatim; normalization for
        // search is a separate concern that must not mutate the URL.
        q = value;
        break;
      case "sort":
        if ((SORT_ORDER as readonly string[]).includes(value)) sort = value as SortOrder;
        else if (value.length > 0) droppedValues.push({ param: "sort", value });
        break;
      case "view":
        if ((VIEW_MODE as readonly string[]).includes(value)) view = value as ViewMode;
        else if (value.length > 0) droppedValues.push({ param: "view", value });
        break;
      case "focus": {
        const trimmed = value.trim();
        if (trimmed.length > 0) focus = trimmed;
        break;
      }
      default:
        break;
    }
  }

  unknownParams.sort();
  droppedValues.sort((a, b) => a.param.localeCompare(b.param) || a.value.localeCompare(b.value));

  return {
    state: { q, filters, sort, view, focus },
    diagnostics: { unknownParams, droppedValues },
  };
}

/**
 * Serialize state to a canonical query string.
 *
 * Canonical form (PRD 5.3.3 "stable share links"):
 *   1. defaults omitted,
 *   2. parameter names sorted,
 *   3. values within a parameter sorted,
 *   4. percent-encoding via URLSearchParams, with '+' rewritten to %20 so the
 *      string is safe in both query and path-adjacent contexts.
 *
 * Returns "" for empty state, never "?".
 */
export function serializeUrlState(state: UrlState): string {
  const pairs: [string, string][] = [];

  if (state.q.trim().length > 0) pairs.push(["q", state.q]);

  for (const param of MULTI_VALUE_PARAMS) {
    const values = state.filters[param];
    if (values.length === 0) continue;
    for (const value of [...values].sort()) pairs.push([param, value]);
  }

  if (state.sort !== DEFAULT_SORT) pairs.push(["sort", state.sort]);
  if (state.view !== DEFAULT_VIEW) pairs.push(["view", state.view]);
  if (state.focus !== null && state.focus.length > 0) pairs.push(["focus", state.focus]);

  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  const search = new URLSearchParams(pairs).toString();
  return search.replace(/\+/g, "%20");
}

/** Idempotent normalization: parse then re-serialize. */
export function canonicalizeSearch(search: string, gate?: VocabularyGate): string {
  return serializeUrlState(parseUrlState(search, gate).state);
}

/** True when no filter, query, or non-default presentation option is active. */
export function isDefaultState(state: UrlState): boolean {
  return serializeUrlState(state) === "";
}

/** Count of active filter values across every group. Drives the "clear all" affordance. */
export function activeFilterCount(state: UrlState): number {
  let total = 0;
  for (const param of MULTI_VALUE_PARAMS) total += state.filters[param].length;
  return total;
}

/**
 * SEO indexability (PRD 10.4).
 *
 * "Filter URLs are noindex,follow unless curated as a role/capability landing
 * page. Canonicalize arbitrary facet combinations to /projects."
 *
 * A URL is indexable only when it is the bare archive or exactly one curated
 * single-facet selection. `focus` and `q` never make a URL indexable: they
 * produce no distinct document worth crawling.
 */
export const CURATED_LANDING_PARAMS: readonly MultiValueParam[] = ["role", "capability"];

export function isIndexable(state: UrlState): boolean {
  if (state.q.trim().length > 0) return false;
  // A focused card is transient UI state, not a distinct document. Indexing it
  // would give search engines N near-duplicate copies of the archive.
  if (state.focus !== null && state.focus.length > 0) return false;
  if (state.sort !== DEFAULT_SORT || state.view !== DEFAULT_VIEW) return false;

  const active = MULTI_VALUE_PARAMS.filter((p) => state.filters[p].length > 0);
  if (active.length === 0) return true;
  if (active.length > 1) return false;

  const only = active[0];
  if (only === undefined) return true;
  return CURATED_LANDING_PARAMS.includes(only) && state.filters[only].length === 1;
}

/** The URL a non-indexable filter combination should declare as canonical. */
export function canonicalUrlFor(state: UrlState, basePath = "/projects"): string {
  if (!isIndexable(state)) return basePath;
  const search = serializeUrlState(state);
  return search === "" ? basePath : `${basePath}?${search}`;
}
