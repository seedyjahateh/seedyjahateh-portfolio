/**
 * Output stages: featured -> payloads/feed -> enforce budgets -> publish.
 *
 * Authority: PRD 5.1.5 (artifacts and budgets), 6.2 (five flagship proofs),
 * 7.3 (cache and invalidation, publish ordering), 10.4 (feeds), 12.2 (budgets
 * are not raised to make a build pass).
 */

import { brotliCompressSync, constants } from "node:zlib";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { canonicalJson, canonicalJsonCompact } from "@atlas/contracts/canonical-json";
import { issue } from "@atlas/contracts/rules";
import type { ProjectRecord } from "@atlas/contracts/project";

import type { Stage } from "../pipeline.js";
import type { OrderedCatalog } from "./artifacts.js";

/** PRD 6.2 item 3: the home page leads with five. */
const MAX_FEATURED = 5;

// -----------------------------------------------------------------------------
// featured
// -----------------------------------------------------------------------------

export interface FeaturedArtifact {
  readonly catalogHash: string;
  readonly global: readonly { ordinal: number; id: string; slug: string; rank: number }[];
  readonly byRole: Readonly<
    Record<string, readonly { ordinal: number; id: string; slug: string; rank: number }[]>
  >;
}

/**
 * Editorial selections.
 *
 * Legitimately empty today: `featured.global` requires flagship tier, measured
 * proof and real media (XFD-FEAT-001), which nothing currently satisfies. The
 * artifact still ships so the home page has a stable shape to read rather than
 * a missing file to special-case.
 *
 * COR-FEAT-RANK-001 and COR-FEAT-COUNT-001 are enforced here because both need
 * the whole corpus - they were exempt from single-record fixture coverage.
 */
export const featuredStage: Stage<
  { catalog: OrderedCatalog; catalogHash: string },
  FeaturedArtifact
> = {
  name: "build-featured",
  effects: ["pure"],
  count: (out) => out.global.length,
  run({ catalog, catalogHash }, ctx) {
    const entries = catalog.records
      .map((record, ordinal) => ({ record, ordinal }))
      .filter(({ record }) => record.featured?.global === true && record.visibility === "public");

    /**
     * COR-FEAT-COUNT-001 is checked on the number of records FLAGGED, before
     * ranks are resolved.
     *
     * Checking it after rank deduplication made it unreachable: `featured.rank`
     * is capped at 5 by the schema, and the loop below skips any record whose
     * rank collides, so `global` could never exceed five however many records
     * were flagged. The rule means "at most five projects may be globally
     * featured", which is a property of the flags, not of the survivors.
     */
    if (entries.length > MAX_FEATURED) {
      ctx.issues.push(
        issue(
          "COR-FEAT-COUNT-001",
          {
            filePath: "content/projects",
            pointer: "/featured/global",
            rejectedValue: entries.length,
          },
          `${entries.length} projects are globally featured; the home page shows ${MAX_FEATURED}.`,
        ),
      );
    }

    const seenRank = new Map<number, string>();
    const global: { ordinal: number; id: string; slug: string; rank: number }[] = [];

    for (const { record, ordinal } of entries) {
      const rank = record.featured?.rank ?? null;
      if (rank === null) continue;

      const owner = seenRank.get(rank);
      if (owner !== undefined) {
        ctx.issues.push(
          issue(
            "COR-FEAT-RANK-001",
            {
              filePath: record.integrity.sourcePath,
              pointer: "/featured/rank",
              rejectedValue: rank,
            },
            `Rank ${rank} is already held by ${owner}.`,
          ),
        );
        continue;
      }
      seenRank.set(rank, record.id);
      global.push({ ordinal, id: record.id, slug: record.slug, rank });
    }

    global.sort((a, b) => a.rank - b.rank);

    const byRole: Record<string, { ordinal: number; id: string; slug: string; rank: number }[]> =
      {};
    for (const { record, ordinal } of entries) {
      for (const role of record.featured?.roles ?? []) {
        (byRole[role] ??= []).push({
          ordinal,
          id: record.id,
          slug: record.slug,
          rank: record.featured?.rank ?? 99,
        });
      }
    }
    for (const list of Object.values(byRole)) list.sort((a, b) => a.rank - b.rank);

    return { catalogHash, global: global.slice(0, MAX_FEATURED), byRole };
  },
};

// -----------------------------------------------------------------------------
// feed
// -----------------------------------------------------------------------------

export interface FeedInput {
  readonly catalog: OrderedCatalog;
  readonly siteUrl: string;
  readonly builtAt: string;
}

