import type { MetadataRoute } from "next";

import { getSitemapProjects } from "../lib/content";
import { ROLE_LENSES, SITE_URL } from "../lib/site";

/**
 * Sitemap.
 *
 * Authority: PRD 10.4 — "The archive is not the crawl boundary. Search engines
 * and non-JavaScript clients reach every public project through paginated
 * indexes and sitemaps."
 *
 * Only PUBLIC records appear. `unlisted` pages exist and are reachable by
 * direct URL but are deliberately absent here (ADR 0024).
 */
/**
 * Required by `output: "export"`: metadata routes must declare themselves
 * static, because there is no server to generate them per request.
 */
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    { path: "/", priority: 1.0 },
    ...ROLE_LENSES.map((lens) => ({ path: `/${lens.slug}`, priority: 0.9 })),
    { path: "/projects", priority: 0.8 },
    { path: "/resume", priority: 0.7 },
    { path: "/contact", priority: 0.5 },
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: `${SITE_URL}${route.path}`,
      changeFrequency: "monthly" as const,
      priority: route.priority,
    })),
    ...getSitemapProjects().map((project) => ({
      url: `${SITE_URL}${project.links.canonical}`,
      changeFrequency: "monthly" as const,
      priority: project.tier === "flagship" ? 0.9 : 0.6,
      ...(project.dates.lastVerified === null
        ? {}
        : { lastModified: new Date(project.dates.lastVerified) }),
    })),
  ];
}