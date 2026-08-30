/**
 * Responsive image URLs.
 *
 * Authority: PRD 1.1 ("1,300 thumbnails at 800x450 would need about 1.87 GB of
 * decoded pixel memory"), 9.5 (`MEM-DECODED-IMAGES` <= 64 MB on /projects),
 * 4 ("build-time image pipeline producing AVIF/WebP/JPEG fallbacks and
 * intrinsic dimensions"), ADR 0016.
 *
 * WHY WIDTHS AND NOT A SRCSET STRING. A card carries `src` plus the widths its
 * derivatives were emitted at, and the srcset is built from them here. Storing
 * the assembled string instead would repeat a ~40-character URL prefix per
 * entry per card, and `catalog-core` already measures 469 KB Brotli against a
 * 500 KB budget at 10,000 records. The compact form costs a few bytes a card.
 *
 * THIS IS THE ONLY PLACE THAT KNOWS THE FILENAME SHAPE. The media pipeline
 * writes `${hash}-${width}.${ext}` (see media/processor.ts) and this module is
 * the single consumer of that fact. A renderer that reconstructed URLs itself
 * would be a second owner of the same convention, free to drift.
 */

/** `${hash}-${width}.${ext}` — the shape media/processor.ts writes. */
const WIDTH_SUFFIX = /-(\d+)(\.[a-z0-9]+)$/i;

/**
 * Swap the width in a derivative URL.
 *
 * Returns null when `src` does not carry a width suffix, rather than returning
 * it unchanged: an unchanged URL in a srcset would advertise one image at
 * several widths, and the browser would trust it and pick wrongly. Failing to
 * build a srcset is recoverable; a lying one is not.
 */
export function widthVariantUrl(src: string, width: number): string | null {
  if (!WIDTH_SUFFIX.test(src)) return null;
  return src.replace(WIDTH_SUFFIX, `-${width}$2`);
}

/**
 * Build a `srcset` value, or null when one cannot be built honestly.
 *
 * Null means the caller should fall back to plain `src`, which still renders
 * correctly — it simply cannot let the browser choose a cheaper derivative.
 */
export function buildSrcSet(src: string, widths: readonly number[]): string | null {
  if (widths.length === 0) return null;

  const entries: string[] = [];
  for (const width of [...widths].sort((a, b) => a - b)) {
    const url = widthVariantUrl(src, width);
    if (url === null) return null;
    entries.push(`${url} ${width}w`);
  }
  return entries.join(", ");
}

export interface CardSizesLayout {
  readonly columnsByBreakpoint: readonly { minWidthPx: number; columns: number }[];
  /** Gap between columns, in CSS pixels. */
  readonly gapPx: number;
  /** Page gutter: the container is `100vw` minus this. */
  readonly gutterPx: number;
  /** Container max width in CSS pixels; it stops growing past this. */
  readonly maxContentPx: number;
}

/**
 * The `sizes` attribute for a grid card.
 *
 * Must describe the slot the card ACTUALLY occupies. A first version said
 * `100vw` at one column and `33vw` at three, ignoring the page gutter, the
 * container's max width and the gaps between columns — so every clause
 * overstated the slot, and the browser dutifully fetched a larger derivative
 * than the card could use. At a 420 px viewport it chose the 736 px image for a
 * 388 px slot, which is the waste `MEM-DECODED-IMAGES` exists to catch.
 *
 * Overstating is the dangerous direction: understating only costs sharpness,
 * while overstating spends decoded memory on pixels nobody sees.
 */
export function cardSizes(layout: CardSizesLayout): string {
  const { gapPx, gutterPx, maxContentPx } = layout;
  const container = `min(100vw - ${gutterPx}px, ${maxContentPx}px)`;

  // Widest breakpoint first: the browser takes the first matching clause.
  const clauses = [...layout.columnsByBreakpoint]
    .sort((a, b) => b.minWidthPx - a.minWidthPx)
    .map(({ minWidthPx, columns }) => {
      const gaps = gapPx * (columns - 1);
      return `(min-width: ${minWidthPx}px) calc((${container} - ${gaps}px) / ${columns})`;
    });

  // Below every breakpoint the grid is a single column.
  return [...clauses, `calc(${container})`].join(", ");
}
