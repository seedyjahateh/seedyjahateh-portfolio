# Design source

These are the artboards the visual layer is built from, and they are tracked
for one specific reason: `apps/web/app/globals.css` cites them.

> Cool neutrals and an ink accent: the technical-document direction, drawn on
> page 2 of the design canvas.

A citation whose source lives only on one machine is not a citation. Anyone
reviewing the palette, the type scale or the desktop chrome should be able to
open the thing the decision was made against, the same way `docs/adr/` makes the
technical decisions checkable.

| File | What it is |
| --- | --- |
| `canvas.json` | The canvas manifest: which artboard is on which page. |
| `Main.dc.html` | Home — profile, role lenses, flagship, atlas entry. |
| `Projects.dc.html` | The archive: controls, grid, facets. |
| `Archive.dc.html`, `ArchiveDark.dc.html` | The archive in both themes. Page 2 is the technical-document direction the palette follows. |
| `Detail.dc.html` | A project detail route. |
| `project-atlas-identity.html` | The identity document: palette, type, spacing, the desktop chrome. Self-contained — the fonts are embedded, which is why it is 2.5 MB. |

They are exports, not sources: edit them in the design tool and re-export.
Nothing in the build reads this directory, and nothing should — the stylesheet
is the implementation, and these are what it answers to.
