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
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}