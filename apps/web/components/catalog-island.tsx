"use client";

/**
 * The archive's client catalog engine.
 *
 * Authority: PRD 5.3.3 (canonical state in URL search params; back/forward
 * restores query, filters, sort, view and focus; removable tokens, clear-all,
 * per-group counts, total result count; one delegated event boundary), 5.4
 * (all views consume VisibleProjectIds), 6.1 ("/projects is static shell +
 * client catalog engine"), 9.7 (works without JavaScript), 10.4 (filter URLs
 * are noindex unless curated).
 *
 * PROGRESSIVE ENHANCEMENT, NOT REPLACEMENT. The server already rendered a
 * paginated semantic list — which is simultaneously the no-JS index, the crawl
 * path, and PRD 5.4.2's assistive-technology fallback. This island stays
 * invisible until the catalog has actually loaded, then takes over. If the
 * fetch fails, the static list simply remains, which is the correct degraded
 * state rather than an error screen.
 *
 * URL WRITES USE replaceState, NOT pushState, for filter changes. Clicking four
 * facets should not require four Back presses to leave the archive. Only a
 * query submission pushes, because that is the navigation a visitor thinks of
 * as a step.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  EMPTY_URL_STATE,
  MULTI_VALUE_PARAMS,
  activeFilterCount,
  parseUrlState,
  serializeUrlState,
  type MultiValueParam,
  type UrlState,
} from "@atlas/contracts/url-state";
import { SORT_ORDER, type SortOrder } from "@atlas/contracts/enums";
import { computeVisible, vocabularyGate, type VisibleResult } from "@atlas/engine";

import { measureAfterPaint } from "../lib/after-paint";
import { loadClientCatalog, type ClientCatalog } from "../lib/catalog-client";
import { SearchClient } from "../lib/search-client";
import { ProjectGrid } from "./project-grid";
import { ProjectRows, type Density, type RowsData } from "./project-rows";

/** Rows fill most of the viewport; fixed so scrolling performs no measurement. */
function viewportHeight(): number {
  return Math.max(320, Math.round(window.innerHeight * 0.7));
}

