// Author: Codex app agent — 2026-09-11. Bidirectional surface and coverage checks.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const paths=process.argv.slice(2,4);
const meshes=paths.map(path=>{
  const data=JSON.parse(readFileSync(path+'/result-geometry.json'));
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));
  if(data.index)g.setIndex(data.index);
  return {g,bvh:new MeshBVH(g,{indirect:true}),data};
});
const point=new THREE.Vector3(),target={};
function distanceSamples(source,dest) {
  const p=source.g.attributes.position,index=source.g.index;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  let count=0,max=0,sum=0,above1e6=0,above1e4=0,worst=null;
  for(let i=0;i<(index?.count??p.count);i+=3) {
    a.fromBufferAttribute(p,index?index.getX(i):i);
    b.fromBufferAttribute(p,index?index.getX(i+1):i+1);
    c.fromBufferAttribute(p,index?index.getX(i+2):i+2);
    // Every vertex, every edge midpoint and every triangle centroid, including
    // tiny/sliver triangles. Area-only random samples would miss narrow cuts.
    for(const weights of [[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]]) {
      point.set(0,0,0).addScaledVector(a,weights[0]).addScaledVector(b,weights[1]).addScaledVector(c,weights[2]);
      const hit=dest.bvh.closestPointToPoint(point,target);
      if(!hit || !Number.isFinite(hit.distance))throw Error('Invalid closest point');
      count++;sum+=hit.distance;
      if(hit.distance>max){max=hit.distance;worst={point:point.toArray(),closest:hit.point.toArray(),triangle:i/3};}
      above1e6+=hit.distance>1e-6;above1e4+=hit.distance>1e-4;
    }
  }
  return {count,max,mean:sum/count,above1e6,above1e4,worst};
}
const surface=[distanceSamples(meshes[0],meshes[1]),distanceSamples(meshes[1],meshes[0])];

// All vertical surface heights on a deterministic XY grid. Comparing complete
// hit lists catches missing groove floors/roofs even where nearest-surface
// distances are small. Merge coincident intersections at triangulation seams.
const ray=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(0,0,-1));
const heights=bvh=>{
  const zs=bvh.raycast(ray,THREE.DoubleSide).map(h=>h.point.z).sort((a,b)=>a-b);
  return zs.filter((z,i)=>!i||z-zs[i-1]>1e-5);
};
let gridPoints=0,coverageMismatches=0,maxHeightDelta=0;
const examples=[];
for(let x=-100.123;x<100;x+=.5)for(let y=-100.321;y<100;y+=.5) {
  ray.origin.set(x,y,20);const a=heights(meshes[0].bvh),b=heights(meshes[1].bvh);gridPoints++;
  const mismatch=a.length!==b.length||a.some((z,i)=>Math.abs(z-b[i])>1e-5);
  if(mismatch){coverageMismatches++;if(examples.length<5)examples.push({x,y,a,b});}
  if(a.length===b.length)for(let i=0;i<a.length;i++)maxHeightDelta=Math.max(maxHeightDelta,Math.abs(a[i]-b[i]));
}
console.log(JSON.stringify({paths,surface,coverage:{gridPoints,spacing:.5,coverageMismatches,maxHeightDelta,examples}},null,2));
