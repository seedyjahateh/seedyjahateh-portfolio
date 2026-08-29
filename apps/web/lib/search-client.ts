/**
 * Main-thread half of the search worker protocol.
 *
 * Authority: PRD 5.2.3 (sequence numbers, 40 ms debounce with exact ids
 * exempt, 50-result cap), 5.2.1 (fallback to /projects?q=… when the worker
 * fails), 7.1 (versioned messages; an unknown version activates fallback),
 * 9.7 (report a version mismatch, never render it silently).
 *
 * WHY THE DEBOUNCE LIVES HERE AND NOT IN THE DIALOG. PRD 5.2.3 exempts exact
 * ID matches from the delay, and deciding what looks like an ID is a search
 * concern, not a UI one. Putting it here keeps the dialog free of search rules
 * and means the archive gets the same behaviour for free.
 *
 * Responses arriving out of order are discarded rather than rendered: a slow
 * query for "ra" must never overwrite a fast one for "rag".
 */

import {
  isSearchResponse,
  MAX_WORKER_RESULTS,
  QUERY_DEBOUNCE_MS,
  SEARCH_PROTOCOL_VERSION,
  type MatchRange,
  type SearchErrorCode,
} from "@atlas/contracts/search-protocol";

export interface SearchHit {
  readonly ids: Uint32Array;
  readonly exact: boolean;
  readonly total: number;
  readonly queryMs: number;
  readonly matches?: readonly (readonly MatchRange[])[];
}

export interface SearchClientOptions {
  readonly onResults: (hit: SearchHit) => void;
  /** Fatal means: stop using the worker and fall back (PRD 5.2.1). */
  readonly onError: (code: SearchErrorCode, fatal: boolean) => void;
  readonly onReady?: (docCount: number, initMs: number) => void;
}

/**
 * Looks like a project id, e.g. "RAG-01".
 *
 * PRD 5.2.3: exact ID matches are not delayed. Someone typing an id already
 * knows what they want, and 40 ms of hesitation on the highest-signal query
 * the palette can receive is the wrong place to save work.
 */
const PROJECT_ID = /^[a-z]{2,4}-\d{1,3}$/i;

interface CatalogManifest {
  readonly catalogHash: string;
  readonly artifacts: Record<string, { url: string; hash: string }>;
}

export class SearchClient {
  private worker: Worker | null = null;
  private seq = 0;
  /** Highest sequence whose response has been delivered. */
  private delivered = -1;
  private timer: number | null = null;
  private ready = false;
  private readonly options: SearchClientOptions;

  constructor(options: SearchClientOptions) {
    this.options = options;
  }

  async start(manifestUrl = "/catalog/manifest.json"): Promise<void> {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      this.options.onError("INDEX_FETCH_FAILED", true);
      return;
    }
    const manifest = (await response.json()) as CatalogManifest;
    const search = manifest.artifacts["search"];
    const docs = manifest.artifacts["searchDocs"] ?? search;
    if (search === undefined || docs === undefined) {
      this.options.onError("INDEX_FETCH_FAILED", true);
      return;
    }

    // webpack bundles this into its own chunk from the URL form. It must stay
    // a literal `new URL(..., import.meta.url)` — a computed specifier is not
    // statically analysable and silently ships nothing.
    this.worker = new Worker(new URL("../workers/search.worker.ts", import.meta.url));
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("error", () => {
      this.options.onError("INTERNAL", true);
    });

    this.worker.postMessage({
      v: SEARCH_PROTOCOL_VERSION,
      type: "init",
      indexUrl: search.url,
      docsUrl: docs.url,
      catalogHash: manifest.catalogHash,
      indexHash: search.hash,
    });
  }

  private readonly onMessage = (event: MessageEvent<unknown>): void => {
    const message = event.data;
    if (!isSearchResponse(message)) {
      // Includes an unsupported protocol version: PRD 7.1 says activate
      // fallback rather than attempt to interpret it.
      this.options.onError("UNSUPPORTED_VERSION", true);
      return;
    }

    switch (message.type) {
      case "ready":
        this.ready = true;
        this.options.onReady?.(message.docCount, message.initMs);
        return;
      case "results":
        // PRD 5.2.3: discard anything older than the newest delivered result.
        if (message.seq < this.delivered) return;
        this.delivered = message.seq;
        // The worker timed itself; republish it as a User Timing entry so the
        // SEARCH-QUERY-* budgets are readable from the page without a bespoke
        // global. Discarded responses are deliberately not recorded — they
        // never reached a visitor.
        try {
          performance.measure("atlas:search", {
            start: performance.now() - message.queryMs,
            duration: message.queryMs,
          });
        } catch {
          // No User Timing; the budget harness will report zero samples.
        }
        this.options.onResults({
          ids: message.ids,
          exact: message.exact,
          total: message.total,
          queryMs: message.queryMs,
          ...(message.matches === undefined ? {} : { matches: message.matches }),
        });
        return;
      case "error":
        this.options.onError(message.code, message.fatal);
        if (message.fatal) this.dispose();
        return;
      default:
        return;
    }
  };

  /** Debounced unless the text looks like a project id. */
  query(text: string, limit = MAX_WORKER_RESULTS): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    const send = (): void => this.send(text, limit);
    if (PROJECT_ID.test(text.trim())) send();
    else this.timer = window.setTimeout(send, QUERY_DEBOUNCE_MS);
  }

  private send(text: string, limit: number): void {
    if (this.worker === null || !this.ready) return;
    this.seq += 1;
    this.worker.postMessage({
      v: SEARCH_PROTOCOL_VERSION,
      type: "query",
      seq: this.seq,
      q: text,
      limit,
    });
  }

  dispose(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.worker === null) return;
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.postMessage({ v: SEARCH_PROTOCOL_VERSION, type: "dispose" });
    // The worker calls self.close() on dispose; terminate is the backstop for
    // a worker that is wedged and never processes the message.
    this.worker.terminate();
    this.worker = null;
    this.ready = false;
  }
}
