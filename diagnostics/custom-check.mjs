// Author: Codex app agent, 2026-09-11.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Font} from '../three/FontLoader.js';import {textPolygons} from '../new/lettering.js';
import {circle,checkPlacement,customize,EMBOSS} from '../new/customize.js';
import {prepareDrawing,drawingRegions} from '../new/local-drawing.js';import {LOCAL} from '../new/file-formats.js';
import {dimensions} from '../new/dimensions.js';import {layerGeometry,retargetGeometry} from '../new/planar.js';
import pc from '../new/planar-boolean.js';
// Frozen 9985e3d height-layer oracle for default solid equivalence.
function customLayers(regions,wallHeight) {
  const [low,base,walls]=regions.layers,T=regions.labels;
  if(!T?.length)return {layers:regions.layers,levels:[0,1.8,6,12]};
  const order=wallHeight>EMBOSS?'above':wallHeight<EMBOSS?'below':'equal';
  return {order,layers:[low,base,regions.raised || pc.union(walls,T),...(order==='equal'?[]:[order==='above'?walls:T])]};
}
function customLevels(dims,order) {
  const b=dims.baseHeight,w=dims.wallHeight;
  return [0,Math.fround(b*.3),Math.fround(b),...order==='equal'?[Math.fround(b+w)]:[Math.fround(b+Math.min(w,EMBOSS)),Math.fround(b+Math.max(w,EMBOSS))]];
}

const fontData=JSON.parse(readFileSync('three/vendor/helvetiker/regular.typeface.json'));globalThis.fetch=async()=>({ok:true,json:async()=>fontData});
const font=new Font(fontData),letters=textPolygons(font,'BOA',3);assert.equal(letters.reduce((n,p)=>n+p.length-1,0),4);assert.throws(()=>textPolygons(font,'🚀',3),/Unsupported/);assert.throws(()=>textPolygons(font,'x',Infinity));
const fc={type:'FeatureCollection',shp2stl:LOCAL,features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[-20,-12],[20,-12],[20,12],[-20,12],[-20,-12]]]}}]};
const options={mapSize:40,width:.5},regions=drawingRegions(prepareDrawing(fc,options));
assert.throws(()=>checkPlacement(circle(19,0,3),'hole',regions),/edge|wall/);
assert.throws(()=>checkPlacement(circle(0,0,3),'hole',{...regions,connections:{links:[{footprint:circle(0,0,4)}]}}),/connector/);
const edits=[{kind:'hole',x:-.3,y:0,diameter:3},{kind:'label',x:.1,y:0,text:'BOA',size:3}];const result=await customize(regions,edits,options);
for(const wallHeight of [6,.4,.8]){const d=dimensions({wallHeight}),shape=customLayers(result,wallHeight),levels=customLevels(d,shape.order),g=layerGeometry(shape.layers,levels);assert(g.userData.validation.closed);const moved=retargetGeometry(g,shape.layers,customLevels(dimensions({baseHeight:2.5,wallHeight}),shape.order));assert(moved.userData.validation.closed);g.dispose();moved.dispose();}
assert.equal(edits[0].diameter,3);assert.equal(edits[1].size,3);
console.log('PASS: BOA counters, unsupported text, edge rejection, hole/label layers and height retargeting above/equal/below emboss height');
// Author: Codex app agent, 2026-09-12. Independent label Z on one cached XY proof.
const {columnGeometry,retargetColumns,regionArea,validateSolid}=await import('../new/planar.js');
const {textHeight}=await import('../new/customize.js');
assert.equal(textHeight(edits[1]),.8);
for(const height of [0,-1,NaN,Infinity,null,'1',.009,200.01])assert.throws(()=>textHeight({height}),/Text height/);
const pair=[{...edits[1],x:-.3,text:'BO'},{...edits[1],x:.1,text:'A',height:1.6}];
const xy=await customize(regions,pair,options),layers=[...xy.layers.slice(0,2),xy.raised],cols=[xy.layers[2],...xy.labelShapes];
const template=columnGeometry(layers,[0,1.8,6,12],cols),labelTemplate=columnGeometry([xy.labels],[6,12],xy.labelShapes);
for(const baseHeight of [2.5,6,200])for(const wallHeight of [.4,.8,1.6,6])for(const heights of [[.8,.8],[.8,1.6],[1.6,.8],[.01,200]]){
 const d=dimensions({baseHeight,wallHeight}),tops=heights.map(h=>Math.fround(baseHeight+h));
 const g=retargetColumns(template,layers,d.levels,[d.levels[3],...tops]);
 const labels=retargetColumns(labelTemplate,[xy.labels],d.levels.slice(2),tops);
 // Recheck complete edge/vertex topology without the cached proof.
 validateSolid(g,[],[],undefined,g.userData.validation.expectedVolume);
 validateSolid(labels,[],[],undefined,labels.userData.validation.expectedVolume);
 const base=layerGeometry(xy.layers.slice(0,2),d.levels.slice(0,3)),walls=layerGeometry([xy.layers[2]],d.levels.slice(2));
 assert(Math.abs(g.userData.validation.volume-base.userData.validation.volume-walls.userData.validation.volume-labels.userData.validation.volume)<.002);
 const p=labels.attributes.position;assert.equal(Math.max(...Array.from({length:p.count},(_,i)=>p.getZ(i))),Math.max(...tops));
 if(heights.every(h=>h===.8)){
  const shape=customLayers(xy,wallHeight),old=layerGeometry(shape.layers,customLevels(d,shape.order));
  assert(Math.abs(g.userData.validation.volume-old.userData.validation.volume)<.002);old.dispose();
 }
 for(const mesh of [g,labels,base,walls])mesh.dispose();
}
assert.throws(()=>retargetColumns(template,layers,[0,1.8,6,12],[12,6,7]),/heights/);
const position=template.attributes.position.array;position[0]+=.1;
assert.throws(()=>retargetColumns(template,layers,[0,1.8,6,12],[12,7,8]),/changed/);
template.dispose();labelTemplate.dispose();
globalThis.localStorage={getItem:()=>JSON.stringify({fixture:pair.map(({height,...e})=>e)}),setItem(){}};
const store=await import('../new/edit-store.js');assert.deepEqual(store.editsFor('x#fixture').map(textHeight),[.8,.8]);
store.saveEdits('x#fixture',pair);assert.deepEqual(store.editsFor('x#fixture').map(textHeight),[.8,1.6]);
store.saveEdits('x#fixture',[]);store.undoEdits('x#fixture');assert.equal(store.editsFor('x#fixture').length,2);
store.undoEdits('x#fixture');assert.deepEqual(store.editsFor('x#fixture').map(textHeight),[.8,.8]);
console.log('PASS: independent column heights, default solid volume, wall crossings/equal planes, .01–200 mm, full topology, aligned assembly volume, immutable proof, legacy state and undo');

const holeOnly=await customize(regions,[edits[0]],options),holeLevels=dimensions({}).levels;
const holeTemplate=columnGeometry(holeOnly.layers,holeLevels,[holeOnly.layers[2]]),holeOutput=retargetColumns(holeTemplate,holeOnly.layers,holeLevels,[12]);
assert.deepEqual(holeOutput.attributes.position.array,holeTemplate.attributes.position.array);assert.deepEqual(holeOutput.index.array,holeTemplate.index.array);
holeOutput.dispose();holeTemplate.dispose();console.log('PASS: hole-only template retains exact default geometry');
