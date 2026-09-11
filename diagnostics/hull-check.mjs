// Author: Codex app agent — 2026-09-11. Boundary provenance, not a ban on closure.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getConvexHull, getConvexHullLines, simplifyGeoJSON, truncateGeoJSON } from '../new/leaflet.js';
for (const file of ['turf', 'server', 'client', 'simplify'])
  vm.runInThisContext(readFileSync(`diagnostics/fixtures/${file}.js`, 'utf8'));
const edges = lines => lines.flatMap(r=>r.slice(1).map((p,i)=>JSON.stringify([r[i],p]))).sort();
const failures = [];
async function check(name, source) {
  truncateGeoJSON(source);
  const original = structuredClone(source);
  const hull = getConvexHull(source);
  const rings = hull.features[0].geometry.coordinates.flat();
  const actual = getConvexHullLines(source);
  const expected = turf.featureCollection(hull.features[0].geometry.coordinates.flatMap(p=>p.map((r,i)=>turf.lineString(r,{boundaryRole:i?'interior':'exterior'}))));
  const simplified = await simplifyGeoJSON(actual, .01);
  const oracle = await simplifyGeoJSON(expected, .01);
  const actualRings = actual.features.map(f=>f.geometry.coordinates);
  const allowed = new Set(edges(rings));
  const invented = edges(actualRings).filter(e=>!allowed.has(e));
  console.log(JSON.stringify({name, polygons:hull.features[0].geometry.coordinates.length,
    rings:rings.length, paths:actualRings.length, inventedSegments:invented.map(JSON.parse),
    simplifiedPaths:simplified.features.length}));
  try {
    assert.equal(invented.length, 0, `${name}: inter-ring segments are not hull boundaries`);
    assert.deepEqual(edges(actualRings), edges(rings), `${name}: retain every boundary edge, including closure`);
    assert.deepEqual(actualRings, rings, `${name}: one path per exterior/hole ring in source order`);
    assert.deepEqual(simplified.features.map(f=>f.geometry), oracle.features.map(f=>f.geometry), `${name}: simplify separate boundaries without connectors`);
    for (const f of simplified.features) assert.deepEqual(f.geometry.coordinates[0], f.geometry.coordinates.at(-1), `${name}: retain ring closure`);
    assert.deepEqual(source, original, `${name}: do not mutate source`);
  } catch (error) { failures.push(error.message); }
}
for (const name of ['dc','baltimore']) await check(name, JSON.parse(readFileSync(`diagnostics/fixtures/${name}.geojson`)));
const square = (x,y,s) => [[x,y],[x+s,y],[x+s,y+s],[x,y+s],[x,y]];
await check('exterior + hole + disconnected island', turf.featureCollection([
  turf.polygon([square(0,0,4),square(1,1,1).reverse()]), turf.polygon([square(6,0,2)]),
]));
assert.equal(failures.length, 0, failures.join('\n'));
console.log('PASS: frozen hull edge provenance, exterior/hole/island separation, simplification and closure');
