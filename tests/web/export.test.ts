/**
 * Static export structure.
 *
 * Authority: PRD 13 Phase 1 exit gate ("crawlable and keyboard-usable without
 * client catalog code"), 10.1 (one h1, ordered headings, landmarks, skip
 * links, descriptive link text), 10.4 (canonical URLs, sitemap, indexability).
 *
 * These assert against the BUILT HTML in apps/web/out rather than rendering
 * components in isolation. That is deliberate: the exit gate is about the
 * artifact a crawler and a keyboard user actually receive, and rendering a
 * component in a test can pass while the export is broken. It also sidesteps
 * async server components, which no component-level renderer handles cleanly.
 *
 * Requires `pnpm --filter @atlas/web build` first; the suite skips with a clear
 * message rather than failing confusingly if the export is absent.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const OUT = join(process.cwd(), "apps", "web", "out");
const hasExport = existsSync(join(OUT, "index.html"));

const describeExport = hasExport ? describe : describe.skip;

if (!hasExport) {
  console.warn("apps/web/out missing — run `pnpm --filter @atlas/web build`. Skipping.");
}

function html(route: string): string {
  return readFileSync(join(OUT, route), "utf8");
}

/**
 * Strip React's SSR comment separators.
 *
 * React emits `<!-- -->` between adjacent text and interpolated values, so
 * `This project is {status}.` renders as `This project is <!-- -->planned<!-- -->.`
 * Assertions should test the copy a reader sees, not that artifact.
 */
function text(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, "");
}

function allHtmlFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) found.push(full);
    }
  };
  walk(OUT);
  return found;
}

/** Heading levels in document order. */
function headingLevels(source: string): number[] {
  return [...source.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
}

const CORE_ROUTES = [
  "index.html",
  "ai-engineer.html",
  "backend-engineer.html",
  "full-stack-engineer.html",
  "projects.html",
  "resume.html",
  "contact.html",
];

describeExport("every core route", () => {
  it.each(CORE_ROUTES)("%s exists", (route) => {
    expect(existsSync(join(OUT, route)), `${route} was not exported`).toBe(true);
  });

  it.each(CORE_ROUTES)("%s has exactly one h1", (route) => {
    const levels = headingLevels(html(route));
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
  });

  it.each(CORE_ROUTES)("%s never skips a heading level", (route) => {
    // PRD 10.1 requires ordered headings: h2 may follow h1, h3 may follow h2,
    // but h1 -> h3 leaves a screen-reader user guessing at the structure.
    const levels = headingLevels(html(route));
    let previous = 0;
    for (const level of levels) {
      if (previous !== 0) {
        expect(level, `${route}: h${previous} is followed by h${level}`).toBeLessThanOrEqual(
          previous + 1,
        );
      }
      previous = level;
    }
  });

  it.each(CORE_ROUTES)("%s has landmarks and a skip link", (route) => {
    const source = html(route);
    expect(source).toContain('class="skip-link"');
    expect(source).toContain('href="#main"');
    expect(source).toMatch(/<main\b[^>]*id="main"/);
    expect(source).toMatch(/<header\b/);
    expect(source).toMatch(/<footer\b/);
    expect(source).toMatch(/<nav\b[^>]*aria-label=/);
  });

  it.each(CORE_ROUTES)("%s declares a language", (route) => {
    expect(html(route)).toMatch(/<html[^>]*lang="en"/);
  });

  it.each(CORE_ROUTES)("%s has a canonical link", (route) => {
    expect(html(route)).toMatch(/<link[^>]*rel="canonical"/);
  });

  it.each(CORE_ROUTES)("%s has a non-empty title", (route) => {
    const title = /<title>([^<]*)<\/title>/.exec(html(route))?.[1] ?? "";
    expect(title.trim().length).toBeGreaterThan(0);
  });
});

describeExport("no client catalog code", () => {
  it("ships no inline event handlers", () => {
    // The exit gate is that the site works without client catalog code. An
    // onclick attribute would be exactly that code, smuggled into markup.
    for (const file of allHtmlFiles()) {
      const source = readFileSync(file, "utf8");
      expect(source, `${relative(OUT, file)} contains an inline handler`).not.toMatch(
        /\son(?:click|change|submit|input|keydown)=/i,
      );
    }
  });

  it("has no form that would need a runtime endpoint", () => {
    // PRD 6.1: contact is "static; no third-party form dependency required",
    // and PRD 8 rules out a runtime API in v1.
    expect(html("contact.html")).not.toMatch(/<form\b/i);
  });
});

describeExport("link integrity (rule LNK-INTERNAL-001)", () => {
  it("every internal link resolves to an exported file", () => {
    const broken: string[] = [];

    for (const file of allHtmlFiles()) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<a\b[^>]*href="([^"]+)"/gi)) {
        const href = match[1];
        if (href === undefined) continue;
        // External, anchor, mail and asset links are out of scope here.
        if (!href.startsWith("/") || href.startsWith("/_next/")) continue;

        const path = href.split("#")[0]?.split("?")[0] ?? "";
        if (path === "" || path === "/") continue;

        const candidates = [
          join(OUT, `${path}.html`),
          join(OUT, path, "index.html"),
          join(OUT, path),
        ];
        if (!candidates.some((candidate) => existsSync(candidate))) {
          broken.push(`${relative(OUT, file)} -> ${href}`);
        }
      }
    }

    expect(broken.slice(0, 20), `${broken.length} broken internal link(s)`).toEqual([]);
  });

  it("every link has discernible text", () => {
    // PRD 10.1: descriptive link text. An empty <a> is unreachable context for
    // a screen reader and usually a markup bug.
    const empty: string[] = [];
    for (const file of allHtmlFiles()) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
        const inner = (match[1] ?? "").replace(/<[^>]+>/g, "").trim();
        const hasLabel = match[0].includes("aria-label=");
        if (inner.length === 0 && !hasLabel) empty.push(relative(OUT, file));
      }
    }
    expect([...new Set(empty)].slice(0, 10)).toEqual([]);
  });
});

