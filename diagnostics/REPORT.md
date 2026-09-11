# Local optimization evidence

Author: Codex app agent · September 11, 2026.

Baseline revision: `919e9d656352be041a5d3118e325e088a137e760` (fresh, clean main). Implementation and evidence are in the accompanying local commit. No push or public deployment was performed.

## Result

**Both final outputs match their complete references byte for byte:** preprocessing, positions, normals, UVs, indices, material groups, draw ranges, and downloaded binary STLs. DC completes 15/15 cuts; Baltimore completes 128/128. No cutters or additional islands were removed, no tolerances or dimensions changed, and the complete-scene export remains intact.

The latest sequential measured pair used Chrome 152.0.7977.82, headless software WebGL, frozen public input/library bytes, identical settings and seeded diagnostic randomness. All heavy generation runs were bounded and sequential.

| Dataset | Page start → completed model | CSG evaluation time | Browser CPU to model completion² | Peak summed browser RSS |
|---|---:|---:|---:|---:|
| DC | 7.27 → 7.54 s | 3.77 → 4.09 s | 14 → 16 s | 1410 → 1408 MiB |
| Baltimore¹ | 463.09 → 196.00 s | 454.75 → 187.12 s | 504 → 226 s | 1710 → 1673 MiB |

¹ The Baltimore reference has one minimal compatibility guard, explained below. Its raw baseline silently omits a cut and is not a valid all-cut comparison.

² Whole-second process counters sampled every 500 ms, including browser startup/background threads; approximate, not CPU-instruction counts. The final Baltimore pair used **55.2% less CPU** to complete the model and **57.7% less elapsed time**. CPU through artifact capture was 649 → 236 seconds, also reflecting elimination of continuous stationary rendering. DC has **no demonstrated build-time improvement**: its observed 7.27 → 7.54 seconds is a small regression/noisy difference, not a claimed speedup.

Timing variation is material. An earlier complete Baltimore reference took 184.2 seconds; exact guarded trials took 124.9 and 187.7 seconds. Even the unchanged union stage varied substantially. The table reports the final sequential pair, not a stable latency guarantee. Baltimore remains expensive and blocks the main thread while CSG runs. Peak RSS includes artifact/UI work, shared pages counted in multiple processes and software rendering; compute-only peak RSS in the last pair increased approximately 7%, while the maximum sampled JS heap at cut boundaries fell from 285.6 to 265.4 MB. Memory improvement is not uniform across metrics.

## Root cause and changes

The trace showed cutter triangle splitting against thousands of existing triangles, creating tens of thousands of temporary fragments that later clipping planes repeatedly scan. In cut 81, one cutter triangle had 2,432 intersecting hull triangles. Cut 119 exceeded 120,000 temporary fragments. Final persistent geometry is much smaller: 44,511 CSG triangles / 4,273,056 attribute bytes. In the last pair, cut 81 fell from 265.17 to 61.51 seconds; cut 119 from 70.96 to 49.99 seconds. Cut 65 completed in the bounded reproductions; a timed-out browser snapshot did not establish an infinite cut there.

Implemented:

- Reuse shared overlaps, conservatively reject disjoint polygon pairs, and bound endpoint refinement with an explicit failure. Keep the two semantically different unions separate.
- Index temporary fragments with pinned, vendored RBush 4.0.1 / quickselect 3.0.0 (17.2 KB of source plus licenses). Preserve original clipping order, triangulation predicates and groups; use the original predicate for ill-conditioned triangles.
- Intern existing vertex hashes into exact numeric edge keys, use one traversal iterator, reuse the evaluator, release obsolete geometry caches, and omit unused interpolated ray-hit attributes. Keep exported attributes and cutter clones.
- Stop on failed extrusion/cuts and keep Download disabled. Render on changes/damping rather than continuously when stationary.

A faster 61–65-second trial was **rejected**. Its nearly equal volume concealed differing tiny fragments: bidirectional vertex/edge/centroid sampling found a 0.234-unit maximum separation, despite zero groove-height mismatches on a 160,801-point grid. The guarded implementation restores exact STL bytes, including those numerical fragments. Full SAT caching was also discarded after a bounded cut-81 replay used more memory and more time; an invasive ray-root index showed too little benefit to retain.

## Baseline defect and limits

The original Baltimore run reported completion at 62.1 seconds **after cut 29 threw and was skipped**. Three r176 can return null for singular normal interpolation; BVH 0.7.3 dereferenced that unused normal. The reference adds only a null guard. Production avoids the unused interpolation entirely; CSG still uses the identical geometric `face.normal`. This is not an approximation or a skipped cut.

Initial 120-second reference/optimization probes were stopped during cut 81; another reached cut 119 at its limit. These are lower-bound records, not completed runs. Full references used explicit 600-second / 2,048-MiB RSS limits; final runs used 400-second / 2,048-MiB limits. No limit result was accepted as success.

Baseline topology remains unchanged, including 53 zero-area CSG triangles in DC and 18 in Baltimore, T-junctions/unmatched edges, existing hull component filtering, and first-hull-only CSG. Fixed-200 scaling still ignores the UI's 180 scale setting. These were preserved for this optimization, not repaired or silently reinterpreted.

## Verification and review

`npm test` passed the focused differential checks, including near-collinear fragments. Both final `compare.py` commands exited 0. Exact bytes imply identical bounds, signed volume, oriented surfaces, coverage and edge incidence, with **no final triangulation difference**. The exported scenes contain 9,323 triangles (DC) and 48,195 (Baltimore); bounds and all numeric metrics are in the comparison files. Signed volumes are surface integrals, not certifications of watertight solids.

- [DC exact comparison](results/dc-equivalence.json) · [Baltimore exact comparison](results/baltimore-equivalence.json)
- [DC before](results/baseline-dc-3/summary.json) / [after](results/final-dc-2/summary.json) · [Baltimore before](results/reference-baltimore-cpu/summary.json) / [after](results/final-baltimore-cpu/summary.json)
- [Raw baseline cut failure](results/baseline-baltimore/events.jsonl) · [Explicit failure UI check](results/final-failed-cut/summary.json)
- [DC screenshot](results/final-dc-2/browser.png) · [DC orbit/zoom screenshot](results/final-dc-2/orbit.png)
- [Baltimore reference screenshot](results/reference-baltimore-full/browser.png) · [final painted view](results/final-baltimore-view/browser.png) · [orbit/zoom view](results/final-baltimore-view/orbit.png) · [UI/paint verification](results/final-baltimore-view/summary.json)

Both DC and Baltimore UI checks measured zero extra render frames during a one-second stationary interval and verified orbit and zoom. The Baltimore painted-frame verification completed in 193.19 seconds; its STL also matches the timed final run. The screenshot harness now waits for the first completed model frame, rather than assuming CSG completion implies a painted canvas. Injecting a failure at cut 3 produced “Failed on start” with Download disabled and no completed output.

Exact commands, fixture URLs/hashes, limits, and diagnostic definitions are in [README.md](README.md). Large regenerated artifacts remain local under `diagnostics/results/<run>/scene.stl`, `preprocess.json`, and `result-geometry.json`; selected logs/comparisons/screenshots are committed. The fixture bytes are protected from Git newline conversion by `.gitattributes`.

Local review: <http://127.0.0.1:8765/diagnostics/review.html>. Its two presets open the actual app with the frozen DC or Baltimore input. Basemap backgrounds in automated screenshots are offline placeholders.
