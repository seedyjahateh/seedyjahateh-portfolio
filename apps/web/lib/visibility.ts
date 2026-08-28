/**
 * Visibility routing policy.
 *
 * Authority: PRD 8.2 defines `Visibility = "public" | "unlisted" | "private"`
 * but assigns no behaviour to `unlisted` anywhere in the document. Phase 1
 * specifies it, and ADR 0024 records the reasoning.
 *
 *   public    detail page · in the site atlas · in the sitemap · crawlable
 *   unlisted  detail page · in the site atlas · NOT in the sitemap · noindex
 *   private   no page generated at all
 *
 * "Unlisted" means unlisted from EXTERNAL indexes, not hidden from the site's
 * own atlas. That distinction is what makes the state useful: the atlas is a
 * roadmap the owner can navigate and share, while search engines only ever see
 * work that has cleared PRD 8.3's publication gates (XFD-PUB-001, XFD-PUB-002,
 * SEL-SCORE-*), which fire exclusively at `public`.
 *
 * This is why the seed catalog imports as `unlisted` rather than `private`
 * (ADR 0020). A planned record carries the owner's own title and summary,
 * shows a prominent "planned" banner, claims no result, and is invisible to
 * crawlers — so publishing the roadmap costs nothing in honesty and makes the
 * detail template real rather than theoretical.
 */

import type { ProjectRecord } from "@atlas/contracts/project";

export type RoutedProject = ProjectRecord;

/** Does this record get a statically generated detail page? */
export function hasDetailPage(project: ProjectRecord): boolean {
  return project.visibility === "public" || project.visibility === "unlisted";
}

/** Does this record appear in sitemap.xml? PRD 10.4. */
export function isInSitemap(project: ProjectRecord): boolean {
  return project.visibility === "public";
}

/**
 * Does this record appear in the site's own paginated atlas?
 *
 * Anything with a detail page does. The atlas is internal navigation, and a
 * page nothing links to is a page nobody can review.
 */
export function isInIndex(project: ProjectRecord): boolean {
  return hasDetailPage(project);
}

/**
 * Has this record cleared the publication gates?
 *
 * The stricter set, used wherever the site makes a CLAIM rather than offers
 * navigation: home flagships, the proof bar, and role-page evidence. Planned
 * work belongs in the atlas, never in an evidence section.
 */
export function isPublished(project: ProjectRecord): boolean {
  return project.visibility === "public";
}

/**
 * Should crawlers index this page?
 *
 * PRD 10.4 requires every public project to be reachable and canonical, while
 * unlisted pages must not enter the index. Returned as a robots directive for
 * the route's metadata.
 */
export function robotsFor(project: ProjectRecord): { index: boolean; follow: boolean } {
  return project.visibility === "public"
    ? { index: true, follow: true }
    : { index: false, follow: true };
}

export function filterDetailPages(projects: readonly ProjectRecord[]): ProjectRecord[] {
  return projects.filter(hasDetailPage);
}

export function filterIndexed(projects: readonly ProjectRecord[]): ProjectRecord[] {
  return projects.filter(isInIndex);
}

export function filterPublished(projects: readonly ProjectRecord[]): ProjectRecord[] {
  return projects.filter(isPublished);
}
