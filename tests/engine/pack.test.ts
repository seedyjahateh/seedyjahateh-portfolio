/**
 * Deterministic row packer.
 *
 * Authority: PRD 5.4.1 (explicit spans, breakpoint rules, rows of known
 * height), 5.4 (all views consume VisibleProjectIds and may not reorder it),
 * ADR 0011.
 *
 * These properties are trivial to assert here and miserable to diagnose through
 * a virtualizer, where a dropped card looks like a scrolling bug.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CARD_VARIANT, CARD_VARIANT_SPAN, type CardVariant } from "@atlas/contracts/enums";
import {
  columnsForWidth,
  gridMetrics,
  packRows,
  GRID_BREAKPOINTS,
  type PackedRow,
} from "@atlas/engine/pack";

const variants = CARD_VARIANT as readonly CardVariant[];

/** Deterministic variant assignment, so a failing case is reproducible. */
function cycling(order: readonly CardVariant[]): (ordinal: number) => CardVariant {
  return (ordinal) => order[ordinal % order.length] ?? "standard";
}

function flatten(rows: readonly PackedRow[]): number[] {
  return rows.flatMap((row) => row.cards.map((card) => card.ordinal));
}

describe("packRows", () => {
  it("rejects a column count below one", () => {
    // Silently coercing to 1 would hide a caller that computed width wrongly.
    expect(() => packRows([0, 1], () => "standard", 0)).toThrow(/at least one column/i);
  });

  it("keeps every card, exactly once, in the given order", () => {
    /**
     * PRD 5.4 makes VisibleProjectIds the single ordered output of search,
     * facets and sort. A packer that reordered cards to fill rows more tightly
     * would silently override the visitor's chosen sort — a short final row is
     * correct, a reordered one is a bug that looks like a ranking bug.
     */
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 0, maxLength: 200 }),
        fc.integer({ min: 1, max: 6 }),
        fc.array(fc.constantFrom(...variants), { minLength: 1, maxLength: 5 }),
        (ordinals, columns, order) => {
          const rows = packRows(ordinals, cycling(order), columns);
          expect(flatten(rows)).toEqual(ordinals);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("never overfills a row", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 1, maxLength: 200 }),
        fc.integer({ min: 1, max: 6 }),
        fc.array(fc.constantFrom(...variants), { minLength: 1, maxLength: 5 }),
        (ordinals, columns, order) => {
          for (const row of packRows(ordinals, cycling(order), columns)) {
            const used = row.cards.reduce((sum, card) => sum + card.span, 0);
            expect(used).toBeLessThanOrEqual(columns);
            expect(used).toBe(row.filled);
          }
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("clamps a card wider than the row instead of overflowing", () => {
    // A `wide` card spans 2, so on a one-column layout it must become 1 rather
    // than breaking the grid or being dropped.
    const rows = packRows([0, 1], () => "wide", 1);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.cards.every((card) => card.span === 1))).toBe(true);
    expect(flatten(rows)).toEqual([0, 1]);
  });

  it("starts a new row rather than splitting a card across two", () => {
    // Three columns, then a 2-span card: it cannot fit beside two standards.
    const rows = packRows([0, 1, 2], (o) => (o === 2 ? "wide" : "standard"), 3);
    expect(rows.map((r) => r.cards.map((c) => c.ordinal))).toEqual([[0, 1], [2]]);
    expect(rows[0]?.filled).toBe(2);
  });

  it("packs a full row exactly", () => {
    const rows = packRows([0, 1, 2, 3], () => "standard", 4);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.filled).toBe(4);
  });

  it("returns nothing for an empty catalog", () => {
    // The filtered-empty state is a real screen (PRD 11.2 screenshots it), and
    // a packer returning one empty row would render a blank band.
    expect(packRows([], () => "standard", 3)).toEqual([]);
  });

  it("is deterministic", () => {
    const ordinals = Array.from({ length: 50 }, (_, i) => i);
    const variantOf = cycling(variants);
    expect(packRows(ordinals, variantOf, 3)).toEqual(packRows(ordinals, variantOf, 3));
  });

  it("uses the span table rather than its own idea of width", () => {
    // If CARD_VARIANT_SPAN changes, the packer must follow it.
    const rows = packRows([0], () => "feature", 4);
    expect(rows[0]?.cards[0]?.span).toBe(CARD_VARIANT_SPAN.feature);
  });
});

describe("breakpoints and geometry", () => {
  it("picks the widest matching breakpoint", () => {
    expect(columnsForWidth(0)).toBe(1);
    expect(columnsForWidth(559)).toBe(1);
    expect(columnsForWidth(560)).toBe(2);
    expect(columnsForWidth(1279)).toBe(3);
    expect(columnsForWidth(4000)).toBe(4);
  });

  it("never returns fewer columns as the container grows", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4000 }), fc.integer({ min: 0, max: 4000 }), (a, b) => {
        const [narrow, wide] = a <= b ? [a, b] : [b, a];
        expect(columnsForWidth(narrow)).toBeLessThanOrEqual(columnsForWidth(wide));
      }),
      { numRuns: 1000 },
    );
  });

  it("derives row height from width and tokens alone, never from content", () => {
    // Same width in, same height out — no card, no measurement, no DOM.
    expect(gridMetrics(1000).rowHeight).toBe(gridMetrics(1000).rowHeight);
    expect(gridMetrics(1000).columns).toBe(3);
  });

  it("gives a positive column width even at absurd container widths", () => {
    // A container can measure 0 during the first frame after mount; a negative
    // or zero column width would produce a NaN row height and an empty grid.
    for (const width of [0, 1, 10, 559, 560, 4000]) {
      const metrics = gridMetrics(width);
      expect(metrics.columnWidth).toBeGreaterThan(0);
      expect(Number.isFinite(metrics.rowHeight)).toBe(true);
      expect(metrics.rowHeight).toBeGreaterThan(0);
    }
  });

  it("keeps the breakpoint table sorted, since the grid CSS mirrors it", () => {
    const mins = GRID_BREAKPOINTS.map((b) => b.minWidthPx);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
  });
});
