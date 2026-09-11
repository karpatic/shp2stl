# Map size, holes, lettering and local files

Author: Codex app agent · 2026-09-11.

Local continuation of `519f54a`, following cache/preset commit `0f5ca6b`. No push or deployment. This is the main-app customization scope plus the small converter; no SVG editor or workshop was built.

[App](http://127.0.0.1:8765/app.html) · [SVG converter](http://127.0.0.1:8765/converter.html) · [Actual downloaded parts](http://127.0.0.1:8765/diagnostics/custom-review.html) · [Cache timings](CACHING.md)

## Main app

- **Map size** is the maximum XY geography extent, 10–500 mm, default **200 mm**. Coordinates are scaled before fixed-mm walls and connectors are generated. The finished mesh is never shrunk. Topology simplification's width-based bound uses the selected map size. Wall width remains an independent **0.5 mm** default; base and additional walls remain **6 + 6 mm**, connector minimum **1.2 mm**. The complete default DC and Baltimore STL files are byte-identical to the retained `519f54a` dimension evidence.
- **Hole**: set diameter first (default **3 mm**, range 1–30), arm the button, preview over an open face, and deliberately click. Escape/Cancel and Undo are available; select a placement to remove it. A drag orbits instead of placing. Circles have 96 segments (maximum radial chord error about 0.0081 mm at the largest permitted diameter).
- **Label**: set text and em size first (default **DC / 3 mm**, range 1–30 mm; 1–24 characters), arm Label, then click. The locally bundled licensed Helvetiker font produces actual outlined glyphs with counters; unsupported characters are rejected. Labels rise **0.8 mm** above the base. Select a label to change text/size in place or remove it. No HTML is evaluated from label text.
- A single controller handles both mutually exclusive placement modes. Up to **16 placements** per source. Coordinates are relative to the centered source extent, while hole diameter and text size remain physical millimeters. Up to 12 source-content histories persist locally; undo retains up to 20 changes per source in memory. Removing a label or hole restores the corresponding original geometry exactly in the tested cases.
- Placements must remain entirely supported. Edge/hole/wall clearance is at least the greater of 0.25 mm and the chosen wall width. Holes also avoid underside grooves and the complete connector footprints/attachments. Invalid positions are rejected with feedback; no keychain tab, geographic repair or relaxed connector minimum is introduced. Larger text or resizing can make existing placements invalid; exports stay disabled until dimensions are restored or the placement is removed/undone.
- Small font strokes and tight geographic features still require printer-specific judgment. Geometric validation is not a physical print/strength test.

Holes are explicitly subtracted from every occupied layer. The complete STL has only exterior surfaces. The aligned 3MF contains closed **Base**, **Walls**, and nonempty **Labels** parts in one assembly, with millimeter units and identity transforms. Parts contact at the base-top interface and do not overlap in volume. Labels are omitted entirely when absent; preview colors do not assign print materials. Actual slicer import/material assignment and physical printing remain untested.

Source preparation, topology, wall footprints, connector regions, edit footprints and validated mesh templates have separate bounded keys. Edited-region caches have four entries; template caches have six families. Label templates prepare all three wall/emboss vertical orderings once. Pure height changes—including crossing 0.8 mm—reuse XY, connector search and cap triangulation. Each output still checks actual faces, volume, normals and bounds. Data, mode, size, widths or edits invalidate only their dependencies. Failed work is retryable; revision checks prevent stale publication.

## Direct import and converter

Main-app import accepts **GeoJSON/JSON Polygon/MultiPolygon** (up to 1,000 features / 200,000 positions / 10 MB), and a real **ZIP containing one 2D Polygon shapefile with matching SHP, SHX and DBF**. Geographic ZIPs require a WGS84 geographic `.prj`; projected/Z/M shapefiles are not supported. DBF attributes are not imported. Malformed indices, unsafe ZIP paths, oversized archives (10 MB compressed, 30 MB expanded, 100 entries) and unsupported geometry are rejected. Local file bytes stay in this browser; reimport after a reload. Existing saved geographic/custom URL settings remain intact. Selecting an SVG in the main importer directs the user to choose it on the linked converter page.

The converter has file input, physical size, a rebuilt polygon preview, GeoJSON export, real shapefile ZIP export, and an explicit **Open in SHP2STL** action. It is deliberately a converter, with no editing tools. Supported vector fills are unioned; supported strokes become polygon footprints. Holes and supported nonzero/even-odd fill rules, group transforms, basic shapes and path curves survive. Curve flattening is bounded at approximately 0.011 mm for accepted bounds (30,000 sampled vertices maximum); complexity failures reject conversion. Nonuniform/skewed strokes are skipped with warnings. If unsupported/invisible content makes physical error bounds unreliable, conversion asks for a cropped SVG instead of guessing.

SVG limits are **1 MB, 500 elements, 20 levels, 200,000 path/point characters**. DTD/entities are rejected. Scripts/events, CSS, references/use, nested viewports, masks, filters, bitmaps, external resources, foreign objects and text/fonts are not converted; warnings list omitted elements/attributes. Text must first be outlined externally. Original markup is never injected into the live document: only reconstructed numeric polygon paths render. External URL paint values are rejected. Preview the supported result before using it.

Converted GeoJSON explicitly carries `shp2stl: {version: 1, coordinates: "local-mm"}`. These are Cartesian drawing coordinates, **not geographic longitude/latitude**. The main app bypasses geodesic projection, source-area filtering, geographic ownership, underside-groove and island-connector heuristics. It creates the polygon base (retaining source holes) and an inward perimeter wall of the chosen width after scaling. Geographic controls remain available for geographic sources; they do not add geography semantics to a drawing.

The ZIP contains actual `drawing.shp`, `.shx`, `.dbf`, a truthful local-millimeter `.prj`, explicit `.shp2stl.json` coordinate metadata, GeoJSON companion and README. No EPSG is fabricated; no color/layer/print-role fidelity is claimed. Open in SHP2STL uses a same-origin, size-limited local-storage envelope with version, random token and ten-minute expiry. The app consumes and validates it, then acknowledges successful geometry creation. Source data is not placed in a giant URL or posted to a server. Downloads are the durable way to retain converted source data.

## Focused evidence

`npm test` passes the retained boundary, source-hole, island floor, C/U shoreline, continuous-pad, height and cache regressions plus small new lettering and binary-format tests. No historical CSG regeneration or broad converter matrix was run.

Actual browser evidence:

- `custom-verified-final`: DC 40 mm / 0.5 mm walls; hole preview/click/cancel/remove/undo; text entered before placement, BOA, in-place text edit/undo/removal; unsupported glyph and off-base/wall rejection; 40 → 80 → 40 source-relative centers and fixed physical dimensions; height edits with both customizations, including crossing emboss height. Source/connector/XY/cap counters remain zero on height changes. Hole removal and label removal restore exact earlier STL bytes.
- `custom-baltimore-hull`: bounded Baltimore check. At 40 mm, Connections correctly rejects infeasible 1.2 mm engagement. Explicit Hull base selection succeeds with the same 0.5 mm walls; no automatic narrowing or repair. Its 200 mm default STL still matches the original baseline.
- `import-verified`: local DC file and equivalent URL yield identical STL; malicious-safe SVG with rotation, a circular hole and a stroked extension; no script execution or external SVG requests; actual GeoJSON/ZIP downloads, acknowledged main-app handoff and ZIP re-import; matching STL bytes, named parts and desktop/mobile screenshots; armed orbit drag adds no hole. No page errors.

Independent Python checks reuse the existing mesh reader and section/cap methods. They verify oriented edge incidence, manifold vertex fans, positive volume, exact 40 mm bounds, actual caps at each interface, and section agreement between the STL, aligned 3MF and explicit expected occupied regions. Hole footprints are the only permitted changes to base occupancy; label footprints and all **four BOA counters** are explicit expected regions. No unrelated ownership/free-space test is weakened to hide intended cuts. Part areas minus twice the contact area match the STL exterior area, checking absence of internal interface shells; part volumes sum to the STL volume. The official unmodified Core 1.4 XSD validates the new named-part packages.

The independent **pyshp 2.3.1** parser reads actual exported SHP/SHX/DBF: one polygon record, two rings (outer + hole), ID=1, maximum extent 40 mm and explicit local units. This parser is a temporary diagnostic dependency only; production has no new npm dependencies. FontLoader/SVGLoader are official Three r176 modules with retained MIT license. SVGLoader is converter-only; the 63 KB licensed font data is loaded only when labeling is requested.

| DC 40 mm artifact | STL triangles | Base / Walls / Labels triangles | STL volume (mm³) |
|---|---:|---|---:|
| No placements, 6 + 6 mm | 3698 | 1900 / 1996 / — | 3849.17681 |
| Hole + BOA, 6 + 6 mm | 6864 | 2480 / 1996 / 1624 | 3810.36482 |
| Hole + BOA, 2.5 + 3.5 mm | 6864 | 2480 / 1996 / 1624 | 1697.15976 |

[Live app screenshot](results/custom-verified-final/keychain.png) · [Aligned parts](results/custom-verified-final/aligned.png) · [Separated parts](results/custom-verified-final/exploded.png) · [Converter preview](results/import-verified/converter.png) · [Mobile app](results/import-verified/mobile-app.png).

Reproduction uses the existing bounded harness: `CUSTOM_CHECK=1 LIMIT_SECONDS=90 node diagnostics/run.mjs optimized dc custom-verified-final`; `IMPORT_CHECK=1 LIMIT_SECONDS=90 node diagnostics/run.mjs optimized dc import-verified`; `python3 diagnostics/custom-evidence.py diagnostics/results/custom-verified-final`; `python3 diagnostics/import-evidence.py diagnostics/results/import-verified`; `python3 diagnostics/shape-evidence.py diagnostics/results/import-verified`. Raw downloads/source snapshots remain local under ignored results directories; selected summaries/screenshots are retained for review. Earlier interrupted or superseded attempts are not counted as successful validation.
