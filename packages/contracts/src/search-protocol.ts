/**
 * Search worker protocol v1.
 *
 * Authority: PRD 5.2.2 (search documents and weighting), 5.2.3 (query
 * execution), 7.1 (worker boundary), 7.4 (scale migration), 12.6 step 1
 * ("freeze ... search protocol v1").
 *
 * WHY A PROTOCOL AND NOT A FUNCTION. PRD 7.4 requires that when client search
 * is outgrown, "introduce an edge/search service behind the same
 * SearchRequest/SearchResponse contract. Do not rewrite view or filter
 * components." So nothing Fuse-specific, DOM-specific, or framework-specific
 * may appear below. The contract describes intent and results, not mechanism.
 *
 * PRD 7.1: "Communicates with versioned discriminated messages. Unknown
 * versions terminate the worker and activate fallback behavior."
 */

/** Bump only with a migration plan on both sides. */
export const SEARCH_PROTOCOL_VERSION = 1 as const;
export type SearchProtocolVersion = typeof SEARCH_PROTOCOL_VERSION;

/**
 * The compact search document (PRD 5.2.2).
 *
 * Field names are single characters because this array is the largest payload
 * the worker holds; PRD 5.2.3 budgets worker retained memory at 12 MB for 1,300
 * projects, and PRD 5.1.5 budgets the serialized index at 900 KB Brotli. The
 * worker receives THIS, never a full Project record (PRD 7.1).
 */
export interface SearchDocument {
  /** Catalog ordinal for the current build. The join key back to the catalog. */
  readonly i: number;
  /** Project id, e.g. "RAG-01". Exact matches on this bypass fuzzy ranking. */
  readonly id: string;
  readonly slug: string;
  /** title */
  readonly t: string;
  /** claim / tagline-or-summary excerpt */
  readonly c: string;
  /** stack terms (languages, frameworks, data, infra, ai) */
  readonly x: readonly string[];
  /** roles */
  readonly r: readonly string[];
  /** domains */
  readonly d: readonly string[];
  /** artifact / evidence types */
  readonly a: readonly string[];
  /** year */
  readonly y: number;
  /** proof level rank, 0-3. Breaks near-ties only (PRD 5.2.3). */
  readonly p: number;
}

/** PRD 5.2.3: highlight matched ranges without injecting HTML. */
export interface MatchRange {
  /** Which search-document key matched. */
  readonly key: string;
  /** [start, end) character offsets, in code units, into that key's text. */
  readonly ranges: readonly (readonly [number, number])[];
}

// -----------------------------------------------------------------------------
// Requests: main thread -> worker
// -----------------------------------------------------------------------------

export interface SearchInitRequest {
  readonly v: SearchProtocolVersion;
  readonly type: "init";
  /** Content-hashed URL of the serialized index (PRD 5.1.5). */
  readonly indexUrl: string;
  /** Content-hashed URL of the compact search documents. */
  readonly docsUrl: string;
  /**
   * Hash of the catalog build these artifacts belong to. The worker refuses to
   * serve results for a different catalog: PRD 9.7 requires a version mismatch
   * to be reported, not silently rendered.
   */
  readonly catalogHash: string;
  readonly indexHash: string;
}

export interface SearchQueryRequest {
  readonly v: SearchProtocolVersion;
  readonly type: "query";
  /** Monotonic. PRD 5.2.3: responses older than the latest sequence are discarded. */
  readonly seq: number;
  /** Raw user text. The worker owns normalization (PRD 7.1). */
  readonly q: string;
  /** PRD 5.2.3 caps this at 50. */
  readonly limit: number;
}

export interface SearchDisposeRequest {
  readonly v: SearchProtocolVersion;
  readonly type: "dispose";
}

export type SearchRequest = SearchInitRequest | SearchQueryRequest | SearchDisposeRequest;

// -----------------------------------------------------------------------------
// Responses: worker -> main thread
// -----------------------------------------------------------------------------

export interface SearchReadyResponse {
  readonly v: SearchProtocolVersion;
  readonly type: "ready";
  readonly indexHash: string;
  readonly docCount: number;
  /** PRD 7.4 migration trigger: >250 ms p95 on reference mobile hardware. */
  readonly initMs: number;
}

export interface SearchResultsResponse {
  readonly v: SearchProtocolVersion;
  readonly type: "results";
  readonly seq: number;
  /**
   * Ordered catalog ordinals, best first.
   *
   * A Uint32Array, not an object array: PRD 9.5 requires that "search result
   * arrays store ordinals, not copied project objects", and a Uint32Array is
   * transferable, so handing it across the boundary costs no structured clone.
   */
  readonly ids: Uint32Array;
  /** True when an exact id or title match bypassed fuzzy ranking (PRD 5.2.3). */
  readonly exact: boolean;
  /** Parallel to `ids`. Omitted when the caller did not ask for highlighting. */
  readonly matches?: readonly (readonly MatchRange[])[];
  /** PRD 5.2.3 budget: <=30 ms p95 at 1,300 projects, <=50 ms at 10,000. */
  readonly queryMs: number;
  /** Total matches before `limit` was applied, for result-count announcements. */
  readonly total: number;
}

export const SEARCH_ERROR_CODES = [
  /** Protocol version the worker cannot serve. Worker self-terminates (PRD 7.1). */
  "UNSUPPORTED_VERSION",
  "INDEX_FETCH_FAILED",
  "INDEX_PARSE_FAILED",
  /** Index hash did not match the requested one. */
  "INDEX_HASH_MISMATCH",
  /** Index belongs to a different catalog build (PRD 9.7). */
  "CATALOG_MISMATCH",
  "MALFORMED_MESSAGE",
  /** Query arrived before a successful init. */
  "NOT_READY",
  "INTERNAL",
] as const;

