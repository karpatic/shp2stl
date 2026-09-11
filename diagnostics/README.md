# Reproducible local investigation

Author: Codex app agent · 2026-09-11.

Current community-enclosure results are in [COMMUNITY_TOPOLOGY.md](COMMUNITY_TOPOLOGY.md); earlier performance results are in [REPORT.md](REPORT.md). The original sections below describe the historical CSG investigation; the **Planar follow-up** section documents the new default workflow.

## 3MF and independent dimensions

Author: Codex app agent · 2026-09-11.

Current implementation, package and geometry audit, actual browser downloads, dimensions and limitations: [3MF_DIMENSIONS.md](3MF_DIMENSIONS.md). [Local downloaded-part review](3mf-review.html).

## Filled island bases and pad engagement

Author: Codex app agent · 2026-09-11.

Current island modes, continuous-contact criteria, focused C/U regressions, actual STL/UI results and reproduction commands: [ISLAND_BASES.md](ISLAND_BASES.md). [Interactive local review](island-review.html).

## Focused hull-line follow-up

The later interior-boundary preservation fix, focused checks, retained evidence and local joint-review limitations are documented in [INTERIOR_BOUNDARIES.md](INTERIOR_BOUNDARIES.md) (Author: Codex app agent · 2026-09-11).

Author: Codex app agent · 2026-09-11.

`node diagnostics/hull-check.mjs` checks the existing frozen DC/Baltimore rings plus a polygon-with-hole/island case. It failed on the concatenated boundaries before the fix and passes afterward; it also runs under `npm test`. No historical CSG regeneration is needed.

The four retained `hull-before-*` / `hull-after-*` runs use the existing isolated-browser harness. Before screenshots were taken from `ae7d630` production source, after the new red-capable check was written and run. To reproduce the fixed views:

```sh
HULL_CHECK=1 LIMIT_SECONDS=60 node diagnostics/run.mjs optimized baltimore hull-after-baltimore
HULL_CHECK=1 LIMIT_SECONDS=60 node diagnostics/run.mjs optimized dc hull-after-dc
python3 diagnostics/hull-evidence.py
```

The evidence command compares the retained before/after preprocessing and base bytes, inspects the actual SVG commands, and independently checks the downloaded STL edges, orientation and connected components using the existing mesh reader. `HULL_CHECK` adds a painted map crop, actual overlay SVG and path-command JSON; it does not change app geometry. The first capture attempt selected Leaflet's attribution SVG too; the selector was narrowed to the overlay pane, then the before run completed successfully. Original planar/CSG artifacts are untouched.

Baseline: `919e9d656352be041a5d3118e325e088a137e760` (fresh `main`). No applicable on-disk `AGENTS.md` was present in this checkout or its ancestor directories. Carlos's supplied instructions governed the work. All source changes, worktrees and retained artifacts for this investigation are scoped to this repository; nothing was deployed or pushed.

## Setup and bounded runs

Requires Node 22, Python 3, Git, tar and Chrome. The only npm dependency is the exact-pinned development tool `playwright-core@1.55.0`; it drives a new, isolated browser profile, never the user's browser profile. `CHROME=/path/to/chrome` overrides the executable.

```sh
npm ci
npm run prepare:baseline
npm test
node diagnostics/run.mjs baseline dc baseline-dc-2
LIMIT_SECONDS=600 node diagnostics/run.mjs reference baltimore reference-baltimore-full
node diagnostics/run.mjs optimized dc final-dc
LIMIT_SECONDS=300 node diagnostics/run.mjs optimized baltimore final-baltimore
python3 diagnostics/compare.py diagnostics/results/baseline-dc-2 diagnostics/results/final-dc
python3 diagnostics/compare.py diagnostics/results/reference-baltimore-full diagnostics/results/final-baltimore
FAIL_CUT=3 node diagnostics/run.mjs optimized dc failed-cut
UI_CHECK=1 node diagnostics/run.mjs optimized dc final-ui
```

Run expensive reproductions sequentially. Defaults are a 120-second external wall deadline, 2,048 MiB summed browser-process RSS limit, and 1,024 MiB V8 old-space limit. `LIMIT_SECONDS` and `RSS_MB` override the first two. The watchdog samples every 500 ms and kills the isolated browser; it remains independent of the blocked page thread. Optional `PROFILE=1` records a CPU profile on completion (capture at a limit is best-effort with a 1.5-second cap). A timeout reports the last completed cut and a lower bound, never success. Artifact capture is also inside the wall limit.

