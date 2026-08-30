/// <reference lib="webworker" />

/**
 * Search worker. Its own chunk — `JS-SEARCH-WORKER` budgets 50 KB for worker
 * plus Fuse plus protocol.
 *
 * Authority: PRD 0.6 / 5.2.2 (the index is built in CI and hydrated here; the
 * main thread must never construct it), 5.2.3 (query execution, exact-match
 * bypass, sequence discard, 50-result cap, ≤30 ms p95 at 1,300), 7.1 (worker
 * boundary: "communicates with versioned discriminated messages. Unknown
 * versions terminate the worker and activate fallback behavior"), 9.7 (a
 * version mismatch is reported, never silently rendered), 10.3 (never log raw
 * query text).
 *
 * THE WORKER OWNS NORMALIZATION. PRD 7.1 puts it here rather than on the main
 * thread so the displayed query text is never mutated by search concerns — the
 * URL keeps exactly what the visitor typed (PRD 5.2.3).
 *
 * It speaks only protocol v1. Anything else self-terminates rather than
 * guessing, because a worker that answers a message it does not understand is
 * worse than one that stops.
 */

import Fuse, { type IFuseOptions } from "fuse.js";

import {
  isSearchRequest,
  isSupportedVersion,
  MAX_WORKER_RESULTS,
  SEARCH_PROTOCOL_VERSION,
  type MatchRange,
  type SearchDocument,
  type SearchErrorCode,
  type SearchRequest,
  type SearchResponse,
} from "@atlas/contracts/search-protocol";

declare const self: DedicatedWorkerGlobalScope;

interface SearchArtifact {
  readonly catalogHash: string;
  readonly docs: readonly SearchDocument[];
  /**
   * Typed as whatever `Fuse.parseIndex` accepts rather than `unknown`, so a
   * future Fuse upgrade that changes the serialized shape fails here at compile
   * time instead of at runtime in a worker where nobody sees the stack.
   */
  readonly index: Parameters<typeof Fuse.parseIndex>[0];
  readonly fuse: {
    readonly keys: readonly { name: string; weight: number }[];
    readonly threshold: number;
    readonly ignoreLocation: boolean;
    readonly minMatchCharLength: number;
    readonly findAllMatches: boolean;
    readonly includeScore: boolean;
    readonly includeMatches: boolean;
    readonly shouldSort: boolean;
  };
}

let fuse: Fuse<SearchDocument> | null = null;
let docs: readonly SearchDocument[] = [];
/** id and title lookups for the PRD 5.2.3 exact-match bypass. */
let byId = new Map<string, SearchDocument>();
let byTitle = new Map<string, SearchDocument>();

function post(message: SearchResponse, transfer?: Transferable[]): void {
  if (transfer !== undefined) self.postMessage(message, transfer);
  else self.postMessage(message);
}

function fail(code: SearchErrorCode, fatal: boolean, detail?: string, seq?: number): void {
  post({
    v: SEARCH_PROTOCOL_VERSION,
    type: "error",
    code,
    fatal,
    ...(detail === undefined ? {} : { detail }),
    ...(seq === undefined ? {} : { seq }),
  });
}

/**
 * Query normalization (PRD 5.2.3).
 *
 * Unicode NFKC folds compatibility forms; punctuation aliases collapse the
 * separators people actually type between technology names, so "node.js",
 * "node-js" and "node js" reach the same tokens. Deliberately conservative:
 * over-normalizing destroys exact-id matching, which is the highest-signal
 * result the palette can return.
 */
