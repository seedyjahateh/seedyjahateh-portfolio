import { WindowFrame } from "../components/window-frame";
import { getProjectsForRole } from "../lib/content";
import { loadProfile, authored } from "../lib/profile";
import type { RoleLens } from "../lib/site";

/**
 * Shared role-lens template.
 *
 * Authority: PRD 6.1 ("role-specific proof ordering and résumé narrative"),
 * 6.4 recruiter journey ("landing → select role or inspect flagship → scan
 * claim/proof → open résumé/source/contact. No mandatory command palette or
 * filters.").
 *
 * That last sentence is the constraint: this page must be complete on its own,
 * with no search, no filters, and no client JavaScript. It is a document.
 *
 * The three routes each import this with their own lens rather than sharing a
 * `[role]` dynamic segment, because PRD 6.1 gives each a distinct narrative and
 * a dynamic segment would quietly encourage one generic page for all three.
 */
export function RolePage({ lens }: { lens: RoleLens }) {
  const profile = loadProfile();
  const projects = getProjectsForRole(lens.id);

  return (
    <WindowFrame id="role" title={lens.label} titleAs="span">
      <h1>{lens.label}</h1>
      <p className="lede">{lens.proves}</p>
      <p className="muted">{lens.summary}</p>

      <ul className="actions">
        <li>
          <a href="/resume">Résumé</a>
        </li>
        <li>
          <a href="/contact">Contact</a>
        </li>
        {profile.links
          .filter((link) => link.primary && authored(link.url))
          .map((link) => (
            <li key={link.url}>
              <a href={link.url} rel="noopener noreferrer">
                {link.label}
              </a>
            </li>
          ))}
      </ul>

      <section className="section" aria-labelledby="proof-order-heading">
        <h2 id="proof-order-heading">Evidence for this role</h2>
        {projects.length > 0 ? (
          <>
            <p className="muted">
              Ordered by proof strength: externally validated first, then measured, then live, then
              source-available.
            </p>
            <ul className="project-list">
              {projects.map((project) => (
                <li key={project.id} className="project-row">
                  <h3>
                    <a href={`/projects/${project.slug}`}>{project.title}</a>
                  </h3>
                  <p>{project.tagline ?? project.summary}</p>
                  <ul className="meta">
                    <li className="project-id">{project.id}</li>
                    <li>{project.proofLevel}</li>
                    <li>{project.status}</li>
                  </ul>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="empty-state">
            <p>
              <strong>No published work under this lens yet.</strong> Projects appear here once they
              are authored and promoted past the schema&rsquo;s publication gates.
            </p>
            <p className="muted">
              The roadmap for this role is visible in the{" "}
              <a href="/projects">project atlas</a>.
            </p>
          </div>
        )}
      </section>
    </WindowFrame>
  );
}
