/**
 * Deterministic row packer for the evidence grid.
 *
 * Authority: PRD 5.4.1 ("Pack cards into rows during data preparation based on
 * explicit spans and breakpoint rules. The virtualizer operates on rows with
 * known heights", "Deterministic card variants ... No arbitrary content-driven
 * masonry"), 9.3 (zero forced synchronous layouts during scroll), ADR 0011.
 *
 * WHY THE ROWS ARE UNIFORM HEIGHT. `CARD_VARIANT_SPAN` already gives `wide` and
 * `feature` the same span of 2, so a variant is a width, not a height. A card
 * that spanned two ROWS would make each row's geometry depend on the rows above
 * it — which is masonry under a different name, and is the exact loop ADR 0011
 * exists to break: measuring unknown heights during scroll forces layout, which
 * destabilises scroll anchoring, which invalidates the virtualizer's cache,
 * which causes more measurement.
 *
 * A `feature` therefore differs from a `wide` in treatment rather than
 * geometry: same box, more of it given to media and accent.
 *
 * Pure and DOM-free, like the rest of this package. Column count arrives as a
 * number; deciding it from a container width is the caller's job, and the
 * caller is the only thing allowed to touch a `ResizeObserver`.
 */

import { CARD_VARIANT_SPAN, type CardVariant } from "@atlas/contracts/enums";

export interface PackedCard {
  /** Catalog ordinal, the join key back to `catalog-core`. */
  readonly ordinal: number;
  /** Columns this card occupies, already clamped to the row width. */
  readonly span: number;
}

export interface PackedRow {
  readonly cards: readonly PackedCard[];
  /** Columns filled. Never exceeds the column count; may be short on the last row. */
  readonly filled: number;
}

/**
 * Pack ordered cards into rows of `columns` columns.
 *
 * ORDER IS PRESERVED EXACTLY. The input is `VisibleProjectIds` — the single
 * ordered output of search, facets and sort (PRD 5.4) — so a packer that
 * reordered to fill rows more tightly would silently override the visitor's
 * chosen sort. A short last row is correct; a reordered one is not.
 *
 * A card wider than the row clamps rather than overflowing, which is what makes
 * a `wide` card render as a single column on a one-column layout instead of
 * breaking the grid.
 */
export function packRows(
  ordinals: Uint32Array | readonly number[],
  variantOf: (ordinal: number) => CardVariant,
  columns: number,
): PackedRow[] {
  if (columns < 1) throw new Error(`packRows needs at least one column, got ${columns}`);

  const rows: PackedRow[] = [];
  let current: PackedCard[] = [];
  let filled = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    rows.push({ cards: current, filled });
    current = [];
    filled = 0;
  };

  for (const ordinal of ordinals) {
    const span = Math.min(CARD_VARIANT_SPAN[variantOf(ordinal)], columns);
    // Start a new row rather than splitting a card across two.
    if (filled + span > columns) flush();
    current.push({ ordinal, span });
    filled += span;
    if (filled === columns) flush();
  }

  flush();
  return rows;
}

/** Breakpoint table: the widest matching entry decides the column count. */
export interface Breakpoint {
  readonly minWidthPx: number;
  readonly columns: number;
}

/**
 * Column counts by container width.
 *
 * Exported so the grid's CSS, the `sizes` attribute and the packer all read the
 * same table. Three separate copies of these numbers would drift, and the
 * symptom would be the browser fetching a derivative sized for a slot the card
 * does not occupy.
 */
export const GRID_BREAKPOINTS: readonly Breakpoint[] = [
  { minWidthPx: 0, columns: 1 },
  { minWidthPx: 560, columns: 2 },
  { minWidthPx: 900, columns: 3 },
  { minWidthPx: 1280, columns: 4 },
];

export function columnsForWidth(widthPx: number): number {
  let columns = 1;
  for (const breakpoint of GRID_BREAKPOINTS) {
    if (widthPx >= breakpoint.minWidthPx) columns = breakpoint.columns;
  }
  return columns;
}

/**
 * Row height in CSS pixels, from column width and tokens alone.
 *
 * PRD 5.4.1: "row geometry is computed from width and design tokens". Nothing
 * here reads the DOM, so a row's height is known before it renders and stays
 * known while scrolling.
 */
export interface GridMetrics {
  readonly columns: number;
  readonly columnWidth: number;
  readonly rowHeight: number;
}

/** Media box aspect ratio, and the fixed text block beneath it. */
export const CARD_MEDIA_RATIO = 3 / 4;
export const CARD_TEXT_BLOCK_PX = 92;
export const GRID_GAP_PX = 16;

export function gridMetrics(containerWidthPx: number): GridMetrics {
  const columns = columnsForWidth(containerWidthPx);
  const totalGap = GRID_GAP_PX * (columns - 1);
  const columnWidth = Math.max(1, (containerWidthPx - totalGap) / columns);
  // The media box is sized from ONE column even on a card spanning two, so
  // every row is the same height whatever it contains.
  const rowHeight = Math.round(columnWidth * CARD_MEDIA_RATIO) + CARD_TEXT_BLOCK_PX + GRID_GAP_PX;
  return { columns, columnWidth, rowHeight };
}
