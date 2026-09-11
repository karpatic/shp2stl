# Planar SHP2STL — local review

Author: Codex app agent · September 11, 2026.

Built on clean local `f5be65e`, preserving its CSG implementation as an explicit fallback. **Planar construction is now the default. No push or public deployment.** The prior investigation remains in [CSG_REPORT.md](CSG_REPORT.md).

## Result and timings

Both frozen datasets complete without 3D boolean evaluations. The actual Download button exports a single connected, closed, oriented solid incorporating **all scene geometry**, with no internal overlap faces. Every exported edge has incidence two; vertex links are manifold; there are no zero-area triangles. The browser downloads exactly match the validated prototype STLs. Preprocessing remains byte-identical to the saved full references.

Same frozen data and settings: depth 6, width 0.5, simplification quantiles 0.01/0.01, UI precision 100 and scale 180; the existing actual 200-unit scaling remains. Chrome 152.0.7977.82, isolated headless software WebGL, seed 12345; sequential bounded runs.

| Metric | DC | Baltimore |
|---|---:|---:|
| Historical `f5be65e` page → model | 7.54 s | 196.00 s |
| Fresh final page → model | **5.86 s** | **10.99 s** |
| Fresh planar regions + both meshes + validation | 1.24 s | 1.97 s |
| Export triangles, historical → new | 9,323 → **4,444** | 48,195 → **7,628** |
| Approximate browser CPU to completion | 16 s | 23 s |
| Peak summed browser RSS | 1,422 MiB | 1,426 MiB |
| JS heap at model completion (not peak) | 26.7 MiB | 49.5 MiB |

The first integrated runs were 2.81/7.68 seconds, with planar stages 0.43/1.06 seconds. Variation is substantial; the table uses the **latest pair**, not the fastest samples. The 196-second Baltimore result and its 187.12-second CSG stage are **historical**, not freshly rerun. RSS includes shared pages counted in multiple processes and screenshot/export work. The new architecture removes sequential triangle fragmentation; these measurements are not a stable latency guarantee. Timing artifacts record their source hashes; the final small follow-up makes Clipper errors throw instead of alerting/continuing and guards its integer range, covered by focused tests.

[Machine-readable evidence, including all mesh-stage timings, bounds, volumes and hashes](results/planar-evidence.json) · [DC run](results/planar-final-dc/summary.json) · [Baltimore run](results/planar-final-baltimore/summary.json).

## Actual cross-sections

There is **no SVG editor or SVG geometry pipeline** here. Leaflet paints the GeoJSON map; `new/three.js` constructs Three.js shapes. `createLineShapes` now exposes the existing 2D strip outlines so clipping precedes extrusion. No generic buffer replaces their construction: butt end caps, existing miter calculation/limit 4, and its bevel fallback are retained, including the existing treatment of repeated endpoints.

Let H be the **first hull shape**, C the union of trimmed interior-line footprints, B the hull-boundary footprint, and L the union of untrimmed shared-boundary footprints. The exact source behavior at depth d is:

| z interval | Occupied XY region |
|---|---|
| 0 to 0.3d | (H minus C) union B |
| 0.3d to d | H union B |
| d to 2d | B union L |

Thus the grooves open on the **underside**, reaching z=1.8 at d=6. They are not replaced by raised lines. Boundary strips span z=0–12; shared-boundary strips span z=6–12. Exposed differences between adjacent layers produce caps, floors and roofs; each layer's contours produce vertical walls. Shared edges are subdivided consistently, eliminating intersecting shells and internal caps from the export.

The preview retains the original translucent raised-boundary objects and a planar base, while export uses the unified mesh. Materials remain randomized; identical seeded colors are not promised after removing unnecessary geometry allocations. The controls, parameters, map, orbit/zoom and on-demand rendering remain familiar. Progress names actual stages; Download stays disabled until both geometries pass validation. `app.html?geometry=csg` selects the preserved fallback explicitly, never silently after a planar failure.

## Geometry evidence and tolerances

The bounded prototype reads frozen preprocessing directly, without regenerating CSG. Initial region construction took 0.11/0.21 seconds; those initial geometry-only probes excluded extrusion and verification. The retained prototype includes complete meshes, original extrusion-cap audits and source outlines in [DC audit](results/planar-prototype-dc/audit.json) / [Baltimore audit](results/planar-prototype-baltimore/audit.json).

Integer clipping uses a **0.000001-unit grid**, followed by **0.000002-unit collinear/spike cleanup**. Final XY vertex welding and edge conformity use **0.00002 units**. The side-classification tolerance is **0.00003 units**; z-hit tolerance is **0.00001**. These are numerical tolerances, not geography simplification: reference Float32 spacing reaches 0.00000763 at magnitude 100. Keeping the original double-precision strip outlines until clipping avoids artificial hairline folds introduced by prematurely rounding each strip to Float32.