describeExport("indexability (PRD 10.4, ADR 0024)", () => {
  it("unlisted project pages are noindex", () => {
    const projectsDir = join(OUT, "projects");
    const pages = readdirSync(projectsDir).filter((f) => f.endsWith(".html"));
    expect(pages.length).toBeGreaterThan(0);

    for (const page of pages.slice(0, 25)) {
      const source = readFileSync(join(projectsDir, page), "utf8");
      expect(source, `${page} should be noindex while unlisted`).toMatch(
        /<meta name="robots" content="noindex/,
      );
    }
  });

  it("the sitemap contains no unlisted project", () => {
    // The whole point of `unlisted`: it has a page, and crawlers never see it.
    const sitemap = readFileSync(join(OUT, "sitemap.xml"), "utf8");
    expect(sitemap).not.toMatch(/<loc>[^<]*\/projects\/[a-z0-9-]+<\/loc>/);
  });

  it("the sitemap lists the static routes", () => {
    const sitemap = readFileSync(join(OUT, "sitemap.xml"), "utf8");
    for (const path of ["/ai-engineer", "/backend-engineer", "/full-stack-engineer", "/resume"]) {
      expect(sitemap).toContain(`${path}</loc>`);
    }
  });

  it("robots.txt points at the sitemap", () => {
    expect(readFileSync(join(OUT, "robots.txt"), "utf8")).toMatch(/Sitemap:\s*http/);
  });
});

describeExport("empty-state policy", () => {
  it("home omits the proof bar entirely while every count is zero", () => {
    // PRD 14 flags credibility skepticism; a row of zeroes invites it.
    const source = html("index.html");
    expect(source).not.toContain('class="proof-bar"');
  });

  it("home shows no flagship placeholders", () => {
    const source = html("index.html");
    expect(source).toContain("No flagship systems yet");
    expect(source).not.toMatch(/lorem|placeholder project|example project/i);
  });

  it("home does not lead with the catalog count", () => {
    // PRD 15: "Do not celebrate project count on the first screen."
    expect(html("index.html")).not.toMatch(/\b240\b/);
  });

  it("the atlas never calls planned entries published", () => {
    // The atlas lists roadmap entries (unlisted + planned). Describing them as
    // "published projects" would be the fabrication PRD 12.2 forbids, so the
    // catalog count and the published count are stated separately.
    const source = text(html("projects.html"));
    expect(source).toContain("catalog entries");
    expect(source).toContain("None are published yet");
    expect(source).not.toMatch(/\d+\s+published projects/);
  });

  it("role pages show an empty state rather than planned work as evidence", () => {
    for (const route of ["ai-engineer.html", "backend-engineer.html", "full-stack-engineer.html"]) {
      expect(html(route)).toContain("No published work under this lens yet");
    }
  });
});

describeExport("project detail template", () => {
  const detailFile = (): string => {
    const dir = join(OUT, "projects");
    const first = readdirSync(dir)
      .filter((f) => f.endsWith(".html"))
      .sort()[0];
    if (first === undefined) throw new Error("no detail pages exported");
    return readFileSync(join(dir, first), "utf8");
  };

  it("marks planned work as planned", () => {
    expect(text(detailFile())).toContain("This project is planned");
  });

  it("renders no empty evidence sections", () => {
    // PRD 6.3 fixes the section ORDER, not that every section appears. An
    // empty "Measured evidence" heading would imply measurement that did not
    // happen, which PRD 0.10 treats as a defect.
    const source = detailFile();
    for (const heading of ["Measured evidence", "Supporting evidence", "Architecture"]) {
      expect(source, `${heading} should be omitted when it has no content`).not.toContain(
        `>${heading}<`,
      );
    }
  });

  it("exposes the project id and status", () => {
    const source = detailFile();
    expect(source).toMatch(/class="project-id"/);
    expect(source).toContain("Status:");
    expect(source).toContain("Proof:");
  });
});
