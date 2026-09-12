# Comparison reveal layout

Author: Codex app agent · 2026-09-12.

Corrects the misunderstood stacked layout. Map and 3D occupy identical, overlapping workspace rectangles. The map wrapper is the front layer, clipped with CSS inset; its canvas/Leaflet host never shrinks. The full-height vertical separator moves horizontally with a 44px hit target, pointer capture, touch drag, arrows (Shift for larger steps), and Home/End at 0/100%. Half the handle remains reachable at either endpoint. Fully concealed views are inert; local drawings retain the model-only presentation.

Settings slide from the right over both views, at a viewport-bounded width and height, with a scrolling body, explicit Close, Escape, focus return, and reduced-motion support. Update, status and downloads remain below the workspace. Placement feedback sits above both visual layers so the wipe cannot conceal its instructions. Existing control IDs, settings persistence, source/import/export behavior and per-label text heights are retained.

Wiping changes only clipping, handle position and accessibility state. It does not shift either layer, synchronize cameras, resize the rendering hosts, perform geometry work or introduce an animation loop. Perspective STL and Leaflet are independently navigable; this comparison does not promise pixel-geographic alignment. Existing actual-viewport resize observers remain unchanged.

## Bounded verification

- Chromium, frozen current DC/dependency fixtures: 1440×960, 390×844, 1280×540, 390×480 and 844×390; equal pane/host bounds at 0/50/100, full-height handle at the correct X, clip-based hit routing, bounded right drawer, reachable footer, no document overflow.
- Mouse, keyboard and emulated touch cancellation; released pointer capture; Escape focus return; drawer click/scroll isolation; actual independent map pan and model orbit; armed map clicks and separator drags create no placement; validated hole placement succeeds after wiping.
- Wiping preserves camera/target/map state, all source/topology/XY/geometry counters, renderer size and map size. Explicit instrumentation confirms zero renderer setSize/map invalidateSize calls and zero render frames during a stationary wipe sequence; idle rendering remains stopped.
- One current default download audit: closed manifold STL and 3MF parts, equal assembly volume and sections at Z=1/5/9. STL bytes match the existing approved text-height default artifact. Text-height browser regression and its six-case independent geometry audit pass; height edits reuse cached XY geometry.
- Actual live network app loaded successfully at http://127.0.0.1:8765/app.html. Visually inspected live-tile half-reveal and open-drawer screenshots, plus emulated mobile/short screenshots.

Evidence: [comparison-reveal](evidence/comparison-reveal/). Raw runs remain ignored under diagnostics/results/reveal-final, reveal-text-height and reveal-live. Reproduce the focused layout run with `LAYOUT_CHECK=1 EXPORT_3MF=1 LIMIT_SECONDS=100 node diagnostics/run.mjs optimized dc reveal-final`; the text regression uses `TEXT_HEIGHT_CHECK=1` and `python3 diagnostics/text-height-evidence.py diagnostics/results/reveal-text-height`.

Limits: Chromium only; touch and mobile sizes were emulated, not physical-device tests. Frozen fixture runs use placeholder basemap tiles; the two live desktop screenshots use real tiles. No historical geography regeneration, push or deployment.
