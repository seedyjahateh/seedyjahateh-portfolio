import type { Metadata } from "next";

import { loadProfile, authored, profileGaps } from "../../lib/profile";

/**
 * Accessible HTML résumé.
 *
 * Authority: PRD 6.1 ("accessible HTML résumé plus versioned PDF link").
 *
 * HTML is the primary artifact and the PDF is a link beside it, not the other
 * way round: a PDF is not reliably accessible, not responsive, and not
 * crawlable, so making it the only form would fail PRD 10.1 and 10.4 at once.
 */

export const metadata: Metadata = {
  title: "Résumé",
  description: "Engineering résumé in accessible HTML, with a versioned PDF alongside.",
  alternates: { canonical: "/resume" },
};

export default function ResumePage() {
  const profile = loadProfile();
  const { resume } = profile;
  const gaps = profileGaps(profile).filter((gap) => gap.field.startsWith("resume"));
  const hasBody =
    resume.experience.length > 0 || resume.education.length > 0 || resume.skills.length > 0;

  return (
    <>
      <h1>Résumé{authored(profile.name) ? ` — ${profile.name}` : ""}</h1>

      {authored(resume.summary) ? <p className="lede">{resume.summary}</p> : null}

      {authored(resume.pdfUrl) ? (
        <ul className="actions">
          <li>
            <a href={resume.pdfUrl} rel="noopener noreferrer">
              Download PDF
            </a>
          </li>
        </ul>
      ) : null}

      {hasBody ? (
        <>
          {resume.experience.length > 0 ? (
            <section className="section" aria-labelledby="experience-heading">
              <h2 id="experience-heading">Experience</h2>
              {resume.experience.map((entry) => (
                <div className="resume-entry" key={`${entry.title}-${entry.organization}`}>
                  <h3>{entry.title}</h3>
                  <p className="muted">
                    {[entry.organization, entry.period].filter((s) => s.length > 0).join(" · ")}
                  </p>
                  {entry.detail.length > 0 ? (
                    <ul>
                      {entry.detail.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {resume.education.length > 0 ? (
            <section className="section" aria-labelledby="education-heading">
              <h2 id="education-heading">Education</h2>
              {resume.education.map((entry) => (
                <div className="resume-entry" key={`${entry.title}-${entry.organization}`}>
                  <h3>{entry.title}</h3>
                  <p className="muted">
                    {[entry.organization, entry.period].filter((s) => s.length > 0).join(" · ")}
                  </p>
                  {entry.detail.length > 0 ? (
                    <ul>
                      {entry.detail.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {resume.skills.length > 0 ? (
            <section className="section" aria-labelledby="skills-heading">
              <h2 id="skills-heading">Skills</h2>
              {/* PRD 3.2 and 15: no proficiency bars or unsupported badges.
                  A skill matrix must map to evidence, which lives on project
                  pages, so this is a plain list. */}
              {resume.skills.map((group) => (
                <div className="resume-entry" key={group.group}>
                  <h3>{group.group}</h3>
                  <ul className="meta">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : null}
        </>
      ) : (
        <div className="empty-state">
          <p>
            <strong>The résumé has not been authored yet.</strong> Its content is personal and
            factual, so it is not generated.
          </p>
          <p className="muted">
            Fill in <code>resume</code> in <code>content/profile.v1.json</code>
            {gaps.length > 0 ? ` (${gaps.map((g) => g.field).join(", ")})` : ""}, then run{" "}
            <code>pnpm profile:verify</code>.
          </p>
        </div>
      )}
    </>
  );
}
