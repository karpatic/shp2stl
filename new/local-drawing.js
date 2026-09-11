// Author: Codex app agent, 2026-09-11. Explicit Cartesian path; no geographic heuristics.
import pc,{insetRegion} from './planar-boolean.js';
export function prepareDrawing(json,options){
 const polygons=json.features.flatMap(f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates);
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const p of polygons)for(const r of p)for(const [x,y] of r){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 const extent=Math.max(maxX-minX,maxY-minY);if(!Number.isFinite(extent)||extent<=0)throw Error('Drawing has no positive extent');
 const scale=(options.mapSize??200)/extent,cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const H=pc.union(polygons.map(p=>p.map(r=>r.map(([x,y])=>[(x-cx)*scale,(y-cy)*scale]))));
 const L=pc.difference(H,insetRegion(H,options.width));
 return {local:true,H,L};
}
export function drawingRegions(p){return {H:p.H,land:p.H,C:[],B:p.L,L:p.L,layers:[p.H,p.H,p.L],connections:{mode:'drawing',pads:[]}};}
