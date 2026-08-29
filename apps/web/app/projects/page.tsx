import type { Metadata } from "next";

import { CatalogIsland } from "../../components/catalog-island";
import { ProjectsIndex } from "./projects-index";

export const metadata: Metadata = {
  title: "Project atlas",
  description:
    "Every published project, with its proof level, status, and role relevance. Paginated and readable without JavaScript.",
  alternates: { canonical: "/projects" },
};

/**
 * The archive: static shell plus client catalog engine (PRD 6.1).
 *
 * BOTH ARE ALWAYS RENDERED. The server list is the no-JS index (PRD 9.7), the
 * crawl path (PRD 10.4) and the assistive-technology fallback (PRD 5.4.2), so
 * it is never removed from the markup. The island hides it with CSS only once
 * the catalog has actually loaded — if that fetch fails, the static list simply
 * stays, which is the correct degraded state rather than an error screen.
 *
 * Deep-linked filter URLs (`/projects?role=…`) therefore still serve the full
 * paginated index to a crawler, which is exactly what PRD 10.4's
 * "noindex,follow unless curated" model expects to find there.
 */
export default function Page() {
  return (
    <>
      {/* Outside #static-index deliberately: it must survive the island
          hiding that container, or the archive loses its only h1. */}
      <h1>Project atlas</h1>
      <CatalogIsland />
      <div id="static-index">
        <ProjectsIndex page={1} />
      </div>
    </>
  );
}
