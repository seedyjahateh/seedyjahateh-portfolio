import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WindowFrame } from "../../../components/window-frame";
import { getProjectBySlug, getRoutedProjects } from "../../../lib/content";
import { robotsFor } from "../../../lib/visibility";

/**
 * Project detail — the canonical URL for a project.
 *
 * Authority: PRD 0.3 ("Dedicated project URLs are mandatory ... canonical for
 * deep links, search engines, accessibility, sharing, and browser history"),
 * 6.3 (the required section order), 10.4 (canonical metadata).
 *
 * PRD 6.3 fixes the ORDER of ten sections. It does not require every section to
 * be present — most describe evidence that a given project may not have. So the
 * template renders sections that have content, in the mandated order, and omits
 * the rest. An empty "Measured evidence" heading would imply measurement that
 * did not happen.
 *
 * PRD 6.3 also forbids hiding core evidence "in hover-only interactions,
 * carousels, or modal-only media". Every action below is a plain link in the
 * document flow, which is also what makes the page work without JavaScript.
 *
 * TODAY THIS GENERATES ZERO PAGES. Every seed record is `private`, so
 * generateStaticParams returns an empty list. That is correct behaviour, not a
 * failure: see ADR 0020 and ADR 0024.
 */

/**
 * Detail pages are capped during a fixture build.
 *
 * `ATLAS_FIXTURE` means "this build exists to measure the archive at scale".
 * The runtime budget harness only ever loads /projects — mounted rows, DOM
 * count, filter timing, search timing and long tasks are all properties of that
 * one route — and generating 1,300 synthetic detail pages added roughly eleven
 * minutes to a build that needs none of them.
 *
 * What the harness measures is unaffected: catalog-core, facets, facet-bits and
 * the search index come from `catalog:build` and are byte-identical either way.
 * The only difference is that some rows link to pages the fixture build did not
 * emit, so a link-integrity check must never be run against one.
 */
const FIXTURE_DETAIL_PAGES = 25;

