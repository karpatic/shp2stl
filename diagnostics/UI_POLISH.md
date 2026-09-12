# Homepage and builder UI polish

Author: Codex app agent · 2026-09-11.

The homepage now describes the working tool, links directly to the builder and converter, and shows an actual DC model render. It uses native HTML/CSS with no home-page JavaScript, remote font, decorative Three canvas, Bootstrap or old photo dependency. Preview provenance is in [assets/README.md](../assets/README.md).

The builder has a bounded settings sidebar ordered Source → Dimensions → Island connections → Customize, with native advanced/help disclosures and persistent Update, status and STL/3MF actions. Desktop preserves both workspaces; narrow desktop stacks them beside settings; mobile stacks settings and workspaces. Settings visibility persists, pending changes pause downloads, and placement feedback/cancel stays with the model. Existing IDs, defaults, immediate preset/mode application and geometry/cache implementation remain intact. Small placement-controller changes expose Cancel only when armed, move mobile users to the model, and enable label editing only for a selected label. Converter changes are visual only.

## Verification

Runs use the existing isolated Chrome harness, frozen public DC/Baltimore sources and bounded deadlines. Large raw artifacts remain ignored under `diagnostics/results/polish-*`; selected screenshots and a compact result are retained in `diagnostics/evidence/ui-polish/`.

- Default DC and Baltimore: exact downloaded binary STL, preview geometry arrays and every extracted 3MF member match shipped commit `1188b03a2f1dea4eed10a449d820be419a151883`. ZIP timestamps are excluded by comparing members.
- Cache UI: base/wall edits perform no fetch, geography, wall XY, region or template work; unchanged Update reuses ready output with zero renders. All island modes, both presets, width/minimum changes, unchanged/changed refresh, failed source recovery, overlapping requests and fresh/saved/query URL precedence passed.
- Customization UI: 40/80 mm sizes, physical wall/hole/text dimensions, actual hole and label previews/placements, Escape, removal, undo, selected text editing and rejection feedback passed. Actual STL/3MF downloads were saved; removing placements restores identical STL output. Decorated height edits retain cached XY work.
- Baltimore at 40 mm: infeasible Connections minimum is reported with exports disabled; switching to Hull base recovers and saves actual STL/3MF.
- Import/converter UI: local DC output equals URL-source output; supported SVG conversion, downloaded GeoJSON/shapefile ZIP, acknowledged builder handoff, ZIP reimport, source hole preservation and browser-local unsupported SVG handling passed. Both actual mesh exports were saved.
- Visual review: homepage and converter desktop/mobile, builder at 1440×960, 1280×540, 1024×768, 390×844 and reduced 390×480 viewport. Settings scroll, collapse/expand, native disclosures, focus, mobile arm/cancel, download access and horizontal overflow checks passed. A reduced viewport approximates keyboard space; no physical mobile keyboard or printer/slicer was used.
- Collapse and style-driven layout changes preserve camera position/target and trigger no model/cache work. No unexpected JavaScript errors in the successful UI runs. Source-error injection intentionally logs its rejected request.

Reproduce the focused checks (one browser run at a time):

```sh
POLISH_CHECK=1 LIMIT_SECONDS=90 node diagnostics/run.mjs optimized dc polish-final-ui
CACHE_CHECK=1 LIMIT_SECONDS=100 node diagnostics/run.mjs optimized dc polish-cache-dc
CUSTOM_CHECK=1 LIMIT_SECONDS=100 node diagnostics/run.mjs optimized dc polish-custom-dc
IMPORT_CHECK=1 LIMIT_SECONDS=100 node diagnostics/run.mjs optimized dc polish-import-dc
```

The geometry, pipeline, dimensions, island, boundary, caching, importer and STL/3MF exporter modules were not changed. No historical geometry suite was rerun for this presentation change.
