import type { NextConfig } from "next";

/**
 * Next.js configuration for the Phase 1 static proof shell.
 *
 * Authority: PRD 0.1 (static-first), 4 (static generation, route-level code
 * splitting), 8 (no runtime database in v1), 10.2 (static rendering is the
 * default attack-surface reduction). ADR 0021 records the export decision.
 */
const nextConfig: NextConfig = {
  /**
   * Full static export. This is the strongest available form of PRD 10.2's
   * "static rendering is the default attack-surface reduction": with no server
   * there is no request-time code path to attack, no runtime secret to leak,
   * and nothing to keep patched.
   *
   * The tradeoff is real and deliberate. Route handlers, middleware, ISR, and
   * Next-native redirects are all unavailable. PRD 8 says v1 needs none of
   * them; redirects instead come from a generated vercel.json (PRD 10.4's
   * "generated redirect map").
   */
  output: "export",

  /**
   * The Next image optimizer is a runtime service, which static export cannot
   * provide. That is fine here rather than a compromise: PRD 4 already requires
   * a BUILD-TIME pipeline producing AVIF/WebP with intrinsic dimensions, and
   * ADR 0016 assigns it to Phase 2. Phase 1 ships no project media at all.
   */
  images: { unoptimized: true },

  /**
   * No trailing slash, so /projects/atlasops and /projects/atlasops/ do not
   * become two URLs for one document. PRD 0.3 makes the dedicated project URL
   * canonical, and duplicate forms would undermine that.
   */
  trailingSlash: false,

  // Catch a bad route reference at build time rather than as a 404 later.
  typedRoutes: true,

  reactStrictMode: true,

  // PRD 10.2: do not advertise the framework version.
  poweredByHeader: false,

  // Note: Next 16 removed the `eslint` config key along with `next lint`.
  // Linting runs as its own workspace-wide CI step (`pnpm lint`) against
  // eslint.config.js, which is where the PRD 12.2 rules live.

  /**
   * STILL WEBPACK, and now for both reasons again. See ADR 0028 and ADR 0030.
   *
   * Phase 1 needed `transpilePackages` and a webpack `extensionAlias` because
   * the site imported TypeScript source from sibling packages using NodeNext
   * `.js` specifiers, which Turbopack cannot alias onto `.ts`. Phase 2 removed
   * that import and both settings went away.
   *
   * Phase 3 brings them back deliberately. The retrieval engine has to run in
   * the browser, so it is client code wherever it lives; PRD 4.1 requires it
   * behind "framework-neutral TypeScript interfaces" and PRD 7.4 requires that
   * a future edge search service slot in "behind the same
   * SearchRequest/SearchResponse contract" without rewriting views. A package
   * is what makes that boundary real, and the resolution cost is the price.
   *
   * The webpack pin itself does not depend on this: ADR 0028 re-justified it on
   * a measured budget — Turbopack emits 111.1 KB Brotli on home against
   * webpack's 106.9 KB, and JS-HOME is 110 KB. PRD 12.2 forbids raising a
   * budget to accommodate a tool.
   */
  transpilePackages: ["@atlas/engine"],

  // The parameter is typed structurally rather than left as Next's `any`, so
  // the only field this touches is checked. Widening to `any` here would let a
  // typo in `extensionAlias` fail silently at build time.
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    // NodeNext source is written with `.js` specifiers that resolve to `.ts` on
    // disk. Without this, every intra-package import in @atlas/engine fails.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