export type SearchErrorCode = (typeof SEARCH_ERROR_CODES)[number];

export interface SearchErrorResponse {
  readonly v: SearchProtocolVersion;
  readonly type: "error";
  readonly code: SearchErrorCode;
  /** Present when the error is attributable to one query. */
  readonly seq?: number;
  /** Human-readable context. Never contains raw query text (PRD 10.3 privacy). */
  readonly detail?: string;
  /**
   * True when the main thread should stop using this worker and switch to the
   * PRD 5.2.1 fallback: submit to /projects?q=... and run a bounded
   * main-thread search after navigation.
   */
  readonly fatal: boolean;
}

export type SearchResponse = SearchReadyResponse | SearchResultsResponse | SearchErrorResponse;

// -----------------------------------------------------------------------------
// Guards
// -----------------------------------------------------------------------------

/**
 * Version check, run FIRST on every inbound message on both sides.
 *
 * PRD 7.1: unknown versions terminate the worker and activate fallback. This is
 * deliberately separate from shape validation - a v2 message may be perfectly
 * well-formed and still unserviceable.
 */
export function isSupportedVersion(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { v?: unknown }).v === SEARCH_PROTOCOL_VERSION
  );
}

export function isSearchRequest(message: unknown): message is SearchRequest {
  if (!isSupportedVersion(message)) return false;
  const candidate = message as { type?: unknown };
  switch (candidate.type) {
    case "init": {
      const m = message as Partial<SearchInitRequest>;
      return (
        typeof m.indexUrl === "string" &&
        typeof m.docsUrl === "string" &&
        typeof m.catalogHash === "string" &&
        typeof m.indexHash === "string"
      );
    }
    case "query": {
      const m = message as Partial<SearchQueryRequest>;
      return (
        Number.isInteger(m.seq) &&
        (m.seq as number) >= 0 &&
        typeof m.q === "string" &&
        Number.isInteger(m.limit) &&
        (m.limit as number) > 0 &&
        (m.limit as number) <= MAX_WORKER_RESULTS
      );
    }
    case "dispose":
      return true;
    default:
      return false;
  }
}

export function isSearchResponse(message: unknown): message is SearchResponse {
  if (!isSupportedVersion(message)) return false;
  const candidate = message as { type?: unknown };
  switch (candidate.type) {
    case "ready": {
      const m = message as Partial<SearchReadyResponse>;
      return typeof m.indexHash === "string" && Number.isInteger(m.docCount);
    }
    case "results": {
      const m = message as Partial<SearchResultsResponse>;
      return Number.isInteger(m.seq) && m.ids instanceof Uint32Array;
    }
    case "error": {
      const m = message as Partial<SearchErrorResponse>;
      return (
        typeof m.code === "string" &&
        (SEARCH_ERROR_CODES as readonly string[]).includes(m.code) &&
        typeof m.fatal === "boolean"
      );
    }
    default:
      return false;
  }
}

// -----------------------------------------------------------------------------
// Protocol constants (PRD 5.2.1, 5.2.3)
// -----------------------------------------------------------------------------

/** Maximum ranked ids the worker returns for one query. */
export const MAX_WORKER_RESULTS = 50;
/** Results rendered in the command palette. */
export const PALETTE_VISIBLE_RESULTS = 12;
/** Palette virtualizes only beyond this many rendered results. */
export const PALETTE_VIRTUALIZE_THRESHOLD = 30;
/** Debounce after the first character. Arrow keys and exact ids are not delayed. */
export const QUERY_DEBOUNCE_MS = 40;
/** Idle delay before speculatively preloading the worker and index. */
export const WORKER_PRELOAD_IDLE_MS = 2000;

/**
 * Navigational commands (PRD 5.2.4). They share the result contract with text
 * search and must be discoverable as labeled suggestions - PRD 5.2.4 is explicit
 * that "undocumented parser syntax is not a substitute for UI".
 */
export const COMMAND_PREFIXES = ["role", "view", "lang", "tech", "year", "proof"] as const;
export const BARE_COMMANDS = [
  "resume",
  "contact",
  "github",
  "writing",
  "open-source",
] as const;

export type CommandPrefix = (typeof COMMAND_PREFIXES)[number];
export type BareCommand = (typeof BARE_COMMANDS)[number];

export interface ParsedCommand {
  readonly kind: "prefixed";
  readonly prefix: CommandPrefix;
  readonly value: string;
}

export interface ParsedBareCommand {
  readonly kind: "bare";
  readonly command: BareCommand;
}

/** Recognize a palette command. Returns null for ordinary search text. */
export function parseCommand(input: string): ParsedCommand | ParsedBareCommand | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  if ((BARE_COMMANDS as readonly string[]).includes(trimmed)) {
    return { kind: "bare", command: trimmed as BareCommand };
  }

  const separator = trimmed.indexOf(":");
  if (separator <= 0) return null;

  const prefix = trimmed.slice(0, separator);
  const value = trimmed.slice(separator + 1).trim();
  if (value.length === 0) return null;
  if (!(COMMAND_PREFIXES as readonly string[]).includes(prefix)) return null;

  return { kind: "prefixed", prefix: prefix as CommandPrefix, value };
}