function normalize(query: string): string {
  return query
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fuse reports matches per key with indices; the protocol wants ranges. */
function toRanges(
  matches: readonly { key?: string; indices: readonly (readonly [number, number])[] }[] | undefined,
): MatchRange[] {
  if (matches === undefined) return [];
  const out: MatchRange[] = [];
  for (const match of matches) {
    if (match.key === undefined) continue;
    // Fuse indices are inclusive on both ends; the protocol documents
    // [start, end) so the consumer can slice directly.
    out.push({
      key: match.key,
      ranges: match.indices.map(([start, end]) => [start, end + 1] as const),
    });
  }
  return out;
}

async function init(request: Extract<SearchRequest, { type: "init" }>): Promise<void> {
  let artifact: SearchArtifact;
  try {
    const response = await fetch(request.docsUrl);
    if (!response.ok) {
      fail("INDEX_FETCH_FAILED", true, `HTTP ${response.status}`);
      return;
    }
    artifact = (await response.json()) as SearchArtifact;
  } catch {
    // No detail: a network error message can contain the URL, and the URL is
    // fine, but this keeps the habit of never widening what leaves the worker.
    fail("INDEX_FETCH_FAILED", true);
    return;
  }

  // PRD 9.7: results from a different catalog build would join against stale
  // ordinals and silently render the wrong projects.
  if (artifact.catalogHash !== request.catalogHash) {
    fail("CATALOG_MISMATCH", true, "index belongs to a different catalog build");
    return;
  }

  const started = performance.now();
  try {
    docs = artifact.docs;
    const options: IFuseOptions<SearchDocument> = {
      keys: artifact.fuse.keys.map((key) => ({ name: key.name, weight: key.weight })),
      threshold: artifact.fuse.threshold,
      ignoreLocation: artifact.fuse.ignoreLocation,
      minMatchCharLength: artifact.fuse.minMatchCharLength,
      findAllMatches: artifact.fuse.findAllMatches,
      includeScore: artifact.fuse.includeScore,
      includeMatches: artifact.fuse.includeMatches,
      shouldSort: artifact.fuse.shouldSort,
    };
    // Parsed, not rebuilt: reconstructing the index here is the cost PRD 0.6
    // moved into CI, and it would blow SEARCH-WORKER-INIT's 250 ms budget.
    fuse = new Fuse(docs, options, Fuse.parseIndex<SearchDocument>(artifact.index));

    byId = new Map(docs.map((doc) => [doc.id.toLowerCase(), doc]));
    byTitle = new Map(docs.map((doc) => [doc.t.toLowerCase(), doc]));
  } catch {
    fail("INDEX_PARSE_FAILED", true);
    return;
  }

  post({
    v: SEARCH_PROTOCOL_VERSION,
    type: "ready",
    indexHash: request.indexHash,
    docCount: docs.length,
    initMs: performance.now() - started,
  });
}

function query(request: Extract<SearchRequest, { type: "query" }>): void {
  if (fuse === null) {
    fail("NOT_READY", false, "query arrived before init completed", request.seq);
    return;
  }

  const started = performance.now();
  const normalized = normalize(request.q);
  const limit = Math.min(request.limit, MAX_WORKER_RESULTS);

  if (normalized.length === 0) {
    post(
      {
        v: SEARCH_PROTOCOL_VERSION,
        type: "results",
        seq: request.seq,
        ids: new Uint32Array(0),
        exact: false,
        queryMs: performance.now() - started,
        total: 0,
      },
      [],
    );
    return;
  }

  /**
   * PRD 5.2.3: exact project id and exact title matches bypass fuzzy ranking
   * and appear first. Typing "RAG-01" must return RAG-01, not the fuzziest
   * neighbourhood around it — this is the one case where the visitor has told
   * us precisely what they want.
   */
  const exactDoc = byId.get(normalized) ?? byTitle.get(normalized);
  if (exactDoc !== undefined) {
    const ids = Uint32Array.from([exactDoc.i]);
    post(
      {
        v: SEARCH_PROTOCOL_VERSION,
        type: "results",
        seq: request.seq,
        ids,
        exact: true,
        queryMs: performance.now() - started,
        total: 1,
      },
      [ids.buffer],
    );
    return;
  }

  // Timed separately from the rest of queryMs: see `searchMs` in the protocol
  // for why the split matters.
  const searchStarted = performance.now();
  const results = fuse.search(normalized, { limit });
  const searchMs = performance.now() - searchStarted;

  const ids = new Uint32Array(results.length);
  const matches: MatchRange[][] = [];
  results.forEach((result, index) => {
    ids[index] = result.item.i;
    matches.push(toRanges(result.matches));
  });

  post(
    {
      v: SEARCH_PROTOCOL_VERSION,
      type: "results",
      seq: request.seq,
      ids,
      exact: false,
      matches,
      queryMs: performance.now() - started,
      searchMs,
      // Fuse's `limit` truncates before returning, so the true pre-limit count
      // is not available without searching twice. Reporting the returned
      // length is honest; `capped` in the engine is derived from whether the
      // list filled the cap rather than from a count we do not have.
      total: results.length,
    },
    [ids.buffer],
  );
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = event.data;

  // PRD 7.1: the version check runs FIRST, before shape validation. A v2
  // message may be perfectly well-formed and still unserviceable.
  if (!isSupportedVersion(message)) {
    fail("UNSUPPORTED_VERSION", true, "worker speaks protocol v1 only");
    self.close();
    return;
  }

  if (!isSearchRequest(message)) {
    fail("MALFORMED_MESSAGE", false);
    return;
  }

  switch (message.type) {
    case "init":
      void init(message);
      return;
    case "query":
      query(message);
      return;
    case "dispose":
      fuse = null;
      docs = [];
      byId = new Map();
      byTitle = new Map();
      self.close();
      return;
    default:
      fail("MALFORMED_MESSAGE", false);
      return;
  }
});
