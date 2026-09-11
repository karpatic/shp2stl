# SHP2STL

Convert GeoJSON boundaries into extruded geometry with internal cuts, then download the scene as a binary STL.

Author of this updated guide: Codex app agent · September 11, 2026.

## Run locally

Serve this directory over HTTP and open `app.html`:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765/app.html>. Edit the URL, depth, line width or simplification settings, then click **Create**. Settings persist in local storage and creation reloads the page. **Download STL** becomes available only after every cut succeeds. Drag or scroll in the 3D view to inspect the model.

The application is static; npm is only needed for the optional diagnostic tools. `index.html` is the landing page, `app.html` the configurable app, and `new.html` the older entry point. `demo.html` demonstrates CSG independently.

## Current geometry pipeline

1. Fetch GeoJSON and apply the existing MultiPolygon rounding/deduplication.
2. Union the original features for the outline, then simplify that outline.
3. Separately simplify the input polygons and union them for the solid hull. These unions have different inputs.
4. Detect shared borders once. Trim their endpoints against the hull to create **interior lines**.
5. Reproject all layers about the same geographic center and scale using the hull bounds.
6. Extrude the hull, the outline, the shared-border visualization and the interior cutters. Subtract each interior cutter in order, at the existing 0.3 depth scale.
7. Render and export the complete scene, including the outline and raised shared-border meshes.

The local CSG module retains upstream intersection rules and material groups. It indexes temporary split fragments, falls back to the original predicate for ill-conditioned triangles, avoids unused ray-hit interpolation, and reduces edge-key and evaluator allocation. Failed geometry or cuts stop creation; they are never exported as a successful partial model.

The 3D view renders on changes and during orbit-control damping, then stops rendering when stationary.

Existing behavior is intentionally retained: scaling currently uses a fixed extent of 200; `precision` and `scaleToThisSize` in the UI do not override it. Only the first hull geometry participates in CSG. The outline/shared-border layers are also exported. The current baseline can contain degenerate triangles and unmatched edges; this optimization does not repair its topology or change its island filtering.

## Measured local investigation

See [the evidence report](diagnostics/REPORT.md) for before/after results and exact-output checks, and [diagnostic instructions](diagnostics/README.md) for frozen input hashes, bounded commands, tests and artifacts. [Local review presets](diagnostics/review.html) load the frozen DC and Baltimore data into the actual app.
