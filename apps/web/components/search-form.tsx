/**
 * Site search entry point.
 *
 * Authority: PRD 5.2.1 ("Open with Meta+K on macOS, Ctrl+K elsewhere, the
 * visible search button, or `/` when focus is not inside an editable field" and
 * "If JavaScript or the worker fails, submit the query to /projects?q=... and
 * perform a synchronous bounded search after navigation"), 9.7 (the site works
 * without JavaScript), 10.1 (labelled controls, 24px targets).
 *
 * A REAL FORM, NOT A BUTTON. The no-JS fallback the PRD demands and the search
 * affordance are the same element: with scripting off this GETs /projects?q=…,
 * which is exactly the fallback path. The palette stub enhances it in place.
 *
 * That is also why the stub can be small enough to fit home's remaining JS
 * budget — it has no UI to render, because the UI is already here in HTML.
 *
 * This is a server component. It ships no JavaScript of its own.
 */
export function SearchForm() {
  return (
    <form className="site-search" role="search" method="get" action="/projects">
      <label className="visually-hidden" htmlFor="site-search-input">
        Search projects
      </label>
      <input
        id="site-search-input"
        className="site-search__input"
        type="search"
        name="q"
        placeholder="Search projects…"
        autoComplete="off"
        // Read by the palette stub so it can enhance this exact field without
        // a framework ref crossing the server/client boundary.
        data-search-input=""
      />
      <button className="site-search__submit" type="submit">
        Search
      </button>
    </form>
  );
}
