import {
  PROJECTS_PER_PAGE,
  getIndexPage,
  getIndexedProjects,
  getPublishedProjects,
  getTrackSummaries,
  totalIndexPages,
} from "../../lib/content";

/**
 * Paginated project index.
 *
 * Authority: PRD 9.7 ("Without JavaScript: ... a paginated project index
 * remain[s] usable"), 10.4 ("The archive is not the crawl boundary. Search
 * engines and non-JavaScript clients reach every public project through
 * paginated indexes and sitemaps"), 5.4.2 (a paginated semantic-list fallback
 * of 50 projects per page).
 *
 * One implementation serves all three requirements. PRD 6.1 describes
 * /projects as "static shell + client catalog engine", so Phase 3 layers search
 * and filtering on top of this markup as progressive enhancement — it does not
 * replace the route. Anything Phase 3 adds must leave this list working when
 * scripting is off.
 */
/**
 * Which page numbers to link: first, last, and a window around the current one.
 *
 * Linking every page is fine at 240 records (5 pages) and indefensible at
 * 10,000 (200 pages): the 10,000-record soak measured the archive at 1,144 DOM
 * elements against DOM-ARCHIVE-STEADY's 1,000, and roughly 350 of those were
 * pagination links — still counted while the client catalog hides them, and a
 * miserable thing to tab through besides.
 *
 * Every page stays REACHABLE, which is what PRD 10.4 needs from the crawl
 * path: consecutive pages link to each other, so a crawler walking next-links
 * still reaches all of them. Only the all-at-once list is gone.
 */
export function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);

  const keep = new Set<number>([1, total]);
  for (let n = current - 2; n <= current + 2; n += 1) {
    if (n >= 1 && n <= total) keep.add(n);
  }

  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (previous !== 0 && n - previous > 1) out.push("gap");
    out.push(n);
    previous = n;
  }
  return out;
}

export function ProjectsIndex({ page }: { page: number }) {
  const projects = getIndexPage(page);
  const total = getIndexedProjects().length;
  const pages = totalIndexPages();
  const published = getPublishedProjects().length;
  const tracks = getTrackSummaries();

  const start = (page - 1) * PROJECTS_PER_PAGE + 1;
  const end = start + projects.length - 1;

  /**
   * No <h1> here.
   *
   * On /projects this component renders inside the container the client
   * catalog island hides once it loads, so an h1 in here would disappear along
   * with it and leave the archive with no visible top-level heading at all —
   * a PRD 10.1 violation that an axe scan of the exported HTML cannot see,
   * because it only happens after hydration. The heading is owned by each
   * route instead.
   */
  return (
    <>
      {total > 0 ? (
        <>
          {/* "Catalog entries", not "published projects". Nearly all of these
              are planned work: calling them published would be the fabrication
              PRD 12.2 forbids, and the two counts are shown separately so they
              can never be read as one number. */}
          <p className="lede">
            {total} catalog {total === 1 ? "entry" : "entries"}
            {pages > 1 ? ` · showing ${start}–${end}` : ""}.{" "}
            {published === 0
              ? "None are published yet — every entry below is planned work."
              : `${published} published so far.`}
          </p>

          {/* A plain semantic list. aria-label carries the range so a screen
              reader user knows their position without counting. */}
          <ul
            className="project-list"
            aria-label={`Projects ${start} to ${end} of ${total}`}
          >
            {projects.map((project) => (
              <li key={project.id} className="project-row">
                <h2>
                  <a href={`/projects/${project.slug}`}>{project.title}</a>
                </h2>
                <p>{project.tagline ?? project.summary}</p>
                <ul className="meta">
                  <li className="project-id">{project.id}</li>
                  <li>{project.status}</li>
                  <li>{project.proofLevel}</li>
                  <li>{project.roles.join(", ")}</li>
                </ul>
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <nav aria-label="Project index pages">
              <ul className="pagination">
                {pageWindow(page, pages).map((n, i) =>
                  n === "gap" ? (
                    <li key={`gap-${i}`} aria-hidden="true" className="muted">
                      …
                    </li>
                  ) : (
                    <li key={n}>
                      <a
                        href={n === 1 ? "/projects" : `/projects/page/${n}`}
                        aria-current={n === page ? "page" : undefined}
                        aria-label={`Page ${n} of ${pages}`}
                      >
                        {n}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            </nav>
          ) : null}
        </>
      ) : (
        /* Empty state. PRD 15 forbids celebrating project count on the first
           screen, and 240 planned records are not an achievement — so this
           shows the STRUCTURE of the work and is explicit that nothing is
           published yet. `planned` is never presented as `done`. */
        <>
          <div className="empty-state">
            <p>
              <strong>No projects are published yet.</strong> Records appear here once they are
              authored and pass the schema&rsquo;s publication gates — evidence, a primary artifact,
              and a review score.
            </p>
            <p className="muted">
              The catalog below is the plan, not a record of completed work.
            </p>
          </div>

          <section className="section" aria-labelledby="tracks-heading">
            <h2 id="tracks-heading">Competency tracks</h2>
            <p className="muted">
              Sixteen tracks organise the work. Each has one keystone case study and fourteen
              focused exhibits.
            </p>
            <ul className="project-list">
              {tracks.map(({ track, total: trackTotal, published: trackPublished }) => (
                <li key={track.id} className="project-row">
                  <h3>{track.label}</h3>
                  <ul className="meta">
                    <li className="project-id">{track.idPrefix}</li>
                    <li>
                      {trackPublished} of {trackTotal} published
                    </li>
                    <li>keystone {track.keystone}</li>
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
