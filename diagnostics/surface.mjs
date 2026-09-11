// Author: Codex app agent — 2026-09-11. Bidirectional surface and coverage checks.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import RBush from '../three/vendor/rbush.js';

const paths=process.argv.slice(2,4);
const meshes=paths.map(path=>{
  let data;
  if(process.env.SCENE){
    const bytes=readFileSync(path+'/scene.stl'),count=bytes.readUInt32LE(80),position=[];
    if(bytes.length!==84+count*50)throw Error('Incomplete STL');
    for(let i=0;i<count;i++)for(let j=0;j<9;j++)position.push(bytes.readFloatLE(84+i*50+12+j*4));
    data={position};
  }else data=JSON.parse(readFileSync(path+'/result-geometry.json'));
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(data.position,3));
  if(data.index)g.setIndex(data.index);
  return {g,bvh:new MeshBVH(g,{indirect:true}),data};
});
const point=new THREE.Vector3(),target={};
function distanceSamples(source,dest) {
  const p=source.g.attributes.position,index=source.g.index;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  let count=0,max=0,sum=0,above1e6=0,above1e4=0,worst=null,area=0,areaBeyondTolerance=0;
  for(let i=0;i<(index?.count??p.count);i+=3) {
    a.fromBufferAttribute(p,index?index.getX(i):i);
    b.fromBufferAttribute(p,index?index.getX(i+1):i+1);
    c.fromBufferAttribute(p,index?index.getX(i+2):i+2);
    const triangleArea=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).length()/2;
    area+=triangleArea;
    // Every vertex, every edge midpoint and every triangle centroid, including
    // tiny/sliver triangles. Area-only random samples would miss narrow cuts.
    for(const weights of [[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]]) {
      point.set(0,0,0).addScaledVector(a,weights[0]).addScaledVector(b,weights[1]).addScaledVector(c,weights[2]);
      const hit=dest.bvh.closestPointToPoint(point,target);
      if(!hit || !Number.isFinite(hit.distance))throw Error('Invalid closest point');
      count++;sum+=hit.distance;
      if(hit.distance>3e-5)areaBeyondTolerance+=triangleArea/7;
      if(hit.distance>max){max=hit.distance;worst={point:point.toArray(),closest:hit.point.toArray(),triangle:i/3};}
      above1e6+=hit.distance>1e-6;above1e4+=hit.distance>1e-4;
    }
  }
  return {count,max,mean:sum/count,above1e6,above1e4,worst,area,areaBeyondTolerance,tolerance:3e-5};
}
const surface=[distanceSamples(meshes[0],meshes[1]),distanceSamples(meshes[1],meshes[0])];

// All vertical surface heights on a deterministic XY grid. Comparing complete
// hit lists catches missing groove floors/roofs even where nearest-surface
// distances are small. Merge coincident intersections at triangulation seams.
const ray=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(0,0,-1));
const heights=bvh=>{
  if(process.env.SCENE){
    const hits=bvh.raycast(ray,THREE.DoubleSide).sort((a,b)=>a.point.z-b.point.z);
    const events=[];
    for(const h of hits){
      if(Math.abs(h.face.normal.z)<.5)continue;
      const delta=h.face.normal.z<0?1:-1;
      if(events.length&&Math.abs(events.at(-1).z-h.point.z)<1e-5)events.at(-1).delta+=delta;
      else events.push({z:h.point.z,delta});
    }
    let winding=0;const result=[];
    for(const e of events){const before=winding;winding+=e.delta;if((before>0)!==(winding>0))result.push(e.z);}
    return result;
  }
  const zs=bvh.raycast(ray,THREE.DoubleSide).map(h=>h.point.z).sort((a,b)=>a-b);
  return zs.filter((z,i)=>!i||z-zs[i-1]>1e-5);
};
let gridPoints=0,coverageMismatches=0,maxHeightDelta=0;
const examples=[];
const regions=process.env.REGIONS?JSON.parse(readFileSync(process.env.REGIONS)):null;
const segments=regions?.layers.flat(2).flatMap(r=>r.slice(1).map((p,i)=>[r[i],p]))??[];
let mismatchesOutsideBoundaryTolerance=0;
const oracleMismatches=[0,0],oracleExamples=[[],[]];
const sourceTrees=regions?.source?Object.fromEntries(Object.entries(regions.source).map(([name,polys])=>{
 const tree=new RBush();tree.load(polys.map(p=>{const ring=p[0],xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);return {minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys),ring};}));return [name,tree];
})):null;
function insideSource(name,x,y){
 return sourceTrees[name].search({minX:x,maxX:x,minY:y,maxY:y}).some(({ring})=>{
  let winding=0;
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],cross=(b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1]);
   if(a[1]<=y&&b[1]>y&&cross>0)winding++;
   if(a[1]>y&&b[1]<=y&&cross<0)winding--;
  }
  return winding!==0;
 });
}
function oracle(x,y){
 const H=insideSource('H',x,y),C=insideSource('C',x,y);
 if(!process.env.SCENE)return H?[C?Math.fround(1.8):0,6]:[];
 const B=insideSource('B',x,y),L=insideSource('L',x,y),filled=[(H&&!C)||B,H||B,B||L],z=[0,Math.fround(1.8),6,12],result=[];
 for(let i=0;i<4;i++)if(!!filled[i-1]!==!!filled[i])result.push(z[i]);
 return result;
}
const mismatchHeights=(a,b)=>a.length!==b.length||a.some((z,i)=>Math.abs(z-b[i])>1e-5);
function boundaryDistance(x,y){
 let min=Infinity;
 for(const [a,b] of segments){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));min=Math.min(min,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));}
 return min;
}
function sample(x,y){
  ray.origin.set(x,y,20);const a=heights(meshes[0].bvh),b=heights(meshes[1].bvh);gridPoints++;
  const mismatch=mismatchHeights(a,b);
  if(sourceTrees){
    const intended=oracle(x,y);
    for(const [i,hits] of [a,b].entries())if(mismatchHeights(hits,intended)&&boundaryDistance(x,y)>3e-5){
      oracleMismatches[i]++;if(oracleExamples[i].length<10)oracleExamples[i].push({x,y,hits,intended});
    }
  }
  if(mismatch){coverageMismatches++;const distance=boundaryDistance(x,y);if(distance>3e-5)mismatchesOutsideBoundaryTolerance++;if(examples.length<10)examples.push({x,y,a,b,boundaryDistance:distance});}
  if(a.length===b.length)for(let i=0;i<a.length;i++)maxHeightDelta=Math.max(maxHeightDelta,Math.abs(a[i]-b[i]));
}
for(let x=-100.123;x<100;x+=.5)for(let y=-100.321;y<100;y+=.5)sample(x,y);
const gridMismatches=coverageMismatches;
let targeted=0;
if(process.env.REGIONS){
  const {layers}=JSON.parse(readFileSync(process.env.REGIONS));
  for(const polygons of layers)for(const poly of polygons)for(const ring of poly)for(let i=1;i<ring.length;i++){
    const [a,b]=[ring[i-1],ring[i]],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
    if(len<1e-4)continue;
    for(const t of [0,.5])for(const sign of [-1,1]){
      sample(a[0]+dx*t-sign*dy/len*1e-4,a[1]+dy*t+sign*dx/len*1e-4);targeted++;
    }
  }
}

console.log(JSON.stringify({paths,surface,oracle:{mismatchesOutsideTolerance:oracleMismatches,examples:oracleExamples},coverage:{gridPoints,targeted,gridMismatches,mismatchesOutsideBoundaryTolerance,spacing:.5,coverageMismatches,maxHeightDelta,examples}},null,2));
