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
export function ProjectsIndex({ page }: { page: number }) {
  const projects = getIndexPage(page);
  const total = getIndexedProjects().length;
  const pages = totalIndexPages();
  const published = getPublishedProjects().length;
  const tracks = getTrackSummaries();

  const start = (page - 1) * PROJECTS_PER_PAGE + 1;
  const end = start + projects.length - 1;

  return (
    <>
      <h1>Project atlas</h1>

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
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <li key={n}>
                    <a
                      href={n === 1 ? "/projects" : `/projects/page/${n}`}
                      aria-current={n === page ? "page" : undefined}
                      aria-label={`Page ${n} of ${pages}`}
                    >
                      {n}
                    </a>
                  </li>
                ))}
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
