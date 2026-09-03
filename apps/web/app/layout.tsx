import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DesktopStub } from "../components/desktop-stub";
import { PaletteStub } from "../components/palette-stub";
import { SearchForm } from "../components/search-form";
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
 * Everything below works with scripting disabled, which is the Phase 1 exit
 * gate. Phase 3 adds exactly one client component — `PaletteStub`, which
 * renders null and only attaches a keyboard listener. The visible search
 * affordance is `SearchForm`, a server-rendered <form> that GETs /projects?q=…
 * on its own; the stub enhances it rather than replacing it, so the no-JS path
 * is the same markup rather than a parallel implementation.
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
      <head>
        {/*
          The desktop is decided before the first paint, not after hydration.

          It used to be switched on in a `useEffect`, which meant the page
          painted as a plain document and then became a desktop — wallpaper,
          glass, four windows placed out of flow. Measured, that was a
          cumulative layout shift of 0.46 against a 0.05 budget, on every load,
          for two stages. Nothing caught it because the only shift observer
          filtered entries down to `.card__media`.

          Setting the attribute here makes the very first paint the desktop, so
          there is no intermediate state to move away from. It stays a
          progressive enhancement: with scripting off this never runs, no
          attribute is set, and every desktop rule stays inert.

          Kept to one expression and no dependencies deliberately — it runs
          before anything else on the page and must never be the reason a paint
          is delayed. `desktop-shell.ts` still owns the attribute afterwards and
          keeps it in step on resize.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'document.documentElement.dataset.desktopMode=matchMedia("(min-width:900px)").matches?"desktop":"springboard";document.documentElement.dataset.desktopActive="";',
          }}
        />
      </head>
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
                  <a href="/systems">Systems</a>
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
            <SearchForm />
          </div>
        </header>
        <PaletteStub />
        <DesktopStub />

        {/*
          The window frame is rendered here, on the server, and not built by the
          desktop shell at runtime.

          The first attempt had the shell wrap `main` in a window by moving
          nodes. It broke immediately and instructively: React still owns this
          subtree, and when the catalog island re-rendered it called
          `insertBefore` against a sibling that had been moved, threw
          `NotFoundError`, and unmounted the page. Re-parenting React-managed DOM
          is not a thing that can be made to work carefully — so the markup
          exists up front and the shell only ever positions it.

          It costs nothing when the desktop is off: every rule that gives this
          chrome an appearance is gated on `[data-desktop-active]`, so without
          JavaScript it is an unstyled wrapper around the same document.

          The bar carries a `span`, not a heading. `tests/web/export.test.ts`
          asserts one `h1` per route and ordered headings, and an `h2` here would
          sit above the page's own `h1`.
        */}
        {/*
          `main` is the desktop surface, and each page supplies its own windows
          through `WindowFrame`. The layout deliberately does not wrap `children`
          in a window of its own: `/` needs several, and a wrapper here would
          nest them.

          It remains the landmark and the skip-link target either way, which is
          what `tests/web/export.test.ts` and the no-JS suite check. With
          JavaScript off, `.shell` still centres the column and the windows are
          plain sections in document order.
        */}
        <main id="main" className="shell desktop-surface" tabIndex={-1}>
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
                  <a href="/systems">Systems</a>
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
