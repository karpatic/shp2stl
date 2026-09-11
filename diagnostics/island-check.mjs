// Author: Codex app agent, 2026-09-11.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {heightRegions, layerGeometry, regionArea} from '../new/planar.js';
import pc from '../new/planar-boolean.js';
import {islandBase, padEngagement} from '../new/islands.js';
const rect=(x,y,w,h)=>[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]];
const fc=features=>({type:'FeatureCollection',features});
const line=coordinates=>({type:'Feature',properties:{boundaryRole:'exterior'},geometry:{type:'LineString',coordinates}});
const islands=[rect(0,0,10,10),rect(14,2,4,4),rect(14,12,3,3)];
const exterior=fc([{type:'Feature',geometry:{type:'MultiPolygon',coordinates:islands}}]);
const input={hull:exterior,sourceExterior:exterior,hullLines:fc(islands.map(p=>line(p[0]))),lines:fc(islands.map(p=>line(p[0]))),interiorLines:fc([])};
const options={width:.5,depth:6,sourceTopology:true,islandConnections:'disconnected'};
const disconnected=heightRegions(input,options);
// Full XY occupancy, including the interior of EVERY component. Bed-reaching
// perimeter strips or a minimum-Z check cannot satisfy this regression.
for(const [i,p] of islands.entries()) {
  assert.equal(pc.difference([p],disconnected.layers[1]).length,0,`Island ${i} is missing filled base area`);
  assert.equal(pc.difference([p],disconnected.layers[0]).length,0,`Island ${i} has an empty underside`);
}
assert.equal(regionArea(disconnected.layers[1]),125);
console.log('PASS: every retained exterior has a fully occupied base and underside');

const levels=[0,1.8,6,12];
for(const mode of ['connections','disconnected','hull']) {
  const r=heightRegions(input,{...options,islandConnections:mode});
  assert.deepEqual(r.L,disconnected.L,'Supports must never modify community walls');
  assert.equal(pc.difference(disconnected.layers[1],r.layers[1]).length,0);
  assert.equal(r.layers[1].length,mode==='disconnected'?3:1);
  for(let i=0;i<levels.length;i++) for(const [side,a,b] of [['up',r.layers[i-1]||[],r.layers[i]||[]],['down',r.layers[i]||[],r.layers[i-1]||[]]])
    assert.equal(pc.xor(r.caps[i][side],pc.difference(a,b)).length,0,'Factored caps equal complete set differences');
  assert(layerGeometry(r.layers,levels,r.caps).userData.validation.closed);
  if(mode==='connections') {
    assert.equal(r.connections.links.length,2);
    assert.equal(r.connections.width,2);
    assert.equal(r.connections.links.reduce((s,l)=>s+l.distance,0),4+Math.sqrt(20),'Use the two shortest boundary gaps');
    for(const l of r.connections.links) for(const i of [l.i,l.j]) assert(regionArea(pc.intersection(l.footprint,[r.land[i]]))>0,'Every bridge attaches with positive volume');
    assert.deepEqual(heightRegions(input,{...options,islandConnections:mode}),r,'Deterministic links');
    assert.deepEqual(heightRegions(input,{...options,islandConnections:undefined}),r,'Fresh default is connections');
  }
  if(mode==='hull') assert.equal(r.H[0].length,1,'Continuous hull floor has no through-holes');
}
// Single-component geography needs no bridge or added bridge footprint.
const single=structuredClone(input);
single.hull=single.sourceExterior=fc([{type:'Feature',geometry:{type:'MultiPolygon',coordinates:[islands[0]]}}]);
single.lines=single.hullLines=fc([line(islands[0][0])]);
const one=heightRegions(single,{...options,islandConnections:'connections'});
assert.equal(one.connections.links.length,0);
assert.deepEqual(one.H,one.land);
// A central source void rim stays floored, never a new through-hole.
const rim=line(rect(3,3,2,2)[0]);rim.properties.boundaryRole='interior';
single.lines.features.push(rim);single.hullLines.features.push(rim);
const voidFloor=heightRegions(single,options);
assert.equal(pc.difference(rect(3,3,2,2),voidFloor.layers[0]).length,0);
assert(layerGeometry(voidFloor.layers,levels,voidFloor.caps).userData.validation.closed);
assert.throws(()=>heightRegions(input,{...options,islandConnections:'unknown'}),/Unknown/);
console.log('PASS: all modes, MST lengths, positive-volume attachment, deterministic default, exact caps, unchanged walls, central void floor, single island and manifold meshes');

