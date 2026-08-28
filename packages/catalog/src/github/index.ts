/**
 * GitHub enrichment.
 *
 * Authority: PRD 5.1.1 (source precedence), 5.1.4 (enrichment rules), 10.2
 * (token handling).
 *
 * THE GOVERNING RULE, from PRD 0.2: "GitHub enriches the catalog; it is not the
 * source of truth." Everything below exists to make that structurally true
 * rather than a matter of discipline — the merge function physically cannot
 * write a curated field, because it only ever returns the objective subset.
 *
 * No manifest currently declares a repository, so this has zero live input
 * today. It is built and tested against recorded responses so that the cache
 * format and the precedence rules are frozen now, and enrichment simply works
 * the day a manifest names a repo.
 */

import { issue, type ValidationIssue } from "@atlas/contracts/rules";
import type { ProjectRecord } from "@atlas/contracts/project";

/** PRD 5.1.4: "Store only fields used by the product." */
export interface EnrichmentFacts {
  readonly defaultBranch: string;
  readonly description: string | null;
  readonly topics: readonly string[];
  readonly primaryLanguage: string | null;
  readonly license: string | null;
  readonly stars: number;
  readonly forks: number;
  readonly openIssues: number;
  readonly archived: boolean;
  readonly lastPush: string | null;
  readonly latestRelease: string | null;
  readonly homepage: string | null;
}

export interface CacheEntry {
  readonly owner: string;
  readonly name: string;
  readonly etag: string | null;
  /** When this response was fetched, for the 7-day staleness rule. */
  readonly fetchedAt: string;
  readonly facts: EnrichmentFacts;
}

export interface EnrichmentCache {
  readonly version: 1;
  readonly entries: Readonly<Record<string, CacheEntry>>;
}

export const EMPTY_CACHE: EnrichmentCache = { version: 1, entries: {} };

/** PRD 5.1.4 constants. Not tunable at call sites. */
export const CONCURRENCY = 2;
export const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_RETRIES = 2;
export const RATE_LIMIT_FLOOR = 0.1;
export const MAX_CACHE_AGE_DAYS = 7;

export function cacheKey(owner: string, name: string): string {
  return `${owner.toLowerCase()}/${name.toLowerCase()}`;
}

/**
 * Fields GitHub may never write.
 *
 * PRD 5.1.1: "GitHub must not overwrite a curated title, summary, role, proof
 * level, metric, display order, or visibility state."
 */
export const CURATED_FIELDS = [
  "title",
  "summary",
  "tagline",
  "roles",
  "proofLevel",
  "metrics",
  "layout",
  "visibility",
  "tier",
  "featured",
] as const;

export interface MergeResult {
  readonly record: ProjectRecord;
  readonly issues: readonly ValidationIssue[];
}

/**
 * Merge enrichment into a record.
 *
 * Only `repository.enrichment` is written. A disagreement on a field the
 * manifest also states is a WARNING that preserves the manifest — PRD 5.1.1:
 * "the build emits a review warning and preserves the manifest until a human
 * resolves it." Failing the build instead would make a stale GitHub
 * description able to block a deploy, which inverts the ownership the PRD sets.
 */
export function mergeEnrichment(
  record: ProjectRecord,
  facts: EnrichmentFacts,
  fetchedAt: string,
  etag: string | null,
): MergeResult {
  const issues: ValidationIssue[] = [];
  const filePath = record.integrity.sourcePath;

  if (record.repository == null) {
    return { record, issues };
  }

  // Factual disagreements: report, never overwrite.
  if (
    record.repository.license != null &&
    facts.license != null &&
    record.repository.license !== facts.license
  ) {
    issues.push(
      issue(
        "GHE-CONFLICT-001",
        { filePath, pointer: "/repository/license", rejectedValue: facts.license },
        `Manifest says '${record.repository.license}', GitHub says '${facts.license}'. Manifest preserved.`,
      ),
    );
  }
  if (record.repository.defaultBranch !== facts.defaultBranch) {
    issues.push(
      issue(
        "GHE-CONFLICT-001",
        { filePath, pointer: "/repository/defaultBranch", rejectedValue: facts.defaultBranch },
        `Manifest says '${record.repository.defaultBranch}', GitHub says '${facts.defaultBranch}'. Manifest preserved.`,
      ),
    );
  }

  return {
    record: {
      ...record,
      repository: {
        ...record.repository,
        // Objective counts only. Curated fields above are untouched by
        // construction: this object literal never names one.
        enrichment: {
          stars: facts.stars,
          forks: facts.forks,
          openIssues: facts.openIssues,
          lastPush: facts.lastPush,
          latestRelease: facts.latestRelease,
          fetchedAt,
          etag,
        },
      },
    },
    issues,
  };
}

/** PRD 5.1.4: publish from cache only when it is younger than 7 days. */
export function cacheIsFresh(entry: CacheEntry, now: Date): boolean {
  const age = now.getTime() - new Date(entry.fetchedAt).getTime();
  return age < MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000;
}

export interface RateLimit {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number;
}

/** PRD 5.1.4: abort when the remaining budget falls below 10%. */
export function shouldAbort(rate: RateLimit): boolean {
  if (rate.limit <= 0) return false;
  return rate.remaining / rate.limit < RATE_LIMIT_FLOOR;
}

/**
 * Exponential backoff with FULL jitter.
 *
 * Full jitter rather than a fixed multiplier: several repositories failing at
 * once would otherwise retry in lockstep and rebuild the burst that caused the
 * failure. `Retry-After` always wins when the server sends it.
 */
