Author: Codex app agent · 2026-09-11.

# Interior-boundary preservation — local joint review

Implemented from clean `main` at `33c57de`, within Carlos's approved general geometry scope. No push, public deployment, worktree, historical CSG rebuild, source-geography edits, city-specific production logic, coordinate exceptions or threshold changes.

`getConvexHull` previously applied the 150,000 m² exterior-island cutoff independently to every MultiPolygon ring. It now tests only the exterior ring and retains the whole qualifying component. Polygon-branch behavior and the intentional small-exterior filtering remain unchanged. Boundary lines carry their exterior/interior role, stay separate and closed, and interior perimeters retain their source coordinates through line simplification. Excluding them from the exterior simplification pool preserves existing exterior paths and their quantile. Geography simplification and shared-boundary extraction are unchanged.

Interior rims contribute to raised walls at z=6–12. Only exterior boundaries contribute base support: extending the new rims through z=0–6 would fill existing underside grooves. The first-exterior base representation, planar XY operations, extrusion, mesh validation, and export architecture remain in place. No new through-holes are cut.

## Regression and bounded verification

- `interior-ring-check.mjs` first failed on unmodified production: the 143,251.853 m² synthetic hole disappeared. Its disconnected small and large exterior islands force the MultiPolygon branch and test both sides of intentional island filtering. A 160,600.693 m² hole is the counterpart. Expectations use input rings; the frozen DC/Baltimore provenance oracle unions raw source features independently, before production filtering. All pass under `npm test`.
- Two necessary follow-ups also had failing probes: closed LineStrings collapsed during simplification; extending the restored rims downward changed grooves and failed topology. Interior source-coordinate preservation and exterior-only base support resolve both. The synthetic floor/groove regression passes. Failed attempts remain locally in `results/interior-ring-*`; they are not final results.
- Final `npm test` passes, including the existing performance-architecture, planar, and hull-ring checks. Both frozen inputs complete through the existing isolated browser harness with actual painted map/3D captures, download, orbit/zoom, and zero idle rendering. Production solid validation passes.
- Final geometry completion was 18.07 s for Baltimore and 8.06 s for DC, within the 60 s harness bounds. These are observed runs, not a controlled speed comparison. Both run manifests match the final production source hashes.
- The focused mesh probe reuses the diagnosis's independently observed raw 12-position perimeter and junctions. All 33 quarter/mid/three-quarter raw-edge samples reach raised STL walls; all 39 junction/incident-arm samples connect. Among 3,272 bounded samples, original strip winding, planar regions and actual downloaded STL agree on raised walls and the floor everywhere. One lower-groove classification differs exactly on junction B's groove cap (distance 0 from the source strip edge), within the existing 2e-5 Float32 conformity band. The raw discrepancy is retained; there are zero discrepancies outside that band. Floor-only and underside-groove controls remain.
- The actual SVG contains the restored closed central path and all three shared-wall endpoint pixels. Shared SVG paths are exact. Both STLs have finite nondegenerate triangles, edge incidence two, opposite edge orientation, and pass production vertex-link and volume validation. These are bounded occupancy checks plus full exported mesh topology checks, not an exhaustive geometric equivalence proof.

## Actual differences

DC's STL is byte-identical (4,444 triangles; one closed component). Both base preview geometry files are byte-identical. Both frozen source geographies, extracted shared lines and trimmed groove lines are exact. Added boundary-role metadata changes the hull-line feature JSON even when geometry is unchanged.

Baltimore's 3 exterior paths retain exactly the previous coordinates (16/6/5 positions). It now retains **77 interior boundary paths** from the existing truncated-source union, including the central perimeter and 76 other holes/slivers. Their Turf areas range from approximately 0.001175 m² to 146,898.924 m². All 77 keep their unsimplified source-union coordinates. The independent *raw*, pre-truncation union has 69 holes across retained components; the difference reflects existing MultiPolygon truncation, which is unchanged. These are source-derived perimeters, not evidence of the publisher's intent for tiny slivers.

The central path retains all 11 raw perimeter edges, including the narrow extension and the three distinct source junctions. The simplified geography hull separately retains six holes; it is not the oracle or input for the raw boundary paths. No source hole is promoted to an exterior island.

For the downloaded solid, planar differences are **0 added / 0 removed area at z=0–1.8 and z=1.8–6**. At z=6–12, **27.741119 model-units² is added and 0 removed**. The first-exterior floor H and groove footprint C are exact. Triangle count changes from 7,258 to 8,446; volume from 131,661.154480 to 131,827.601098 model-units³.

**Joint-review limitation:** Baltimore now has five closed components instead of three. Two small new source-hole wall shells span z=6–12 outside the existing first-exterior floor. They are disconnected raised shells; the existing base representation does not fill those areas. This change preserves that base coverage rather than adding a new floor there. The central restored rim is connected to the main solid and its floor is intact. Component bounds and all measurements are in the evidence JSON. This is an actual consequence of retaining the additional source boundaries, not a claim that every component is ready to print as one object.

## Preview and evidence

Local server: <http://127.0.0.1:8765/diagnostics/review.html>. The existing server serves this canonical checkout. The review page links frozen presets, downloads and an interactive comparison of the actual downloaded STLs; no geometry rebuild is needed for that comparison.

- [Painted central before/after map](results/interior-ring-fix/central-before-after.png)
- [Painted actual STL before/after](results/interior-ring-fix/stl-before-after.png) and [interactive STL viewer](results/interior-ring-fix/stl-review.html)
- Before: `results/hull-after-baltimore/{browser.png,map.png,preprocess.json,scene.stl}` at `33c57de`; independent provenance: `results/central-gap/{DIAGNOSIS.md,hull-stages.json,evidence.json}`.
- Final: `results/interior-ring-final-{baltimore,dc}/{browser.png,map.png,map.svg,map-paths.json,scene.stl,summary.json,planar-validation.json}`. Underside/orbit views and raw geometry remain there too.
- [Checks and topology](results/interior-ring-fix/evidence.json), [exact layer differences and retained hole areas](results/interior-ring-fix/differences.json), [focused STL occupancy](results/interior-ring-final-baltimore/mesh-evidence.json), [initial red regression](results/interior-ring-fix/red.log), [passing suite](results/interior-ring-fix/final-tests.log).

Reproduce sequentially using the existing frozen fixtures and retained diagnosis:

```sh
npm test
HULL_CHECK=1 UI_CHECK=1 LIMIT_SECONDS=60 node diagnostics/run.mjs optimized baltimore interior-ring-final-baltimore
HULL_CHECK=1 UI_CHECK=1 LIMIT_SECONDS=60 node diagnostics/run.mjs optimized dc interior-ring-final-dc
node --import ./diagnostics/register.mjs diagnostics/interior-ring-mesh.mjs
node --import ./diagnostics/register.mjs diagnostics/interior-ring-differences.mjs
python3 diagnostics/interior-ring-evidence.py
```

Large raw exports remain local and ignored, consistent with the existing harness. Selected evidence, tests, implementation and this report are committed locally for joint review.
