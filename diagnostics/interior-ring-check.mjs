// Author: Codex app agent — 2026-09-11.
// Expectations come from source rings, never the filtered production hull.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getConvexHull, getConvexHullLines, simplifyGeoJSON } from '../new/leaflet.js';
for (const file of ['turf', 'server', 'client', 'simplify'])
  vm.runInThisContext(readFileSync(`diagnostics/fixtures/${file}.js`, 'utf8'));
const square = (x, y, s) => [[x,y],[x+s,y],[x+s,y+s],[x,y+s],[x,y]];
const edgeKey = ring => ring.slice(1).map((p,i) => [ring[i],p].map(JSON.stringify).sort().join('|')).sort();
const smallRing = square(.01,.01,.00001);
const mixed = turf.featureCollection([turf.lineString(square(0,0,1)), turf.lineString(smallRing, {boundaryRole: 'interior'})]);
const mixedOriginal = structuredClone(mixed);
const simplifiedMixed = await simplifyGeoJSON(mixed, .01);
assert.deepEqual(simplifiedMixed.features[1].geometry.coordinates, smallRing,
  'interior rings must retain their source perimeter through simplification');
assert.deepEqual(mixed,mixedOriginal);
for (const side of [.0034, .0036]) {
  const exterior = square(0,0,.04), hole = square(.01,.01,side).reverse();
  const island = square(.06,0,.001), retainedIsland = square(.08,0,.004);
  const source = turf.featureCollection([turf.polygon([exterior,hole]), turf.polygon([island]), turf.polygon([retainedIsland])]);
  const original = structuredClone(source);
  const area = turf.area(turf.polygon([hole]));
  assert.equal(area < 150000, side === .0034);
  const hull = getConvexHull(source).features[0].geometry;
  assert.equal(hull.type, 'MultiPolygon');
  assert.equal(hull.coordinates.length, 2, 'discard small exterior island, retain large island');
  assert.deepEqual(hull.coordinates.map(p=>p.length), [2,1], `preserve interior ring (${area} m²)`);
  const boundaryLines = getConvexHullLines(source);
  assert.deepEqual(boundaryLines.features.map(f=>f.properties.boundaryRole), ['exterior','interior','exterior']);
  const simplified = await simplifyGeoJSON(boundaryLines, .01);
  assert.deepEqual(simplified.features[1].geometry.coordinates, hole);
  const paths = boundaryLines.features.map(f=>f.geometry.coordinates);
  assert.deepEqual(paths.map(edgeKey), [exterior,hole,retainedIsland].map(edgeKey));
  for (const path of paths) assert.deepEqual(path[0],path.at(-1), 'closed independent ring');
  assert.deepEqual(source,original,'source is unchanged');
  console.log(`PASS: ${area.toFixed(3)} m² interior hole; exterior island filtering and separate closed paths`);
}
// Raw union is an independent provenance oracle, before production filtering or
// simplification. Exercise every source hole, including narrow slivers.
for (const name of ['dc','baltimore']) {
  const raw = JSON.parse(readFileSync(`diagnostics/fixtures/${name}.geojson`));
  const union = raw.features.reduce((a,b)=>a ? turf.union(a,b) : b, null).geometry;
  const components = union.type === 'Polygon' ? [union.coordinates] : union.coordinates;
  const retained = components.filter(p=>union.type === 'Polygon' || turf.area(turf.polygon([p[0]])) >= 150000);
  const expected = retained.flat().map(edgeKey).sort();
  const paths = getConvexHullLines(raw).features.map(f=>f.geometry.coordinates);
  assert.deepEqual(paths.map(edgeKey).sort(), expected, `${name}: every retained raw source boundary survives`);
  for (const path of paths) assert.deepEqual(path[0],path.at(-1));
  console.log(`PASS: ${name}: ${retained.length} exterior components, ${retained.flat().length-retained.length} raw source holes`);
}
