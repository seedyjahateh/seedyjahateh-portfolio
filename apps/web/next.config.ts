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
   * STILL WEBPACK — but for a different reason than in Phase 1. See ADR 0028.
   *
   * Phase 1 needed `transpilePackages` and a webpack `extensionAlias` because
   * the site imported TypeScript source from sibling packages using NodeNext
   * `.js` specifiers, which Turbopack cannot alias onto `.ts`. Phase 2 removed
   * that import — the site now reads compiled JSON and takes only `import type`
   * from the contracts — so ADR 0023's stated condition for returning to
   * Turbopack was met, and both settings are gone.
   *
   * Turbopack was then measured and rejected on budget: it emits 111.1 KB
   * Brotli for the home route against webpack's 106.9 KB, and JS-HOME is
   * 110 KB. PRD 12.2 forbids raising a budget to accommodate a tool, so the
   * build stays on webpack until either Turbopack closes the 4 KB gap or the
   * baseline runtime shrinks.
   */
};

export default nextConfig;
