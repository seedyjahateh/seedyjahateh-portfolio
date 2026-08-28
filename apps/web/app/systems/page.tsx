import type { Metadata } from "next";

import { getEvidenceIndex, getRoutedProjects } from "../../lib/content";

/**
 * Systems — the engineering-evidence index.
 *
 * Authority: PRD 6.1 (`/systems` is the "architecture, benchmarks, SRE,
 * security, and system-design artifacts" index), 6.3 (a project page must
 * expose measured evidence and consequential decisions), 8.3 (a public project
 * needs a primary evidence item).
 *
 * WHY THIS ROUTE EXISTS AT ALL. Evidence is what separates this site from a
 * list of project names, and PRD 8.3 will not let a project reach `public`
 * without a primary artifact. For work whose source is private — a commercial
 * product, a startup — the artifact cannot be a repository link. It has to be a
 * design document, an architecture diagram, a decision record, or a recorded
 * demo: things that show engineering judgement without disclosing the code.
 *
 * Those artifacts need somewhere to live, and until this route existed they had
 * nowhere. The link-integrity test proved it: adding a real evidence URL to a
 * project produced `projects/... -> /evidence/... (broken internal link)`.
 */

export const metadata: Metadata = {
  title: "Systems",
  description:
    "Architecture, design decisions, benchmarks, and reliability artifacts behind the projects.",
  alternates: { canonical: "/systems" },
};

export default function SystemsPage() {
  const evidence = getEvidenceIndex();
  const projects = getRoutedProjects();

  return (
    <>
      <h1>Systems</h1>
      <p className="lede">
        The architecture notes, decision records, benchmarks, and reliability artifacts behind the
        projects — the working out, not the summary.
      </p>

      {evidence.length > 0 ? (
        <section className="section" aria-labelledby="artifacts-heading">
          <h2 id="artifacts-heading">Artifacts</h2>
          <ul className="project-list">
            {evidence.map((item) => (
              <li key={`${item.projectId}-${item.id}`} className="project-row">
                <h3>
                  <a href={item.url}>{item.title}</a>
                </h3>
                <ul className="meta">
                  <li>{item.type}</li>
                  <li>
                    <a href={`/projects/${item.projectSlug}`}>{item.projectTitle}</a>
                  </li>
                  {item.external ? <li>externally validated</li> : null}
                  {item.verifiedAt === null ? null : <li>verified {item.verifiedAt}</li>}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="empty-state">
          <p>
            <strong>No artifacts published yet.</strong> This page collects the design documents,
            architecture notes, decision records, and benchmarks that projects cite as evidence.
          </p>
          <p className="muted">
            It fills up as projects are written up. A project cannot reach the published state
            without at least one artifact here or elsewhere — that gate is in the schema, not in an
            editor&rsquo;s judgement.
          </p>
        </div>
      )}

      <section className="section" aria-labelledby="projects-heading">
        <h2 id="projects-heading">Projects awaiting evidence</h2>
        <p className="muted">
          {projects.length} {projects.length === 1 ? "project" : "projects"} in the catalog. Those
          without an artifact stay unlisted.
        </p>
        <p>
          <a href="/projects">Browse the project atlas</a>
        </p>
      </section>
    </>
  );
}
