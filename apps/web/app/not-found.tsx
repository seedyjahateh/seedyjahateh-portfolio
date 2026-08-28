import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/**
 * 404. PRD 9.7 requires degraded paths to stay usable, so this offers the
 * routes a lost visitor most likely wanted rather than a dead end.
 */
export default function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p className="lede">That URL does not match a page on this site.</p>
      <ul className="actions">
        <li>
          <a href="/">Home</a>
        </li>
        <li>
          <a href="/projects">Project atlas</a>
        </li>
        <li>
          <a href="/resume">Résumé</a>
        </li>
        <li>
          <a href="/contact">Contact</a>
        </li>
      </ul>
    </>
  );
}