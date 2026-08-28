# ADR 0013 - Three.js deferred to Phase 6 with a deletion path

- Status: accepted
- Date: 2026-08-27
- Phase: 0

## Context

PRD 15 is blunt: "Do not make WebGL the hero centerpiece. It offers weak
recruiter utility, high implementation risk, and poor fallback behavior." PRD
11.3: "Spatial view may be absent. It cannot delay launch." PRD 14 rates "3D
becomes inaccessible or drains battery" as high probability if prioritized.

## Decision

No Three.js in Phase 0-5. Phase 6 builds it as an isolated, dynamically imported
route island with hard caps: 120 nodes, DPR 1.5, 50 draw calls, 32 MB textures,
40 MB incremental heap, 16.7 ms p95 desktop frame time.

It may never be the default view, the only navigation, or part of the initial
bundle. It cannot own canonical filters, selection, URLs, or history.

The deletion path is a first-class deliverable, not a contingency: ATLAS-006''s
final acceptance criterion is that if teardown, accessibility or frame budgets
fail, the route is removed without changing the core product.

## Consequences

Easier: zero risk to the default experience; the launch gate does not depend on
graphics work. Harder: the spatial view must duplicate selection state into an
accessible mirror list.

## Compressed cost

320 KB incremental, on the spatial route only, never in a shared chunk.

## Fallback

PRD 9.7: on WebGL unavailability or context loss, return to the grid with query
and filters unchanged.

## Removal path

Delete `apps/web/features/spatial/`. Nothing else references it.

## Revisit trigger

Only after every non-spatial release gate in PRD 11.2 passes.