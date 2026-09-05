/**
 * One window.
 *
 * Authority: ADR 0036, PRD 10.1 (WCAG 2.2 AA), 9.3 (`A11Y-TARGET-SIZE` 24 px,
 * `BACKDROP-FILTER-SURFACES` 10).
 *
 * A SERVER COMPONENT, DELIBERATELY. Stage 2 tried building window chrome at
 * runtime and it threw `NotFoundError` the first time the catalog island
 * re-rendered: React owns those subtrees and will not tolerate another script
 * moving or appending to them. Rendering the chrome up front also means
 * `DOM-HOME` counts it, which is where the cost belongs.
 *
 * WITHOUT JAVASCRIPT THIS IS AN UNSTYLED WRAPPER. Every rule that gives it an
 * appearance, and every rule that reveals the controls, is gated on
 * `[data-desktop-active]` — an attribute only `desktop-shell.ts` sets. The
 * controls do nothing until `window-manager.ts` binds them, so they must not be
 * reachable before that; a button that does nothing is worse than no button.
 */

import type { ReactNode } from "react";

export interface WindowFrameProps {
  /** Stable across renders and reloads: keys ARIA and the saved geometry. */
  readonly id: string;
  readonly title: string;
  /**
   * `span` for the window that holds the page's own `h1`.
   *
   * `tests/web/export.test.ts` only forbids SKIPPING heading levels, so an `h2`
   * above the `h1` passes CI while reading as though the page title were nested
   * inside the window title. Nothing catches this but choosing correctly.
   */
  readonly titleAs?: "h2" | "span";
  /** Layout hint for desktop-shell.ts. `half` lets two windows share a row. */
  readonly span?: "full" | "half";
  readonly children: ReactNode;
}

/** PRD 5.4.1-style position vocabulary, and the whole of SC 2.5.7's answer. */
const PLACEMENTS = [
  { id: "left", label: "Left half" },
  { id: "right", label: "Right half" },
  { id: "centre", label: "Centre" },
  { id: "fill", label: "Fill" },
  { id: "reset", label: "Reset position" },
] as const;

export function WindowFrame({
  id,
  title,
  titleAs = "h2",
  span = "full",
  children,
}: WindowFrameProps) {
  const Title = titleAs === "span" ? "span" : "h2";
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;

  return (
    <section className="window" data-window={id} data-window-span={span} aria-labelledby={titleId}>
      <div className="window__bar" data-window-handle>
        {/*
          Traffic lights. 24x24 buttons holding a 12px dot, so they satisfy
          SC 2.5.8 on SIZE rather than leaning on the spacing exemption — real
          macOS lights are 12px on 8px gaps, which puts centres 20px apart and
          fails. axe's `target-size` rule runs in the suite's wcag22aa tag set,
          so this is checked rather than asserted.

          There is no close button, and the dock does not change that. The dock
          is the site's Primary navigation presented as a tray, not a list of
          open windows — so a closed window would still have nowhere to go and
          no way back, which is the whole objection. Every window here holds
          route content; closing one would be closing part of the page.
          Minimize collapses in place and is reversible.
        */}
        <span className="window__lights">
          <button
            type="button"
            className="window__light window__light--minimize"
            data-window-action="minimize"
            aria-expanded="true"
            aria-controls={bodyId}
          >
            <span className="visually-hidden">Minimize {title}</span>
          </button>
          <button
            type="button"
            className="window__light window__light--zoom"
            data-window-action="zoom"
            aria-pressed="false"
          >
            <span className="visually-hidden">Zoom {title}</span>
          </button>
        </span>

        <Title className="window__title" id={titleId}>
          {title}
        </Title>

        {/*
          The position menu, and the reason dragging is allowed to exist.

          WCAG 2.2 SC 2.5.7 requires a single-pointer equivalent for anything
          operated by dragging, and the "essential" exemption does not apply
          because a window's position can plainly be set another way. So this is
          the mechanism and the drag is the enhancement.

          `<details>` rather than a scripted menu: it is the disclosure pattern
          already used for facets (catalog-island.tsx), and it opens, closes and
          takes keyboard focus with no JavaScript of its own — which matters for
          a control whose entire purpose is to be the accessible path.
        */}
        <details className="window__menu">
          <summary className="window__menu-button">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="visually-hidden">Position {title}</span>
          </summary>
          <ul className="window__menu-list">
            {PLACEMENTS.map((placement) => (
              <li key={placement.id}>
                <button type="button" data-window-place={placement.id}>
                  {placement.label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className="window__body" id={bodyId}>
        {children}
      </div>
    </section>
  );
}
