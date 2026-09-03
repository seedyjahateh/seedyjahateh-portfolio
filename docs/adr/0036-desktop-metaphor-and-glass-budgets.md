# ADR 0036 - The desktop metaphor, liquid glass, and the budgets it moves

- Status: accepted
- Date: 2026-09-03
- Phase: 5

## Context

The Phase 1 stylesheet was never replaced. Its own header says the UI workstream
"owns the visual layer in Phase 4", and Phase 4 shipped grid mechanics without a
visual pass, so the site still ships browser-default link colours, unstyled form
controls and system type. Reviewed directly, it reads as an unstyled document.

The chosen replacement is a macOS-inspired desktop: a wallpaper, a menu bar, a
dock, and draggable windows holding the catalog. That is a deliberate change of
kind, not of degree, and it collides with budgets that were written for a
document-shaped site.

This ADR records what the direction actually costs, which budgets move, which do
not, and why.

## What was investigated first

**The reference repositories are not usable.** The direction was accompanied by
101 repositories under `frontend-joe`. Every one of them carries **no licence** —
confirmed against the GitHub API and by reading the repository roots and READMEs.
A public repository without a licence is all-rights-reserved: GitHub's terms
grant viewing and forking on GitHub, not copying into another project. Nothing
from them is copied.

They would not have supplied much regardless. The catalogue is accordions,
carousels, navbars, sidebars, modals and form controls — general web components.
None of them is a window manager, a dock, or a glass surface. Technique is
studied and reimplemented; that is the whole of the relationship.

**Refraction glass is Chromium-only.** True Liquid Glass refraction uses an SVG
`feDisplacementMap` fed to `backdrop-filter: url(#filter)`. Safari and Firefox
support neither the filter-as-backdrop path nor the pipeline behind it, and
resizing a surface forces a full displacement-map rebuild — which is exactly what
dragging and resizing a window do continuously. Refraction is therefore a
progressive enhancement on static chrome, never the mechanism the design depends
on, and never on a moving surface.

The portable effect is three stacked layers: a frost (`backdrop-filter: blur()
saturate()` over a tint), a rim (inset box-shadows plus a hairline border), and a
sheen (a diagonal gradient). Those work in every current engine.

## The measurement that decides the palette

`A11Y-CONTRAST-TEXT` requires 4.5:1 and is tested at the token level. Translucent
glass has no fixed background: its effective colour is the tint composited over
whatever is behind it, which moves. So the worst case was computed rather than
assumed — minimum tint opacity for 4.5:1:

| Backdrop      | Surface                | Minimum alpha |
| ------------- | ---------------------- | ------------- |
| Unconstrained | white glass, dark text | **0.500**     |
| Unconstrained | dark glass, white text | **0.585**     |
| Our wallpaper | dark glass, white text | **0.000**     |

Over an arbitrary backdrop, glass must be about half opaque to pass — at which
point it is no longer glass. But the wallpaper is ours, built from CSS gradients
whose stops are known: the lightest is `#1E52AE` at a relative luminance of
0.0937. Against a backdrop capped there, **white text on dark glass passes 4.5:1
at any opacity**, including none.

### Correction, found while implementing

The argument above is right about the wallpaper and wrong about what it implies
for the tint, and the implementation is what exposed it.

"Glass is only ever over the wallpaper" holds only while nothing can get between
them. Windows are draggable, so they overlap — a title bar dragged across another
window sits on that window's **opaque, near-white body**, which is the
unconstrained case this ADR set out to avoid. axe found it as a real 3.88:1
failure on the menu bar, not as a tooling artefact.

So the tint is 0.75, not the near-zero the wallpaper cap alone would permit.
Measured over white, the floor is 0.595 for `--glass-text` and 0.730 for
`--glass-text-muted`; 0.75 clears both at 8.0:1 and 5.0:1.

The wallpaper cap still does real work — it bounds how light the backdrop can
get and keeps 0.75 an upper bound rather than a starting point — but it is not
by itself the guarantee. `tests/ui/wallpaper.test.ts` now asserts the stronger
claim: text on glass passes over **any** backdrop, white included.

That fixes three things at once, and they are not stylistic preferences:

1. **Glass is dark and text on it is light.** Light glass would need ~48%
   opacity even over our own wallpaper.
2. **The wallpaper's luminance is capped.** It is a token with a tested ceiling,
   not a picture someone swaps. A photographic wallpaper reintroduces the
   unconstrained case and the effect becomes unprovable.
3. **Glass is chrome only; content is opaque.** A window's body holds the card
   grid on an opaque surface. Glass over another window's light content is the
   unconstrained case again.

## Accessibility requirements this direction creates

**WCAG 2.2 SC 2.5.7 Dragging Movements (AA)** requires that anything operated by
dragging is also achievable with a single pointer without dragging. The
"essential" exemption does not apply: window position can plainly be set another
way. So every window ships snap positions (halves, quarters, centre, fill) from
its title-bar menu, and arrow-key movement when the title bar has focus. Dragging
is the enhancement, not the mechanism.

**WCAG 2.2 SC 2.5.8 Target Size (AA)**, enforced here as `A11Y-TARGET-SIZE: 24`.
Real macOS traffic lights are 12 px on 8 px gaps — 20 px between centres. The
spacing exemption needs 24 px circles not to intersect, so they fail as drawn.
The gap widens to 12 px, putting centres exactly 24 px apart. The budget does not
move; the design does.

