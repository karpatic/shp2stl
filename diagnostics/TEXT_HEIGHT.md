# Configurable label rise

Author: Codex app agent · 2026-09-12.

Implemented from clean `main` at `9985e3d`. Each label has a `height` in millimeters above the base, independently of font size, map size, base height and wall height. The existing default is 0.8 mm, including saved placements without this property. The control accepts finite values from 0.01 through 200 mm. Invalid selected edits leave the applied placements intact and downloads disabled. Placement, selected updates, removal, undo and source-scoped local storage share the existing edit history.

The XY cache key excludes height; the ready-output key includes the ordered label heights. A single validated template joins the base to all raised footprints without interface caps. Its separated wall/label columns have cached vertex ownership and footprint areas. Positive independent top mappings preserve their topology across equal or crossing heights. Every output retains immutable-template checks, noncollapsed-face checks and an independent expected-volume check. The aligned Labels part uses the same per-label tops. The existing source, connector, placement-clearance and export checks remain in effect.

## Verification

- Existing custom, cache and planar regression checks passed. The focused custom extension checks the original 0.8 mm solid volume, two independently rising labels, swapped heights, wall crossings/equal planes, base changes, full edge/vertex topology, assembly volume and template-tampering rejection. Label limits 0.01 and 200 mm were exercised with base heights 2.5, 6 and 200 mm; zero, negative, nonfinite, null, string and out-of-range heights were rejected.
- An isolated real Chromium run placed labels through the canvas with 0.8 and 1.6 mm controls, updated the selected label from 0.8 to 1.6 mm without changing the other placement or camera, rejected zero with both downloads disabled, and checked undo, removal, reload and an old saved label missing height. Each captured preview's triangle positions exactly matched the unified export mesh.
- Six pairs of actual STL/3MF downloads passed the existing independent Python mesh/3MF audit: default labels, different heights, walls at 0.4/1.6/3.5 mm, and a 2.5 mm base. Checks cover Z bounds, outward top caps at each label/wall plane, no internal downward caps, oriented manifold edges and vertex fans, named aligned parts, cross-section occupancy and unified/assembly volume equivalence. Surface area also accounts for precisely the removed base interfaces, detecting duplicate caps or overlapping shells.
- Across the selected label height update, three wall changes and one base change: **zero** source fetches, geography/connector builds, XY booleans, custom XY work, template builds or layer tessellations. Only five height computations and their twenty mesh validations ran.

[Painted side view](evidence/text-height/side.png): foreground A rises 1.6 mm; BO and perimeter walls rise 0.8 mm, above a 2.5 mm base. [Compact results](evidence/text-height/verification.json).

Browser downloads used frozen DC at 80 mm; focused geometry tests used the existing local drawing fixture. No physical print, Baltimore run or historical CSG suite was performed. Initial browser attempts required correcting test click projection after drawer resizing and reopening the restored drawer after reload. The final run and download audit passed; there are no outstanding blockers.

Reproduce from the repository root:

```sh
node --import ./diagnostics/register.mjs diagnostics/custom-check.mjs
node diagnostics/cache-check.mjs
node --import ./diagnostics/register.mjs diagnostics/planar-check.mjs
TEXT_HEIGHT_CHECK=1 LIMIT_SECONDS=90 node diagnostics/run.mjs optimized dc text-height
python3 diagnostics/text-height-evidence.py diagnostics/results/text-height
```

Local app: <http://127.0.0.1:8765/app.html>. This pass makes a local commit only; no push or deployment.
