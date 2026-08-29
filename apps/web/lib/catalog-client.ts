/**
 * Fetches the compiled artifacts and hands them to the engine.
 *
 * Authority: PRD 5.1.5 (content-hashed artifacts), 7.3 (the manifest is the
 * bootstrap pointer), 9.7 (a catalog/version mismatch is reported, not
 * silently rendered), ADR 0027 (artifacts live under /catalog).
 *
 * THE ENGINE DOES NOT FETCH. `@atlas/engine` is framework- and
 * environment-neutral so the same code runs in a browser and in vitest with no
 * DOM. Fetching is the part that differs, so it lives here in the app.
 *
 * Everything is loaded through the manifest rather than by guessing filenames:
 * artifact names carry a content hash, and the manifest is the only thing that
 * knows the current one.
 */

import {
  FacetEngine,
  loadBitsets,
  loadCatalog,
  type CatalogCore,
  type LoadedCatalog,
} from "@atlas/engine";
import type { Facets } from "@atlas/contracts/artifacts";

export interface CatalogManifest {
  readonly catalogHash: string;
  readonly artifacts: Record<string, { url: string; hash: string; bytes: number }>;
}

export interface ClientCatalog {
  readonly manifest: CatalogManifest;
  readonly catalog: LoadedCatalog;
  readonly engine: FacetEngine;
}

let cached: Promise<ClientCatalog> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Load once per page. Repeat callers share the same promise, so the palette
 * and the archive island on /projects never fetch the catalog twice.
 */
export function loadClientCatalog(manifestUrl = "/catalog/manifest.json"): Promise<ClientCatalog> {
  cached ??= (async () => {
    const manifest = await fetchJson<CatalogManifest>(manifestUrl);

    const coreUrl = manifest.artifacts["catalogCore"]?.url;
    const facetsUrl = manifest.artifacts["facets"]?.url;
    const bitsUrl = manifest.artifacts["facetBits"]?.url;
    if (coreUrl === undefined || facetsUrl === undefined || bitsUrl === undefined) {
      throw new Error("manifest is missing catalogCore, facets or facetBits");
    }

    // Fetched in parallel: they are independent files and the engine needs all
    // three before it can answer anything.
    const [core, facets, bitsResponse] = await Promise.all([
      fetchJson<CatalogCore>(coreUrl),
      fetchJson<Facets>(facetsUrl),
      fetch(bitsUrl),
    ]);
    if (!bitsResponse.ok) throw new Error(`${bitsUrl} responded ${bitsResponse.status}`);

    // arrayBuffer() yields a standalone ArrayBuffer with no byteOffset, which
    // is what the zero-copy Uint32Array view over the payload requires.
    const bits = loadBitsets(await bitsResponse.arrayBuffer());

    // loadCatalog throws when catalog-core and facets came from different
    // builds; the FacetEngine constructor throws when facet-bits disagrees on
    // the project count. Both are PRD 9.7 mismatches and must be loud.
    const catalog = loadCatalog(core, facets);
    return { manifest, catalog, engine: new FacetEngine(catalog, bits) };
  })();

  return cached;
}