export function generateStaticParams(): { slug: string }[] {
  const routed = getRoutedProjects().map((project) => ({ slug: project.slug }));
  return process.env["ATLAS_FIXTURE"] === undefined
    ? routed
    : routed.slice(0, FIXTURE_DETAIL_PAGES);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (project === null) return { title: "Project not found" };

  return {
    title: project.title,
    description: project.tagline ?? project.summary,
    alternates: { canonical: project.links.canonical },
    robots: robotsFor(project),
    openGraph: {
      type: "article",
      title: project.title,
      description: project.tagline ?? project.summary,
      url: project.links.canonical,
    },
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (project === null) notFound();

  const primaryEvidence = project.evidence.filter((item) => item.primary);
  const otherEvidence = project.evidence.filter((item) => !item.primary);
  const hasActions =
    project.links.live != null || project.links.source != null || project.links.caseStudy != null;
  const isUnfinished = project.status === "planned" || project.status === "in-progress";

  return (
    <WindowFrame id="project" title={project.title} titleAs="span">
      <article>
      {/* PRD 6.3, section 1: claim, status, role relevance, proof level, and
          the engineer's responsibility. */}
      <p className="project-id">{project.id}</p>
      <h1>{project.title}</h1>
      {project.tagline == null ? null : <p className="lede">{project.tagline}</p>}
      <p>{project.summary}</p>

      <ul className="meta">
        <li>
          <strong>Status:</strong> {project.status}
        </li>
        <li>
          <strong>Proof:</strong> {project.proofLevel}
        </li>
        <li>
          <strong>Tier:</strong> {project.tier}
        </li>
        <li>
          <strong>Roles:</strong> {project.roles.join(", ")}
        </li>
      </ul>

      {isUnfinished ? (
        <div className="status-banner">
          <p>
            <strong>
              This project is {project.status === "planned" ? "planned" : "in progress"}.
            </strong>{" "}
            It is published for transparency about what is being built. Nothing on this page claims
            a result that has been measured.
          </p>
        </div>
      ) : null}

      {/* Media, with intrinsic dimensions always present.
          PRD 9.3 budgets zero layout shift from project media, and MED-DIM-001
          makes width and height mandatory precisely so the box can be reserved
          before the bytes arrive. A plain <picture> rather than next/image:
          static export has no image optimizer, and the derivatives were already
          produced at build time by the media pipeline (ADR 0016). */}
      {project.media.card == null ? null : (
        <figure className="project-media">
          <picture>
            {project.media.card.fallbackSrc == null ? null : (
              <source srcSet={project.media.card.src} type="image/avif" />
            )}
            {/* A plain <img>, not next/image: static export ships no image
                optimizer, and the responsive derivatives already exist. */}
            <img
              src={project.media.card.fallbackSrc ?? project.media.card.src}
              alt={project.media.card.alt}
              width={project.media.card.width}
              height={project.media.card.height}
              loading="lazy"
              decoding="async"
            />
          </picture>
        </figure>
      )}

      {project.ownership.responsibilities.length > 0 ? (
        <section className="section" aria-labelledby="responsibility-heading">
          <h2 id="responsibility-heading">My responsibility</h2>
          <p className="muted">Ownership: {project.ownership.kind}</p>
          <ul>
            {project.ownership.responsibilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* PRD 6.3, section 2: demo, source, case study, primary evidence.
          Plain links in flow — never hover-only or modal-only. */}
      {hasActions || primaryEvidence.length > 0 ? (
        <section className="section" aria-labelledby="actions-heading">
          <h2 id="actions-heading">Inspect it</h2>
          <ul className="actions">
            {project.links.live == null ? null : (
              <li>
                <a href={project.links.live} rel="noopener noreferrer">
                  Live system
                </a>
              </li>
            )}
            {project.links.source == null ? null : (
              <li>
                <a href={project.links.source} rel="noopener noreferrer">
                  Source
                </a>
              </li>
            )}
            {project.links.caseStudy == null ? null : (
              <li>
                <a href={project.links.caseStudy}>Case study</a>
              </li>
            )}
            {primaryEvidence.map((item) => (
              <li key={item.id}>
                <a href={item.url}>{item.title}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* PRD 6.3, section 3: problem, user, constraints, non-goals, boundary. */}
      {project.content.problem == null ? null : (
        <section className="section" aria-labelledby="problem-heading">
          <h2 id="problem-heading">Problem</h2>
          <p>{project.content.problem}</p>
          {project.content.hardestProblem == null ? null : (
            <>
              <h3>Hardest part</h3>
              <p>{project.content.hardestProblem}</p>
            </>
          )}
        </section>
      )}

      {/* PRD 6.3, section 4: architecture and data flow. */}
      {project.architecture == null ? null : (
        <section className="section" aria-labelledby="architecture-heading">
          <h2 id="architecture-heading">Architecture</h2>
          <p className="muted">Style: {project.architecture.style}</p>
          {project.architecture.components.length > 0 ? (
            <>
              <h3>Components</h3>
              <ul>
                {project.architecture.components.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
          {project.architecture.diagramUrl == null ? null : (
            <p>
              <a href={project.architecture.diagramUrl}>Architecture diagram</a>
            </p>
          )}
        </section>
      )}

      {/* PRD 6.3, section 6: measured evidence WITH environment and date.
          The environment and measurement date are rendered next to every
          number, because PRD 0.10 makes an unlabelled metric a defect. */}
      {project.metrics.length > 0 ? (
        <section className="section" aria-labelledby="metrics-heading">
          <h2 id="metrics-heading">Measured evidence</h2>
          <ul className="project-list">
            {project.metrics.map((metric) => (
              <li key={metric.id} className="project-row">
                <h3>
                  {metric.label}: {metric.value} {metric.unit}
                  {metric.synthetic ? " (synthetic)" : ""}
                </h3>
                <p>{metric.environment}</p>
                <ul className="meta">
                  <li>Measured {metric.measuredAt.slice(0, 10)}</li>
                  {metric.sampleSize == null ? null : <li>n = {metric.sampleSize}</li>}
                  <li>
                    <a href={metric.evidenceUrl}>Evidence</a>
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* PRD 6.3, section 7: reliability, security, accessibility, testing. */}
      {otherEvidence.length > 0 ? (
        <section className="section" aria-labelledby="evidence-heading">
          <h2 id="evidence-heading">Supporting evidence</h2>
          <ul className="project-list">
            {otherEvidence.map((item) => (
              <li key={item.id} className="project-row">
                <h3>
                  <a href={item.url}>{item.title}</a>
                </h3>
                <ul className="meta">
                  <li>{item.type}</li>
                  {item.external ? <li>externally validated</li> : null}
                  {item.verifiedAt == null ? null : <li>verified {item.verifiedAt}</li>}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* PRD 6.3, section 9: limitations and next scale threshold. */}
      {project.content.limitations.length > 0 ? (
        <section className="section" aria-labelledby="limitations-heading">
          <h2 id="limitations-heading">Limitations</h2>
          <ul>
            {project.content.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Stack last: it is context, not proof (PRD 5.1.4, 15). */}
      {project.stack.languages.length > 0 || project.stack.frameworks.length > 0 ? (
        <section className="section" aria-labelledby="stack-heading">
          <h2 id="stack-heading">Stack</h2>
          <ul className="meta">
            {[
              ...project.stack.languages,
              ...project.stack.frameworks,
              ...project.stack.data,
              ...project.stack.infrastructure,
              ...project.stack.ai,
              ...project.stack.testing,
            ].map((tech) => (
              <li key={tech}>{tech}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="section">
        <a href="/projects">← All projects</a>
      </p>
      </article>
    </WindowFrame>
  );
}
