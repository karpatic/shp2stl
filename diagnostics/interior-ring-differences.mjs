// Author: Codex app agent — 2026-09-11. Bounded differences from retained preprocessing.
import fs from 'node:fs';import vm from 'node:vm';
import {heightRegions,regionArea} from '../new/planar.js';
import pc from '../new/planar-boolean.js';
import {reprojectGeoJSON,scaleGeoJSON,getMinMaxCoordinates} from '../new/leaflet.js';
vm.runInThisContext(fs.readFileSync('diagnostics/fixtures/turf.js','utf8'));
const a=JSON.parse(fs.readFileSync('diagnostics/results/hull-after-baltimore/preprocess.json')), b=JSON.parse(fs.readFileSync('diagnostics/results/interior-ring-final-baltimore/preprocess.json'));
const polys=JSON.parse(fs.readFileSync('diagnostics/results/central-gap/hull-stages.json')).truncated.union.geometry.coordinates.filter(p=>turf.area(turf.polygon([p[0]]))>=150000);
const rawRings=polys.flat(), holes=polys.flatMap(p=>p.slice(1));
const finalRings=b.hullLines.features.map(f=>f.geometry.coordinates);
const result={author:'Codex app agent',date:'2026-09-11',retainedExteriorComponents:polys.length,retainedInteriorBoundaries:holes.length,interiorAreasMeters2:holes.map(r=>turf.area(turf.polygon([r]))).sort((a,b)=>a-b),unsimplifiedSourceRings:finalRings.filter((r,i)=>JSON.stringify(r)===JSON.stringify(rawRings[i])).length,oldExteriorVertices:a.hullLines.features.map(f=>f.geometry.coordinates.length),newExteriorVertices:b.hullLines.features.filter(f=>f.properties.boundaryRole==='exterior').map(f=>f.geometry.coordinates.length)};
function project(d){let xs=[],ys=[];function visit(c){if(typeof c[0]==='number'){xs.push(c[0]);ys.push(c[1]);}else c.forEach(visit)}d.geojson.features.forEach(f=>visit(f.geometry.coordinates));const center={lng:(Math.min(...xs)+Math.max(...xs))/2,lat:(Math.min(...ys)+Math.max(...ys))/2};for(const v of Object.values(d))reprojectGeoJSON(v,center);const bounds=getMinMaxCoordinates(d.hull);for(const v of Object.values(d))scaleGeoJSON(v,bounds);return heightRegions(d,{depth:6,width:.5});}
const before=project(a),after=project(b);
result.layers=before.layers.map((r,i)=>({height:i===0?'0–1.8':i===1?'1.8–6':'6–12',addedArea:regionArea(pc.difference(after.layers[i],r)),removedArea:regionArea(pc.difference(r,after.layers[i]))}));
result.HExact=JSON.stringify(before.H)===JSON.stringify(after.H);result.CExact=JSON.stringify(before.C)===JSON.stringify(after.C);
fs.writeFileSync('diagnostics/results/interior-ring-fix/differences.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
