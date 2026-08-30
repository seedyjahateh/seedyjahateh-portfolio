/**
 * Catalog retrieval engine.
 *
 * Authority: PRD 4.1 (framework-neutral catalog logic), 5.3 (filtering),
 * 5.4 (VisibleProjectIds), 7.4 (the migration boundary).
 *
 * Nothing here imports React, Next, or the DOM.
 */

export {
  loadCatalog,
  vocabularyGate,
  decodeLabels,
  termKey,
  type CatalogCore,
  type LoadedCatalog,
  type TermRef,
} from "./catalog.js";

export { FacetEngine, loadBitsets, type BitsetIndex, type Selection } from "./facets.js";

export { comparatorFor, type Comparator } from "./sort.js";

export { computeVisible, type VisibleInput, type VisibleResult } from "./visible.js";

export {
  packRows,
  columnsForWidth,
  gridMetrics,
  GRID_BREAKPOINTS,
  GRID_GAP_PX,
  CARD_MEDIA_RATIO,
  CARD_TEXT_BLOCK_PX,
  type Breakpoint,
  type GridMetrics,
  type PackedCard,
  type PackedRow,
} from "./pack.js";