**No-JavaScript operation** is a PRD requirement and is not negotiable by raising
a number. It is met by construction: the desktop is an enhancement layered over
the same server-rendered document the site already emits. With JavaScript off the
visitor gets that document — the typographic layout, fully usable. The desktop
never becomes the only navigation.

## Decision

**Adopt the desktop metaphor across every route, with draggable windows, and move
only the budgets it can be shown to cost.**

| Budget                     | From | To  | Why                                                                                                                        |
| -------------------------- | ---- | --- | -------------------------------------------------------------------------------------------------------------------------- |
| `BACKDROP-FILTER-SURFACES` | 2    | 10  | Menu bar and dock are 2 before any window. Three open windows contribute a title bar and a sidebar each, plus one popover. |
| `JS-HOME`                  | 110  | 135 | Home is at 107.7 KB. A window manager with drag, resize, snap, focus order and keyboard operation is ~12 KB brotli.        |

### Two budgets this ADR proposed and then withdrew

A first draft also raised `DOM-HOME` (800 → 1200) and `MEM-JS-HEAP` (75 → 90).
Both were withdrawn after measuring, and the withdrawal is recorded here because
proposing a budget change without evidence is the failure this file exists to
prevent.

- **`DOM-HOME` stays at 800.** The home route measures **101 elements**, 13 % of
  the budget. Desktop furniture does not plausibly consume the remaining 699. The
  raise was reasoning from the size of the change rather than from a number.
- **`MEM-JS-HEAP` stays at 75.** No `check()` for it exists anywhere in the
  repository — `runtime-budgets.perf.spec.ts` reports it through `note()` with an
  explicit comment that a two-minute test does not measure a ten-minute budget.
  Raising it would have changed no assertion and asserted nothing new. It is also
  the wrong instrument: blurred surfaces cost compositor memory, not JS heap.

`DOM-HOME` has a real gap behind it, and raising it would have papered over that
rather than closing it: it is measured by counting opening tags in the exported
`index.html` (`scripts/measure-routes.ts`), so anything the desktop injects after
hydration is invisible to it. The answer is a runtime DOM count for `/`, not a
larger static one.

**Budgets that do not move, and the design absorbs instead:**

`A11Y-CONTRAST-TEXT`, `A11Y-TARGET-SIZE`, `A11Y-AXE-SERIOUS`, `LIGHTHOUSE-A11Y`,
`INP`, `CLS`, `LONG-TASK-CEILING`, `FORCED-LAYOUTS-SCROLL`, `NET-FONTS`,
`CSS-ROUTE`. Every one of these is either an accessibility floor or a
responsiveness ceiling, and a desktop metaphor is precisely the kind of design
that fails them quietly. They stay where they are.

Two consequences follow, and they are requirements rather than advice:

- **Dragging moves a transform, never a layout property**, and the dragged
  window's `backdrop-filter` is dropped for the duration of the gesture and
  restored on release. Blurring a moving surface is what turns a 150 ms `INP`
  budget into a slideshow.
- **Windows are positioned absolutely out of flow**, so opening, closing and
  moving one contributes nothing to `CLS`.

## Consequences

- The budget file changes by **two** values, each with a measured or derived
  reason above. `BACKDROP-FILTER-SURFACES` in particular stops being a near-ban
  and becomes a real ceiling: at 10, a fifth open window breaks the build, which
  is the intended pressure.
- The desktop shell is imported **statically**, not behind `import()`. The
  palette is lazy because it is on-demand; the desktop is the page. A dynamic
  import would land it in a chunk `measure-routes.ts` never counts, which would
  have made the cost invisible rather than smaller — and `JS-HOME` was raised
  precisely so the cost could be carried honestly.
- Refraction is Chromium-only and gated behind `@supports`. Every other engine
  gets frost, rim and sheen, which is the whole visual argument; refraction is a
  bonus, and the design is never checked against a browser that has it.
- The typographic direction is not discarded. It becomes the no-JavaScript
  document and the content inside every window, which is why window bodies are
  opaque.
- A photographic wallpaper is now a contract violation rather than a taste
  question. If one is ever wanted, its luminance must be capped and measured, and
  this ADR revisited.

## What the implementation found

**The revisit trigger fired immediately, and the answer it prescribes worked.**
The home route split into four windows measured **10 of 10** backdrop-filter
surfaces — passing, with nothing left. Four of the ten were the position menus,
which declare a blur even while closed, because `<details>` keeps its children in
the DOM and the budget counts every element that declares a filter whether or not
anyone can see it. Declaring the blur only under `[open]` took home to **6**. No
budget moved; something stopped being kept.

**Glass made the palette slower, in a way worth recording.** `PALETTE-OPEN`
(50 ms) reached 54.6 ms on the desktop against roughly 22 ms before it. The cause
was not the palette: opening it sets `overflow: hidden` to lock scrolling, the
scrollbar disappears, the viewport narrows, and every glass surface on the page
re-composites against a moved backdrop. `scrollbar-gutter: stable` makes the lock
change no layout at all, and the tail fell from 47.3 ms to 35.1 ms across five
runs. Any future chrome that blurs should expect the same class of interaction.

## Revisit trigger

If `BACKDROP-FILTER-SURFACES` needs to exceed 10, the window manager is keeping
too much mounted and should virtualize or unmount background windows rather than
raise the number again.

If Safari ships SVG filters as `backdrop-filter`, refraction moves from
enhancement to baseline and this ADR's Chromium-only note is revisited.
