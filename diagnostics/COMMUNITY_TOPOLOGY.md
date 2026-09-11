Author: Codex app agent · 2026-09-11.

# Community separation — local joint review

This supersedes the unsuccessful default boundary behavior at `a51b5c0`. The four reported openings now have raised walls in the actual downloaded STL. All 55 Baltimore community anchors and all eight DC ward anchors occupy distinct closed wall compartments. The ownership audit finds no mixed-owner compartments, no ambiguous overlap area inside compartments, and no processing-created unowned pockets beyond the existing STL precision band. Nothing was pushed or deployed.

[Interactive before/after actual-STL comparison](community-review.html) · [Frozen app presets](review.html) · [Baltimore acceptance](results/community-topology/verified-baltimore.json) · [DC acceptance](results/community-topology/verified-dc.json).

The correction starts with original polygons, including original MultiPolygon coordinates. It inserts intersection vertices before building shared TopoJSON arcs, simplifies each arc once, and generates walls from the complete boundary network. Arc metadata retains the participating source features. Thus a locally overlapping border still produces a wall even when its two edges are not identical. Separate rings never acquire inter-ring connectors. The existing 150,000 m² exterior-component policy remains; it is applied to original geography rather than rounded MultiPolygons.

Simply stroking all original rings was insufficient. Joining return paths into a single strip produced cancellation pockets, and centered coastline strokes sealed narrow source-water inlets. The selected treatment uses the existing Clipper library to stroke the network together with positive-area endpoint joints. Exterior walls occupy the **full configured width inside the source coastline**, keeping its open inlets open. Exterior simplification rejects shortcuts that intersect another current boundary edge. The floor and exterior support use that same coastline. This is a printable-wall placement rule, not assignment of water or disputed land to a community.

Both interior and exterior approximation are bounded by wall width / 8: 0.0625 model units at the frozen 0.5 width. Measured maximum deviations are about 6.07 m for Baltimore and 7.10 m for DC at their respective model scales. Exterior paths retain 1,460 of 3,627 positions in Baltimore and 279 of 14,465 in DC; their four and one exterior components remain valid and separate. The source coordinates are not snapped to a repair grid. Noding retains every original input vertex; endpoint reuse is limited to coordinate-scale Float64 roundoff (upper bound 1.08×10⁻⁸ m for these inputs). The existing 10⁻⁶ model-unit clipping grid and 2×10⁻⁵ Float32 conformity band are unchanged. [Source measurements](results/community-topology/source-metrics.json) · [Exterior measurements](results/community-topology/coast-metrics.json).

The genuine central raw void remains unassigned, enclosed by its source-facing walls, with floor hits at z=0 and z=6. All 33 quarter/mid/three-quarter samples of its original 11-edge perimeter and its three source junctions hit raised STL walls. Original source overlaps have not been administratively resolved: they are retained as source data. No overlapping ownership remains in empty enclosed compartments; approximately 0.000364 m² of Baltimore raw overlap lies outside the wall footprint **and outside all closed compartments**. There is no nearest-community assignment or substantive ownership choice hidden in this fix.

The full floor remains z=0–6 with underside grooves up to z=1.8; walls rise to z=12. Grooves derive from shared community arcs, so singly owned void rims do not introduce new underside cuts. Floor outlines, individual groove paths, and wall footprints change as original geography replaces rounded/mismatched inputs; **their bytes and areas are not unchanged**. The retained convention still provides a full floor only for the first exterior component. Baltimore exports four supported source components, each reaching z=0, rather than the previous five components with two unsupported z=6–12 shells. The separate source islands have perimeter support, not a newly filled plate across the water.

The map paints the actual planar wall footprint without a screen-width stroke that could visually seal channels. The 3D preview paints the same validated solid used for download. The explicit `?geometry=csg` comparison route retains its prior preprocessing and implementation; no historical CSG benchmarks were repeated. No runtime dependencies were added.

| Frozen input | Before triangles | After triangles | After supported components | Geometry completion |
|---|---:|---:|---:|---:|
| Baltimore | 8,446 | 38,578 | 4 | 10.14 s |
| DC | 4,444 | 8,654 | 1 | 6.21 s |

Before recorded geometry times were approximately 18.1 s and 8.1 s. Final timings below are observed browser runs, not controlled speed ratios. The shoreline initially made repeated whole-layer boolean subtraction expensive. Algebraically factoring the same height interfaces avoids repeatedly processing identical coast edges; synthetic tests compare these caps to full set differences. Mesh validation remains enabled. [Mesh, layer-area differences, floor/groove probes and UI measurements](results/community-topology/evidence.json).

Acceptance began red on the retained `a51b5c0` export. The final audit reconstructs wall footprints and exposed floor from **actual downloaded STL caps**, checks free-space connectivity at the named seams, checks all source-feature anchors, and intersects every closed compartment with original exclusive ownership and raw source holes. Its only geometric allowance is the perimeter-area band implied by existing Float32 conformity, not an ownership percentage. It also caught ten additional coastline pockets missed by exact-location probes; those fail the centered-stroke candidate and pass the selected inward-coast treatment. No unowned pockets are excused by calling them source holes unless they lie within actual raw holes. [Red acceptance](results/community-topology/red-acceptance.json).

`npm test` passes, including intersection/collinear noding, Polygon/MultiPolygon equivalence, source immutability, separate rings, positive-area junctions, opposing-edge sliver prevention, an open-inlet regression, full nominal exterior width, exact factored cap identities, floor/groove controls, and the existing planar/performance-architecture checks. Both browser runs include painted SVG/map/3D, actual Download STL, orbit, zoom and zero idle rendering. Export edges, orientation, vertex links, finite triangles and volume pass validation. Final source hashes include the new boundary module. [Test log](results/community-topology/verified-tests.log).

Useful visual evidence: [Greenmount seam](results/community-topology/stl-green.png), [Oldtown seam](results/community-topology/stl-oldtown.png), [southern triangle](results/community-topology/stl-triangle1.png), [southern rectangle](results/community-topology/stl-rectangle.png), [central raw void](results/community-topology/stl-central.png), [whole-model underside](results/community-topology/stl-underside.png). These views recolor the actual mesh by height for legibility; geometry is unchanged.

Reproduce with the saved fixtures and existing harness. The Python acceptance script reuses the existing ignored `.tmp/central-gap-python` Shapely installation. Large raw files remain local and ignored; selected evidence is committed.

```sh
npm test
HULL_CHECK=1 UI_CHECK=1 LIMIT_SECONDS=90 node diagnostics/run.mjs optimized baltimore community-local-baltimore
HULL_CHECK=1 UI_CHECK=1 LIMIT_SECONDS=90 node diagnostics/run.mjs optimized dc community-local-dc
node --import ./diagnostics/register.mjs diagnostics/community-regions.mjs diagnostics/results/community-local-baltimore
node --import ./diagnostics/register.mjs diagnostics/community-regions.mjs diagnostics/results/community-local-dc dc
python3 diagnostics/community-enclosure-check.py diagnostics/results/community-local-baltimore
python3 diagnostics/community-enclosure-check.py diagnostics/results/community-local-dc
python3 diagnostics/community-evidence.py
```