The existing surface harness now also reads complete exported STLs, combines their oriented crossings into occupied intervals, and checks those intervals against an independent point-winding evaluation of the **original uncombined source outlines**. It samples the original 160,801-point grid plus 5,008 DC / 7,812 Baltimore points next to vertices and edge midpoints, covering joins and intersections.

- **New base and complete scene: zero source-occupancy disagreements outside the 0.00003-unit boundary band.** All grid comparisons with the references match. Raw boundary-band discrepancies remain reported, rather than being discarded from the evidence.
- DC new→reference surface samples: maximum **0.00000787** units. Baltimore: **0.000194** units at an acute endpoint; this exceeds the ordinary surface tolerance and is explicitly retained in the report. Source-occupancy sampling passes there; strict Hausdorff equality to the old fragmented mesh is **not** claimed.
- Reference→new maximum separation is **0.333 DC / 0.370 Baltimore**. The area-weighted seven-point estimates beyond 0.00003 are **0.00560 / 1.09074 square units**. These expose the old numerical fragments; counts alone overemphasize very thin triangles. The saved Baltimore base has 12 source-height discrepancies outside the boundary band; its complete-scene crossing check has 16. Examples show extra bottom crossings or missing groove roofs. The new meshes agree with the source solid at all those sampled locations.
- Complete-scene volumes: **86,223.42730 DC / 132,342.85225 Baltimore** cubic model units. Deviations from the analytic layer-area integrals are **0.00256 / 0.00538**, within guards **0.00863 / 0.01324**. Bounds match the saved exported scenes. Each new scene is one connected component. Old summed-shell signed volume includes overlaps and is not a union-volume reference.

[DC base comparison](results/planar-prototype-dc/surface.json) · [Baltimore base comparison](results/planar-prototype-baltimore/surface.json) · [DC complete scene](results/planar-prototype-dc/scene-surface.json) · [Baltimore complete scene](results/planar-prototype-baltimore/scene-surface.json).

This is quantitative sampled equivalence to the intended solid, supported by planar construction, cap area, topology, bounds and volume checks—not a continuous exact-arithmetic proof. Runtime checks reject empty, incomplete, nonfinite, open, inconsistently oriented or nonmanifold output and volume inconsistencies. Arbitrary inputs/settings have not been exhaustively qualified.

## Preservation, checks and review

No unrelated baseline semantics were repaired: Baltimore still uses only the first of three hull shapes; source hole rings are still treated as separate shapes by that baseline selection; hull-line concatenation still includes its inter-ring connectors; filtering, simplification, projection, truncation and fixed-200 scaling remain unchanged. The southern Baltimore rail outlines therefore remain visible without newly invented base islands. No material geography decision was needed for these fixtures.

`npm test` passes the existing CSG differential checks and focused planar checks for crossing underside grooves, raised crossings, holes, disconnected solids and invalid-output rejection. An [injected planar failure](results/planar-failure/summary.json) shows Failed with Download disabled. Both final UI runs verify orbit, zoom and zero stationary render frames. A fresh DC fallback run matches every frozen geometry attribute and STL byte ([comparison](results/planar-csg-fallback-equivalence.json)); no multi-minute Baltimore CSG regeneration was performed.

Two pinned, vendored runtime libraries add about 354 KB uncompressed: **clipper-lib 6.4.2** for robust integer planar booleans (Boost/JSBN licenses), and **libtess 1.2.2** for caps with touching/complex holes (SGI Free Software License B 2.0). Existing RBush is reused for edge conformity. Licenses, upstream hashes and the small module-loading adaptations are in [vendor manifest](../three/vendor/manifest.json). A floating-point clipping prototype and Earcut cap triangulation failed checks and were rejected, not shipped. A bounded attempt to union all historical cap triangles was also stopped; the source-winding check avoids recreating their fragmentation.

**Local review:** <http://127.0.0.1:8765/diagnostics/review.html>. No public hosting changes.

| Painted browser view | DC | Baltimore |
|---|---|---|
| Initial | [Screenshot](results/planar-final-dc/browser.png) | [Screenshot](results/planar-final-baltimore/browser.png) |
| Orbit / zoom | [Screenshot](results/planar-final-dc/orbit.png) | [Screenshot](results/planar-final-baltimore/orbit.png) |
| Underside grooves, original lighting | [Screenshot](results/planar-final-dc/underside.png) | [Screenshot](results/planar-final-baltimore/underside.png) |

Frozen basemap placeholders are used in automated screenshots. Large STL/geometry files remain local under `diagnostics/results/`; selected evidence and screenshots are committed. Reproduction commands are in [README.md](README.md).
