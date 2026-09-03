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

import { createWindowManager } from "./window-manager";

/** Below this the desktop is not a desktop. See `Springboard` in globals.css. */
const DESKTOP_MIN_WIDTH = 900;

export function startDesktop(): () => void {
  const root = document.documentElement;
  const surface = document.querySelector<HTMLElement>(".desktop-surface");
  if (surface === null) return () => undefined;

  const windows = [...surface.querySelectorAll<HTMLElement>(".window")];
  const wide = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);

  /**
   * All geometry lives in the manager, including the automatic layout.
   *
   * It was here first, and having two files write `transform` on the same
   * elements is how a dragged window gets silently re-tidied by a resize. This
   * file keeps what it is actually about: which mode the page is in, the
   * attribute every stylesheet rule hangs off, and when to recompute.
   */
  const manager = createWindowManager(surface);

  const apply = (): void => {
    const desktop = wide.matches;
    root.dataset["desktopMode"] = desktop ? "desktop" : "springboard";
    if (desktop) manager.relayout();
    else {
      /**
       * The springboard is a stylesheet, not a second DOM. Clearing the inline
       * geometry lets the windows fall back into normal document flow, which is
       * also the answer to `A11Y-ZOOM` at 400%: at that magnification the
       * viewport is narrow whatever the hardware, so the breakpoint that serves
       * phones serves zoom, and neither needs a second layout to maintain.
       */
      manager.clear();
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
    manager.relayout();
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
    manager.destroy();
    delete root.dataset["desktopActive"];
    delete root.dataset["desktopMode"];
  };
}
