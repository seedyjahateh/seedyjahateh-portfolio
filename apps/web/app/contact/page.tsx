import type { Metadata } from "next";

import { WindowFrame } from "../../components/window-frame";
import { loadProfile, authored } from "../../lib/profile";

/**
 * Contact.
 *
 * Authority: PRD 6.1 ("low-friction contact paths and availability; static; no
 * third-party form dependency required"), 10.2 ("Contact links must not expose
 * private addresses unnecessarily or depend on a client secret").
 *
 * So: no form, no third-party widget, no client JavaScript. Direct links only.
 * A form would need a runtime endpoint, which PRD 8 rules out for v1, and an
 * embedded third-party form would add a script that executes before consent
 * (PRD 9.4) and a data processor nobody reviewed (PRD 10.3).
 *
 * The email address is rendered only if the owner authored it. Publishing a
 * personal address is their decision, so there is no default and no fallback.
 */

export const metadata: Metadata = {
  title: "Contact",
  description: "Direct contact paths. No forms, no third-party scripts.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const profile = loadProfile();
  const methods = profile.contact.methods.filter((m) => authored(m.url));
  const links = profile.links.filter((l) => authored(l.url));
  const hasEmail = authored(profile.contact.email);
  const hasAnything = hasEmail || methods.length > 0 || links.length > 0;

  return (
    <WindowFrame id="contact" title="Contact" titleAs="span">
      <h1>Contact</h1>

      {authored(profile.availability) ? <p className="lede">{profile.availability}</p> : null}
      {authored(profile.contact.note) ? <p>{profile.contact.note}</p> : null}

      {hasAnything ? (
        <ul className="actions">
          {hasEmail ? (
            <li>
              <a href={`mailto:${profile.contact.email}`}>Email {profile.contact.email}</a>
            </li>
          ) : null}
          {methods.map((method) => (
            <li key={method.url}>
              <a href={method.url} rel="noopener noreferrer">
                {method.label}
              </a>
            </li>
          ))}
          {links.map((link) => (
            <li key={`link-${link.url}`}>
              <a href={link.url} rel="noopener noreferrer">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <p>
            <strong>No contact paths are published yet.</strong> Whether to put an address on a
            public page is the site owner&rsquo;s decision, so nothing is filled in by default.
          </p>
          <p className="muted">
            Add <code>contact.email</code> or entries under <code>contact.methods</code> in{" "}
            <code>content/profile.v1.json</code>.
          </p>
        </div>
      )}

      {authored(profile.location) ? <p className="muted">Based in {profile.location}.</p> : null}
    </WindowFrame>
  );
}