// Four ordered contact points on nearby facing stretches, with real overlap.
const facing=[rect(0,0,20,20),rect(26,0,12,20)];
const pad=islandBase(facing,{width:.5}).links[0];
assert.equal(pad.kind,'shore-pad');
assert(pad.width>=7,'A broad attachment, scaled to the gap and source size');
assert(pad.contacts[0].every(p=>p[0]===20));
assert(pad.contacts[1].every(p=>p[0]===26));
assert.equal(pad.quad.length,4);
for(const [i,a] of pad.quad.entries()) {
  const b=pad.quad[(i+1)%4],c=pad.quad[(i+2)%4];
  assert((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])>0,'No self-crossing or concave quad');
}
assert(regionArea(pad.footprint)<100,'Bounded local pad cannot engulf the islands');
for(const p of facing)assert(regionArea(pc.intersection(pad.footprint,[p]))>1);
// Compact local fallback still has the same dimensional requirements. An
// island below them must fail explicitly, even though a union could be closed.
const scaledFacing=facing.map(p=>p.map(r=>r.map(point=>point.map(v=>v*2))));
const scaledPad=islandBase(scaledFacing,{width:1}).links[0];
assert.equal(scaledPad.width,2*pad.width,'Pad width follows exported coordinate scale and wall width');
assert(Math.abs(scaledPad.engagement[0].penetration-2*pad.engagement[0].penetration)<1e-9);
const small=[facing[0],rect(24,6,1.2,2)];
const fallback=islandBase(small,{width:.5});
assert.equal(fallback.links[0].kind,'solid-fallback');
assert(fallback.links[0].engagement.every(e=>e.accepted));
assert.equal(fallback.links[0].filledCornerPockets,0);
assert(layerGeometry([fallback.footprint],[0,6]).userData.validation.closed);
for(const tiny of [rect(24,6,.3,.4),[[[24,0],[24.2,.1],[24,8],[23.8,.1],[24,0]]]])
  assert.throws(()=>islandBase([facing[0],tiny],{width:.5}),/continuous broad engagement/);

// C-shaped base: wide endpoint separation and ample total overlap, but only
// two isolated tips attach. Test the engagement rule itself, independently of
// the separate pocket check (a watertight connected solid is insufficient).
const cShore=[[[0,0],[10,0],[10,2],[2,2],[2,8],[10,8],[10,10],[0,10],[0,0]]];
const falsePad=rect(9.3,1,6.4,8),other=rect(15,0,10,10);
const falseEnd=[[10,1],[10,9]];
const weak=padEngagement(falsePad,[cShore],falseEnd,[-1,0],.7,2,8);
assert(regionArea(pc.intersection(falsePad,[cShore]))>8*.7*.2,'Old aggregate-area gate passes');
assert.equal(pc.intersection(falsePad,[cShore]).length,2,'Only the two tips touch');
assert.equal(pc.union([cShore,other],falsePad).length,1,'Union is connected');
assert(layerGeometry([pc.union([cShore,other],falsePad)],[0,6]).userData.validation.closed,'Even a manifold mesh can be weak');
assert(!weak.accepted && weak.width<1.01,'Wide C-tip contact must be rejected');
// Rotate into a U to avoid an axis-dependent regression.
const rotate=ps=>ps.map(p=>p.map(r=>r.map(([x,y])=>[-y,x])));
assert(!padEngagement(rotate([falsePad]),rotate([cShore]),falseEnd.map(([x,y])=>[-y,x]),[0,-1],.7,2,8).accepted);
// A hairline along the mouth makes the two tip overlaps one connected patch,
// without supplying penetration through the intended end. Still reject it.
const hairline=pc.union([cShore],rect(9.3,1,.02,8));
assert.equal(pc.intersection(falsePad,hairline).length,1);
assert(!padEngagement(falsePad,hairline,falseEnd,[-1,0],.7,2,8).accepted);
const corner=rect(9.99,8.99,.02,.02);
assert(!padEngagement(falsePad,[corner],falseEnd,[-1,0],.7,2,8).accepted);
// A notch narrower than any reasonable sampling step must split the band.
const notch=pc.difference(rect(0,0,10,10),rect(9,4.9999,2,.0002));
assert(!padEngagement(falsePad,notch,falseEnd,[-1,0],.7,2,8).accepted);
const alternate=islandBase([cShore,other],{width:.5});
assert(alternate.links.every(l=>l.engagement.every(e=>e.accepted)));
assert(!pc.union([cShore,other],...alternate.links.map(l=>l.footprint)).some(p=>p.length>1),'Use a local span without trapping/filling the inlet');
assert.equal(pc.intersection(rect(2.01,2.01,7,5.98),alternate.footprint).length,0,'Source inlet stays open');
for(const link of [pad,fallback.links[0],...alternate.links]) {
 assert(link.neckWidth>=link.requiredNeckWidth);
 for(const e of link.engagement)assert(e.width>=e.requiredWidth && e.penetration>=e.requiredPenetration);
}
console.log('PASS: regular quad and compact fallback; C/U tips, hairline, corner and sub-sample notch rejected; alternate shore leaves inlet open; undersized islands fail explicitly');