export function backoffMs(
  attempt: number,
  retryAfterSeconds: number | null,
  random = Math.random,
): number {
  if (retryAfterSeconds !== null) return retryAfterSeconds * 1000;
  const ceiling = Math.min(30_000, 500 * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

export type Fetcher = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export interface FetchOptions {
  readonly token: string;
  readonly fetcher: Fetcher;
  readonly now: () => Date;
  readonly sleep: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

export interface RepoRef {
  readonly owner: string;
  readonly name: string;
}

export interface EnrichOutcome {
  readonly cache: EnrichmentCache;
  readonly issues: readonly ValidationIssue[];
  readonly fetched: number;
  readonly notModified: number;
  readonly aborted: boolean;
}

/**
 * Fetch repository facts, honouring the cache.
 *
 * Conditional requests via `If-None-Match`; a 304 reuses the cached normalized
 * response without counting as new data (PRD 5.1.4). Requests run at
 * concurrency 2 with a 10 s timeout and at most two retries.
 *
 * The fetcher is injected so tests drive recorded responses and CI never
 * reaches the network.
 */
export async function enrichRepositories(
  repos: readonly RepoRef[],
  cache: EnrichmentCache,
  options: FetchOptions,
): Promise<EnrichOutcome> {
  const entries: Record<string, CacheEntry> = { ...cache.entries };
  const issues: ValidationIssue[] = [];
  let fetched = 0;
  let notModified = 0;
  let aborted = false;

  const queue = [...repos];

  const worker = async (): Promise<void> => {
    while (queue.length > 0 && !aborted) {
      const repo = queue.shift();
      if (repo === undefined) return;
      const key = cacheKey(repo.owner, repo.name);
      const existing = entries[key];

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => {
          controller.abort();
        }, REQUEST_TIMEOUT_MS);

        try {
          const headers: Record<string, string> = {
            authorization: `Bearer ${options.token}`,
            accept: "application/vnd.github+json",
            "user-agent": "project-atlas-catalog",
          };
          if (existing?.etag != null) headers["if-none-match"] = existing.etag;

          const response = await options.fetcher(
            `https://api.github.com/repos/${repo.owner}/${repo.name}`,
            { headers, signal: controller.signal },
          );

          const rate: RateLimit = {
            limit: Number(response.headers.get("x-ratelimit-limit") ?? 0),
            remaining: Number(response.headers.get("x-ratelimit-remaining") ?? 0),
            resetAt: Number(response.headers.get("x-ratelimit-reset") ?? 0),
          };
          if (shouldAbort(rate)) {
            aborted = true;
            issues.push(
              issue(
                "GHE-BUDGET-001",
                { filePath: "<github>", pointer: "", rejectedValue: rate.remaining },
                `${rate.remaining} of ${rate.limit} requests remain.`,
              ),
            );
            return;
          }

          if (response.status === 304 && existing !== undefined) {
            notModified += 1;
            break;
          }

          if (response.status === 200) {
            const body = (await response.json()) as Record<string, unknown>;
            entries[key] = {
              owner: repo.owner,
              name: repo.name,
              etag: response.headers.get("etag"),
              fetchedAt: options.now().toISOString(),
              facts: normalizeFacts(body),
            };
            fetched += 1;
            break;
          }

          if (response.status === 403 || response.status === 429 || response.status >= 500) {
            if (attempt === MAX_RETRIES) {
              issues.push(
                issue(
                  "LNK-EXTERNAL-001",
                  { filePath: key, pointer: "", rejectedValue: response.status },
                  `GitHub returned ${response.status} after ${MAX_RETRIES + 1} attempts.`,
                ),
              );
              break;
            }
            const retryAfter = response.headers.get("retry-after");
            await options.sleep(
              backoffMs(attempt, retryAfter === null ? null : Number(retryAfter), options.random),
            );
            continue;
          }

          // 404 and other terminal statuses: report once, do not retry.
          issues.push(
            issue(
              "LNK-EXTERNAL-001",
              { filePath: key, pointer: "", rejectedValue: response.status },
              `GitHub returned ${response.status}.`,
            ),
          );
          break;
        } catch (error) {
          if (attempt === MAX_RETRIES) {
            issues.push(
              issue(
                "LNK-EXTERNAL-001",
                { filePath: key, pointer: "", rejectedValue: String(error) },
                "Request failed or timed out.",
              ),
            );
            break;
          }
          await options.sleep(backoffMs(attempt, null, options.random));
        } finally {
          clearTimeout(timer);
        }
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return { cache: { version: 1, entries }, issues, fetched, notModified, aborted };
}

/** Keep only the PRD 5.1.4 field allowlist. */
export function normalizeFacts(body: Record<string, unknown>): EnrichmentFacts {
  const str = (key: string): string | null =>
    typeof body[key] === "string" && body[key] !== "" ? body[key] : null;
  const num = (key: string): number => (typeof body[key] === "number" ? body[key] : 0);

  return {
    defaultBranch: str("default_branch") ?? "main",
    description: str("description"),
    topics: Array.isArray(body["topics"]) ? (body["topics"] as string[]).map(String).sort() : [],
    primaryLanguage: str("language"),
    license:
      typeof body["license"] === "object" && body["license"] !== null
        ? ((body["license"] as Record<string, unknown>)["spdx_id"] as string | null)
        : null,
    stars: num("stargazers_count"),
    forks: num("forks_count"),
    openIssues: num("open_issues_count"),
    archived: body["archived"] === true,
    lastPush: str("pushed_at"),
    latestRelease: null,
    homepage: str("homepage"),
  };
}
