/**
 * Catalog sort orders.
 *
 * Authority: PRD 5.3.3 (`sort` is canonical URL state), 5.2.3 ("Search
 * relevance dominates editorial priority. `proofLevel` may break near-ties but
 * cannot move a weak text match above a strong match"), 8.2 / enums.ts
 * (`SORT_ORDER` is frozen).
 *
 * EVERY COMPARATOR BREAKS TIES BY ORDINAL. Two projects from the same year with
 * the same proof level must not swap places between renders, or the row
 * virtualizer will appear to shuffle while scrolling. Ordinal is the catalog's
 * deterministic build order, so it is a total order and free.
 */

import { PROOF_LEVEL_RANK, type SortOrder } from "@atlas/contracts/enums";

import type { LoadedCatalog } from "./catalog.js";

/**
 * Pinned to "en" rather than the user's locale.
 *
 * A locale-sensitive sort would order the same catalog differently for
 * different visitors, so a shared `?sort=title` link would not reproduce what
 * the sender saw — and PRD 5.3.3 requires share links to be stable. The site is
 * English; this is the honest trade.
 */
const COLLATOR = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export type Comparator = (a: number, b: number) => number;

export function comparatorFor(catalog: LoadedCatalog, sort: SortOrder): Comparator {
  const cards = catalog.byOrdinal;

  switch (sort) {
    case "proof":
      return (a, b) => {
        const cardA = cards[a];
        const cardB = cards[b];
        if (cardA === undefined || cardB === undefined) return a - b;
        const rank = PROOF_LEVEL_RANK[cardB.proof] - PROOF_LEVEL_RANK[cardA.proof];
        return rank !== 0 ? rank : a - b;
      };

    case "year-desc":
      return (a, b) => {
        const cardA = cards[a];
        const cardB = cards[b];
        if (cardA === undefined || cardB === undefined) return a - b;
        return cardB.year !== cardA.year ? cardB.year - cardA.year : a - b;
      };

    case "year-asc":
      return (a, b) => {
        const cardA = cards[a];
        const cardB = cards[b];
        if (cardA === undefined || cardB === undefined) return a - b;
        return cardA.year !== cardB.year ? cardA.year - cardB.year : a - b;
      };

    case "title":
      return (a, b) => {
        const cardA = cards[a];
        const cardB = cards[b];
        if (cardA === undefined || cardB === undefined) return a - b;
        const byTitle = COLLATOR.compare(cardA.t, cardB.t);
        return byTitle !== 0 ? byTitle : a - b;
      };

    case "relevance":
    default:
      /**
       * With no active query there is no relevance to sort by, so this falls
       * back to the compiler's editorial `priority`. When a query IS active the
       * worker's ranking is used instead and this comparator is never reached —
       * see `visible.ts`. That is what keeps PRD 5.2.3's rule intact: editorial
       * priority never reorders a ranked result set.
       */
      return (a, b) => {
        const cardA = cards[a];
        const cardB = cards[b];
        if (cardA === undefined || cardB === undefined) return a - b;
        return cardB.priority !== cardA.priority ? cardB.priority - cardA.priority : a - b;
      };
  }
}
