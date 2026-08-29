/**
 * Main-thread half of the search protocol.
 *
 * Authority: PRD 5.2.3 ("Increment a query sequence number. Discard worker
 * responses older than the latest sequence"), 7.1 (an unknown protocol version
 * activates fallback), 5.2.1 (fatal errors fall back to /projects?q=…).
 *
 * WHY A FAKE WORKER RATHER THAN A BROWSER. Out-of-order responses cannot be
 * provoked reliably in a real browser — the whole point is that they happen
 * when timing goes wrong. Driving the client with a worker that replies on
 * command is the only way to test the rule the rule exists for.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SEARCH_PROTOCOL_VERSION } from "@atlas/contracts/search-protocol";

import { SearchClient, type SearchHit } from "../../apps/web/lib/search-client.js";

type Listener = (event: { data: unknown }) => void;

/** Stands in for the real worker; replies only when a test tells it to. */
class FakeWorker {
  static last: FakeWorker | null = null;
  readonly sent: unknown[] = [];
  private listeners: Listener[] = [];
  terminated = false;

  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: unknown): void {
    this.sent.push(message);
  }
  addEventListener(type: string, listener: Listener): void {
    if (type === "message") this.listeners.push(listener);
  }
  removeEventListener(type: string, listener: Listener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  terminate(): void {
    this.terminated = true;
  }
  /** Deliver a response as if the worker had posted it. */
  reply(data: unknown): void {
    for (const listener of [...this.listeners]) listener({ data });
  }
}

const MANIFEST = {
  catalogHash: "sha256:abc",
  artifacts: {
    search: { url: "/catalog/search.abc.json", hash: "sha256:idx" },
    searchDocs: { url: "/catalog/search.abc.json", hash: "sha256:idx" },
  },
};

function results(seq: number, ids: number[]): unknown {
  return {
    v: SEARCH_PROTOCOL_VERSION,
    type: "results",
    seq,
    ids: Uint32Array.from(ids),
    exact: false,
    queryMs: 1,
    total: ids.length,
  };
}

beforeEach(() => {
  FakeWorker.last = null;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(MANIFEST) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function started(options: {
  onResults: (hit: SearchHit) => void;
  onError?: (code: string, fatal: boolean) => void;
}): Promise<{ client: SearchClient; worker: FakeWorker }> {
  const client = new SearchClient({
    onResults: options.onResults,
    onError: options.onError ?? (() => undefined),
  });
  await client.start();
  const worker = FakeWorker.last;
  if (worker === null) throw new Error("client never constructed a worker");
  worker.reply({
    v: SEARCH_PROTOCOL_VERSION,
    type: "ready",
    indexHash: "sha256:idx",
    docCount: 3,
    initMs: 5,
  });
  return { client, worker };
}

describe("SearchClient", () => {
  it("initialises the worker from the manifest", async () => {
    const { worker } = await started({ onResults: () => undefined });
    expect(worker.sent[0]).toMatchObject({
      type: "init",
      catalogHash: "sha256:abc",
      indexUrl: "/catalog/search.abc.json",
    });
  });

  it("discards a response older than the newest delivered one", async () => {
    // The bug this prevents: a slow query for "ra" landing after a fast one
    // for "rag" and overwriting the results the visitor is looking at.
    const delivered: number[][] = [];
    const { worker } = await started({
      onResults: (hit) => delivered.push(Array.from(hit.ids)),
    });

    worker.reply(results(2, [7, 8]));
    worker.reply(results(1, [1, 2, 3]));

    expect(delivered).toEqual([[7, 8]]);
  });

  it("still delivers a newer response after an older one arrives", async () => {
    const delivered: number[][] = [];
    const { worker } = await started({
      onResults: (hit) => delivered.push(Array.from(hit.ids)),
    });

    worker.reply(results(2, [7]));
    worker.reply(results(1, [1]));
    worker.reply(results(3, [9]));

    expect(delivered).toEqual([[7], [9]]);
  });

  it("treats an unknown protocol version as fatal", async () => {
    // PRD 7.1: unknown versions activate fallback rather than being guessed at.
    const errors: { code: string; fatal: boolean }[] = [];
    const { worker } = await started({
      onResults: () => undefined,
      onError: (code, fatal) => errors.push({ code, fatal }),
    });

    worker.reply({ v: 99, type: "results", seq: 1, ids: new Uint32Array(0) });

    expect(errors).toEqual([{ code: "UNSUPPORTED_VERSION", fatal: true }]);
  });

  it("tears the worker down on a fatal error", async () => {
    const { worker } = await started({ onResults: () => undefined });

    worker.reply({
      v: SEARCH_PROTOCOL_VERSION,
      type: "error",
      code: "CATALOG_MISMATCH",
      fatal: true,
    });

    expect(worker.terminated).toBe(true);
  });

  it("keeps serving after a non-fatal error", async () => {
    // NOT_READY is transient: a query outran init. Tearing the worker down for
    // that would turn a race into a permanent fallback.
    const delivered: number[][] = [];
    const { worker } = await started({
      onResults: (hit) => delivered.push(Array.from(hit.ids)),
    });

    worker.reply({
      v: SEARCH_PROTOCOL_VERSION,
      type: "error",
      code: "NOT_READY",
      fatal: false,
    });
    expect(worker.terminated).toBe(false);

    worker.reply(results(1, [4]));
    expect(delivered).toEqual([[4]]);
  });

  it("does not dispatch an exact-looking project id through the debounce", async () => {
    // PRD 5.2.3 exempts exact ids from the 40 ms delay: the visitor already
    // told us exactly what they want.
    const { client, worker } = await started({ onResults: () => undefined });
    const before = worker.sent.length;

    client.query("RAG-01");
    expect(worker.sent.length, "an exact id should dispatch synchronously").toBe(before + 1);

    client.query("rag something");
    expect(worker.sent.length, "free text should be debounced").toBe(before + 1);
  });
});
