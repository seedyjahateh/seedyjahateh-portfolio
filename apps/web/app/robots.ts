import type { MetadataRoute } from "next";

import { SITE_URL } from "../lib/site";

/**
 * robots.txt. PRD 10.4.
 *
 * Everything statically generated is crawlable; unlisted pages are kept out of
 * the index by a per-page robots directive rather than by a path rule here,
 * so the two cannot drift apart.
 */
/**
 * Required by `output: "export"`: metadata routes must declare themselves
 * static, because there is no server to generate them per request.
 */
export const dynamic = "force-static";
export default function robots(): MetadataRoute.Robots {
  // Only production invites crawlers. A preview deployment is unreviewed
  // content on a throwaway hostname; letting it be indexed would compete with
  // the real site and surface work that has not cleared the publication gates.
  const isProduction = process.env["VERCEL_ENV"] === "production";

  if (!isProduction) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}