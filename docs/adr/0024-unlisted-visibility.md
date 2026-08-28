# ADR 0024 - `unlisted` means unlisted from external indexes

- Status: accepted
- Date: 2026-08-28
- Phase: 1

## Context

PRD 8.2 defines `Visibility = "public" | "unlisted" | "private"` and then never
mentions `unlisted` again. No section assigns it behaviour, so Phase 1 had to
specify it before the routing layer could use it.

Two facts forced the question. All 240 seed records were `private`, meaning zero
detail pages. And `output: "export"` treats an empty `generateStaticParams()` as
a build error (ADR 0021). So `private` for everything was not merely unhelpful -
it did not build.

## Decision

| Visibility | Detail page | Site atlas | Sitemap | Crawlers    |
| ---------- | ----------- | ---------- | ------- | ----------- |
| `public`   | yes         | yes        | yes     | indexed     |
| `unlisted` | yes         | yes        | **no**  | **noindex** |
| `private`  | **no page** | no         | no      | n/a         |

`unlisted` means unlisted from EXTERNAL indexes, not hidden from the site's own
atlas. That is what makes it useful: the atlas becomes a roadmap the owner can
navigate and share by URL, while search engines only ever see work that has
cleared PRD 8.3's publication gates - which fire exclusively at `public`.

The seed catalog therefore imports as `unlisted` (ADR 0020). Honest because each
record carries only the title and summary the owner wrote in the selection
catalog, shows a prominent "planned" banner, asserts no result, and is invisible
to crawlers.

The site keeps two separate queries so this cannot erode: `getIndexedProjects()`
for navigation, `getPublishedProjects()` for anywhere the site makes a claim -
flagships, the proof bar, role-page evidence. Planned work appears in the atlas
and never in an evidence section.

That separation was not theoretical. The first implementation used the atlas
query for the home page and rendered "Browse all 240 published projects", which
was both a PRD 15 violation and false. The export tests caught it.

## Consequences

Easier: the roadmap is browsable and shareable; the detail template is exercised
by 240 real pages instead of being theoretical; the build works.

Harder: two queries to keep straight. Mitigated by tests asserting the home page
never states a catalog count and the atlas never calls planned work published.

## Compressed cost

None to the client. 240 additional static pages, ~2 KB Brotli each, fetched only
if requested.

## Fallback

None needed.

## Removal path

Set the importer default back to `private`. The detail and pagination routes
would then need at least one public record to build.

## Revisit trigger

If unlisted pages ever appear in search results, the noindex directive or the
sitemap filter has regressed - both are covered by tests.
