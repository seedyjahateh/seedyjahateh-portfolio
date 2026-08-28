/**
 * The 240-project seed catalog.
 *
 * Authority: PRD 11.3 ("The 240-project seed catalog imports through the
 * production schema without manual runtime transformation"), 13 Phase 0 exit
 * gate ("240-project import mapping approved"), 12.2 (no invented claims).
 *
 * This is the test that closes the Phase 0 exit gate. It validates the real
 * content/projects/ corpus - not fixtures - through the production schema, and
 * asserts the truth constraints that let 240 unbuilt projects exist in the
 * catalog without any of them making a claim.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { projectSchema, type ProjectRecord } from "@atlas/contracts/project";
import { ruleIdFromIssue } from "@atlas/contracts/rules";
import { loadTaxonomy, loadTracks, trackByPrefix } from "@atlas/taxonomy";

const projectsDir = join(process.cwd(), "content", "projects");
const files = readdirSync(projectsDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

const records: ProjectRecord[] = [];
const parseFailures: string[] = [];

for (const file of files) {
  const raw: unknown = JSON.parse(readFileSync(join(projectsDir, file), "utf8"));
  const result = projectSchema.safeParse(raw);
  if (result.success) {
    records.push(result.data);
  } else {
    parseFailures.push(
      `${file}: ${result.error.issues
        .map((i) => `/${i.path.join("/")} ${i.message} [${ruleIdFromIssue(i) ?? i.code}]`)
        .join("; ")}`,
    );
  }
}

const taxonomy = loadTaxonomy();
const tracks = loadTracks(taxonomy);
const byPrefix = trackByPrefix(tracks);

describe("seed catalog imports through the production schema", () => {
  it("has 240 manifests", () => {
    expect(files).toHaveLength(240);
  });

  it("validates every record with no transformation", () => {
    expect(parseFailures.slice(0, 10)).toEqual([]);
    expect(records).toHaveLength(240);
  });

  it("has unique ids and slugs (COR-DUP-ID-001 / COR-DUP-SLUG-001)", () => {
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length);
    expect(new Set(records.map((r) => r.slug)).size).toBe(records.length);
  });

  it("gives every record a canonical URL matching its slug", () => {
    for (const record of records) {
      expect(record.links.canonical).toBe(`/projects/${record.slug}`);
    }
  });
});

describe("truth constraints (PRD 12.2)", () => {
  it("marks every unbuilt project as planned, and none as public", () => {
    // Nothing has been built, so nothing may be public. This is the constraint
    // that lets a 240-entry catalog exist without making 240 claims.
    //
    // `unlisted` rather than `private` (ADR 0020, ADR 0024): the record gets a
    // page carrying only the title and summary the owner wrote, shows a
    // "planned" banner, and is noindex and absent from the sitemap. What must
    // never happen is `public`, which is the state the publication gates guard.
    for (const record of records) {
      expect(record.status, record.id).toBe("planned");
      expect(record.visibility, record.id).toBe("unlisted");
      expect(record.visibility, record.id).not.toBe("public");
    }
  });

  it("features nothing globally", () => {
    // PRD 8.3 gates featured.global on measured proof and real media. No seed
    // record can satisfy that, so the flagship rotation lives in
    // content/editorial/flagship-rotation.v1.json as intent instead.
    for (const record of records) {
      expect(record.featured?.global ?? false, record.id).toBe(false);
    }
  });

  it("claims no metrics, evidence, or dates", () => {
    for (const record of records) {
      expect(record.metrics, record.id).toHaveLength(0);
      expect(record.evidence, record.id).toHaveLength(0);
      expect(record.dates.started, record.id).toBeNull();
      expect(record.dates.completed, record.id).toBeNull();
    }
  });

  it("asserts no proof beyond source availability", () => {
    for (const record of records) {
      expect(record.proofLevel, record.id).toBe("code");
    }
  });

  it("carries no tagline, because a tagline is a claim", () => {
    for (const record of records) {
      expect(record.tagline ?? null, record.id).toBeNull();
    }
  });

  it("leaves the stack empty rather than inferring it from prose", () => {
    // The selection document names technologies in sentences. Extracting them
    // would be the "unreviewed generative inference" PRD 5.1.1 forbids.
    for (const record of records) {
      const total =
        record.stack.languages.length +
        record.stack.frameworks.length +
        record.stack.data.length +
        record.stack.infrastructure.length +
        record.stack.ai.length +
        record.stack.testing.length;
      expect(total, `${record.id} stack should be author-supplied`).toBe(0);
    }
  });
});

describe("track structure matches the selection document", () => {
  it("spreads 240 projects across 16 tracks, 15 each", () => {
    const counts = new Map<string, number>();
    for (const record of records) {
      counts.set(record.track, (counts.get(record.track) ?? 0) + 1);
    }
    expect(counts.size).toBe(16);
    for (const [track, count] of counts) {
      expect(count, `track ${track}`).toBe(15);
    }
  });

  it("keeps every id prefix inside its owning track (TAX-TRACK-PREFIX-001)", () => {
    for (const record of records) {
      const prefix = record.id.split("-")[0] ?? "";
      const track = byPrefix.get(prefix);
      expect(track, `${record.id} prefix '${prefix}' has no track`).toBeDefined();
      expect(track?.id, record.id).toBe(record.track);
    }
  });

  it("marks exactly 16 keystones, one per track", () => {
    const keystones = records.filter((r) => r.tier === "keystone");
    expect(keystones).toHaveLength(16);
    expect(new Set(keystones.map((r) => r.track)).size).toBe(16);
    for (const track of tracks) {
      const keystone = keystones.find((r) => r.track === track.id);
      expect(keystone?.id, `track ${track.id}`).toBe(track.keystone);
    }
  });

  it("assigns roles from the track header, not per project", () => {
    for (const record of records) {
      const track = byPrefix.get(record.id.split("-")[0] ?? "");
      expect([...record.roles].sort(), record.id).toEqual([...(track?.roles ?? [])].sort());
    }
  });
});

describe("vocabulary membership (TAX-UNKNOWN-001)", () => {
  const groupFor = (name: string): ReadonlySet<string> =>
    new Set(taxonomy.byGroup.get(name)?.keys() ?? []);

  it("uses only known tracks, capabilities, domains, and accents", () => {
    const trackIds = groupFor("tracks.tracks");
    const capabilities = groupFor("classification.capabilities");
    const domains = groupFor("classification.domains");
    const accents = groupFor("classification.accentTokens");
    const spatial = groupFor("classification.spatialGroups");

    for (const record of records) {
      expect(trackIds.has(record.track), `${record.id} track`).toBe(true);
      expect(accents.has(record.layout.accentToken), `${record.id} accent`).toBe(true);
      if (record.layout.spatialGroup) {
        expect(spatial.has(record.layout.spatialGroup), `${record.id} spatialGroup`).toBe(true);
      }
      for (const capability of record.capabilities) {
        expect(capabilities.has(capability), `${record.id} capability '${capability}'`).toBe(true);
      }
      for (const domain of record.domains) {
        expect(domains.has(domain), `${record.id} domain '${domain}'`).toBe(true);
      }
    }
  });
});
