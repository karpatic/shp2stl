// Author: Codex app agent, 2026-09-11.
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import {nodePolygons,communityBoundaries,simplifyTopology} from '../new/boundaries.js';
for(const s of ['turf','server','client','simplify'])vm.runInThisContext(fs.readFileSync(`diagnostics/fixtures/${s}.js`,'utf8'));
const polygon=r=>turf.polygon([r]);
const source=turf.featureCollection([
 polygon([[0,0],[4,0],[4,4],[0,4],[0,0]]),
 polygon([[2,-1],[3,-1],[3,5],[2,5],[2,-1]])
]);
const copy=structuredClone(source),noded=nodePolygons(source);
assert.deepEqual(source,copy);
for(const f of noded.features)for(const p of [[2,0],[3,0],[2,4],[3,4]])assert(f.geometry.coordinates[0].some(q=>q[0]===p[0]&&q[1]===p[1]),'Each crossing must be shared by both polygons');
const partial=nodePolygons(turf.featureCollection([polygon([[0,0],[4,0],[4,4],[0,4],[0,0]]),polygon([[2,0],[3,0],[3,-1],[2,-1],[2,0]])]));
for(const p of [[2,0],[3,0]])assert(partial.features[0].geometry.coordinates[0].some(q=>q[0]===p[0]&&q[1]===p[1]),'Node partial collinear overlaps');
// Multipolygon and Polygon representations of the same source must agree.
const square=polygon([[0,0],[.04,0],[.04,.04],[0,.04],[0,0]]);
const multi=structuredClone(square);multi.geometry={type:'MultiPolygon',coordinates:[multi.geometry.coordinates]};
const opt={width:.5,simplifyBy:.01};
assert.deepEqual(communityBoundaries(turf.featureCollection([square]),opt),communityBoundaries(turf.featureCollection([multi]),opt));
console.log('PASS: crossing/collinear noding, source immutability, equal Polygon/MultiPolygon treatment');
const hole=turf.polygon([[[0,0],[.04,0],[.04,.04],[0,.04],[0,0]],[[.01,.01],[.01,.03],[.03,.03],[.03,.01],[.01,.01]]]);
const voidResult=communityBoundaries(turf.featureCollection([hole]),opt);
assert.equal(voidResult.interiorLines.features.length,0,'A source void rim must not add an underside community groove');
const {strokeLines}=await import('../new/planar-boolean.js');
const strokes=coords=>strokeLines(turf.featureCollection(coords.map(c=>turf.lineString(c))),.5);
const elbow=strokes([[[-2,0],[0,0]],[[0,0],[0,2]]]);
assert(turf.booleanPointInPolygon(turf.point([.1,-.1]),turf.multiPolygon(elbow)),'Endpoint caps must overlap across a bent junction');
const returns=strokes([[[0,0],[3,0]],[[3,.01],[0,.01]]]);
assert.equal(returns.length,1);assert.equal(returns[0].length,1,'Opposing near-parallel arcs must not enclose a sliver');
console.log('PASS: source void has no new groove; positive-area arc junction and no duplicate-edge pocket');
