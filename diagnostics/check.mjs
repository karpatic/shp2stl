// Author: Codex app agent — 2026-09-11. Focused differential checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import * as oldCSG from './fixtures/csg.js';
import * as newCSG from '../three/three-bvh-csg.js';
import * as oldGeo from './.cache/baseline/new/leaflet.js';
import * as newGeo from '../new/leaflet.js';
vm.runInThisContext(readFileSync('diagnostics/fixtures/turf.js','utf8'));
let seed=875;
const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);

// Half-edge pairing must retain original hash collisions, duplicate directed
// edges, reversed edges and near coincident coordinates, not merely edge counts.
for (let round=0;round<30;round++) {
  const points=[];
  for(let i=0;i<40;i++) points.push([Math.floor(random()*10),Math.floor(random()*10),Math.floor(random()*10)]);
  const coords=[];
  for(let i=0;i<150;i++) for(let j=0;j<3;j++) {
    const point=points[Math.floor(random()*points.length)];
    coords.push(...point.map(x=>x+(random()<.2?1e-7:0)));
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  if(round%2)g.setIndex(Array.from({length:coords.length/3},(_,i)=>i));
  const before=new oldCSG.HalfEdgeMap(g),after=new newCSG.HalfEdgeMap(g);
  assert.deepEqual(after.data,before.data);
  assert.equal(after.unmatchedEdges,before.unmatchedEdges);
}

// Fragment order and every double-precision coordinate must match. Include
// repeated planes, coplanar triangles, reused pools and noncoplanar triangles.
const tuple=t=>[...t.a.toArray(),...t.b.toArray(),...t.c.toArray()];
let indexedPlanes=0, maxFragments=0;
for(let round=0;round<80;round++) {
  const base=new THREE.Triangle(new THREE.Vector3(0,0,0),new THREE.Vector3(10,0,0),new THREE.Vector3(0,10,0));
  const before=new oldCSG.TriangleSplitter(),after=new newCSG.TriangleSplitter();
  for(let reuse=0;reuse<2;reuse++) {
    before.initialize(base);after.initialize(base);
    for(let i=0;i<8;i++) {
      const tri=new THREE.Triangle(...Array.from({length:3},()=>new THREE.Vector3(random()*20-5,random()*20-5,round%2?0:random()*2-1)));
      before.splitByTriangle(tri);after.splitByTriangle(tri);
      indexedPlanes+=!!after.fragmentIndex;
      maxFragments=Math.max(maxFragments,after.triangles.length);
      assert.deepEqual(after.triangles.map(tuple),before.triangles.map(tuple));
    }
  }
}
assert.ok(indexedPlanes>0,'Exercise the indexed splitter path');
console.log({indexedPlanes,maxFragments});

// Near-collinear fragments must keep the upstream numerical predicate, even
// when a geometric bounding-box test would otherwise reject them.
for(const thinness of [1e-4,1e-6,1e-8,1e-10,0]) {
  const base=new THREE.Triangle(new THREE.Vector3(0,0,0),new THREE.Vector3(100,100,0),new THREE.Vector3(100,100+thinness,0));
  const before=new oldCSG.TriangleSplitter(),after=new newCSG.TriangleSplitter();
  before.initialize(base);after.initialize(base);
  for(let i=0;i<12;i++) {
    const x=i*8;
    const clip=new THREE.Triangle(new THREE.Vector3(x,-2,0),new THREE.Vector3(x+1,102,0),new THREE.Vector3(x+2,102+thinness,0));
    before.splitByTriangle(clip);after.splitByTriangle(clip);
    assert.deepEqual(after.triangles.map(tuple),before.triangles.map(tuple));
  }
}

const rect=(x,y,w=1,h=1)=>turf.polygon([[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]);
const features=turf.featureCollection([rect(0,0),rect(1,0),rect(0,1),rect(20,20),rect(1,1)]);
features.features[3].bbox=[0,0,1,1]; // Stale metadata must not affect rejection.
assert.deepEqual(newGeo.getOverlappingLines(features),oldGeo.getOverlappingLines(features));
const lines=newGeo.getOverlappingLines(features);
const snapshot=JSON.stringify(lines);
const hull={features:[{geometry:{coordinates:[[[[-1,-1],[3,-1],[3,3],[-1,3],[-1,-1]]]]}}]};
assert.deepEqual(newGeo.getInteriorLines(lines,hull),oldGeo.getInteriorLines(features,hull));
assert.equal(JSON.stringify(lines),snapshot,'Interior refinement must not mutate cached lines');
assert.deepEqual(newGeo.getOverlappingLines(turf.featureCollection([])),turf.featureCollection([]));

// A failed convergence must throw rather than overflow the stack or invent an endpoint.
const originalDistance=turf.pointToLineDistance;
let calls=0;
turf.pointToLineDistance=()=>++calls===2?200:0;
assert.throws(()=>newGeo.getInteriorLines(turf.featureCollection([turf.lineString([[0,0],[1,1]])]),hull),/did not converge/);
turf.pointToLineDistance=originalDistance;
console.log('PASS: half-edge data; splitter coordinates/order/cache reuse; shared overlaps; immutable inputs; convergence failure');
