# Session caches and presets

Author: Codex app agent · 2026-09-11.

Local continuation from `519f54a`. No push or deployment. The retained same-input browser runs measure action to enabled STL/3MF and the following painted frame (milliseconds). Frozen DC/Baltimore bytes and the existing harness were reused; no historical CSG runs.

| Action | DC before painted | DC after painted | Baltimore before painted | Baltimore after painted |
|---|---:|---:|---:|---:|
| Base 6 → 2.5 | 1221 | 162 | 4081 | 360 |
| Walls 6 → 3.5 | 1386 | 117 | 5138 | 301 |
| Heights → defaults | 1666 | 130 | 6099 | 239 |
| Unchanged Create | 1380 | 58 | 3507 | 57 |

Single runs, not guarantees. Timing data: `results/cache-timing-{before,after}-{dc,baltimore}/cache-actions.json`. The original baseline rebuilds three meshes on every action. Height edits now perform zero fetches, topology preparation, connector searches, XY booleans, cap triangulations or SVG rebuilds. Indices/XY and validated vertex links are retained; changed Z, normals, bounds, face validity and actual volume are checked. Unchanged Create does no mesh work and paints zero additional 3D frames.

Source LRU: 3 URL/content entries; prepared geography and wall footprints: 3 each; solid templates: 6. SHA-256 source identity and actual dependencies key geometry. Pending fetches are shared, failed work is evicted and retryable, and revision checks stop obsolete requests from publishing. Refresh source bypasses response caching and compares content. Sources and geometry stay in this browser session; saved settings retain explicit/custom URLs. Fresh startup selects DC; query URL overrides saved URL. Preset URLs match the established frozen-source manifest.

`npm test` passed. `CACHE_CHECK=1 LIMIT_SECONDS=180 node diagnostics/run.mjs optimized dc cache-final-review` passed heights, unchanged Create, minimum/mode/width changes, DC/Baltimore switches, unchanged/changed refresh, source failure/retry, shared pending work, latest request wins, fresh default, saved custom URL and explicit query precedence. Earlier bounded Baltimore runs remain under `cache-verified-baltimore` and `cache-timing-after-baltimore`. Default DC STL was compared with the retained dimensions baseline. Interrupted harness attempts are incomplete evidence, not implementation failures or successful runs.

[App](http://127.0.0.1:8765/app.html) · [Frozen review presets](http://127.0.0.1:8765/diagnostics/review.html).
