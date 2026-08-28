import type { Metadata } from "next";
import type { ReactNode } from "react";

import { loadProfile, authored } from "../lib/profile";
import { SITE_NAME, SITE_URL } from "../lib/site";

import "./globals.css";

/**
 * Root layout.
 *
 * Authority: PRD 10.1 (one h1, ordered headings, semantic landmarks, skip
 * links, descriptive link text), 6.2 item 6 (résumé, GitHub and contact
 * reachable without scrolling and present in the mobile header).
 *
 * This is a server component with no client JavaScript. Everything below works
 * with scripting disabled, which is the Phase 1 exit gate.
 */

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description:
    "An engineering archive: role positioning, project case studies, and the evidence behind each claim.",
  // PRD 10.4: canonical URLs on every route.
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE_NAME, url: SITE_URL },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const profile = loadProfile();
  const displayName = authored(profile.name) ? profile.name : SITE_NAME;

  // PRD 6.2 item 6: these must be reachable without scrolling, and they are the
  // recruiter's exit paths, so they live in the header on every route.
  const headerLinks = profile.links.filter((link) => link.primary && authored(link.url));

  return (
    <html lang="en">
      <body>
        {/* First focusable element on the page (PRD 10.1). */}
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        <header className="site-header">
          <div className="shell site-header__inner">
            <a className="site-header__name" href="/">
              {displayName}
            </a>
            <nav className="site-nav" aria-label="Primary">
              <ul>
                <li>
                  <a href="/projects">Projects</a>
                </li>
                <li>
                  <a href="/ai-engineer">AI</a>
                </li>
                <li>
                  <a href="/backend-engineer">Backend</a>
                </li>
                <li>
                  <a href="/full-stack-engineer">Full stack</a>
                </li>
                <li>
                  <a href="/resume">Résumé</a>
                </li>
                <li>
                  <a href="/contact">Contact</a>
                </li>
                {headerLinks.map((link) => (
                  <li key={link.url}>
                    <a href={link.url} rel="noopener noreferrer">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>

        {/* Landmark + skip-link target. Each page supplies its own single h1. */}
        <main id="main" className="shell" tabIndex={-1}>
          {children}
        </main>

        <footer className="site-footer">
          <div className="shell">
            <nav aria-label="Footer">
              <ul>
                <li>
                  <a href="/projects">All projects</a>
                </li>
                <li>
                  <a href="/resume">Résumé</a>
                </li>
                <li>
                  <a href="/contact">Contact</a>
                </li>
                {profile.links
                  .filter((link) => authored(link.url))
                  .map((link) => (
                    <li key={`footer-${link.url}`}>
                      <a href={link.url} rel="noopener noreferrer">
                        {link.label}
                      </a>
                    </li>
                  ))}
              </ul>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