The runner instruments the **actual app and vendored geometry code** through its local HTTP responses. It retains the real UI initialization, geometry generators, scene transforms, download button and exporter. It records stage times, cut entry/exit times, input/cutter/output triangle and attribute-buffer counts, groups, and sampled JS heap. Nested stage timings are inclusive: do not sum `getConvexHullLines` with the union it calls, for example. `complete.ms` measures page start to completed geometry; `wallMs` also includes screenshots, export, and diagnostic serialization. RSS is the sum of process RSS (shared pages may be counted more than once), not unique physical memory.

Final runs also record process CPU seconds, summed across only this isolated browser's descendants. `computeCpuSeconds` is sampled at model completion; `processCpuSeconds` includes subsequent rendering/export/artifact work. Values use whole-second process counters and 500 ms samples, so they are approximate. These distinguish computational expense from wall-time variation; they are not a substitute for reporting elapsed time. `UI_CHECK=1` checks orbit, zoom and stationary render counts after exporting the unmodified view.

`baseline` serves the original revision unchanged apart from observation hooks and frozen-network routing. **`reference` differs only by a null guard in BVH 0.7.3's unused interpolated hit normal**: Three r176 can return null for singular barycentric interpolation, and the original code otherwise throws during Baltimore cut 29 and silently skips that cut. CSG consumes `hit.face.normal`, not this interpolated value. The final app avoids computing the unused value. Never compare the raw partial export as if it represented all 128 cuts.

`Math.random` has the fixed seed 12345 in diagnostic browsers. Upstream CSG uses random ray jitter, and Three/color/UUID creation consumes the same generator. No production randomness was changed; cutter clones and existing material allocation are retained so equivalent runs consume the same sequence. Frozen basemap placeholders eliminate external tile variability. They do not alter GeoJSON overlays or 3D output.

## Frozen inputs and dependencies

`fixtures/manifest.json` contains exact public URLs, byte sizes and SHA-256 values. The runner verifies every fixture before each run and serves those bytes for the original external URLs. DC has 8 Polygon features / 22,755 coordinate positions; Baltimore has 55 features (53 Polygon, 2 MultiPolygon) / 43,549 positions. The original defaults produce 15 and 128 cutters, respectively.

Both use depth 6, width 0.5, simplification quantiles 0.01 / 0.01, UI precision 100 and UI scale 180. Existing fixed-200 scaling and complete-scene export are deliberately preserved.

The existing `three/three-bvh-csg.js` was byte-identical to the app's pinned CDN 0.0.16 build before this change (SHA-256 `a72e85389c4088990a0f9b375fa5046d0abebe118ced442807f15066a987d1cb`). `app.html` and `new.html` now use that local, patched module. The runtime still uses the same pinned BVH 0.7.3 and local Three r176.

The only new runtime dependency is vendored **RBush 4.0.1**, with its **quickselect 3.0.0** dependency. Their original sources, MIT licenses, upstream hashes and local hashes are in `three/vendor/`. The sole upstream-source adaptation is RBush's import pointing to the local quickselect file. A spatial index is justified by tens of thousands of temporary fragments being rescanned thousands of times in individual CSG cuts. No CDN or npm install is needed for these new runtime files.

## Checks and artifacts

`check.mjs` compares the old and new half-edge arrays, triangle-splitting coordinates and order, index threshold transitions, pool reuse, near-collinear cases, overlap ordering, stale bounding-box metadata, immutable cached input, and explicit convergence failure. This is a focused differential check, not a general application test suite.

`compare.py` requires exact preprocessing, geometry attributes/indices/groups/draw range, and downloaded STL bytes. It also reports bounds, area, signed volume, oriented surface hashes and exact-coordinate edge incidences. Exact surface bytes preserve even baseline degenerate fragments and T-junctions; they do not certify a watertight printable mesh. Signed volume of the complete scene is a surface integral, since exported layers can overlap.

For experiments with different triangulation, `surface.mjs` samples both directions at every vertex, edge midpoint and face centroid, then compares all vertical hit heights over a 0.5-unit XY grid. A low volume difference alone is insufficient: this check rejected the initially faster broad phase. The final version instead preserves exact bytes, so sampling is not needed as a substitute for equivalence.

