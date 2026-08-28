/**
 * Search worker protocol v1.
 *
 * Authority: PRD 7.1 ("Communicates with versioned discriminated messages.
 * Unknown versions terminate the worker and activate fallback behavior"),
 * 5.2.3 (limits and sequencing), 5.2.4 (commands), 7.4 (migration behind the
 * same contract).
 */

import { describe, expect, it } from "vitest";

import {
  MAX_WORKER_RESULTS,
  PALETTE_VIRTUALIZE_THRESHOLD,
  PALETTE_VISIBLE_RESULTS,
  QUERY_DEBOUNCE_MS,
  SEARCH_ERROR_CODES,
  SEARCH_PROTOCOL_VERSION,
  isSearchRequest,
  isSearchResponse,
  isSupportedVersion,
  parseCommand,
} from "@atlas/contracts/search-protocol";

const init = {
  v: SEARCH_PROTOCOL_VERSION,
  type: "init",
  indexUrl: "/search.abc.json",
  docsUrl: "/search-docs.abc.json",
  catalogHash: "sha256:aaa",
  indexHash: "sha256:bbb",
} as const;

describe("version gating", () => {
  it("accepts the current version", () => {
    expect(isSupportedVersion(init)).toBe(true);
  });

  it("rejects a future version even when otherwise well-formed", () => {
    // The whole point of PRD 7.1: a v2 message can be perfectly valid and still
    // unserviceable. Version is checked before shape, never after.
    const future = { ...init, v: 2 };
    expect(isSupportedVersion(future)).toBe(false);
    expect(isSearchRequest(future)).toBe(false);
  });

  it("rejects messages with no version at all", () => {
    expect(isSupportedVersion({ type: "init" })).toBe(false);
    expect(isSupportedVersion(null)).toBe(false);
    expect(isSupportedVersion("init")).toBe(false);
  });

  it("exposes UNSUPPORTED_VERSION so the fallback path has a code to match", () => {
    expect(SEARCH_ERROR_CODES).toContain("UNSUPPORTED_VERSION");
  });
});

describe("request validation", () => {
  it("accepts a well-formed init", () => {
    expect(isSearchRequest(init)).toBe(true);
  });

  it("accepts a well-formed query", () => {
    expect(
      isSearchRequest({ v: 1, type: "query", seq: 0, q: "rag", limit: 12 }),
    ).toBe(true);
  });

  it("rejects a query whose limit exceeds the worker cap", () => {
    // PRD 5.2.3: "Return a maximum of 50 ranked IDs from the worker."
    expect(
      isSearchRequest({ v: 1, type: "query", seq: 1, q: "rag", limit: MAX_WORKER_RESULTS + 1 }),
    ).toBe(false);
  });

  it("rejects a negative or fractional sequence", () => {
    expect(isSearchRequest({ v: 1, type: "query", seq: -1, q: "a", limit: 5 })).toBe(false);
    expect(isSearchRequest({ v: 1, type: "query", seq: 1.5, q: "a", limit: 5 })).toBe(false);
  });

  it("rejects an unknown message type", () => {
    expect(isSearchRequest({ v: 1, type: "reindex" })).toBe(false);
  });

  it("rejects init with a missing hash", () => {
    const { indexHash: _omitted, ...partial } = init;
    expect(isSearchRequest(partial)).toBe(false);
  });
});

describe("response validation", () => {
  it("requires results ids to be a Uint32Array", () => {
    // PRD 9.5: result arrays store ordinals, not copied objects. A plain array
    // would also lose transferability, forcing a structured clone per query.
    expect(
      isSearchResponse({
        v: 1, type: "results", seq: 1, ids: new Uint32Array([3, 1]),
        exact: false, queryMs: 4, total: 2,
      }),
    ).toBe(true);

    expect(
      isSearchResponse({
        v: 1, type: "results", seq: 1, ids: [3, 1],
        exact: false, queryMs: 4, total: 2,
      }),
    ).toBe(false);
  });

  it("accepts a ready response", () => {
    expect(
      isSearchResponse({ v: 1, type: "ready", indexHash: "sha256:bbb", docCount: 240, initMs: 42 }),
    ).toBe(true);
  });

  it("accepts every declared error code and rejects undeclared ones", () => {
    for (const code of SEARCH_ERROR_CODES) {
      expect(isSearchResponse({ v: 1, type: "error", code, fatal: true })).toBe(true);
    }
    expect(isSearchResponse({ v: 1, type: "error", code: "KABOOM", fatal: true })).toBe(false);
  });

  it("requires an explicit fatal flag so the caller knows whether to fall back", () => {
    expect(isSearchResponse({ v: 1, type: "error", code: "INTERNAL" })).toBe(false);
  });
});

describe("PRD 5.2.3 constants", () => {
  it("matches the documented numbers", () => {
    expect(MAX_WORKER_RESULTS).toBe(50);
    expect(PALETTE_VISIBLE_RESULTS).toBe(12);
    expect(PALETTE_VIRTUALIZE_THRESHOLD).toBe(30);
    expect(QUERY_DEBOUNCE_MS).toBe(40);
  });
});

describe("command parsing (PRD 5.2.4)", () => {
  it("parses prefixed commands", () => {
    expect(parseCommand("role:ai")).toEqual({ kind: "prefixed", prefix: "role", value: "ai" });
    expect(parseCommand("view:rows")).toEqual({ kind: "prefixed", prefix: "view", value: "rows" });
    expect(parseCommand("year:2026")).toEqual({ kind: "prefixed", prefix: "year", value: "2026" });
  });

  it("parses bare commands", () => {
    expect(parseCommand("resume")).toEqual({ kind: "bare", command: "resume" });
    expect(parseCommand("  GitHub ")).toEqual({ kind: "bare", command: "github" });
  });

  it("treats ordinary text as search, not a command", () => {
    expect(parseCommand("vector search")).toBeNull();
    expect(parseCommand("RAG-01")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });

  it("ignores an unknown prefix so it falls through to text search", () => {
    expect(parseCommand("author:me")).toBeNull();
  });

  it("ignores a prefix with an empty value", () => {
    expect(parseCommand("role:")).toBeNull();
  });
});
