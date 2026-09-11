# SHP2STL

Convert GeoJSON boundaries into extruded geometry with internal cuts, then download the scene as a binary STL.

Author of this updated guide: Codex app agent · September 11, 2026.

## Run locally

Serve this directory over HTTP and open `app.html`:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765/app.html>. Edit the URL, depth, line width or simplification settings, then click **Create**. Settings persist in local storage and creation reloads the page. **Download STL** becomes available only after the complete solid passes validation. Drag or scroll in the 3D view to inspect the model.

The application is static; npm is only needed for the optional diagnostic tools. `index.html` is the landing page, `app.html` the configurable app, and `new.html` the older entry point. `demo.html` demonstrates CSG independently.

## Current geometry pipeline

1. Preserve original Polygon and MultiPolygon coordinates and apply the existing exterior-component area policy.
2. Node intersections and build a shared source-arc topology. Simplification is bounded by wall width; exterior shortcuts cannot cross other boundaries.
3. Generate the boundary network in XY. Place exterior walls inside the coastline so narrow source-water inlets stay open; derive underside grooves from shared community arcs.
4. Extrude the floor, grooves and raised walls as a single solid and validate its edges, vertex links, triangles and volume.
5. Paint the actual wall footprint and validated solid, then download that solid as STL.

All processing remains browser-local. The 3D view renders on changes and during orbit-control damping, then stops when stationary. Failed geometry cannot enable a partial download. The previous CSG comparison route remains available through `?geometry=csg`.

Scaling still uses a fixed extent of 200; the UI's `precision` and `scaleToThisSize` do not override it. The first exterior component receives a full floor; other retained exterior components receive supported perimeter walls. Source ownership is not reassigned, and genuine source voids remain explicit. [Community-enclosure checks and limitations](diagnostics/COMMUNITY_TOPOLOGY.md).

## Measured local investigation

See [the community-enclosure report](diagnostics/COMMUNITY_TOPOLOGY.md) and [earlier performance evidence](diagnostics/REPORT.md) for before/after results and exact-output checks, and [diagnostic instructions](diagnostics/README.md) for frozen input hashes, bounded commands, tests and artifacts. [Local review presets](diagnostics/review.html) load the frozen DC and Baltimore data into the actual app.
