import type { Metadata } from "next";

import { WindowFrame } from "../components/window-frame";
import { getFlagships, getProofCounts, proofBarIsEmpty } from "../lib/content";
import { loadProfile, authored } from "../lib/profile";
import { ROLE_LENSES } from "../lib/site";

/**
 * Home page.
 *
 * Authority: PRD 6.2, which fixes the hierarchy:
 *   1 positioning sentence · 2 three role lenses · 3 five flagship proofs
 *   4 compact proof bar · 5 entry to the atlas · 6 résumé/GitHub/contact
 *
 * PRD 6.2 also states what this page is NOT: "The home page is not the
 * 1,300-project archive", and PRD 15 adds "Do not celebrate project count on
 * the first screen." Both matter more than usual right now, because the
 * catalog currently holds 240 planned records and nothing else. Leading with
 * that number would be the exact failure PRD 14 calls credibility skepticism.
 */

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  const profile = loadProfile();
  const flagships = getFlagships();
  const counts = getProofCounts();
  const showProofBar = !proofBarIsEmpty(counts);

  return (
    <>
      {/*
        The home route is the one place with several windows, because it is the
        one page whose content is genuinely several documents. Every other route
        is a single article and splitting it would be decoration.

        `titleAs="span"` here and nowhere else: this window holds the page's h1,
        and an h2 above it would read as though the page were nested inside the
        window. export.test.ts only forbids SKIPPING levels, so nothing but this
        choice prevents it.
      */}
      <WindowFrame id="profile" title="Profile" titleAs="span">
        {/* PRD 6.2 item 1. Rendered only when authored - an invented positioning
            sentence would be a claim about a person (PRD 12.2). */}
        <h1>{authored(profile.name) ? profile.name : "Engineering archive"}</h1>

      {authored(profile.positioning) ? (
        <p className="lede">{profile.positioning}</p>
      ) : (
        <div className="empty-state">
          <p>
            <strong>The positioning sentence has not been written yet.</strong> PRD §6.2 asks for
            one sentence naming the three target roles and the engineering specialization.
          </p>
          <p className="muted">
            Add it as <code>positioning</code> in <code>content/profile.v1.json</code>, then run{" "}
            <code>pnpm profile:verify</code>.
          </p>
        </div>
      )}

        {authored(profile.availability) ? <p>{profile.availability}</p> : null}
      </WindowFrame>

      {/* PRD 6.2 item 2. */}
      <WindowFrame id="roles" title="Role lenses">
        <p className="muted">
          The same work, ordered and narrated for the role you are hiring for.
        </p>
        <ul className="role-lenses">
          {ROLE_LENSES.map((lens) => (
            <li key={lens.slug} className="role-lens">
              <h3>
                <a href={`/${lens.slug}`}>{lens.label}</a>
              </h3>
              <p>{lens.summary}</p>
            </li>
          ))}
        </ul>
      </WindowFrame>

      {/* PRD 6.2 item 3: five flagship proofs, each with one hard claim and one
          evidence action. There is no honest way to render this without
          measured evidence, so the empty state says so plainly rather than
          showing placeholder cards. */}
      <WindowFrame id="flagships" title="Flagship systems" span="half">
        {flagships.length > 0 ? (
          <ul className="project-list">
            {flagships.map((project) => (
              <li key={project.id} className="project-row">
                <h3>
                  <a href={`/projects/${project.slug}`}>{project.title}</a>
                </h3>
                {project.tagline == null ? null : <p>{project.tagline}</p>}
                <ul className="meta">
                  <li className="project-id">{project.id}</li>
                  <li>{project.proofLevel}</li>
                  {project.evidence
                    .filter((item) => item.primary)
                    .map((item) => (
                      <li key={item.id}>
                        <a href={item.url}>{item.title}</a>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <p>
              <strong>No flagship systems yet.</strong> A project reaches this section only once it
              is measured or externally validated, carries real evidence, and has been reviewed —
              the rules are in the schema, not in an editor&rsquo;s judgement.
            </p>
            <p className="muted">
              Until then this space stays empty on purpose. Inventing entries here would assert
              something no evidence supports.
            </p>
          </div>
        )}
      </WindowFrame>

      {/* PRD 6.2 item 4. Omitted entirely while every count is zero: a row of
          zeroes is a worse first impression than no row at all, and it invites
          exactly the skepticism PRD 14 warns about. */}
      {showProofBar ? (
        <WindowFrame id="proof" title="Evidence" span="half">
          <dl className="proof-bar">
            <div>
              <dt>Production systems</dt>
              <dd>{counts.productionSystems}</dd>
            </div>
            <div>
              <dt>Measured reports</dt>
              <dd>{counts.measuredReports}</dd>
            </div>
            <div>
              <dt>Accepted contributions</dt>
              <dd>{counts.acceptedContributions}</dd>
            </div>
            <div>
              <dt>Reliability artifacts</dt>
              <dd>{counts.reliabilityArtifacts}</dd>
            </div>
            <div>
              <dt>Security &amp; accessibility</dt>
              <dd>{counts.securityAndAccessibility}</dd>
            </div>
          </dl>
        </WindowFrame>
      ) : null}

      {/* PRD 6.2 item 5. The command palette arrives in Phase 3; linking to a
          shortcut that does nothing would be worse than not mentioning it.

          No count here, deliberately. PRD 15: "Do not celebrate project count
          on the first screen." The catalog size is an archive property, not the
          value proposition — and while the catalog is mostly roadmap, a number
          would read as a claim about finished work. */}
      <WindowFrame id="atlas" title="Project atlas" span="half">
        <p>
          <a href="/projects">Browse the project atlas</a> — the sixteen competency tracks the work
          is organised around.
        </p>
      </WindowFrame>
    </>
  );
}
