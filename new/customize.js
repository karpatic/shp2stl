// Author: Codex app agent, 2026-09-11. Shared physical XY edits, no geography repair.
import pc,{insetRegion} from './planar-boolean.js';
import {regionArea} from './planar.js';
import {loadFont,textPolygons} from './lettering.js';
export const EMBOSS=0.8;
export const translate=(ps,x,y)=>ps.map(p=>p.map(r=>r.map(([a,b])=>[a+x,b+y])));
export function circle(x,y,diameter) {
  if(!Number.isFinite(diameter)||diameter<1||diameter>30)throw Error('Hole diameter must be 1–30 mm');
  const r=diameter/2,ring=Array.from({length:96},(_,i)=>[x+r*Math.cos(i*Math.PI/48),y+r*Math.sin(i*Math.PI/48)]);ring.push(ring[0]);return [[ring]];
}
export async function editShape(edit,size) {
  if(![edit.x,edit.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=1))throw Error('Invalid source-relative placement');
  return edit.kind==='hole'?circle(edit.x*size,edit.y*size,edit.diameter):translate(textPolygons(await loadFont(),edit.text,edit.size),edit.x*size,edit.y*size);
}
const significant=ps=>regionArea(ps)>0.000001;
export function checkPlacement(shape,kind,regions,otherHoles=[],otherLabels=[],width=.5) {
  const margin=Math.max(.25,width),base=regions.layers[1];
  if(significant(pc.difference(shape,insetRegion(base,margin))))throw Error('Too close to the base edge or a hole. Move inward.');
  if(significant(pc.intersection(shape,insetRegion(regions.layers[2],-margin))))throw Error('Placement crosses or approaches a wall. Choose an open face.');
  if(kind==='hole')for(const link of regions.connections?.links||[])if(significant(pc.intersection(shape,insetRegion(link.footprint,-margin))))throw Error('Hole is too close to a connector or its attachment.');
  if(kind==='hole'&&significant(pc.difference(shape,insetRegion(regions.land,margin))))throw Error('Holes cannot cut connector pads or their shoreline attachments.');
  if(kind==='hole'&&significant(pc.difference(shape,insetRegion(regions.layers[0],margin))))throw Error('Hole is too close to an underside groove.');
  if(significant(pc.intersection(shape,insetRegion(otherHoles,-margin))))throw Error('Placement is too close to another hole.');
  if(significant(pc.intersection(shape,insetRegion(otherLabels,-margin))))throw Error('Placement overlaps or approaches a label. Remove it first.');
}
export async function customize(regions,edits,options) {
  if(!Array.isArray(edits)||edits.length>16)throw Error('At most 16 holes and labels per source');
  let holes=[],labels=[];
  // Validate against the original base and each previous edit; nothing silently clips a label.
  for(const edit of edits) {
    if(!['hole','label'].includes(edit.kind))throw Error('Unknown placement type');
    const shape=await editShape(edit,options.mapSize??200);
    checkPlacement(shape,edit.kind,regions,holes,labels,options.width);
    if(edit.kind==='hole')holes=pc.union(holes,shape);else labels=pc.union(labels,shape);
  }
  const layers=regions.layers.map(p=>holes.length?pc.difference(p,holes):p);
  return {...regions,layers,caps:undefined,holes,labels,expectedCuts:holes,raised:labels.length?pc.union(layers[2],labels):null};
}
export function customLayers(regions,wallHeight) {
  const [low,base,walls]=regions.layers,T=regions.labels;
  if(!T?.length)return {layers:regions.layers,levels:[0,1.8,6,12]};
  const order=wallHeight>EMBOSS?'above':wallHeight<EMBOSS?'below':'equal';
  return {order,layers:[low,base,regions.raised || pc.union(walls,T),...(order==='equal'?[]:[order==='above'?walls:T])]};
}
export function customLevels(dims,order) {
  const b=dims.baseHeight,w=dims.wallHeight;
  return [0,Math.fround(b*.3),Math.fround(b),...order==='equal'?[Math.fround(b+w)]:[Math.fround(b+Math.min(w,EMBOSS)),Math.fround(b+Math.max(w,EMBOSS))]];
}
