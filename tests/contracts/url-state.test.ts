/**
 * URL-state grammar v1.
 *
 * Authority: PRD 5.3.3 ("Browser back/forward restores the exact query,
 * filters, sort, view, and focused project"; "Sort parameter names and values
 * before writing the URL to guarantee stable share links"), 10.4 (indexability).
 *
 * The round-trip and idempotence properties are the load-bearing ones. If
 * parse(serialize(s)) loses anything, back/forward silently drops state; if
 * serialize is not canonical, two users who clicked the same filters in a
 * different order produce different share links and different cache entries.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  ALL_PARAMS,
  EMPTY_FILTERS,
  EMPTY_URL_STATE,
  MULTI_VALUE_PARAMS,
  activeFilterCount,
  canonicalUrlFor,
  canonicalizeSearch,
  isIndexable,
  parseUrlState,
  serializeUrlState,
  type MultiValueParam,
  type UrlState,
} from "@atlas/contracts/url-state";
import { SORT_ORDER, VIEW_MODE } from "@atlas/contracts/enums";

/** Values that survive parsing: lowercase, trimmed, non-empty, no separators. */
const termArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,14}$/)
  .filter((s) => s.length > 0 && !s.endsWith("-"));

const yearArb = fc.integer({ min: 1990, max: 2999 }).map(String);

const stateArb: fc.Arbitrary<UrlState> = fc
  .record({
    q: fc.oneof(fc.constant(""), fc.stringMatching(/^[a-zA-Z0-9 .:_-]{1,30}$/)),
    sort: fc.constantFrom(...SORT_ORDER),
    view: fc.constantFrom(...VIEW_MODE),
    focus: fc.oneof(fc.constant(null), fc.stringMatching(/^[A-Z]{2,4}-[0-9]{2,4}$/)),
    filterEntries: fc.tuple(
      ...MULTI_VALUE_PARAMS.map((param) =>
        fc.uniqueArray(param === "year" ? yearArb : termArb, { maxLength: 4 }),
      ),
    ),
  })
  .map(({ q, sort, view, focus, filterEntries }) => {
    // Built explicitly rather than via Object.fromEntries: the latter widens to
    // an index signature, which exactOptionalPropertyTypes will not narrow back.
    const filters = { ...EMPTY_FILTERS } as Record<MultiValueParam, readonly string[]>;
    MULTI_VALUE_PARAMS.forEach((param, index) => {
      filters[param] = [...(filterEntries[index] ?? [])].sort();
    });
    return { q, filters, sort, view, focus } satisfies UrlState;
  });

describe("round trip", () => {
  it("parse(serialize(state)) preserves state", () => {
    fc.assert(
      fc.property(stateArb, (state) => {
        const { state: parsed } = parseUrlState(serializeUrlState(state));
        // q is preserved verbatim apart from the empty/whitespace case, which
        // serializes away by design (PRD 5.3.3 omits defaults).
        expect(parsed.q).toBe(state.q.trim().length > 0 ? state.q : "");
        expect(parsed.sort).toBe(state.sort);
        expect(parsed.view).toBe(state.view);
        expect(parsed.focus).toBe(state.focus);
        for (const param of MULTI_VALUE_PARAMS) {
          expect(parsed.filters[param]).toEqual(state.filters[param]);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("serialization is idempotent", () => {
    fc.assert(
      fc.property(stateArb, (state) => {
        const once = serializeUrlState(state);
        expect(canonicalizeSearch(once)).toBe(once);
        expect(canonicalizeSearch(canonicalizeSearch(once))).toBe(once);
      }),
      { numRuns: 300 },
    );
  });

  it("produces stable share links regardless of click order", () => {
    // PRD 5.3.3: this is the whole reason values are sorted before writing.
    const a = canonicalizeSearch("?tech=redis&tech=kafka&role=backend-engineer");
    const b = canonicalizeSearch("?role=backend-engineer&tech=kafka&tech=redis");
    expect(a).toBe(b);
  });
});

describe("canonical form", () => {
  it("omits defaults", () => {
    expect(serializeUrlState(EMPTY_URL_STATE)).toBe("");
    expect(canonicalizeSearch("?sort=relevance&view=grid")).toBe("");
  });

  it("keeps non-default presentation", () => {
    expect(canonicalizeSearch("?view=rows")).toBe("view=rows");
    expect(canonicalizeSearch("?sort=year-desc")).toBe("sort=year-desc");
  });

  it("drops unknown parameters and reports them", () => {
    const { state, diagnostics } = parseUrlState("?utm_source=twitter&role=ai-engineer");
    expect(diagnostics.unknownParams).toEqual(["utm_source"]);
    expect(state.filters.role).toEqual(["ai-engineer"]);
  });

  it("drops invalid enum values rather than throwing", () => {
    const { state, diagnostics } = parseUrlState("?sort=nonsense&view=hologram");
    expect(state.sort).toBe("relevance");
    expect(state.view).toBe("grid");
    expect(diagnostics.droppedValues).toHaveLength(2);
  });

  it("rejects out-of-range years", () => {
    const { state } = parseUrlState("?year=1899&year=2026");
    expect(state.filters.year).toEqual(["2026"]);
  });

  it("deduplicates repeated values", () => {
    const { state } = parseUrlState("?tech=redis&tech=redis&tech=kafka");
    expect(state.filters.tech).toEqual(["kafka", "redis"]);
  });

  it("encodes spaces as %20, never '+'", () => {
    // '+' means space only in query strings; a link that travels through a
    // path-adjacent context would decode it wrongly.
    const search = serializeUrlState({ ...EMPTY_URL_STATE, q: "vector search" });
    expect(search).toBe("q=vector%20search");
    expect(search).not.toContain("+");
  });

  it("never emits 'density' (PRD 5.3.3 confines it to local storage)", () => {
    expect(ALL_PARAMS).not.toContain("density");
  });

  it("counts active filters across groups", () => {
    const { state } = parseUrlState("?role=ai-engineer&tech=redis&tech=kafka");
    expect(activeFilterCount(state)).toBe(3);
  });
});

describe("indexability (PRD 10.4)", () => {
  it("indexes the bare archive", () => {
    expect(isIndexable(EMPTY_URL_STATE)).toBe(true);
    expect(canonicalUrlFor(EMPTY_URL_STATE)).toBe("/projects");
  });

  it("indexes a single curated role or capability facet", () => {
    const role = parseUrlState("?role=ai-engineer").state;
    expect(isIndexable(role)).toBe(true);
    expect(canonicalUrlFor(role)).toBe("/projects?role=ai-engineer");
  });

  it("does not index arbitrary facet combinations", () => {
    const combo = parseUrlState("?role=ai-engineer&tech=redis").state;
    expect(isIndexable(combo)).toBe(false);
    // PRD 10.4: "Canonicalize arbitrary facet combinations to /projects."
    expect(canonicalUrlFor(combo)).toBe("/projects");
  });

  it("does not index a search query or a focused project", () => {
    expect(isIndexable(parseUrlState("?q=redis").state)).toBe(false);
    expect(isIndexable(parseUrlState("?focus=RAG-01").state)).toBe(false);
  });

  it("does not index a non-curated single facet", () => {
    expect(isIndexable(parseUrlState("?tech=redis").state)).toBe(false);
  });
});
