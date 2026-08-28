/**
 * The seed catalog.
 *
 * Authority: PRD 11.3 ("The 240-project seed catalog imports through the
 * production schema without manual runtime transformation"), 13 Phase 0 exit
 * gate, 5.1.1 (source precedence), 12.2 (no invented claims).
 *
 * TWO KINDS OF RECORD NOW LIVE HERE, and the distinction is the point.
 *
 * A SEED STUB is generated from the selection document and carries only what
 * that document states: id, title, summary, track, roles. It must stay free of
 * claims — no tagline, no evidence, no stack — because inventing any of those
 * would be the "unreviewed generative inference" PRD 5.1.1 forbids.
 *
 * An AUTHORED record has been written by a human, which PRD 5.1.1 makes the
 * highest-precedence source. It may carry a tagline, a stack, and a problem
 * statement, and the importer leaves it alone — it skips any file whose
 * `integrity.reviewedBy` is no longer "seed-import".
 *
 * What holds for BOTH is the constraint that actually matters: nothing reaches
 * `public` without clearing PRD 8.3's publication gates. The emptiness
 * assertions are therefore scoped to stubs, while the no-unearned-publication
 * assertions apply to everything.
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

/** Generated from the selection document, untouched by a human. */
const seedStubs = records.filter((r) => r.integrity.reviewedBy === "seed-import");
/** Written by a human; the manifest wins over the document (PRD 5.1.1). */
const authored = records.filter((r) => r.integrity.reviewedBy !== "seed-import");

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

  it("contains both seed stubs and authored records", () => {
    // If this ever reads zero authored, the importer has overwritten human
    // work — the exact failure its reviewedBy check exists to prevent.
    expect(seedStubs.length).toBeGreaterThan(0);
    expect(authored.length).toBeGreaterThan(0);
    expect(seedStubs.length + authored.length).toBe(240);
  });
});

describe("truth constraints for every record (PRD 12.2)", () => {
  it("publishes nothing", () => {
    // The constraint that matters. `public` is the state PRD 8.3's gates guard,
    // so until a record has evidence, media, a primary artifact and a score, it
    // stays unlisted no matter who wrote it.
    for (const record of records) {
      expect(record.visibility, record.id).not.toBe("public");
    }
  });

  it("features nothing globally", () => {
    for (const record of records) {
      expect(record.featured?.global ?? false, record.id).toBe(false);
    }
  });

  it("claims no metric anywhere", () => {
    // A metric needs environment, date, evidence and a synthetic flag. Nothing
    // here has been measured, so nothing here reports a number.
    for (const record of records) {
      expect(record.metrics, record.id).toHaveLength(0);
    }
  });

  it("claims no proof beyond source availability", () => {
    for (const record of records) {
      expect(record.proofLevel, record.id).toBe("code");
    }
  });
});

describe("seed stubs stay free of invented content", () => {
  it("marks every stub as planned and unlisted", () => {
    for (const record of seedStubs) {
      expect(record.status, record.id).toBe("planned");
      expect(record.visibility, record.id).toBe("unlisted");
    }
  });

  it("carries no tagline, because a tagline is a claim", () => {
    for (const record of seedStubs) {
      expect(record.tagline ?? null, record.id).toBeNull();
    }
  });

  it("carries no evidence or dates", () => {
    for (const record of seedStubs) {
      expect(record.evidence, record.id).toHaveLength(0);
      expect(record.dates.started, record.id).toBeNull();
      expect(record.dates.completed, record.id).toBeNull();
    }
  });

  it("leaves the stack empty rather than inferring it from prose", () => {
    // The selection document names technologies in sentences. Reading them out
    // is inference; an author naming them is not.
    for (const record of seedStubs) {
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

describe("authored records", () => {
  it("state a problem and a limitation rather than only a summary", () => {
    // If someone took the trouble to author a record, the parts a hiring
    // engineer actually reads should be there — including what it cannot do.
    for (const record of authored) {
      expect(record.content.problem, `${record.id} problem`).not.toBeNull();
      expect(record.content.limitations.length, `${record.id} limitations`).toBeGreaterThan(0);
    }
  });

  it("name a stack, since a human supplied it", () => {
    for (const record of authored) {
      const total =
        record.stack.languages.length +
        record.stack.frameworks.length +
        record.stack.data.length +
        record.stack.infrastructure.length +
        record.stack.ai.length +
        record.stack.testing.length;
      expect(total, `${record.id} stack`).toBeGreaterThan(0);
    }
  });

  it("record who reviewed them and when", () => {
    for (const record of authored) {
      expect(record.integrity.reviewedBy.length, record.id).toBeGreaterThan(0);
      expect(record.integrity.reviewedAt, `${record.id} reviewedAt`).not.toBeNull();
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

  it("assigns stub roles from the track header, not per project", () => {
    // Authored records may narrow their roles deliberately; stubs may not.
    for (const record of seedStubs) {
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
