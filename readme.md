# SHP2STL

Convert GeoJSON boundaries into extruded geometry with internal cuts, then download a unified binary STL or a 3MF assembly with named Base and Walls parts.

Author of this updated guide: Codex app agent · September 11, 2026.

## Run locally

Serve this directory over HTTP and open `app.html`:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765/app.html>. Edit the URL, base height, wall height above the base, minimum connector width, wall width or simplification settings, then click **Create**. Dimensions are in millimeters; defaults remain a 6 mm base plus 6 mm walls. Settings persist in local storage. Height and connector edits rebuild in place and preserve the camera; geography and wall-width edits reload for preprocessing. Both downloads become available only after the complete solid and both named parts pass validation. Drag or scroll in the 3D view to inspect the model.

The application is static; npm is only needed for the optional diagnostic tools. `index.html` is the landing page, `app.html` the configurable app, and `new.html` the older entry point. `demo.html` demonstrates CSG independently.

## Current geometry pipeline

1. Preserve original Polygon and MultiPolygon coordinates and apply the existing exterior-component area policy.
2. Node intersections and build a shared source-arc topology. Simplification is bounded by wall width; exterior shortcuts cannot cross other boundaries.
3. Generate the boundary network in XY. Place exterior walls inside the coastline so narrow source-water inlets stay open; derive underside grooves from shared community arcs.
4. Extrude the floor, grooves and raised walls as a single solid and validate its edges, vertex links, triangles and volume.
5. Paint the actual wall footprint and validated solid; download that unified solid as STL, or separately capped Base and Walls meshes in one aligned Core 3MF assembly.

All processing remains browser-local. The 3D view renders on changes and during orbit-control damping, then stops when stationary. Failed geometry cannot enable a partial download. The previous CSG comparison route remains available through `?geometry=csg`.

Scaling still uses a fixed XY extent of 200 mm; the UI's `precision` and legacy `scaleToThisSize` do not override it. Every retained exterior component receives a full floor. Connections (default) adds broad pads, Disconnected preserves separate bases, and Hull base fills their convex hull. Faces, pads and hull backing share the chosen base height. Underside grooves cut upward through 30% of that height, leaving 70% above them. Invalid dimensions and infeasible connector minima fail visibly and disable both exports. Source ownership is not reassigned, and genuine source voids remain explicit. [Community-enclosure checks and limitations](diagnostics/COMMUNITY_TOPOLOGY.md).

## 3MF and dimensions local review

[Downloaded-part viewer](diagnostics/3mf-review.html) · [Dimensions, package validation, actual times and limitations](diagnostics/3MF_DIMENSIONS.md). No public deployment or push. 3MF uses millimeters; import unitless STL as mm. No material/color assignment or mechanical strength guarantee is encoded. Slicer import has not been tested locally.

## Measured local investigation

See [the community-enclosure report](diagnostics/COMMUNITY_TOPOLOGY.md) and [earlier performance evidence](diagnostics/REPORT.md) for before/after results and exact-output checks, and [diagnostic instructions](diagnostics/README.md) for frozen input hashes, bounded commands, tests and artifacts. [Local review presets](diagnostics/review.html) load the frozen DC and Baltimore data into the actual app.
