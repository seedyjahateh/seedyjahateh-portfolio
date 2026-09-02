"use client";

/**
 * Evidence grid — the default archive view.
 *
 * Authority: PRD 5.4.1 (deterministic variants, packed rows, 3 rows of
 * overscan, 18–36 cards mounted with a hard 60 maximum, reserved aspect ratios,
 * bounded line clamps), 9.3 (no per-card listeners or observers, no read/write
 * interleaving, `MOUNTED-CARDS-MAX`), 9.7 (image failure preserves geometry and
 * shows a branded neutral placeholder), 5.4 (views consume VisibleProjectIds
 * and may not filter), ADR 0010, ADR 0011.
 *
 * NOTHING HERE MEASURES A CARD. Row height comes from `gridMetrics`, which is a
 * pure function of container width and tokens. The single `ResizeObserver`
 * reports width and nothing else, exactly as PRD 5.4.1 requires. That is what
 * keeps `FORCED-LAYOUTS-SCROLL` at zero: there is no layout to force.
 *
 * IMAGE FAILURES ARE CAUGHT IN THE CAPTURE PHASE. PRD 9.3 forbids a listener
 * per card, and `error` events on `<img>` do not bubble — so the only way to
 * handle them at the view boundary, as required, is a capture-phase listener on
 * the container.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, type RowComponentProps } from "react-window";

import type { CatalogCard } from "@atlas/contracts/artifacts";
import { buildSrcSet, cardSizes } from "@atlas/contracts/media";
import {
  gridMetrics,
  packRows,
  GRID_BREAKPOINTS,
  GRID_GAP_PX,
  type PackedRow,
} from "@atlas/engine/pack";

/** PRD 5.4.1: three rows above and below the visible region. */
export const GRID_OVERSCAN_ROWS = 3;

/**
 * Computed once. Mirrors `.shell` in globals.css — `width: min(100% - 2rem,
 * 76rem)` — because `sizes` has to describe the slot the card really occupies,
 * not the viewport. See `cardSizes`.
 */
const SHELL_GUTTER_PX = 32; // 2rem
const SHELL_MAX_PX = 1216; // 76rem
const CARD_SIZES = cardSizes({
  columnsByBreakpoint: GRID_BREAKPOINTS.filter((b) => b.minWidthPx > 0),
  gapPx: GRID_GAP_PX,
  gutterPx: SHELL_GUTTER_PX,
  maxContentPx: SHELL_MAX_PX,
});

export interface GridData {
  readonly ids: Uint32Array;
  readonly cards: readonly CatalogCard[];
  readonly labels: ReadonlyMap<number, string>;
  /**
   * Ordinal -> status label, from the status facet bitset. The rows view has
   * shown this since Phase 3; the grid did not, and the grid is the default.
   *
   * That mattered more than it looks. 238 of 240 records are `planned`, and a
   * card rendered its proof level while withholding whether the work exists —
   * so a visitor read "code" on a project with no code, no link and no
   * evidence, indistinguishable from one that shipped. PRD 0.10 does not permit
   * a portfolio to be ambiguous about what is real.
   */
  readonly statuses: readonly (string | null)[];
}

interface RowProps {
  readonly rows: readonly PackedRow[];
  readonly cards: readonly CatalogCard[];
  readonly total: number;
  readonly offsets: readonly number[];
  readonly statuses: readonly (string | null)[];
}