Each run writes `summary.json`, `events.jsonl`, `browser.png`, `scene.stl`, `preprocess.json`, and `result-geometry.json` under `results/<label>/`. Failures/limits retain only the artifacts actually reached. Large raw files and experimental output are kept locally and ignored by Git; the evidence report, selected logs, comparisons and screenshots are committed. Rerunning the commands regenerates the large files. `FRAGMENTS=1 CHECKPOINT=81` enables a bounded detailed trace/checkpoint for inspecting the pathological cut; it is excluded from final timing runs.

See [REPORT.md](REPORT.md) for the measured results, discarded approaches and remaining costs. Serve the repo on `127.0.0.1:8765` and open [review.html](review.html) for DC/Baltimore presets using the frozen bytes.

## Planar follow-up (September 11, 2026)

Author: Codex app agent.

Continuation from `f5be65e`. Start with [REPORT.md](REPORT.md); the previous exact-CSG report is preserved as [CSG_REPORT.md](CSG_REPORT.md). The original `compare.py` deliberately still requires byte equality and remains useful for the fallback.

The smallest prototype reads the existing frozen full-reference preprocessing. No baseline preparation or CSG regeneration is needed when these local artifacts are present:

```sh
timeout 30s node --import ./diagnostics/register.mjs diagnostics/planar-prototype.mjs dc
timeout 30s node --import ./diagnostics/register.mjs diagnostics/planar-prototype.mjs baltimore
```

For each dataset, use its retained reference (`baseline-dc-3` or `reference-baltimore-cpu`) and run the existing surface checker on the prototype. `REGIONS` enables targeted samples and the independent source-outline occupancy oracle; `SCENE=1` compares occupied intervals of the complete downloaded solids. For example:

```sh
REGIONS=diagnostics/results/planar-prototype-baltimore/regions.json timeout 55s node --import ./diagnostics/register.mjs diagnostics/surface.mjs diagnostics/results/reference-baltimore-cpu diagnostics/results/planar-prototype-baltimore
SCENE=1 REGIONS=diagnostics/results/planar-prototype-baltimore/regions.json timeout 55s node --import ./diagnostics/register.mjs diagnostics/surface.mjs diagnostics/results/reference-baltimore-cpu diagnostics/results/planar-prototype-baltimore
```

Retain these JSON outputs as `surface.json` and `scene-surface.json` inside the corresponding prototype directory. Surface distances include the historical fragments and internal overlap faces; they must not be interpreted as strict union-surface equivalence. Raw discrepancies and discrepancies outside the explicit boundary band are reported separately. The independent source oracle uses winding of each original strip before any planar union, not the generated triangles.

Actual browser runs and the lightweight evidence summary:

```sh
UI_CHECK=1 LIMIT_SECONDS=60 node diagnostics/run.mjs optimized dc planar-final-dc
UI_CHECK=1 LIMIT_SECONDS=60 node diagnostics/run.mjs optimized baltimore planar-final-baltimore
FAIL_PLANAR=1 LIMIT_SECONDS=30 node diagnostics/run.mjs optimized dc planar-failure
CSG_FALLBACK=1 LIMIT_SECONDS=45 node diagnostics/run.mjs optimized dc planar-csg-fallback
python3 diagnostics/compare.py diagnostics/results/baseline-dc-3 diagnostics/results/planar-csg-fallback
python3 diagnostics/planar-evidence.py
npm test
python3 -m http.server 8765 --bind 127.0.0.1
```

`planar-evidence.py` imports the existing mesh metrics, requires unchanged preprocessing, checks that the browser-exported scene exactly matches the validated prototype, verifies oriented base-surface identity between prototype and browser, and summarizes geometry/timing/occupancy results. `run.mjs` additionally records production validation and heap at completion. Its planar stage includes the unified export mesh and the separate preview base; displayed raised lines retain the existing objects. The final screenshots include an underside orbit with unchanged production lighting.

Runtime dependencies are vendored, pinned and licensed in `three/vendor/manifest.json`; no added npm runtime package or CDN is required. The prototype's integer grid and cleanup tolerances are documented in REPORT.md. Invalid topology/cap/volume output is rejected; it never silently switches to CSG or enables a partial download.
