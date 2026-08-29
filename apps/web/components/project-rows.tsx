"use client";

/**
 * Dense terminal/row view.
 *
 * Authority: PRD 5.4.2 (fixed row height 52 px compact / 64 px comfortable,
 * react-window with stable project id keys and overscan 6, the column set,
 * aria-rowcount / aria-rowindex, predictable keyboard navigation), 9.3
 * (`MOUNTED-ROWS-MAX` 72, `DOM-ARCHIVE-STEADY` 1000, zero forced layouts on
 * scroll), ADR 0010.
 *
 * FIXED HEIGHTS ARE THE WHOLE DESIGN. PRD 14 names variable-height measurement
 * as a high-impact risk, and PRD 5.4.2 answers it by fixing the row height in
 * tokens rather than measuring content. Nothing here reads layout: row height
 * is a constant, so scrolling performs no DOM reads and cannot force a
 * synchronous layout.
 *
 * It renders `VisibleProjectIds` and nothing else. PRD 5.4 forbids views from
 * filtering, and this one structurally cannot — it receives an ordered
 * Uint32Array and looks each ordinal up.
 */

import { List, type RowComponentProps } from "react-window";

import type { CatalogCard } from "@atlas/contracts/artifacts";

/** PRD 5.4.2 row heights, in CSS pixels. */
export const ROW_HEIGHT = { compact: 52, comfortable: 64 } as const;
/** PRD 5.4.2: overscan of 6 rows. */
export const OVERSCAN_ROWS = 6;

export type Density = keyof typeof ROW_HEIGHT;

export interface RowsData {
  readonly ids: Uint32Array;
  readonly cards: readonly CatalogCard[];
  /** Ordinal -> status label, resolved from the status facet bitset. */
  readonly statuses: readonly (string | null)[];
  /** Dictionary id -> label, for decoding a card's roles and stack. */
  readonly labels: ReadonlyMap<number, string>;
}

function decode(labels: ReadonlyMap<number, string>, ids: readonly number[], max: number): string {
  const out: string[] = [];
  for (const id of ids) {
    const label = labels.get(id);
    if (label !== undefined) out.push(label);
    if (out.length === max) break;
  }
  return out.join(", ");
}

function ProjectRow({ index, style, ids, cards, statuses, labels }: RowComponentProps<RowsData>) {
  const ordinal = ids[index] ?? 0;
  const card = cards[ordinal];
  if (card === undefined) return null;

  return (
    <div
      className="row"
      style={style}
      role="row"
      // 1-based and offset by the header row, which is what a screen reader
      // announces as "row N of M" (PRD 5.4.2).
      aria-rowindex={index + 2}
    >
      <span className="row__id" role="gridcell">
        {card.id}
      </span>
      <span className="row__title" role="gridcell">
        <a href={`/projects/${card.slug}`}>{card.t}</a>
      </span>
      <span className="row__roles" role="gridcell">
        {decode(labels, card.roles, 2)}
      </span>
      <span className="row__stack" role="gridcell">
        {decode(labels, card.stack, 3)}
      </span>
      <span className="row__proof" role="gridcell">
        {card.proof}
      </span>
      <span className="row__year" role="gridcell">
        {card.year}
      </span>
      <span className="row__status" role="gridcell">
        {statuses[ordinal] ?? "—"}
      </span>
      {/* PRD 5.4.2 "evidence shortcuts". The archive carries no evidence
          payloads (PRD 9.5 keeps cards compact), so this is a deep link into
          the detail route's evidence section rather than a copy of it. */}
      <span className="row__evidence" role="gridcell">
        <a href={`/projects/${card.slug}#evidence-heading`} aria-label={`Evidence for ${card.t}`}>
          evidence
        </a>
      </span>
    </div>
  );
}

export interface ProjectRowsProps {
  readonly data: RowsData;
  readonly density: Density;
  /** Rendered height in pixels. Fixed, so no measurement happens on scroll. */
  readonly height: number;
}

export function ProjectRows({ data, density, height }: ProjectRowsProps) {
  return (
    <div
      className="rows"
      role="grid"
      // The header row counts, hence +1 (PRD 5.4.2).
      aria-rowcount={data.ids.length + 1}
      aria-label="Projects"
    >
      {/* Header and body each get their own rowgroup. A `role="row"` must be
          a direct child of grid/rowgroup, and react-window inserts one wrapper
          div of its own — so without these, axe reports aria-required-children
          on the grid and aria-required-parent on every row. */}
      <div role="rowgroup">
        <div className="row row--head" role="row" aria-rowindex={1}>
          <span role="columnheader">ID</span>
          <span role="columnheader">Project</span>
          <span role="columnheader">Roles</span>
          <span role="columnheader">Stack</span>
          <span role="columnheader">Proof</span>
          <span role="columnheader">Year</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Evidence</span>
        </div>
      </div>

      <List
        // Overrides react-window's default role="list", which is not a valid
        // child of role="grid".
        role="rowgroup"
        rowComponent={ProjectRow}
        rowCount={data.ids.length}
        rowHeight={ROW_HEIGHT[density]}
        // Stable across filter changes, so React reuses the right DOM node and
        // focus is not silently moved to a different project (PRD 5.3.3).
        rowKey={(index, rows) => String(rows.ids[index] ?? index)}
        rowProps={data}
        overscanCount={OVERSCAN_ROWS}
        style={{ height, width: "100%" }}
      />
    </div>
  );
}
