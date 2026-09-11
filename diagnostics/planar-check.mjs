// Author: Codex app agent — 2026-09-11.
import assert from "node:assert/strict";
import { heightRegions, layerGeometry, validateSolid } from "../new/planar.js";
import pc from "../new/planar-boolean.js";
const rect = (x, y, w, h) => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ],
];
const H = pc.union(rect(0, 0, 10, 10));
const C = pc.union(rect(-1, 4, 12, 2), rect(4, -1, 2, 12));
const layers = [pc.difference(H, C), H, pc.intersection(H, C)],
  z = [0, 1.8, 6, 12];
const cross = layerGeometry(layers, z);
assert.ok(Math.abs(cross.userData.validation.volume - 751.2) < 1e-4);
const hole = pc.difference(H, rect(2, 2, 6, 6));
const holed = layerGeometry([hole], [0, 6]);
assert.ok(Math.abs(holed.userData.validation.volume - 384) < 1e-6);
const disconnected = layerGeometry(
  [pc.union(rect(0, 0, 1, 1), rect(3, 0, 1, 1))],
  [0, 2],
);
assert.equal(disconnected.userData.validation.volume, 4);
const broken = cross.clone();
broken.setIndex(Array.from(cross.index.array).slice(3));
assert.throws(() => validateSolid(broken, layers, z), /open or nonmanifold/);
assert.throws(() => layerGeometry([H], [0, 0]), /Invalid height/);
assert.throws(() => layerGeometry([[]], [0, 6]), /empty/);
console.log(
  "PASS: crossed underside grooves, raised crossings, holes, disconnected solids, incomplete-output rejection",
);

assert.throws(() => pc.union(rect(6e9, 0, 10, 10)), /integer range/);

// Restoring a rim must leave the floor and the underside groove beneath it.
const fc = features => ({type:'FeatureCollection',features});
const line = (coordinates, boundaryRole) => ({type:'Feature',properties:{boundaryRole},geometry:{type:'LineString',coordinates}});
const exterior = line(rect(0,0,10,10)[0], 'exterior');
const rim = line(rect(2,2,3,3)[0], 'interior');
const groove = line([[1,2],[9,2]]);
const inputs = {hull:fc([{type:'Feature',geometry:{type:'MultiPolygon',coordinates:[rect(0,0,10,10)]}}]),
  hullLines:fc([exterior]), lines:fc([groove]), interiorLines:fc([groove])};
const before = heightRegions(inputs,{depth:6,width:.5});
const after = heightRegions({...inputs,hullLines:fc([exterior,rim])},{depth:6,width:.5});
assert.deepEqual(after.layers.slice(0,2), before.layers.slice(0,2), 'interior rim preserves base and grooves');
assert.notDeepEqual(after.layers[2],before.layers[2], 'interior rim reaches raised walls');
assert.ok(layerGeometry(after.layers,z).userData.validation.closed);
console.log('PASS: restored interior rim above an unchanged floor and underside groove');

// Author: Codex app agent, 2026-09-11. A narrow open inlet must stay open.
const coast=[[0,0],[10,0],[10,10],[6,10],[6,8],[7,8],[7,6],[4,6],[4,8],[5.8,8],[5.8,10],[0,10],[0,0]];
const sourceExterior=fc([{type:'Feature',geometry:{type:'MultiPolygon',coordinates:[[coast]]}}]);
const sourceRegions=heightRegions({hull:sourceExterior,sourceExterior,hullLines:fc([line(coast,'exterior')]),lines:fc([line(coast),groove]),interiorLines:fc([groove])},{width:.5,depth:6,sourceTopology:true});
assert.equal(pc.intersection(sourceRegions.L,rect(5.875,7,.05,4)).length,0,'An open source-water path must not become a closed wall pocket');
assert.ok(pc.intersection(sourceRegions.L,rect(.39,4,.02,.02)).length,'Inward exterior wall keeps the full nominal width');
assert.equal(pc.intersection(sourceRegions.L,rect(.59,4,.02,.02)).length,0);
for(let i=0;i<z.length;i++){
 const low=sourceRegions.layers[i-1]||[],high=sourceRegions.layers[i]||[];
 assert.equal(pc.xor(sourceRegions.caps[i].up,pc.difference(low,high)).length,0,'Factored upper cap equals the full set difference');
 assert.equal(pc.xor(sourceRegions.caps[i].down,pc.difference(high,low)).length,0,'Factored lower cap equals the full set difference');
}
assert.ok(layerGeometry(sourceRegions.layers,z,sourceRegions.caps).userData.validation.closed);
console.log('PASS: open inlet, full-width inward wall, exact factored cap identities and closed solid');
