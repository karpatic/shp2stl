# Homepage model preview

Author: Codex app agent · 2026-09-11.

`dc-model.webp` is a cropped screenshot of the actual default SHP2STL DC model, not a print photograph or generated illustration. The app uses the public [2012 DC ward boundaries](https://raw.githubusercontent.com/benbalter/dc-maps/master/maps/ward-2012.geojson), frozen unchanged in `diagnostics/fixtures/dc.geojson` for repeatable capture. Source identity and hash are recorded in `diagnostics/fixtures/manifest.json`.

Captured using the existing browser harness with `POLISH_CHECK=1`: default 200 mm map, 6 mm base, 6 mm walls, 0.5 mm wall width, Connections mode and 1.2 mm minimum. Only the review camera changes: position (70, -135, 210), target (0, 0, 3). The first 672 × 828 canvas capture in `diagnostics/results/polish-layout-dc/dc-preview.png` was cropped to (80, 195, 620, 659) and encoded as WebP at quality 92. Model geometry, lighting and colors were not edited.