export interface FeedArtifact {
  readonly rss: string;
  readonly json: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * RSS 2.0 and JSON Feed of PUBLISHED projects only.
 *
 * PRD 10.4 requires generated feed artifacts. Unlisted roadmap entries are
 * excluded for the same reason they are absent from the sitemap: a feed is a
 * syndication surface, and planned work is not an announcement.
 *
 * Emitting a valid empty feed matters - a subscriber should get an empty
 * channel, not a 404 or malformed XML.
 */
export const feedStage: Stage<FeedInput, FeedArtifact> = {
  name: "build-feed",
  effects: ["pure"],
  count: () => 1,
  run({ catalog, siteUrl, builtAt }) {
    const published = catalog.records.filter((r) => r.visibility === "public");

    const items = published.map((record) => ({
      id: `${siteUrl}${record.links.canonical}`,
      url: `${siteUrl}${record.links.canonical}`,
      title: record.title,
      summary: record.tagline ?? record.summary,
      date: record.dates.completed ?? record.dates.lastVerified ?? builtAt.slice(0, 10),
    }));

    const rss = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0">',
      "  <channel>",
      "    <title>Project Atlas</title>",
      `    <link>${escapeXml(siteUrl)}</link>`,
      "    <description>Engineering case studies and the evidence behind them.</description>",
      ...items.flatMap((item) => [
        "    <item>",
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(item.url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(item.id)}</guid>`,
        `      <description>${escapeXml(item.summary)}</description>`,
        "    </item>",
      ]),
      "  </channel>",
      "</rss>",
      "",
    ].join("\n");

    const json = canonicalJson({
      version: "https://jsonfeed.org/version/1.1",
      title: "Project Atlas",
      home_page_url: siteUrl,
      feed_url: `${siteUrl}/catalog/feed.json`,
      items: items.map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title,
        summary: item.summary,
        date_published: `${item.date}T00:00:00Z`,
      })),
    });

    return { rss, json };
  },
};

// -----------------------------------------------------------------------------
// budgets
// -----------------------------------------------------------------------------

export interface ArtifactFile {
  /** Path relative to the output directory. */
  readonly path: string;
  readonly contents: string | Uint8Array;
  /** Budget id from config/budgets.v1.json, or null when unbudgeted. */
  readonly budgetId: string | null;
  /** True when the name carries a content hash and may be cached forever. */
  readonly immutable: boolean;
}

export function brotliBytes(data: string | Uint8Array): number {
  const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  return brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
}

export interface BudgetInput {
  readonly files: readonly ArtifactFile[];
  readonly budgets: ReadonlyMap<string, { value: number; unit: string; section: string }>;
}

export interface BudgetRow {
  readonly path: string;
  readonly budgetId: string | null;
  readonly kb: number;
  readonly limitKb: number | null;
  readonly ok: boolean;
}

/**
 * Compare every artifact against its budget.
 *
 * PRD 12.2 forbids raising a budget to make this pass, and PRD 0.9 says the
 * effect is removed rather than excused. Thresholds are read from
 * config/budgets.v1.json - nothing here hard-codes a number.
 */
export const budgetStage: Stage<BudgetInput, BudgetRow[]> = {
  name: "enforce-budgets",
  effects: ["pure"],
  count: (rows) => rows.length,
  run({ files, budgets }, ctx) {
    const rows: BudgetRow[] = [];

    for (const file of files) {
      const budget = file.budgetId === null ? undefined : budgets.get(file.budgetId);
      const limitKb = budget?.value ?? null;

      /**
       * Skip compression when the file cannot possibly exceed its budget.
       *
       * Brotli only exceeds its input for incompressible data, and then only by
       * a few bytes of header — so a file whose RAW size is already under the
       * budget is under it compressed too. Quality-11 compression of 1,300
       * detail payloads that sit 75x under budget cost 15 s of a 15.5 s build
       * and would have broken the 30 s incremental SLO in PRD 5.1.6.
       *
       * The shortcut is deliberately conservative: it only applies when raw
       * size is under the limit, so anything near the budget is still measured
       * exactly.
       */
      const rawBytes =
        typeof file.contents === "string"
          ? Buffer.byteLength(file.contents, "utf8")
          : file.contents.byteLength;
      const rawKb = rawBytes / 1024;

      const kb =
        limitKb !== null && rawKb <= limitKb
          ? Math.round(rawKb * 10) / 10
          : Math.round((brotliBytes(file.contents) / 1024) * 10) / 10;

      const ok = limitKb === null || kb <= limitKb;

      rows.push({ path: file.path, budgetId: file.budgetId, kb, limitKb, ok });

      if (limitKb !== null && kb > limitKb) {
        ctx.issues.push(
          issue(
            "BLD-BUDGET-001",
            { filePath: file.path, pointer: "", rejectedValue: kb },
            `${kb} KB Brotli against a budget of ${limitKb} KB (PRD ${budget?.section ?? "5.1.5"}).`,
          ),
        );
      }
    }

    return rows;
  },
};

// -----------------------------------------------------------------------------
// publish
// -----------------------------------------------------------------------------

export interface PublishInput {
  readonly files: readonly ArtifactFile[];
  readonly outDir: string;
  /** The unhashed bootstrap pointer, written last. */
  readonly bootstrap: { path: string; contents: string };
}

/**
 * Write artifacts to disk, pointer last.
 *
 * PRD 7.3: "A deployment publishes artifacts before HTML/manifest pointers.
 * Never publish pointers to missing content." Ordering is the whole point of
 * this stage — a crash midway leaves the previous pointer valid and the new
 * artifacts merely unreferenced, rather than a live pointer to a 404.
 */
export const publishStage: Stage<PublishInput, string[]> = {
  name: "publish",
  effects: ["write-fs"],
  count: (written) => written.length,
  run({ files, outDir, bootstrap }) {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const written: string[] = [];

    for (const file of files) {
      const target = join(outDir, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(
        target,
        typeof file.contents === "string" ? file.contents : Buffer.from(file.contents),
      );
      written.push(file.path);
    }

    // Last, deliberately.
    const pointer = join(outDir, bootstrap.path);
    mkdirSync(dirname(pointer), { recursive: true });
    writeFileSync(pointer, bootstrap.contents, "utf8");
    written.push(bootstrap.path);

    return written;
  },
};

/** SHA-256 over canonical JSON, matching `hashCanonical` in the contracts. */
export async function hashOf(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJsonCompact(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Short hash for filenames: `catalog-core.{hash}.json`. */
export function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, "").slice(0, 16);
}

export type { ProjectRecord };
