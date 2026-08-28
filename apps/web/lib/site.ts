/**
 * Site-level constants.
 *
 * SITE_URL is the origin used for canonical URLs, Open Graph, and the sitemap
 * (PRD 10.4). It is read from the environment so a preview deployment
 * advertises its own origin rather than claiming to be production - a preview
 * that emits production canonicals would invite the crawler to index the wrong
 * host.
 */

const FALLBACK_ORIGIN = "http://localhost:3000";

function resolveSiteUrl(): string {
  const explicit = process.env["NEXT_PUBLIC_SITE_URL"];
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    return explicit.replace(/\/+$/, "");
  }
  // Vercel supplies the deployment host without a scheme.
  const vercel = process.env["NEXT_PUBLIC_VERCEL_URL"] ?? process.env["VERCEL_URL"];
  if (typeof vercel === "string" && vercel.trim().length > 0) {
    return `https://${vercel.replace(/\/+$/, "")}`;
  }
  return FALLBACK_ORIGIN;
}

export const SITE_URL = resolveSiteUrl();

export const SITE_NAME = "Project Atlas";

/** PRD 6.1: the three role lenses, and the copy each route leads with. */
export const ROLE_LENSES = [
  {
    slug: "ai-engineer",
    id: "ai-engineer",
    label: "AI Engineer",
    short: "AI",
    summary:
      "Retrieval, evaluation, model serving, agent orchestration, and the cost and safety controls around them.",
    proves:
      "You evaluate, serve, monitor, secure, and control AI systems — not just call an API.",
  },
  {
    slug: "backend-engineer",
    id: "backend-engineer",
    label: "Backend Engineer",
    short: "Backend",
    summary:
      "Concurrency, data correctness, distributed failure, API design, and the operations behind them.",
    proves: "You reason about concurrency, data correctness, failure, scale, and operations.",
  },
  {
    slug: "full-stack-engineer",
    id: "full-stack-engineer",
    label: "Full Stack Engineer",
    short: "Full stack",
    summary:
      "Product surfaces with real accessibility, performance, security, and test evidence behind them.",
    proves:
      "You can own product UX and the backend, with accessibility, performance, security, and tests.",
  },
] as const;

export type RoleLens = (typeof ROLE_LENSES)[number];

export function roleLensBySlug(slug: string): RoleLens | undefined {
  return ROLE_LENSES.find((lens) => lens.slug === slug);
}
