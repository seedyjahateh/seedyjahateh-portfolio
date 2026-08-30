/**
 * Measure the static export against the route budgets.
 *
 * Authority: PRD 0.9 ("Performance is a release feature. Budgets are enforced
 * in CI"), 9.4 (JS and CSS budgets), 9.6 (HTML and network budgets), 12.2
 * (budgets may not be changed to make a test pass).
 *
 * WHY THIS MATTERS NOW. config/budgets.v1.json has been reviewed since Phase 0
 * but never compared against anything, so its 83 numbers have been assertions
 * rather than gates. Phase 1 is the first phase with a build to measure. The
 * value is less that a static shell passes - it obviously will - and more that
 * the measurement exists before Phase 4 adds a grid that could regress it.
 *
 * Sizes are Brotli-compressed transfer sizes, matching how the budget file
 * defines itself. Thresholds are read from that file; nothing is hard-coded.
 */

import { brotliCompressSync, constants } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const outDir = join(repoRoot, "apps", "web", "out");
const budgetsPath = join(repoRoot, "config", "budgets.v1.json");

interface Budget {
  id: string;
  section: string;
  value: number;
  unit: string;
  comparator: string;
  appliesTo: string;
}

/** Brotli at max quality, matching a CDN's static compression. */
function brotliBytes(buffer: Buffer): number {
  return brotliCompressSync(buffer, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
}

function kb(bytes: number): number {
  return Math.round((bytes / 1024) * 10) / 10;
}

/**
 * Every file a MODERN browser actually fetches for one HTML document.
 *
 * Two exclusions, both deliberate:
 *
 * 1. `noModule` scripts. Next emits a ~112 KB legacy polyfill bundle tagged
 *    `noModule`, which any module-supporting browser skips without downloading.
 *    Counting it would inflate the measured transfer by roughly 30 KB Brotli
 *    for bytes no target browser ever requests.
 *
 * 2. `<link rel="preload">`. Preloads point at the same chunks the script tags
 *    already reference; counting both double-counts every byte.
 *
 * So this reads actual `<script src>` and `<link rel="stylesheet">` tags rather
 * than grepping for `/_next/*.js`, which is what an earlier version did — and
 * it over-reported by ~30 KB as a result.
 */
function assetsFor(htmlPath: string): { js: number; css: number; html: number } {
  const html = readFileSync(htmlPath);
  const text = html.toString("utf8");

  let js = 0;
  let css = 0;
  const seen = new Set<string>();

  const add = (ref: string): void => {
    if (seen.has(ref)) return;
    seen.add(ref);
    const assetPath = join(outDir, ref);
    if (!existsSync(assetPath)) return;
    const bytes = brotliBytes(readFileSync(assetPath));
    if (extname(ref) === ".js") js += bytes;
    else css += bytes;
  };

  for (const tag of text.matchAll(/<script\b[^>]*>/gi)) {
    const raw = tag[0];
    // Legacy-only bundle; modern browsers never request it.
    if (/\bnomodule\b/i.test(raw)) continue;
    const src = /\bsrc=["']([^"']+)["']/i.exec(raw)?.[1];
    if (src?.startsWith("/_next/") === true) add(src);
  }

  for (const tag of text.matchAll(/<link\b[^>]*>/gi)) {
    const raw = tag[0];
    if (!/rel=["']stylesheet["']/i.test(raw)) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(raw)?.[1];
    if (href?.startsWith("/_next/") === true) add(href);
  }

  return { js, css, html: brotliBytes(html) };
}

/** Rough element count, for the DOM budgets in PRD 9.3. */
function elementCount(htmlPath: string): number {
  const text = readFileSync(htmlPath, "utf8");
  return (text.match(/<[a-zA-Z][^>]*>/g) ?? []).length;
}

interface RouteCheck {
  readonly label: string;
  readonly file: string;
  readonly jsBudget: string;
  readonly cssBudget: string;
  readonly htmlBudget: string;
  readonly domBudget?: string;
}

const ROUTES: readonly RouteCheck[] = [
  {
    label: "/",
    file: "index.html",
    jsBudget: "JS-HOME",
    cssBudget: "CSS-ROUTE",
    htmlBudget: "NET-HTML",
    domBudget: "DOM-HOME",
  },
  {
    label: "/ai-engineer",
    file: "ai-engineer.html",
    jsBudget: "JS-ROLE-DETAIL",
    cssBudget: "CSS-ROUTE",
    htmlBudget: "NET-HTML",
  },
  {
    label: "/projects",
    file: "projects.html",
    jsBudget: "JS-ARCHIVE",
    cssBudget: "CSS-ROUTE",
    htmlBudget: "NET-HTML",
    domBudget: "DOM-ARCHIVE-CEILING",
  },
  {
    label: "/resume",
    file: "resume.html",
    jsBudget: "JS-ROLE-DETAIL",
    cssBudget: "CSS-ROUTE",
    htmlBudget: "NET-HTML",
  },
  {
    label: "/contact",
    file: "contact.html",
    jsBudget: "JS-ROLE-DETAIL",
    cssBudget: "CSS-ROUTE",
    htmlBudget: "NET-HTML",
  },
];

function main(): void {
  if (!existsSync(outDir)) {
    process.stderr.write(
      "apps/web/out does not exist. Run `pnpm --filter @atlas/web build` first.\n",
    );
    process.exit(1);
  }

  const budgetFile = JSON.parse(readFileSync(budgetsPath, "utf8")) as { budgets: Budget[] };
  const budgets = new Map(budgetFile.budgets.map((b) => [b.id, b]));

  const failures: string[] = [];
  const rows: string[] = [];

  const check = (label: string, budgetId: string, actual: number, unit: string): void => {
    const budget = budgets.get(budgetId);
    if (budget === undefined) {
      failures.push(`Unknown budget id '${budgetId}' referenced by ${label}.`);
      return;
    }
    const ok = actual <= budget.value;
    const pct = Math.round((actual / budget.value) * 100);
    rows.push(
      `  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(16)} ${budgetId.padEnd(22)} ` +
        `${String(actual).padStart(7)} / ${budget.value} ${unit}  (${pct}%)`,
    );
    if (!ok) {
      failures.push(
        `${label}: ${budgetId} exceeded — ${actual} ${unit} against a budget of ${budget.value} ${unit} (PRD ${budget.section}).`,
      );
    }
  };

  for (const route of ROUTES) {
    const htmlPath = join(outDir, route.file);
    if (!existsSync(htmlPath)) {
      failures.push(`Expected export output ${route.file} for route ${route.label}.`);
      continue;
    }
    const { js, css, html } = assetsFor(htmlPath);
    check(route.label, route.jsBudget, kb(js), "KB");
    check(route.label, route.cssBudget, kb(css), "KB");
    check(route.label, route.htmlBudget, kb(html), "KB");
    if (route.domBudget !== undefined) {
      check(route.label, route.domBudget, elementCount(htmlPath), "elements");
    }
  }

  /**
   * NET-ARCHIVE-TOTAL: "Total transfer before search activation."
   *
   * The route budgets above cover the document, its JS and its CSS. They miss
   * what the archive fetches on top: the manifest, catalog-core, the facet
   * dictionaries and the bitsets, all pulled eagerly when the island mounts.
   * That is most of what a visitor actually downloads, and it grows with the
   * catalog while the JS does not — so measuring only the bundle would report a
   * flat number for a page whose weight is anything but.
   *
   * The search index is deliberately excluded: it loads on the first query,
   * which is the "before search activation" this budget names.
   */
  const archiveHtml = join(outDir, "projects.html");
  const catalogDir = join(outDir, "catalog");
  if (existsSync(archiveHtml) && existsSync(catalogDir)) {
    const { js, css, html } = assetsFor(archiveHtml);
    const eager = ["manifest", "catalog-core", "facets.", "facet-bits"];
    const artifactBytes = readdirSync(catalogDir)
      .filter((file) => eager.some((prefix) => file.startsWith(prefix)))
      .reduce((sum, file) => sum + brotliBytes(readFileSync(join(catalogDir, file))), 0);
    check("/projects", "NET-ARCHIVE-TOTAL", kb(js + css + html + artifactBytes), "KB");
  }

  // A representative detail page, whichever sorts first, so the measurement is
  // deterministic rather than dependent on directory order.
  const projectsDir = join(outDir, "projects");
  if (existsSync(projectsDir)) {
    const detail = readdirSync(projectsDir)
      .filter((f) => f.endsWith(".html"))
      .sort()[0];
    if (detail !== undefined) {
      const htmlPath = join(projectsDir, detail);
      const { js, css, html } = assetsFor(htmlPath);
      check("/projects/{slug}", "JS-ROLE-DETAIL", kb(js), "KB");
      check("/projects/{slug}", "CSS-ROUTE", kb(css), "KB");
      check("/projects/{slug}", "NET-HTML", kb(html), "KB");
    }
  }

  const totalBytes = readdirSync(outDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0);

  process.stdout.write("Route budgets (Brotli transfer sizes)\n\n");
  for (const row of rows) process.stdout.write(`${row}\n`);
  process.stdout.write(`\nexport total on disk: ${kb(totalBytes)} KB uncompressed\n`);

  if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} budget failure(s):\n`);
    for (const failure of failures) process.stderr.write(`  - ${failure}\n`);
    process.stderr.write(
      "\nPRD 12.2: budgets are not raised to make this pass. Reduce the payload.\n",
    );
    process.exit(1);
  }
  process.stdout.write("\nall route budgets pass\n");
}

main();