// The row needs no metrics: its height arrives inline from the virtualizer and
// its column count from the `--grid-columns` custom property on the container,
// so both come from `gridMetrics` without being threaded through every row.
function GridRow({
  index,
  style,
  rows,
  cards,
  total,
  offsets,
  statuses,
}: RowComponentProps<RowProps>) {
  const row = rows[index];
  if (row === undefined) return null;
  const firstIndex = offsets[index] ?? 0;

  return (
    // presentation: the row is a layout wrapper, and role="list" requires its
    // items to be effective children. Without this the cards are not listitems.
    <div className="grid__row" style={style} role="presentation">
      {row.cards.map((packed, position) => {
        const card = cards[packed.ordinal];
        if (card === undefined) return null;
        const srcset = card.img === null ? null : buildSrcSet(card.img.src, card.img.widths);
        const status = statuses[packed.ordinal] ?? null;
        // `ordinalLabels` yields the display label ("In progress"), while CSS
        // needs a stable key. Slugified back to the facet's own value rather
        // than styling on prose, which changes the day someone rewords a label.
        const statusKey = status === null ? null : status.toLowerCase().replace(/\s+/g, "-");

        return (
          <article
            key={card.id}
            className={`card card--${card.variant}`}
            data-accent={card.accent}
            data-ordinal={packed.ordinal}
            data-slug={card.slug}
            // Styling hook only; the label below is what is actually read. A
            // card whose status is unknown gets no attribute rather than a
            // guess, so CSS cannot invent a state the catalog does not assert.
            {...(statusKey === null ? {} : { "data-status": statusKey })}
            role="listitem"
            // Positional ARIA: with virtualization the DOM holds a window, so
            // without these a screen reader announces "1 of 36" inside a
            // catalog of 1,300 (PRD 14's virtualization risk).
            aria-setsize={total}
            aria-posinset={firstIndex + position + 1}
            style={{ gridColumn: `span ${packed.span}` }}
          >
            <div
              className="card__media"
              // Reserved before any byte arrives. PRD 9.3 budgets zero layout
              // shift from media, and an image that never loads must move
              // nothing.
              style={{ aspectRatio: `${card.img?.w ?? 4} / ${card.img?.h ?? 3}` }}
            >
              {card.img === null ? (
                <span className="card__placeholder" aria-hidden="true" />
              ) : (
                <img
                  src={card.img.src}
                  {...(srcset === null ? {} : { srcSet: srcset, sizes: CARD_SIZES })}
                  alt={card.img.alt}
                  width={card.img.w}
                  height={card.img.h}
                  loading="lazy"
                  decoding="async"
                />
              )}
            </div>

            <h3 className="card__title">
              <a href={`/projects/${card.slug}`}>{card.t}</a>
            </h3>
            <p className="card__claim">{card.c}</p>
            <ul className="card__meta meta">
              <li className="project-id">{card.id}</li>
              {/* Before the proof level, deliberately: "planned" qualifies what
                  "code" means, and reading them the other way round states a
                  proof and then withdraws it. */}
              {status !== null && <li className="card__state">{status}</li>}
              <li>{card.proof}</li>
              <li>{card.year}</li>
            </ul>
          </article>
        );
      })}
    </div>
  );
}

export interface ProjectGridProps {
  readonly data: GridData;
  readonly height: number;
  /** Called when a card receives focus, so the archive can record `?focus=`. */
  readonly onFocusProject?: (slug: string) => void;
}

export function ProjectGrid({ data, height, onFocusProject }: ProjectGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  /**
   * ONE observer for the whole view (PRD 9.3 forbids one per card), reporting
   * width only (PRD 5.4.1). Height is never observed: it comes from tokens, and
   * observing it would reintroduce the measurement loop ADR 0011 removed.
   */
  useEffect(() => {
    const node = containerRef.current;
    if (node === null) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /**
   * Image failures, handled once at the boundary.
   *
   * PRD 9.7: "preserve geometry, show alt text and a branded neutral
   * placeholder, and avoid retry loops." Marking the frame is what avoids the
   * retry: nothing reassigns `src`, so a broken URL is requested once.
   */
  useEffect(() => {
    const node = containerRef.current;
    if (node === null) return;
    const onError = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      target.closest(".card__media")?.setAttribute("data-failed", "");
      target.hidden = true;
    };
    // Capture phase: `error` does not bubble, so a listener on the container
    // only sees it on the way down.
    node.addEventListener("error", onError, true);
    return () => node.removeEventListener("error", onError, true);
  }, []);

  const onFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const slug = (event.target as HTMLElement).closest<HTMLElement>("[data-slug]")?.dataset["slug"];
      if (slug !== undefined) onFocusProject?.(slug);
    },
    [onFocusProject],
  );

  const metrics = useMemo(() => gridMetrics(width), [width]);

  const rows = useMemo(
    () => packRows(data.ids, (ordinal) => data.cards[ordinal]?.variant ?? "standard", metrics.columns),
    [data.ids, data.cards, metrics.columns],
  );

  /** Running card index per row, so `aria-posinset` is catalog-wide. */
  const offsets = useMemo(() => {
    const out: number[] = [];
    let running = 0;
    for (const row of rows) {
      out.push(running);
      running += row.cards.length;
    }
    return out;
  }, [rows]);

  const rowProps: RowProps = {
    rows,
    cards: data.cards,
    total: data.ids.length,
    offsets,
    statuses: data.statuses,
  };

  return (
    <div
      ref={containerRef}
      className="grid"
      style={{ ["--grid-columns" as string]: metrics.columns }}
      onFocus={onFocus}
    >
      {width === 0 ? null : (
        <List
          role="list"
          aria-label="Projects"
          rowComponent={GridRow}
          rowCount={rows.length}
          rowHeight={metrics.rowHeight}
          rowKey={(index, props) => String(props.rows[index]?.cards[0]?.ordinal ?? index)}
          rowProps={rowProps}
          overscanCount={GRID_OVERSCAN_ROWS}
          style={{ height, width: "100%" }}
        />
      )}
    </div>
  );
}
