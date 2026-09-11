// Author: Codex app agent, 2026-09-11.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Font} from '../three/FontLoader.js';import {textPolygons} from '../new/lettering.js';
import {circle,checkPlacement,customize,customLayers,customLevels} from '../new/customize.js';
import {prepareDrawing,drawingRegions} from '../new/local-drawing.js';import {LOCAL} from '../new/file-formats.js';
import {dimensions} from '../new/dimensions.js';import {layerGeometry,retargetGeometry} from '../new/planar.js';
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
