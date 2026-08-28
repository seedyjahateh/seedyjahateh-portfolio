import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getEvidenceByPath, getEvidenceIndex } from "../../../lib/content";

/**
 * An evidence artifact page.
 *
 * Authority: PRD 6.3 (evidence actions must be plain, inspectable links, never
 * hover-only or modal-only), 8.3 (a public project needs a primary evidence
 * item), 10.4 (canonical metadata).
 *
 * A catch-all segment, because evidence URLs are namespaced per project —
 * `/evidence/berea-rides/route-overlap` — and that shape comes from the
 * manifests rather than from a route convention. `generateStaticParams` derives
 * the list from whatever the records actually cite, so a project cannot link to
 * an artifact that has no page: the link-integrity test would fail the build.
 *
 * The BODY of an artifact is authored prose that lives in the manifest's
 * evidence entry. This route renders the record and its context; it does not
 * generate analysis, because a design document that nobody wrote is exactly the
 * fabricated evidence PRD 12.2 forbids.
 */

export function generateStaticParams(): { slug: string[] }[] {
  return getEvidenceIndex().map((item) => ({
    // "/evidence/a/b" -> ["a", "b"]
    slug: item.url.replace(/^\/evidence\//, "").split("/"),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = getEvidenceByPath(slug);
  if (item === null) return { title: "Artifact not found" };

  return {
    title: item.title,
    description: `${item.type} — evidence for ${item.projectTitle}.`,
    alternates: { canonical: item.url },
    // An artifact is indexable only when the project citing it is public.
    robots: item.projectIsPublic ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function EvidencePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const item = getEvidenceByPath(slug);
  if (item === null) notFound();

  return (
    <article>
      <p className="project-id">{item.type}</p>
      <h1>{item.title}</h1>

      <ul className="meta">
        <li>
          <strong>Project:</strong>{" "}
          <a href={`/projects/${item.projectSlug}`}>{item.projectTitle}</a>
        </li>
        {item.verifiedAt === null ? null : (
          <li>
            <strong>Verified:</strong> {item.verifiedAt}
          </li>
        )}
        {item.external ? <li>Externally validated</li> : null}
      </ul>

      {item.body === null ? (
        <div className="status-banner">
          <p>
            <strong>This artifact has not been written up yet.</strong> The project cites it, so the
            page exists and the link resolves — but the content is still to be authored.
          </p>
          <p className="muted">
            Write it at{" "}
            <code>
              content/evidence/{item.projectId}/{item.id}.txt
            </code>
            .
          </p>
        </div>
      ) : (
        item.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)
      )}

      <p className="section">
        <a href="/systems">← All artifacts</a>
      </p>
    </article>
  );
}
