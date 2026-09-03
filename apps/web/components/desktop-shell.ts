/**
 * The desktop shell.
 *
 * Authority: ADR 0036, PRD 10.1 (WCAG 2.2 AA, `A11Y-ZOOM` 400%), 9.4
 * (`JS-HOME` 135 KB), 9.3 (`BACKDROP-FILTER-SURFACES` 10).
 *
 * IT MOVES NOTHING. Window chrome is server-rendered in `layout.tsx`; this file
 * only measures, positions and labels it. The first version built the chrome
 * here by re-parenting `main` into a wrapper, which broke the archive on sight:
 * React still owns that subtree, so when the catalog island re-rendered it
 * called `insertBefore` against a sibling that had moved, threw `NotFoundError`
 * and unmounted the page. Re-parenting React-managed DOM cannot be done
 * carefully enough to be safe; the markup has to exist before this runs.
 *
 * ACTIVATION IS AN ATTRIBUTE, AND EVERY STYLE RULE HANGS OFF IT.
 * `[data-desktop-active]` is set here and nowhere else, so a visitor with
 * JavaScript disabled never reaches any desktop styling and keeps the plain
 * document. CSS does not care whether scripts ran, and
 * `tests/e2e/exit-gate.nojs.spec.ts` asserts the header, footer and `main#main`
 * are visible on all seven routes with scripting off — an ungated rule fails
 * that while looking perfectly correct in a browser.
 * `[data-catalog-active] #static-index` is the same pattern, already in use.
 *
 * WHY NOT REACT. Same reason as `palette-dialog.ts` (ADR 0031): the budget. This
 * decorates existing DOM once and gets out of the way.
 */

/** Below this the desktop is not a desktop. See `Springboard` in globals.css. */
const DESKTOP_MIN_WIDTH = 900;

/** Window geometry, in CSS pixels. */
const GUTTER = 24;

/**
 * Name the window after the page.
 *
 * The bar is rendered by a layout that has no idea which route it is wrapping,
 * so it ships the site name and this replaces it with the page's own `h1`. That
 * is a text write into React-owned DOM, which is safe here in a way that moving
 * nodes was not: the layout holds no state and never re-renders, so nothing
 * will overwrite it. It is also the only write of its kind in this file.
 */
function nameWindow(): void {
  const title = document.querySelector<HTMLElement>("[data-window-title]");
  const heading = document.querySelector("h1")?.textContent.trim();
  if (title !== null && heading !== undefined && heading !== "") title.textContent = heading;
}

/**
 * Place the windows.
 *
 * Geometry is written as `transform`, never `top`/`left`: a Stage 3 drag moves
 * the same property, and animating a layout property there would put `CLS` and
 * `FORCED-LAYOUTS-SCROLL` at risk. The surface is given an explicit height
 * because its children are taken out of flow.
 */
function layout(surface: HTMLElement, windows: readonly HTMLElement[]): void {
  const available = surface.clientWidth - GUTTER * 2;
  let bottom = 0;

  for (const node of windows) {
    node.style.width = `${available}px`;
    node.style.transform = `translate3d(${GUTTER}px, ${GUTTER + bottom}px, 0)`;
    // One read per window, at layout time only. Never on scroll, which is what
    // `FORCED-LAYOUTS-SCROLL` (0) is actually about.
    bottom += node.offsetHeight + GUTTER;
  }

  surface.style.minHeight = `${bottom + GUTTER}px`;
}

function clear(surface: HTMLElement, windows: readonly HTMLElement[]): void {
  for (const node of windows) {
    node.style.removeProperty("width");
    node.style.removeProperty("transform");
  }
  surface.style.removeProperty("min-height");
}

export function startDesktop(): () => void {
  const root = document.documentElement;
  const surface = document.querySelector<HTMLElement>(".desktop-surface");
  if (surface === null) return () => undefined;

  const windows = [...surface.querySelectorAll<HTMLElement>(".window")];
  const wide = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);

  nameWindow();

  const apply = (): void => {
    const desktop = wide.matches;
    root.dataset["desktopMode"] = desktop ? "desktop" : "springboard";
    if (desktop) layout(surface, windows);
    else {
      /**
       * The springboard is a stylesheet, not a second DOM. Clearing the inline
       * geometry lets the windows fall back into normal document flow, which is
       * also the answer to `A11Y-ZOOM` at 400%: at that magnification the
       * viewport is narrow whatever the hardware, so the breakpoint that serves
       * phones serves zoom, and neither needs a second layout to maintain.
       */
      clear(surface, windows);
    }
    root.dataset["desktopActive"] = "";
  };

  apply();

  /**
   * Window content changes height on its own — the catalog island replaces the
   * static index, a facet narrows the grid — and a window positioned from a
   * stale height leaves a gap or overlaps the one below. Observing the surface
   * catches that without polling.
   */
  let laying = false;
  const observer = new ResizeObserver(() => {
    // `layout` writes width, and the observer is watching width — without this
    // guard the first pass re-enters itself. It converges either way, but a
    // re-entrant ResizeObserver is how "loop completed with undelivered
    // notifications" gets into a console.
    if (laying || !wide.matches) return;
    laying = true;
    layout(surface, windows);
    laying = false;
  });
  for (const node of windows) observer.observe(node);

  const onChange = (): void => apply();
  wide.addEventListener("change", onChange);
  window.addEventListener("resize", onChange, { passive: true });

  return () => {
    observer.disconnect();
    wide.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
    clear(surface, windows);
    delete root.dataset["desktopActive"];
    delete root.dataset["desktopMode"];
  };
}
