# SHP2STL

Convert GeoJSON boundaries into extruded geometry with internal cuts, then download a unified binary STL or a 3MF assembly with named Base, Walls and optional Labels parts.

Author of this updated guide: Codex app agent · September 11, 2026.

## Run locally

Serve this directory over HTTP and open `app.html`:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765/app.html>. Edit the URL, base height, wall height above the base, minimum connector width, wall width or simplification settings, then click **Create**. Dimensions are in millimeters; defaults remain a 6 mm base plus 6 mm walls. Settings persist in local storage. All standard-model edits rebuild in place and preserve the camera. Height edits reuse validated mesh structure; unchanged Create reuses the ready output. DC and Baltimore buttons beside the URL load the established sources immediately. A fresh start uses DC; saved/custom URLs and an explicit `?geoJsonUrl=...` (or `?url=...`) selection are preserved. Both downloads become available only after the complete solid and all named parts pass validation. Drag or scroll in the 3D view to inspect the model.

The application is static; npm is only needed for the optional diagnostic tools. `index.html` is the landing page, `app.html` the configurable app, and `new.html` the older entry point. `demo.html` demonstrates CSG independently.

## Size, holes, labels and local files

Set **Map size** independently from **Wall width**. Set a hole diameter or label text/size first, click **Hole** or **Label**, then click an open face in the 3D view. Preview, Escape/Cancel, Undo, selected removal and label text/size edits are available. Labels emboss 0.8 mm above the base using bundled licensed glyph outlines; counters remain open. Placements follow source-relative coordinates when map size changes while their dimensions stay in mm. Unsupported text and risky edges/walls/connectors are rejected. Printability depends on your chosen dimensions and printer.

Import local polygon GeoJSON/JSON or zipped 2D polygon shapefiles with WGS84 .prj (or converter local-mm metadata). Files stay local; reimport them after reloading. The separate [SVG converter](converter.html) previews a bounded basic-vector subset, downloads GeoJSON or real SHP/SHX/DBF ZIP, and can hand the result to the main app locally. Converted coordinates have explicit Cartesian millimeter metadata and bypass geographic heuristics. Unsupported SVG features are reported; this is a converter, not an editor.

[Controls, exact formats, limits and verified results](diagnostics/CUSTOMIZATION.md) · [Actual 40 mm downloaded parts](diagnostics/custom-review.html).

## Current geometry pipeline

1. Preserve original Polygon and MultiPolygon coordinates and apply the existing exterior-component area policy.
2. Node intersections and build a shared source-arc topology. Simplification is bounded by wall width; exterior shortcuts cannot cross other boundaries.
3. Generate the boundary network in XY. Place exterior walls inside the coastline so narrow source-water inlets stay open; derive underside grooves from shared community arcs.
4. Extrude the floor, grooves and raised walls as a single solid and validate its edges, vertex links, triangles and volume.
5. Paint the actual wall footprint and validated solid; download that unified solid as STL, or separately capped Base and Walls meshes in one aligned Core 3MF assembly.

All processing remains browser-local. Small session caches retain source content, prepared geography, wall footprints and validated mesh templates. URL plus a SHA-256 content identity and the relevant geometry parameters determine reuse. **Refresh source** fetches the current URL again with browser response caching bypassed; identical content reuses geometry, changed content rebuilds it. Reloading the page clears geometry caches; local storage holds geographic settings and source-scoped placements. Local file inputs must be reimported after reload. The 3D view renders on changes and during orbit-control damping, then stops when stationary. Failed geometry cannot enable a partial download. The previous CSG comparison route remains available through `?geometry=csg`.

Map size sets the maximum XY geography extent in millimeters (default 200, range 10–500) before fixed-mm walls and connectors are generated. It does not shrink finished meshes. The legacy precision and viewport hints do not change geometry. Every retained exterior component receives a full floor. Connections (default) adds broad pads, Disconnected preserves separate bases, and Hull base fills their convex hull. Faces, pads and hull backing share the chosen base height. Underside grooves cut upward through 30% of that height, leaving 70% above them. Invalid dimensions and infeasible connector minima fail visibly and disable both exports. Source ownership is not reassigned, and genuine source voids remain explicit. [Community-enclosure checks and limitations](diagnostics/COMMUNITY_TOPOLOGY.md).

## Performance and preset local review

[Current cache measurements, validation and limitations](diagnostics/CACHING.md). Height edits update Z, normals, bounds and checked volume without fetching, simplifying, finding connectors, running XY Booleans, triangulating caps or rebuilding the map SVG. New widths and modes still perform the geometry work their dependencies require. No worker or reduced-detail preview is used.

## 3MF and dimensions local review

[Downloaded-part viewer](diagnostics/3mf-review.html) · [Dimensions, package validation, actual times and limitations](diagnostics/3MF_DIMENSIONS.md). No public deployment or push. 3MF uses millimeters; import unitless STL as mm. No material/color assignment or mechanical strength guarantee is encoded. Slicer import has not been tested locally.

## Measured local investigation

See [the community-enclosure report](diagnostics/COMMUNITY_TOPOLOGY.md) and [earlier performance evidence](diagnostics/REPORT.md) for before/after results and exact-output checks, and [diagnostic instructions](diagnostics/README.md) for frozen input hashes, bounded commands, tests and artifacts. [Local review presets](diagnostics/review.html) load the frozen DC and Baltimore data into the actual app.