export function CatalogIsland() {
  const [catalog, setCatalog] = useState<ClientCatalog | null>(null);
  const [state, setState] = useState<UrlState>(EMPTY_URL_STATE);
  const [visible, setVisible] = useState<VisibleResult | null>(null);
  const [height, setHeight] = useState(480);
  const [density] = useState<Density>("comfortable");
  /**
   * Which facet groups are expanded.
   *
   * A collapsed `<details>` still keeps its children in the DOM — it only hides
   * them. At 1,300 records the facet dictionaries are large enough that
   * rendering every group's values eagerly pushed the archive to 1,168
   * elements against DOM-ARCHIVE-STEADY's 1,000. Values are mounted only while
   * their group is open, which is also the only time they are reachable.
   */
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());
  const searchRef = useRef<SearchClient | null>(null);
  const rankedRef = useRef<{ ids: Uint32Array; total: number } | null>(null);

  /**
   * Latest state, readable from worker callbacks.
   *
   * The search client is created once and outlives many state changes, so a
   * callback that closed over `state` would recompute with whatever filters
   * were active when the worker started. Results arriving just after a facet
   * click would then briefly render the pre-click set.
   */
  const stateRef = useRef<UrlState>(state);
  stateRef.current = state;

  // -- load ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void loadClientCatalog()
      .then((loaded) => {
        if (cancelled) return;
        setCatalog(loaded);
        setState(parseUrlState(window.location.search, vocabularyGate(loaded.catalog)).state);
        document.documentElement.dataset["catalogActive"] = "";
      })
      .catch(() => {
        // Leave the server-rendered list in place. PRD 9.7's degraded state is
        // the static index, not an error message.
      });
    return () => {
      cancelled = true;
      delete document.documentElement.dataset["catalogActive"];
    };
  }, []);

  useEffect(() => {
    const onResize = (): void => setHeight(viewportHeight());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // -- back / forward --------------------------------------------------------
  useEffect(() => {
    if (catalog === null) return;
    const onPop = (): void => {
      setState(parseUrlState(window.location.search, vocabularyGate(catalog.catalog)).state);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [catalog]);

  // -- search ----------------------------------------------------------------
  const recompute = useCallback(
    (next: UrlState, loaded: ClientCatalog) => {
      const ranked = next.q.trim().length > 0 ? rankedRef.current : null;
      setVisible(
        computeVisible(loaded.catalog, loaded.engine, {
          selection: next.filters,
          sort: next.sort,
          searchOrder: ranked?.ids ?? null,
          ...(ranked === null ? {} : { searchTotal: ranked.total }),
        }),
      );
    },
    [],
  );

  useEffect(() => {
    if (catalog === null || state.q.trim().length === 0) return;
    if (searchRef.current !== null) {
      searchRef.current.query(state.q);
      return;
    }
    const client = new SearchClient({
      onReady: () => client.query(stateRef.current.q),
      onResults: (hit) => {
        rankedRef.current = { ids: hit.ids, total: hit.total };
        recompute(stateRef.current, catalog);
      },
      onError: (_code, fatal) => {
        if (!fatal) return;
        // The worker is gone; fall back to facets over the whole catalog
        // rather than showing nothing (PRD 5.2.1).
        searchRef.current = null;
        rankedRef.current = null;
        recompute({ ...stateRef.current, q: "" }, catalog);
      },
    });
    searchRef.current = client;
    void client.start();
    return () => {
      client.dispose();
      searchRef.current = null;
    };
    // Only the query text belongs in the deps: every callback above reads the
    // rest through stateRef, and re-creating a worker per filter click would
    // blow SEARCH-WORKER-INIT's 250 ms budget many times over.
  }, [catalog, state.q, recompute]);

  // -- recompute + URL -------------------------------------------------------
  useEffect(() => {
    if (catalog === null) return;
    if (state.q.trim().length === 0) rankedRef.current = null;
    recompute(state, catalog);

    const search = serializeUrlState(state);
    const url = search === "" ? window.location.pathname : `${window.location.pathname}?${search}`;
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", url);
    }
  }, [catalog, state, recompute]);

  /**
   * FILTER-TO-PAINT (PRD 9.1, <=32 ms p95).
   *
   * The clock starts at the click and stops after the frame that shows the new
   * result set, so it covers the whole interaction a visitor perceives —
   * bitset filtering, sorting and React's re-render — not just the engine's
   * share, which `FILTER-P95` already measures separately.
   */
  const filterStartedAt = useRef<number | null>(null);
  const markFilterStart = useCallback(() => {
    filterStartedAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (visible === null) return;
    // Only a real filter interaction sets this. Recomputes from a page load or
    // an arriving search result leave it null and record nothing, which is what
    // keeps this budget about the interaction it names.
    const startedAt = filterStartedAt.current;
    if (startedAt === null) return;
    filterStartedAt.current = null;
    measureAfterPaint("atlas:filter-paint", startedAt);
  }, [visible]);

  /**
   * Record which project is focused, so back/forward can restore it.
   *
   * PRD 5.3.3 requires back/forward to restore "the exact query, filters, sort,
   * view, and focused project", and PRD line 405 names focus explicitly in the
   * archive journey. With a virtualizer the browser cannot do this itself: when
   * it tries to restore scroll, the card is not in the DOM to scroll to.
   *
   * Written through `state`, so it lands in the URL by the same path as every
   * other piece of catalog state rather than a second mechanism.
   */
  const onFocusProject = useCallback((slug: string) => {
    setState((prev) => (prev.focus === slug ? prev : { ...prev, focus: slug }));
  }, []);

  /**
   * Restore the focused card once the catalog is loaded.
   *
   * Runs on mount and on `popstate` (which replaces `state` wholesale), not on
   * every render: re-focusing on each keystroke would fight the visitor for the
   * caret. PRD 5.3.3 also forbids resetting scroll "without an announced
   * reason", so this only acts when the URL actually names a project.
   */
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (catalog === null || visible === null) return;
    const slug = state.focus;
    if (slug === null || restoredFor.current === slug) return;

    const card = document.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`);
    if (card === null) return; // Not rendered yet; a later pass will find it.
    restoredFor.current = slug;
    card.scrollIntoView({ block: "center", behavior: "auto" });
    card.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
  }, [catalog, visible, state.focus]);

  const toggleFacet = useCallback((group: MultiValueParam, value: string) => {
    markFilterStart();
    setState((prev) => {
      const current = prev.filters[group];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value].sort();
      return { ...prev, filters: { ...prev.filters, [group]: next } };
    });
  }, [markFilterStart]);

  if (catalog === null || visible === null) return null;

  const rowsData: RowsData = {
    ids: visible.ids,
    cards: catalog.catalog.byOrdinal,
    statuses: catalog.engine.ordinalLabels("status"),
    labels: catalog.catalog.labels,
  };

  const activeCount = activeFilterCount(state);

  return (
    <section className="catalog" aria-label="Project catalog">
      <div className="catalog__controls">
        <label className="visually-hidden" htmlFor="catalog-q">
          Filter projects by text
        </label>
        <input
          id="catalog-q"
          className="site-search__input"
          type="search"
          value={state.q}
          placeholder="Filter projects…"
          onChange={(e) => setState((prev) => ({ ...prev, q: e.target.value }))}
        />

        <label className="visually-hidden" htmlFor="catalog-sort">
          Sort order
        </label>
        <select
          id="catalog-sort"
          className="site-search__submit"
          value={state.sort}
          onChange={(e) => setState((prev) => ({ ...prev, sort: e.target.value as SortOrder }))}
        >
          {SORT_ORDER.map((order) => (
            <option key={order} value={order}>
              {order}
            </option>
          ))}
        </select>

        {/* PRD 5.4.1 makes the grid the default archive view; `view` is already
            canonical URL state, so switching is a state change and nothing
            more. Only two modes are offered: `spatial` is Phase 6. */}
        <fieldset className="catalog__views">
          <legend className="visually-hidden">View</legend>
          {(["grid", "rows"] as const).map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name="catalog-view"
                value={mode}
                checked={state.view === mode}
                onChange={() => setState((prev) => ({ ...prev, view: mode }))}
              />{" "}
              {mode}
            </label>
          ))}
        </fieldset>

        {activeCount > 0 ? (
          <button
            type="button"
            className="site-search__submit"
            onClick={() => setState((prev) => ({ ...prev, filters: EMPTY_URL_STATE.filters }))}
          >
            Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>

      {/* Selected filters as removable tokens (PRD 5.3.3). */}
      {activeCount > 0 ? (
        <ul className="tokens" aria-label="Active filters">
          {MULTI_VALUE_PARAMS.flatMap((group) =>
            state.filters[group].map((value) => (
              <li key={`${group}:${value}`}>
                <button type="button" onClick={() => toggleFacet(group, value)}>
                  {group}: {value}
                  <span aria-hidden="true"> ×</span>
                  <span className="visually-hidden"> (remove filter)</span>
                </button>
              </li>
            )),
          )}
        </ul>
      ) : null}

      {/* PRD 5.3.3: total result count, announced politely so it does not
          interrupt typing. `capped` keeps the number honest — the worker
          returns at most 50, and calling that "50 results" for a query
          matching 300 would be false. */}
      <p className="catalog__status" role="status" aria-live="polite">
        {visible.capped
          ? `Top ${visible.total} of ${visible.matchTotal} matches`
          : `${visible.total} project${visible.total === 1 ? "" : "s"}`}
        {activeCount > 0 ? " after filters" : ""}
      </p>

      {visible.total === 0 ? (
        <div className="empty-state">
          <p>
            <strong>Nothing matches those filters.</strong> Remove a token above, or clear them all.
          </p>
        </div>
      ) : state.view === "rows" ? (
        <ProjectRows data={rowsData} density={density} height={height} />
      ) : (
        // `grid` is DEFAULT_VIEW, and `spatial` falls here too: PRD 13 puts the
        // spatial route in Phase 6, and a URL asking for a view that does not
        // exist yet should show the default rather than nothing.
        <ProjectGrid
          data={{
            ids: visible.ids,
            cards: catalog.catalog.byOrdinal,
            labels: catalog.catalog.labels,
            statuses: rowsData.statuses,
          }}
          height={height}
          onFocusProject={onFocusProject}
        />
      )}

      {/* Per-group counts, and the only way to ADD a facet from this view. */}
      <div className="facets">
        {catalog.catalog.facets.groups
          .filter((group) => (MULTI_VALUE_PARAMS as readonly string[]).includes(group.group))
          .map((group) => (
            <details
              key={group.group}
              className="facet"
              /**
               * Deliberately UNCONTROLLED — no `open` prop.
               *
               * `<details>` toggles itself natively on click, so a controlled
               * `open` bound to React state races its own event: the browser
               * opens the element, React re-renders before the state update
               * lands, sees `open={false}` and closes it again, unmounting the
               * checkboxes that had just appeared. React owns which children
               * exist; the element owns whether it is open.
               */
              onToggle={(e) => {
                // Read synchronously. React nulls `currentTarget` once the
                // handler returns, and a state updater runs later — reading it
                // in there yielded `undefined`, so the group never opened and
                // its checkboxes never mounted.
                const isOpen = e.currentTarget.open;
                setOpenGroups((prev) => {
                  const next = new Set(prev);
                  if (isOpen) next.add(group.group);
                  else next.delete(group.group);
                  return next;
                });
              }}
            >
              <summary>
                {group.label}{" "}
                <span className="muted">
                  ({state.filters[group.group as MultiValueParam].length || group.values.length})
                </span>
              </summary>
              {openGroups.has(group.group) ? (
                <ul>
                  {group.values.slice(0, 40).map((value) => {
                    const param = group.group as MultiValueParam;
                    const checked = state.filters[param].includes(value.value);
                    return (
                      <li key={value.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFacet(param, value.value)}
                          />{" "}
                          {value.label} <span className="muted">({value.count})</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </details>
          ))}
      </div>
    </section>
  );
}
