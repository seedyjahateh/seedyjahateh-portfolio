/**
 * Bitset facet filtering.
 *
 * Authority: PRD 5.3.2 (bitset representation, OR within a group and AND across
 * groups), 5.3.3 (filter computation ≤4 ms median and ≤8 ms p95 at 1,300
 * projects, ≤16 ms p95 at 10,000), ADR 0009 (layout, endianness, budget).
 *
 * WHY BITSETS AND NOT ARRAY FILTERING. At 1,300 projects one set is 41 32-bit
 * words. Intersecting three facet groups is ~123 word operations — arithmetic,
 * not object traversal, and it touches 164 bytes per set rather than 1,300
 * objects. The budget is 4 ms median; a naive `.filter()` over decoded records
 * would spend most of that in property access and allocation.
 *
 * THE SCRATCH BUFFERS ARE THE POINT. Filtering runs on every keystroke and
 * every token click. Allocating two Uint32Arrays per call would hand the GC a
 * steady stream of garbage during exactly the interaction PRD 9.3 budgets at
 * zero long tasks. They are allocated once per catalog and reused.
 */

import {
  facetBitsPayload,
  parseFacetBitsHeader,
  wordsPerSet as wordsFor,
} from "@atlas/contracts/artifacts";

import { termKey, type LoadedCatalog } from "./catalog.js";

export interface BitsetIndex {
  /** Zero-copy view over the payload; requires a little-endian host (ADR 0009). */
  readonly payload: Uint32Array;
  readonly words: number;
  readonly projectCount: number;
  readonly setCount: number;
  readonly dictHash32: number;
}

export function loadBitsets(buffer: ArrayBuffer): BitsetIndex {
  const header = parseFacetBitsHeader(buffer);
  return {
    payload: facetBitsPayload(buffer),
    words: header.wordsPerSet,
    projectCount: header.projectCount,
    setCount: header.setCount,
    dictHash32: header.dictHash32,
  };
}

/** Selected values per facet group, exactly the shape `UrlState.filters` has. */
export type Selection = Readonly<Record<string, readonly string[]>>;

/**
 * Reusable filtering state for one loaded catalog.
 *
 * Holds the scratch buffers. One instance per catalog, reused for the life of
 * the page.
 */
export class FacetEngine {
  private readonly accumulator: Uint32Array;
  private readonly groupBuffer: Uint32Array;
  // Declared explicitly rather than as constructor parameter properties:
  // tsconfig sets `erasableSyntaxOnly`, so the shorthand is not available.
  private readonly catalog: LoadedCatalog;
  private readonly bits: BitsetIndex;

  constructor(catalog: LoadedCatalog, bits: BitsetIndex) {
    this.catalog = catalog;
    this.bits = bits;
    if (bits.projectCount !== catalog.core.count) {
      throw new Error(
        `catalog mismatch: facet-bits covers ${bits.projectCount} projects but catalog-core has ${catalog.core.count}. Reload the manifest.`,
      );
    }
    if (bits.words !== wordsFor(bits.projectCount)) {
      throw new Error(
        `facet-bits: ${bits.words} words per set does not match ${bits.projectCount} projects.`,
      );
    }
    this.accumulator = new Uint32Array(bits.words);
    this.groupBuffer = new Uint32Array(bits.words);
  }

  /** Number of projects in the catalog, i.e. the unfiltered total. */
  get projectCount(): number {
    return this.bits.projectCount;
  }

  /**
   * Intersect a selection into a membership bitset.
   *
   * Returns `null` when nothing is selected — meaning "every project" — so
   * callers can skip the membership test entirely on the common unfiltered
   * path rather than walking an all-ones bitset.
   *
   * The returned array is the internal accumulator. It is valid until the next
   * call and must not be retained.
   */
  select(selection: Selection): Uint32Array | null {
    const groups = Object.keys(selection).filter((group) => (selection[group] ?? []).length > 0);
    if (groups.length === 0) return null;

    const { payload, words } = this.bits;
    const accumulator = this.accumulator;
    const groupBuffer = this.groupBuffer;
    let seeded = false;

    // Groups are processed in a stable order so the result never depends on
    // key insertion order; the arithmetic is commutative but determinism here
    // makes the property tests reproducible.
    groups.sort();

    for (const group of groups) {
      groupBuffer.fill(0);

      // OR every selected value within this group (PRD 5.3.2).
      for (const value of selection[group] ?? []) {
        const term = this.catalog.terms.get(termKey(group, value));
        // An unknown term contributes nothing. The vocabulary gate normally
        // drops these before they reach here; if one survives, a group whose
        // every value is unknown correctly matches nothing.
        if (term === undefined) continue;
        const base = term.setIndex * words;
        for (let i = 0; i < words; i += 1) {
          groupBuffer[i] = (groupBuffer[i] ?? 0) | (payload[base + i] ?? 0);
        }
      }

      // AND this group into the running result (PRD 5.3.2).
      if (!seeded) {
        accumulator.set(groupBuffer);
        seeded = true;
      } else {
        for (let i = 0; i < words; i += 1) {
          accumulator[i] = (accumulator[i] ?? 0) & (groupBuffer[i] ?? 0);
        }
      }
    }

    return accumulator;
  }

  /** Test one ordinal against a bitset produced by `select`. */
  static has(bitset: Uint32Array, ordinal: number): boolean {
    const word = bitset[ordinal >>> 5];
    if (word === undefined) return false;
    return (word & (1 << (ordinal & 31))) !== 0;
  }

  /**
   * Population count, for the "N results" announcement before sorting.
   *
   * Hamming weight via the standard SWAR sequence — no loop over ordinals, so
   * counting 10,000 projects costs 313 word operations rather than 10,000 bit
   * tests.
   */
  static count(bitset: Uint32Array): number {
    let total = 0;
    for (const word of bitset) {
      let v = word;
      v = v - ((v >>> 1) & 0x55555555);
      v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
      total += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    }
    return total;
  }

  /**
   * Expand a bitset to ascending ordinals.
   *
   * Skips whole empty words, which is what makes a narrow filter over a large
   * catalog cheap: 10,000 projects with 12 matches touches 313 words and 12
   * bits, not 10,000 of anything.
   */
  static ordinals(bitset: Uint32Array, projectCount: number): Uint32Array {
    const out = new Uint32Array(FacetEngine.count(bitset));
    let n = 0;
    for (let w = 0; w < bitset.length; w += 1) {
      let word = bitset[w] ?? 0;
      if (word === 0) continue;
      const base = w << 5;
      while (word !== 0) {
        // Lowest set bit; Math.clz32 avoids a per-bit loop.
        const bit = 31 - Math.clz32(word & -word);
        const ordinal = base + bit;
        if (ordinal < projectCount) out[n++] = ordinal;
        word &= word - 1;
      }
    }
    return n === out.length ? out : out.subarray(0, n);
  }
}