// A genuine hole in source land keeps its original inward rim, while the
// established floor convention fills below it in every support mode.
const holed=structuredClone(single);
holed.sourceExterior.features[0].geometry.coordinates[0].push(rect(3,3,2,2)[0]);
const hole=heightRegions(holed,options);
assert.equal(pc.difference(rect(3,3,2,2),hole.layers[0]).length,0);
for(let i=0;i<levels.length;i++)for(const [side,a,b] of [['up',hole.layers[i-1]||[],hole.layers[i]||[]],['down',hole.layers[i]||[],hole.layers[i-1]||[]]])
  assert.equal(pc.xor(hole.caps[i][side],pc.difference(a,b)).length,0);
assert(layerGeometry(hole.layers,levels,hole.caps).userData.validation.closed);
console.log('PASS: actual source-hole floor, rim and factored caps');

if(process.argv.includes('--evidence')) {
 fs.mkdirSync('diagnostics/results/island-pads',{recursive:true});
 fs.writeFileSync('diagnostics/results/island-pads/synthetic.json',JSON.stringify({author:'Codex app agent',date:'2026-09-11',cShore,other,falsePad,weak,alternate,facing,pad,small,fallback},null,2));
}

// Explicit minimum drives broad and fallback search independently of wall width.
for(const minimum of [1.2,1.6,2]) {
 const result=islandBase(facing,{width:.5,minConnectorWidth:minimum});
 assert.deepEqual(islandBase(facing,{width:1,minConnectorWidth:minimum}),result);
 for(const link of result.links) {
  assert(link.neckWidth>=minimum);
  assert.equal(link.requiredNeckWidth,minimum);
  for(const e of link.engagement) {
   assert(e.width>=minimum && e.requiredWidth>=minimum);
   assert.equal(e.requiredPenetration,minimum/4);
   assert(e.penetration>=e.requiredPenetration);
  }
 }
 assert(!padEngagement(falsePad,[cShore],falseEnd,[-1,0],minimum/.6*.35,minimum/.6,8).accepted);
}
assert.throws(()=>islandBase(small,{width:.5,minConnectorWidth:4}),/continuous broad engagement/);
for(const mode of ['disconnected','hull'])assert(islandBase(small,{width:.5,minConnectorWidth:4,islandConnections:mode}).footprint.length);
for(const minConnectorWidth of [0,-1,NaN,Infinity,201])assert.throws(()=>islandBase(facing,{width:.5,minConnectorWidth}),/Minimum connector width/);
console.log('PASS: explicit minima, positive depth, independent wall width, stricter concave rejection, infeasible minimum and alternate modes');
