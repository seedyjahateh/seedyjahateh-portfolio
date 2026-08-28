/**
 * Seeded pseudo-random generator.
 *
 * Authority: PRD 5.1.3 (deterministic builds), 9.2 (deterministic catalog
 * fixtures at 240 / 1,300 / 10,000 records), rule BLD-DETERMINISM-001.
 *
 * WHY NOT Math.random, AND WHY NOT A DEPENDENCY. Fixture corpora are compared
 * byte for byte across runs and across platforms, so the generator must be
 * seeded, portable, and frozen. sfc32 is ~30 lines, has no dependency to pin or
 * audit (PRD 4.1), and produces identical output on every JavaScript engine
 * because it uses only uint32 arithmetic.
 *
 * Nothing here may read the clock, the locale, the environment, or the
 * filesystem. That is the whole contract.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  /** Uniform element. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T;
  /** `count` distinct elements, in the source list's order. */
  sample<T>(items: readonly T[], count: number): T[];
  /** True with probability `p`. */
  chance(p: number): boolean;
}

/** Deterministic 32-bit string hash, used to turn a seed phrase into state. */
function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 0x9e3779b9;
  let h2 = 0x243f6a88;
  let h3 = 0xb7e15162;
  let h4 = 0xdeadbeef;
  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x85ebca6b) >>> 0;
    h2 = Math.imul(h2 ^ code, 0xc2b2ae35) >>> 0;
    h3 = Math.imul(h3 ^ (code + i), 0x27d4eb2f) >>> 0;
    h4 = Math.imul(h4 ^ (code * 3), 0x165667b1) >>> 0;
  }
  // Guarantee a non-zero state; sfc32 is degenerate at all-zero.
  return [h1 || 1, h2 || 2, h3 || 3, h4 || 4];
}

export function createRng(seed: string): Rng {
  let [a, b, c, d] = hashSeed(seed);

  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) >>> 0;
    t = (t + d) >>> 0;
    c = (c + t) >>> 0;
    return t >>> 0;
  };

  // Discard the first values so the seed hash does not leak into early output.
  for (let i = 0; i < 12; i += 1) next();

  const rng: Rng = {
    next: () => next() / 4294967296,
    int: (min, max) => min + Math.floor((next() / 4294967296) * (max - min + 1)),
    pick: <T,>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error("createRng().pick: empty list");
      const item = items[rng.int(0, items.length - 1)];
      if (item === undefined) throw new Error("createRng().pick: index out of range");
      return item;
    },
    sample: <T,>(items: readonly T[], count: number): T[] => {
      const take = Math.max(0, Math.min(count, items.length));
      const indices = new Set<number>();
      // Bounded attempts, then fall back to a linear scan, so a pathological
      // seed can never spin forever.
      let attempts = 0;
      while (indices.size < take && attempts < take * 16) {
        indices.add(rng.int(0, items.length - 1));
        attempts += 1;
      }
      for (let i = 0; indices.size < take && i < items.length; i += 1) indices.add(i);
      return [...indices].sort((x, y) => x - y).map((i) => items[i] as T);
    },
    chance: (p) => next() / 4294967296 < p,
  };

  return rng;
}
