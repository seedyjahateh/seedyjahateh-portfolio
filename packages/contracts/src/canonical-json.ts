/**
 * Canonical JSON serialization.
 *
 * Authority: PRD 5.1.3 - "Builds are deterministic: identical normalized inputs
 * and cached enrichment must produce byte-identical artifacts", enforced by rule
 * BLD-DETERMINISM-001.
 *
 * JSON.stringify preserves insertion order, which means two runs that build an
 * object by different code paths can emit different bytes for identical data.
 * Every generated artifact in this repository goes through canonicalJson so
 * that byte comparison is a meaningful determinism test.
 *
 * Rules:
 *   - object keys sorted by UTF-16 code unit (Array.prototype.sort default),
 *   - arrays keep their order (order is data),
 *   - undefined properties dropped, matching JSON.stringify,
 *   - trailing newline, so files end cleanly and diffs stay small,
 *   - LF only; .gitattributes prevents Git from rewriting it on Windows.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) continue;
      sorted[key] = sortKeysDeep(entry);
    }
    return sorted;
  }
  return value;
}

/** Pretty-printed canonical JSON with a trailing newline. For committed artifacts. */
export function canonicalJson(value: unknown, indent = 2): string {
  return `${JSON.stringify(sortKeysDeep(value), null, indent)}\n`;
}

/** Minified canonical JSON. For hashing and for CDN-delivered payloads. */
export function canonicalJsonCompact(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}
