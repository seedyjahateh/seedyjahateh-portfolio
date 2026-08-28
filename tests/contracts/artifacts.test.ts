/**
 * Artifact contracts, focused on the facet-bits binary layout.
 *
 * Authority: PRD 5.3.2 (bitset representation and sizing), 5.1.5 (artifact
 * budgets), 9.7 (catalog artifact mismatch must be reported, not rendered).
 */

import { describe, expect, it } from "vitest";

import {
  ARTIFACT_BUDGETS_KB,
  FACET_BITS_HEADER_BYTES,
  FACET_BITS_VERSION,
  bitsetHas,
  encodeFacetBits,
  facetBitsByteLength,
  facetBitsPayload,
  isLittleEndian,
  parseFacetBitsHeader,
  wordsPerSet,
} from "@atlas/contracts/artifacts";

function emptySets(projectCount: number, count: number): Uint32Array[] {
  return Array.from({ length: count }, () => new Uint32Array(wordsPerSet(projectCount)));
}

describe("bitset sizing (PRD 5.3.2)", () => {
  it("matches the PRD's worked example at 1,300 projects", () => {
    // "At 1,300 projects, one bitset contains 41 32-bit words = 164 bytes."
    expect(wordsPerSet(1300)).toBe(41);
    expect(wordsPerSet(1300) * 4).toBe(164);
  });

  it("keeps 200 facet values near the PRD's ~32.8 KB estimate", () => {
    const payloadBytes = facetBitsByteLength(1300, 200) - FACET_BITS_HEADER_BYTES;
    expect(payloadBytes).toBe(32800);
    expect(payloadBytes / 1024).toBeLessThan(ARTIFACT_BUDGETS_KB.facetBits);
  });

  it("rounds up for counts that are not a multiple of 32", () => {
    expect(wordsPerSet(1)).toBe(1);
    expect(wordsPerSet(32)).toBe(1);
    expect(wordsPerSet(33)).toBe(2);
    expect(wordsPerSet(10000)).toBe(313);
  });
});

describe("facet-bits encoding", () => {
  it("round-trips membership", () => {
    const projectCount = 100;
    const sets = emptySets(projectCount, 3);
    // Set 0 owns ordinals 0, 31, 32, 99 - deliberately straddling word edges,
    // where an off-by-one in the >>>5 / &31 addressing would show up.
    for (const ordinal of [0, 31, 32, 99]) {
      const set = sets[0];
      if (set) set[ordinal >>> 5] = (set[ordinal >>> 5] ?? 0) | (1 << (ordinal & 31));
    }

    const buffer = encodeFacetBits(projectCount, sets, 0xdeadbeef);
    const header = parseFacetBitsHeader(buffer);
    expect(header.version).toBe(FACET_BITS_VERSION);
    expect(header.projectCount).toBe(projectCount);
    expect(header.setCount).toBe(3);

    const payload = facetBitsPayload(buffer);
    const words = header.wordsPerSet;
    for (const ordinal of [0, 31, 32, 99]) {
      expect(bitsetHas(payload, words, 0, ordinal), `ordinal ${ordinal}`).toBe(true);
    }
    for (const ordinal of [1, 30, 33, 98]) {
      expect(bitsetHas(payload, words, 0, ordinal), `ordinal ${ordinal}`).toBe(false);
    }
    expect(bitsetHas(payload, words, 1, 0)).toBe(false);
  });

  it("aligns the header so the payload can be a zero-copy view", () => {
    expect(FACET_BITS_HEADER_BYTES % 4).toBe(0);
  });

  it("rejects a truncated buffer", () => {
    expect(() => parseFacetBitsHeader(new ArrayBuffer(8))).toThrow(/shorter than/);
  });

  it("rejects a file that is not a bitset artifact", () => {
    const buffer = new ArrayBuffer(FACET_BITS_HEADER_BYTES);
    new DataView(buffer).setUint32(0, 0x12345678, true);
    expect(() => parseFacetBitsHeader(buffer)).toThrow(/bad magic/);
  });

  it("rejects a future layout version", () => {
    const sets = emptySets(64, 1);
    const buffer = encodeFacetBits(64, sets, 1);
    new DataView(buffer).setUint16(4, 99, true);
    expect(() => parseFacetBitsHeader(buffer)).toThrow(/unsupported version/);
  });

  it("rejects a header whose declared size disagrees with the buffer", () => {
    const sets = emptySets(64, 2);
    const buffer = encodeFacetBits(64, sets, 1);
    new DataView(buffer).setUint32(16, 5, true); // claim 5 sets, ship 2
    expect(() => parseFacetBitsHeader(buffer)).toThrow(/expected/);
  });

  it("refuses a set of the wrong width", () => {
    expect(() => encodeFacetBits(100, [new Uint32Array(2)], 0)).toThrow(/expected 4/);
  });

  it("writes little-endian regardless of host order", () => {
    const buffer = encodeFacetBits(64, emptySets(64, 1), 0);
    const bytes = new Uint8Array(buffer);
    // "ATLB" little-endian: 0x41 'A', 0x54 'T', 0x4c 'L', 0x42 'B'
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x41, 0x54, 0x4c, 0x42]);
  });

  it("documents the endianness assumption the zero-copy view depends on", () => {
    // Every realistic target is little-endian; this asserts the assumption is
    // checked rather than assumed, so a big-endian host fails loudly.
    expect(isLittleEndian()).toBe(true);
  });
});
