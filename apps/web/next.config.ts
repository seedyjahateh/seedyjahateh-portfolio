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
   * The workspace packages are TypeScript source, not published builds, so the
   * bundler has to compile them rather than treat them as external.
   */
  transpilePackages: ["@atlas/contracts", "@atlas/taxonomy"],

  /**
   * WHY WEBPACK RATHER THAN TURBOPACK (see ADR 0023).
   *
   * `packages/*` use `moduleResolution: "NodeNext"`, which REQUIRES explicit
   * `.js` extensions on relative imports even though the files are `.ts`. That
   * is correct for the rest of the workspace - tsc, tsx and vitest all depend
   * on it - but a bundler then has to map `./schema.js` onto `schema.ts`.
   *
   * webpack expresses that in one line via `extensionAlias`. Turbopack has no
   * equivalent today, so it fails to resolve those specifiers.
   *
   * This coupling is temporary and disappears on its own: ADR 0023 records that
   * Phase 1 imports catalog source directly only until Phase 2's compiler emits
   * JSON artifacts, after which `apps/web` reads data instead of importing TS.
   * At that point this can move back to Turbopack.
   */
  webpack: (config: {
    resolve: { extensionAlias?: Record<string, string[]> };
  }) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
