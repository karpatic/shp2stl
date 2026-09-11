// Author: Codex app agent · 2026-09-11. Targeted occupancy checks; no extrusion or CSG rebuild.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {heightRegions,lineFootprints} from '../new/planar.js';
import {reprojectGeoJSON,scaleGeoJSON,getMinMaxCoordinates} from '../new/leaflet.js';
const provenance='diagnostics/results/central-gap/';
const dir=(process.argv[2] || 'diagnostics/results/interior-ring-final-baltimore')+'/';
const data=JSON.parse(readFileSync(dir+'preprocess.json'));
let xs=[],ys=[];function visit(c){if(typeof c[0]==='number'){xs.push(c[0]);ys.push(c[1]);}else c.forEach(visit)}
data.geojson.features.forEach(f=>visit(f.geometry.coordinates));
const center={lng:(Math.min(...xs)+Math.max(...xs))/2,lat:(Math.min(...ys)+Math.max(...ys))/2};
for(const value of Object.values(data))reprojectGeoJSON(value,center);
const bounds=getMinMaxCoordinates(data.hull);
for(const value of Object.values(data))scaleGeoJSON(value,bounds);
const regions=heightRegions(data,{depth:6,width:.5});
const strips={B:lineFootprints(data.hullLines,{depth:6,width:.5}),L:lineFootprints(data.lines,{depth:6,width:.5})};
function insideRing(r,x,y){let wn=0;for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i],cross=(b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1]);if(a[1]<=y&&b[1]>y&&cross>0)wn++;if(a[1]>y&&b[1]<=y&&cross<0)wn--;}return wn!==0;}
const inside=(polys,x,y)=>polys.some(p=>insideRing(p[0],x,y)&&!p.slice(1).some(r=>insideRing(r,x,y)));
function edgeDistance(polys,x,y) {
  let distance=Infinity;
  for(const polygon of polys)for(const ring of polygon)for(let i=1;i<ring.length;i++) {
    const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
    distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
  }
  return distance;
}
const bytes=readFileSync(dir+'scene.stl'),position=[];
for(let i=0;i<bytes.readUInt32LE(80);i++)for(let j=0;j<9;j++)position.push(bytes.readFloatLE(84+i*50+12+j*4));
const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));const bvh=new MeshBVH(g,{indirect:true});
const ring=JSON.parse(readFileSync(provenance+'hull-stages.json')).truncated.centralHoles[0].coords;
const fc={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:structuredClone(ring)}}]};
reprojectGeoJSON(fc,center);scaleGeoJSON(fc,bounds);const mr=fc.features[0].geometry.coordinates;
const samples=[];
const exteriorStrips=lineFootprints({...data.hullLines,features:data.hullLines.features.filter(f=>f.properties?.boundaryRole!== 'interior')},{depth:6,width:.5});
const grooves=lineFootprints(data.interiorLines,{depth:6,width:.5});
function sample(x,y,label){const ray=new THREE.Ray(new THREE.Vector3(x,y,20),new THREE.Vector3(0,0,-1));const zs=bvh.raycast(ray,THREE.DoubleSide).map(h=>h.point.z).sort((a,b)=>a-b);const heights=zs.filter((z,i)=>!i||z-zs[i-1]>1e-5);const sourceWall=[...strips.B,...strips.L].some(p=>inside([p],x,y)), planarWall=inside(regions.layers[2],x,y),meshWall=heights.some(z=>z>9);const occupied=z=>heights.filter(h=>h>z).length%2===1;
const H=inside(regions.H,x,y), support=inside(exteriorStrips,x,y), C=inside(grooves,x,y);
const sourceLow=(H&&!C)||support, sourceFloor=H||support;
samples.push({label,x,y,sourceWall,planarWall,meshWall,heights,sourceLow,meshLow:occupied(.9),sourceFloor,meshFloor:occupied(3)});}
for(let i=1;i<mr.length;i++)for(const t of [.25,.5,.75])sample(mr[i-1][0]*(1-t)+mr[i][0]*t,mr[i-1][1]*(1-t)+mr[i][1]*t,`source perimeter segment ${i} t=${t}`);
// Local 80 x 40 grid plus existing wall midpoints. Same original-outline oracle as surface.mjs.
const minx=Math.min(...mr.map(p=>p[0])),maxx=Math.max(...mr.map(p=>p[0])),miny=Math.min(...mr.map(p=>p[1])),maxy=Math.max(...mr.map(p=>p[1]));
for(let i=0;i<80;i++)for(let j=0;j<40;j++)sample(minx-1+(maxx-minx+2)*(i+.37)/80,miny-1+(maxy-miny+2)*(j+.43)/40,'local grid');
for(const f of data.lines.features)for(let i=1;i<f.geometry.coordinates.length;i++){const [a,b]=[f.geometry.coordinates[i-1],f.geometry.coordinates[i]];const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;if(x>minx-1&&x<maxx+1&&y>miny-1&&y<maxy+1)sample(x,y,'retained wall control');}
const perimeterCount=(mr.length-1)*3;
const junctions=JSON.parse(readFileSync(provenance+'evidence.json')).junctions;
for(const junction of junctions) {
  const point={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:[junction.coordinate,junction.coordinate]}}]};
  reprojectGeoJSON(point,center);scaleGeoJSON(point,bounds);
  const p=point.features[0].geometry.coordinates[0];
  sample(...p,`junction ${junction.label}`);
  // Follow each of the three source incident arms into the common wall volume.
  const incident=[...data.hullLines.features,...data.lines.features].flatMap(f=>f.geometry.coordinates.slice(1).flatMap((b,i)=>{
    const a=f.geometry.coordinates[i];
    return Math.hypot(a[0]-p[0],a[1]-p[1])<.0001 ? [b] : Math.hypot(b[0]-p[0],b[1]-p[1])<.0001 ? [a] : [];
  }));
  assert.ok(incident.length>=3,`junction ${junction.label}: source perimeter plus shared line`);
  for(const q of incident)for(const distance of [.01,.05,.1,.2]){
    const length=Math.hypot(q[0]-p[0],q[1]-p[1]),t=Math.min(.5,distance/length);
    sample(p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1]),`junction ${junction.label} arm`);
  }
}
const result={author:'Codex app agent',date:'2026-09-11',center,bounds,sourceWallWidth:.5,perimeterSamples:samples.slice(0,perimeterCount),samples:samples.length,mismatches:samples.filter(s=>s.sourceWall!==s.planarWall||s.planarWall!==s.meshWall||s.sourceLow!==s.meshLow||s.sourceFloor!==s.meshFloor),wallSamples:samples.filter(s=>s.meshWall).length};
// Exact cap endpoints can lie on opposite sides after Float32 conformity.
// Retain those raw discrepancies; only lower-groove classification may use the
// production 2e-5 boundary band. Raised walls and floor must agree everywhere.
result.unexpectedMismatches=result.mismatches.filter(s=>s.sourceWall!==s.planarWall || s.planarWall!==s.meshWall || s.sourceFloor!==s.meshFloor || edgeDistance(grooves,s.x,s.y)>2e-5);
result.lowerBoundaryDistances=result.mismatches.map(s=>edgeDistance(grooves,s.x,s.y));
writeFileSync(dir+'mesh-evidence.json',JSON.stringify(result,null,2));
writeFileSync(dir+'regions.json',JSON.stringify({regions,strips,center,bounds,modelRing:mr}));
assert.equal(result.unexpectedMismatches.length,0,'original strips / planar / downloaded STL occupancy outside exact groove caps');
assert.ok(samples.slice(0,perimeterCount).every(s=>s.meshWall),'every raw perimeter segment reaches raised STL');
assert.ok(samples.filter(s=>s.label.startsWith('junction')).every(s=>s.meshWall),'three junctions connect through wall volume');
assert.ok(samples.some(s=>s.meshFloor&&!s.meshWall),'floor-only controls remain');
assert.ok(samples.some(s=>s.meshFloor&&!s.meshLow),'underside groove controls remain');
console.log(JSON.stringify({samples:result.samples,rawMismatches:result.mismatches.length,unexpectedMismatches:result.unexpectedMismatches.length,wallSamples:result.wallSamples,perimeterSamples:perimeterCount,junctionSamples:samples.filter(s=>s.label.startsWith('junction')).length}));
